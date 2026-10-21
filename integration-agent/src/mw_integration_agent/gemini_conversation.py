"""Gemini (gemini-4-argon) on Vertex AI behind the Partner conversation (gemini_partner_conversation).

The provider-neutral loop, transcript, transport and audit live in conversation_session; this module is the
Gemini dialect: one non-streaming generateContent request per round with the VM service account's token, the
instructions and the rules/digest reference as systemInstruction parts, the host tools as functionDeclarations
in AUTO mode, and no temperature. thinkingConfig.thinkingLevel is always sent (gemini_conversation_thinking_level,
LOW|MEDIUM|HIGH|MAX, default HIGH; thinkingBudget is rejected by this model and never sent), with maxOutputTokens
16384. Implicit caching only.

The candidate's content.parts are appended and stored verbatim (functionCall and text parts keep their
thoughtSignature), so the next turn replays them unchanged. Every functionCall is answered in one user content,
in call order, with functionResponse {name, id, response:{result|error}}; the model's call id is echoed and
also journals the call (a derived id when absent).
"""
import json
import re
import time  # noqa: F401  (tests patch time through this module object)

from . import http  # noqa: F401  (tests patch the opener and token through this module object)
from .audit import audited
from .config import ConfigurationError
from .conversation_session import (ASSISTANT_INSTRUCTIONS, LOCATION, PROJECT, ConversationSession, Resend,  # noqa: F401
                                   bounded, digest, partner_texts, reference, vertex_host)

MODELS = ('gemini-4-argon',)
THINKING_LEVELS = ('LOW', 'MEDIUM', 'HIGH', 'MAX')  # accepted live by gemini-4-argon; XHIGH is a 400
MAX_OUTPUT_TOKENS = 16384
DEFAULTS = {'gemini_location': 'global', 'gemini_conversation_model': 'gemini-4-argon',
            'gemini_conversation_thinking_level': 'HIGH', 'gemini_conversation_request_timeout_seconds': 300,
            'gemini_conversation_max_tool_rounds': 24, 'gemini_conversation_history_token_limit': 150000,
            'gemini_conversation_seed_history_chars': 40000}
BOUNDS = {'gemini_conversation_request_timeout_seconds': (30, 600), 'gemini_conversation_max_tool_rounds': (4, 40),
          'gemini_conversation_history_token_limit': (50000, 400000),
          'gemini_conversation_seed_history_chars': (0, 200000)}
KNOWN = {'text', 'thought', 'functionCall', 'thoughtSignature'}  # at least one per part; other fields kept as-is
SCHEMA_KEYS = ('description', 'enum', 'minimum', 'maximum', 'required')


def settings(config):
    value = {k: config.get(k, d) for k, d in DEFAULTS.items()}
    value['gemini_project'] = config.get('gemini_project')
    return value


def validate(config):
    """Gemini conversation settings; called from config.validate_config when the provider is gemini.

    gemini_project and gemini_location are shared with the receipt provider (same patterns); the receipt's
    gemini_model is not required here.
    """
    s = settings(config)
    if not isinstance(s['gemini_project'], str) or not PROJECT.fullmatch(s['gemini_project']):
        raise ConfigurationError('gemini_project must be a GCP project id')
    if not isinstance(s['gemini_location'], str) or not LOCATION.fullmatch(s['gemini_location']):
        raise ConfigurationError('gemini_location must be a Vertex AI region or global')
    if s['gemini_conversation_model'] not in MODELS:
        raise ConfigurationError('gemini_conversation_model must be one of ' + ', '.join(MODELS))
    if s['gemini_conversation_thinking_level'] not in THINKING_LEVELS:
        raise ConfigurationError('gemini_conversation_thinking_level must be LOW, MEDIUM, HIGH or MAX')
    bounded(config, s, BOUNDS, 'gemini_conversation_request_timeout_seconds')
    return s


