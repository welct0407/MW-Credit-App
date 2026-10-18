"""Gemini on Vertex AI receipt provider: one generateContent call per attempt, VM identity, no API key.

The shared prompt and schema are sent unchanged (schema translated to Vertex's OpenAPI subset),
temperature 0, JSON response mode and, for Flash models, thinking disabled. A transient failure (429, 5xx, timeout,
connection error) is retried once while the caller's deadline allows it. Recognition has no side
effect, so a retry after an uncertain attempt is safe.
"""
import base64
import json
import re
import socket
import time
import urllib.error
import urllib.request

from . import http
from .config import ConfigurationError
from .receipt_image import PROMPT, SCHEMA, RecognitionUnavailable

ATTEMPT_TIMEOUT = 20
RETRY_MINIMUM = 3  # seconds a retry needs to be worth starting
RETRY_PAUSE = 1
RESPONSE_LIMIT = 1_048_576
TRANSIENT = (429, 500, 502, 503, 504)
# Fixed model versions only: stable GA ids (gemini-2.5-flash) or suffixed ones (gemini-2.0-flash-001).
# Moving aliases and non-GA ids (-latest, -preview, -exp) are rejected.
MODEL = re.compile(r'gemini-\d+(?:\.\d+)?-(?:flash|flash-lite|pro)(?:-\d{3})?')
MOVING = ('latest', 'preview', 'exp')
LOCATION = re.compile(r'global|[a-z]+-[a-z]+\d+')
PROJECT = re.compile(r'[a-z][a-z0-9-]{4,28}[a-z0-9]')


def validate(config):
    if not isinstance(config.get('gemini_project'), str) or not PROJECT.fullmatch(config['gemini_project']):
        raise ConfigurationError('gemini_project must be a GCP project id')
    if not isinstance(config.get('gemini_location'), str) or not LOCATION.fullmatch(config['gemini_location']):
        raise ConfigurationError('gemini_location must be a Vertex AI region or global')
    name = config.get('gemini_model')
    if not isinstance(name, str) or not MODEL.fullmatch(name) or any(word in name for word in MOVING):
        raise ConfigurationError('gemini_model must be an exact versioned model id')


def model(config):
    validate(config)
    return config['gemini_model']


def endpoint(config):
    validate(config)
    location = config['gemini_location']
    host = 'aiplatform.googleapis.com' if location == 'global' else location + '-aiplatform.googleapis.com'
    return (f"https://{host}/v1/projects/{config['gemini_project']}/locations/{location}"
            f"/publishers/google/models/{config['gemini_model']}:generateContent")


def vertex_schema(schema):
    """The shared JSON schema in Vertex's OpenAPI subset: uppercase types, no additionalProperties."""
    result = {'type': schema['type'].upper()}
    if 'properties' in schema:
        result['properties'] = {k: vertex_schema(v) for k, v in schema['properties'].items()}
    if 'required' in schema:
        result['required'] = list(schema['required'])
    if 'items' in schema:
        result['items'] = vertex_schema(schema['items'])
    return result


def body(image_data, model_id):
    generation = {'temperature': 0, 'candidateCount': 1, 'maxOutputTokens': 2048,
                  'responseMimeType': 'application/json', 'responseSchema': vertex_schema(SCHEMA)}
    if '-flash' in model_id:
        # Thinking off for Flash and Flash-Lite; Pro cannot disable thinking, so it gets no thinkingConfig.
        generation['thinkingConfig'] = {'thinkingBudget': 0}
    return {'contents': [{'role': 'user', 'parts': [
                {'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(image_data).decode('ascii')}},
                {'text': PROMPT}]}],
            'generationConfig': generation}


def parse(raw):
    """The JSON object in the first candidate's text parts; anything else is a provider error."""
    try:
        response = json.loads(raw)
        candidate = response['candidates'][0]
        if candidate.get('finishReason') != 'STOP':
            raise ValueError('unfinished')
        text = ''.join(p['text'] for p in candidate['content']['parts'] if 'text' in p and not p.get('thought'))
        return json.loads(text)
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise RecognitionUnavailable() from exc


def attempt(url, data, timeout):
    token = http.access_token(timeout=min(timeout, 10))
    request = urllib.request.Request(url, data=data, method='POST',
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with http.opener().open(request, timeout=timeout) as response:
        raw = response.read(RESPONSE_LIMIT + 1)
    if len(raw) > RESPONSE_LIMIT:
        raise RecognitionUnavailable()
    return parse(raw)


def transient(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in TRANSIENT
    return isinstance(exc, (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError))


def extract(config, image_data, deadline=None):
    url, data = endpoint(config), json.dumps(body(image_data, model(config)), separators=(',', ':')).encode()
    deadline = time.monotonic() + 2 * ATTEMPT_TIMEOUT if deadline is None else deadline
    for number in (1, 2):
        remaining = deadline - time.monotonic()
        try:
            return attempt(url, data, max(0.001, min(ATTEMPT_TIMEOUT, remaining)))
        except RecognitionUnavailable:
            raise
        except Exception as exc:
            if isinstance(exc, urllib.error.HTTPError):
                exc.close()
            timed_out = isinstance(exc, (TimeoutError, socket.timeout)) or isinstance(getattr(exc, 'reason', None), (TimeoutError, socket.timeout))
            retry = number == 1 and transient(exc) and deadline - time.monotonic() >= RETRY_MINIMUM + RETRY_PAUSE
            if not retry:
                raise RecognitionUnavailable('timeout' if timed_out else 'provider_error') from exc
            time.sleep(RETRY_PAUSE)
    raise RecognitionUnavailable()
