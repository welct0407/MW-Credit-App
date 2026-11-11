"""Claude receipt provider (R142): one Messages API call, keyless workload identity federation, no SDK.

The shared prompt and schema are sent unchanged as structured output (output_config.format json_schema), with
adaptive thinking at the configured effort (low by default), no sampling settings and the same downscaled image as
Gemini (receipt_provider_gemini.downscaled). Upstream credentials come from the chat relay's federation rule of the
caller's environment (chat_relay_api.rule), exchanged by this module's own CredentialProvider instance; there is no
API key path and an Anthropic credential in the process environment is refused. One attempt, no retry: the
recognizer falls back to Gemini instead. Every failure is RecognitionUnavailable with a claude_* cause.
"""
import base64
import io
import json
import os
import re
import socket
import threading
import time
import urllib.error
import urllib.request

from PIL import Image

from . import chat_relay_api as relay
from . import http
from .config import ConfigurationError
from .receipt_image import PROMPT, SCHEMA, RecognitionUnavailable
from .receipt_provider_gemini import JPEG_QUALITY, MAX_SIDE

URL = 'https://api.anthropic.com/v1/messages'
ATTEMPT_TIMEOUT = 36  # the whole Claude call, token exchange included, when no shorter bound is given
MAX_TOKENS = 8000
MINIMUM = 1  # seconds a request needs to be worth starting
RESPONSE_LIMIT = 1_048_576
EFFORTS = ('low', 'medium', 'high')
DEFAULT_EFFORT = 'low'
# Fixed model ids only (claude-opus-5-5, claude-haiku-5-5): no date suffix, no alias such as -latest.
MODEL = re.compile(r'claude-(?:opus|sonnet|haiku)-\d{1,2}(?:-\d{1,2})?')

# The token exchange of this process is bounded by the current call's deadline (thread-local, set around headers()).
_bound = threading.local()


def _left(limit):
    deadline = getattr(_bound, 'deadline', None)
    return limit if deadline is None else max(0.1, min(limit, deadline - time.monotonic()))


def identity(audience):
    try:
        return http.identity_token(audience, http.opener(), _left(relay.IDENTITY_TIMEOUT))
    except Exception:
        raise relay.CredentialError('RELAY_IDENTITY_UNAVAILABLE') from None


def exchange(body):
    return relay.token_exchange(body, timeout=_left(relay.EXCHANGE_TIMEOUT))


# Separate from the chat relay's provider (another process anyway); tokens stay in this process's memory.
CREDENTIALS = relay.CredentialProvider(identity=identity, exchange=exchange)


def prepared(image_data):
    """R142 (DEV measurement): the Claude route's image, prepared once before the Claude phase starts. The same Lanczos
    resize to a long side of at most MAX_SIDE as Gemini's `downscaled`, encoded as JPEG quality 85 only: no PNG attempt and
    no optimize pass (the PNG optimize cost seconds on the VM's shared vCPU). Gemini-only routes keep `downscaled`."""
    try:
        with Image.open(io.BytesIO(image_data)) as source:
            image = source.convert('RGB')
        if max(image.size) > MAX_SIDE:
            image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=JPEG_QUALITY)
    except Exception as exc:
        raise RecognitionUnavailable(cause='image_prepare_failed') from exc
    return output.getvalue(), 'image/jpeg'


def validate(config):
    name = config.get('receipt_claude_model')
    if not isinstance(name, str) or not MODEL.fullmatch(name):
        raise ConfigurationError('receipt_claude_model must be an exact Claude model id such as claude-opus-5-5')
    if config.get('receipt_claude_effort', DEFAULT_EFFORT) not in EFFORTS:
        raise ConfigurationError('receipt_claude_effort must be low, medium or high')


def model(config):
    validate(config)
    return config['receipt_claude_model']


def effort(config):
    validate(config)
    return config.get('receipt_claude_effort', DEFAULT_EFFORT)