def endpoint(config):
    s = validate(config)
    location = s['gemini_location']
    return (f"https://{vertex_host(location)}/v1/projects/{s['gemini_project']}/locations/{location}"
            f"/publishers/google/models/{s['gemini_conversation_model']}:generateContent")


def schema(value):
    """A host JSON schema in Vertex's OpenAPI subset: uppercase types, no additionalProperties."""
    result = {'type': value['type'].upper()}
    if 'properties' in value:
        result['properties'] = {k: schema(v) for k, v in value['properties'].items()}
    if 'items' in value:
        result['items'] = schema(value['items'])
    for key in SCHEMA_KEYS:
        if key in value:
            result[key] = list(value[key]) if isinstance(value[key], list) else value[key]
    return result


def function_declaration(spec):
    return {'name': spec['name'], 'description': spec['description'], 'parameters': schema(spec['inputSchema'])}


def coerce(args, spec):
    """JSON numbers decoded as floats become ints for properties declared integer (e.g. limit 100.0 -> 100)."""
    if not isinstance(args, dict) or spec is None:
        return args
    properties = spec['inputSchema'].get('properties', {})
    return {k: (int(v) if properties.get(k, {}).get('type') == 'integer' and isinstance(v, float) and v.is_integer() else v)
            for k, v in args.items()}


def code(value):
    return re.sub(r'[^A-Z0-9]+', '_', str(value or 'UNKNOWN').upper())[:40] or 'UNKNOWN'


def plan(session, instructions, request):
    s = settings(session.config)
    return {'provider': 'gemini', 'model': s['gemini_conversation_model'],
            'thinking_level': s['gemini_conversation_thinking_level'], 'max_rounds': s['gemini_conversation_max_tool_rounds']}