def body(image_data, model_id, effort_level, mime_type='image/png'):
    return {'model': model_id, 'max_tokens': MAX_TOKENS, 'thinking': {'type': 'adaptive'},
            'output_config': {'effort': effort_level, 'format': {'type': 'json_schema', 'schema': SCHEMA}},
            'messages': [{'role': 'user', 'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': mime_type,
                                             'data': base64.b64encode(image_data).decode('ascii')}},
                {'type': 'text', 'text': PROMPT}]}]}


def parse(raw):
    """The JSON object in the text blocks of a finished (end_turn) reply; anything else is a provider error."""
    try:
        response = json.loads(raw)
        stop = response.get('stop_reason')
    except (ValueError, AttributeError, UnicodeDecodeError):
        raise RecognitionUnavailable(cause='claude_response_invalid') from None
    if stop == 'refusal':
        raise RecognitionUnavailable(cause='claude_refusal')
    if stop != 'end_turn':
        raise RecognitionUnavailable(cause='claude_unfinished')
    try:
        text = ''.join(block['text'] for block in response['content'] if block.get('type') == 'text')
        return json.loads(text)
    except (ValueError, KeyError, TypeError, AttributeError):
        raise RecognitionUnavailable(cause='claude_response_invalid') from None


def credential_cause(code):
    return 'claude_' + code.lower().removeprefix('relay_')


def extract(config, image_data, deadline=None, attempt_timeout=ATTEMPT_TIMEOUT, environment='prod', credentials=None, prepared_image=None):
    """The candidate dict of one Claude call, bounded by min(deadline, now + attempt_timeout) including the exchange.

    prepared_image is (bytes, mime type) from `prepared`, made by the caller before its timer started; without it the
    image is prepared here, before this call's own bound is taken.
    """
    if any(os.environ.get(name) for name in relay.FORBIDDEN_ENVIRONMENT):
        raise RecognitionUnavailable(cause='claude_env_credential')
    model_id, level = model(config), effort(config)
    sent, mime_type = prepared_image or prepared(image_data)
    data = json.dumps(body(sent, model_id, level, mime_type), separators=(',', ':')).encode()
    now = time.monotonic()
    deadline = now + attempt_timeout if deadline is None else min(deadline, now + attempt_timeout)
    credentials = credentials or CREDENTIALS
    _bound.deadline = deadline
    try:
        auth, _rule = credentials.headers(config, environment, deadline)
    except relay.CredentialError as exc:
        raise RecognitionUnavailable(cause=credential_cause(exc.code)) from None
    except ConfigurationError:
        raise RecognitionUnavailable(cause='claude_federation_config') from None
    finally:
        _bound.deadline = None
    remaining = deadline - time.monotonic()
    if remaining < MINIMUM:
        raise RecognitionUnavailable('timeout', 'claude_timeout')
    request = urllib.request.Request(URL, data=data, method='POST', headers={
        **auth, 'anthropic-version': relay.ANTHROPIC_VERSION, 'content-type': 'application/json',
        'User-Agent': 'MW-Receipt-Recognition/1.0'})
    try:
        with http.opener().open(request, timeout=remaining) as response:
            raw = response.read(RESPONSE_LIMIT + 1)
    except urllib.error.HTTPError as exc:
        exc.close()
        if exc.code == 401:
            credentials.invalidate(environment, auth['authorization'])  # the next call exchanges afresh
        raise RecognitionUnavailable(cause=f'claude_http_{exc.code}') from None
    except Exception as exc:
        timed_out = isinstance(exc, (TimeoutError, socket.timeout)) or isinstance(getattr(exc, 'reason', None), (TimeoutError, socket.timeout))
        if timed_out:
            raise RecognitionUnavailable('timeout', 'claude_timeout') from None
        if isinstance(exc, urllib.error.URLError):
            raise RecognitionUnavailable(cause='claude_unreachable') from None
        raise RecognitionUnavailable(cause='claude_' + type(exc).__name__) from None
    if len(raw) > RESPONSE_LIMIT:
        raise RecognitionUnavailable(cause='claude_response_too_large')
    return parse(raw)