class GeminiConversation(ConversationSession):
    PROVIDER = 'gemini'
    PREFIX = 'GEMINI'

    def texts(self, ids):
        return partner_texts(self.config, ids)

    def limits(self):
        s = settings(self.config)
        return {'model': s['gemini_conversation_model'], 'request_timeout': s['gemini_conversation_request_timeout_seconds'],
                'max_rounds': s['gemini_conversation_max_tool_rounds'],
                'token_limit': s['gemini_conversation_history_token_limit'],
                'seed_chars': s['gemini_conversation_seed_history_chars']}

    def endpoint(self):
        return endpoint(self.config)

    def system(self):
        return {'parts': [{'text': self.instructions}, {'text': reference()}]}

    def declarations(self):
        return [function_declaration(t) for t in self.tools]

    def prompt_digest(self):
        return digest({'provider': self.PROVIDER, 'model': settings(self.config)['gemini_conversation_model'],
                       'system': self.system(), 'tools': self.declarations()})

    def body(self, messages):
        s = settings(self.config)
        # thinkingLevel is always sent (owner: HIGH by default, MAX allowed); thinkingBudget is a 400 on this
        # model and is never sent.
        generation = {'maxOutputTokens': MAX_OUTPUT_TOKENS, 'candidateCount': 1,
                      'thinkingConfig': {'thinkingLevel': s['gemini_conversation_thinking_level']}}
        return {'systemInstruction': self.system(), 'contents': messages,
                'tools': [{'functionDeclarations': self.declarations()}],
                'toolConfig': {'functionCallingConfig': {'mode': 'AUTO'}}, 'generationConfig': generation}

    def parse(self, raw):
        try:
            response = json.loads(raw)
        except ValueError:
            raise ConfigurationError('GEMINI_RESPONSE_INVALID') from None
        if not isinstance(response, dict):
            raise ConfigurationError('GEMINI_RESPONSE_INVALID')
        candidates = response.get('candidates')
        if not candidates:
            feedback = response.get('promptFeedback')
            blocked = feedback.get('blockReason') if isinstance(feedback, dict) else None
            raise ConfigurationError('GEMINI_PROMPT_BLOCKED_' + code(blocked) if blocked else 'GEMINI_RESPONSE_INVALID')
        candidate = candidates[0] if isinstance(candidates, list) else None
        if not isinstance(candidate, dict):
            raise ConfigurationError('GEMINI_RESPONSE_INVALID')
        reason = candidate.get('finishReason')
        if reason == 'MALFORMED_FUNCTION_CALL':
            raise Resend('GEMINI_STOP_MALFORMED_FUNCTION_CALL')
        if reason != 'STOP':
            raise ConfigurationError('GEMINI_STOP_' + code(reason))
        content = candidate.get('content')
        parts = content.get('parts') if isinstance(content, dict) else None
        if not isinstance(parts, list) or not parts or any(not isinstance(p, dict) for p in parts):
            raise ConfigurationError('GEMINI_RESPONSE_INVALID')
        calls = []
        for part in parts:
            # Every part is stored and replayed verbatim, unknown fields included (they carry no meaning here; a
            # signature-only part is neither a call nor text). A part with no text, thought, functionCall or
            # signature at all (empty, or only data such as inlineData/executableCode) cannot be answered.
            if not set(part) & KNOWN:
                raise ConfigurationError('GEMINI_UNEXPECTED_PART')
            call = part.get('functionCall')
            if call is None:
                continue
            if (not isinstance(call, dict) or not isinstance(call.get('name'), str)
                    or not isinstance(call.get('args', {}), dict) or not isinstance(call.get('id', ''), str)):
                raise ConfigurationError('GEMINI_RESPONSE_INVALID')
            # A repeated id (in this response or an earlier round) is echoed as given; the shared loop derives
            # a unique journal id (<id>~<round>-<index>) for the tool_calls journal.
            spec = next((t for t in self.tools if t['name'] == call['name']), None)
            calls.append({'name': call['name'], 'args': coerce(call.get('args', {}), spec), 'id': call.get('id') or None})
        usage = response.get('usageMetadata') if isinstance(response.get('usageMetadata'), dict) else {}
        number = lambda key: usage.get(key) if isinstance(usage.get(key), int) else 0  # noqa: E731
        return {'message': {'role': 'model', 'parts': parts}, 'calls': calls,
                'input_tokens': number('promptTokenCount'),
                'audit': {'finish_reason': reason, 'prompt_tokens': number('promptTokenCount'),
                          'candidates_tokens': number('candidatesTokenCount'),
                          'thoughts_tokens': number('thoughtsTokenCount'), 'total_tokens': number('totalTokenCount'),
                          'cached_content_tokens': number('cachedContentTokenCount'),
                          'traffic_type': usage.get('trafficType') if isinstance(usage.get('trafficType'), str) else None}}

    def opening(self, prefix, request):
        return {'role': 'user', 'parts': ([{'text': prefix}] if prefix else []) + [{'text': request}]}

    def results_messages(self, results, note=None):
        # Vertex rejects a user content that mixes functionResponse and text parts (live 400 "Requests ending
        # with a model turn are not supported"): the round-cap note is its own user content after the answers.
        return [self.results_message(results)] + ([self.text_message(note)] if note else [])

    def results_message(self, results):
        parts = []
        for result in results:
            answer = {'name': result['call']['name'],
                      'response': {'error': result['value']} if result['error'] else {'result': result['value']}}
            if result['call']['id']:
                answer = {'name': answer['name'], 'id': result['call']['id'], 'response': answer['response']}
            parts.append({'functionResponse': answer})
        return {'role': 'user', 'parts': parts}

    def text_message(self, text):
        return {'role': 'user', 'parts': [{'text': text}]}

    def row(self, message):
        return message['role'], message['parts']

    def message(self, role, content):
        return {'role': role, 'parts': content}

    @audited('model_turn', route='internal', plan=plan)
    def run(self, instructions, request):
        validate(self.config)
        return self.converse(instructions, request)
