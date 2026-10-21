"""Claude Opus 5.5 on Vertex AI behind the Partner conversation (claude_partner_conversation).

The provider-neutral loop, transcript, transport and audit live in conversation_session. This module is the
Claude dialect: one non-streaming rawPredict request per round (anthropic_version vertex-2023-10-16, no
thinking field, no beta header, tool_choice auto, effort in output_config, the rules and digest as a cached
system block). Thinking is always on for this model; its blocks and signatures are stored and replayed
verbatim. A 400 that says the replayed thinking is bound to a different conversation restarts the turn once
in a fresh epoch, before any tool ran.
"""
import re
import time  # noqa: F401  (tests patch time through this module object)

from . import http  # noqa: F401  (tests patch the opener and token through this module object)
from .audit import audited
from .config import ConfigurationError
from .conversation_session import (ASSISTANT_INSTRUCTIONS, FINISH_NUDGE, HISTORY_NOTE, LOCATION, PROJECT,  # noqa: F401
                                   ROUND_NUDGE, SEED_FAILED_NOTE, ConversationSession, RestartEpoch, bounded, digest,
                                   partner_texts, reference, stamp, transcript, vertex_host)

ANTHROPIC_VERSION = 'vertex-2023-10-16'
MAX_TOKENS = 16000
MODELS = ('claude-opus-5-5',)
EFFORTS = ('low', 'medium', 'high', 'xhigh', 'max')
DEFAULTS = {'claude_location': 'global', 'claude_model': 'claude-opus-5-5', 'claude_effort': 'high',
            'claude_request_timeout_seconds': 300, 'claude_max_tool_rounds': 24, 'claude_history_token_limit': 150000,
            'claude_seed_history_chars': 40000}
BOUNDS = {'claude_request_timeout_seconds': (30, 600), 'claude_max_tool_rounds': (4, 40),
          'claude_history_token_limit': (50000, 400000), 'claude_seed_history_chars': (0, 200000)}
BLOCKS = ('thinking', 'redacted_thinking', 'text', 'tool_use')
CLAUDE_INSTRUCTIONS = ASSISTANT_INSTRUCTIONS  # one instruction text for every model provider


class HistoryMismatch(RestartEpoch):
    """Vertex refused replayed thinking blocks as bound to a different conversation (preserved thinking)."""
    def __init__(self):
        super().__init__('CLAUDE_HISTORY_BINDING_MISMATCH')


def settings(config):
    value = {k: config.get(k, d) for k, d in DEFAULTS.items()}
    value['claude_project'] = config.get('claude_project')
    return value


def validate(config):
    """Claude provider settings; called from config.validate_config when the provider is claude."""
    s = settings(config)
    if not isinstance(s['claude_project'], str) or not PROJECT.fullmatch(s['claude_project']):
        raise ConfigurationError('claude_project must be a GCP project id')
    if not isinstance(s['claude_location'], str) or not LOCATION.fullmatch(s['claude_location']):
        raise ConfigurationError('claude_location must be global or a Vertex AI region')
    if s['claude_model'] not in MODELS:
        raise ConfigurationError('claude_model must be one of ' + ', '.join(MODELS))
    if s['claude_effort'] not in EFFORTS:
        raise ConfigurationError('claude_effort must be low, medium, high, xhigh or max')
    bounded(config, s, BOUNDS, 'claude_request_timeout_seconds')
    return s


def endpoint(config):
    s = validate(config)
    location = s['claude_location']
    return (f"https://{vertex_host(location)}/v1/projects/{s['claude_project']}/locations/{location}"
            f"/publishers/anthropic/models/{s['claude_model']}:rawPredict")


def system_blocks(instructions):
    return [{'type': 'text', 'text': instructions},
            {'type': 'text', 'text': reference(), 'cache_control': {'type': 'ephemeral'}}]


def tool_specs(tools):
    return [{'name': t['name'], 'description': t['description'], 'input_schema': t['inputSchema']} for t in tools]


def input_tokens(usage):
    usage = usage if isinstance(usage, dict) else {}
    return sum(usage.get(k) or 0 for k in ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')
               if isinstance(usage.get(k) or 0, int))


def parse(raw):
    import json
    try:
        response = json.loads(raw)
    except ValueError:
        raise ConfigurationError('CLAUDE_RESPONSE_INVALID') from None
    if (not isinstance(response, dict) or response.get('type') != 'message' or response.get('role') != 'assistant'
            or not isinstance(response.get('content'), list) or not isinstance(response.get('stop_reason'), str)
            or any(not isinstance(b, dict) or not isinstance(b.get('type'), str) for b in response['content'])):
        raise ConfigurationError('CLAUDE_RESPONSE_INVALID')
    return response


def plan(session, instructions, request):
    s = settings(session.config)
    return {'provider': 'claude', 'model': s['claude_model'], 'effort': s['claude_effort'],
            'max_rounds': s['claude_max_tool_rounds']}


class ClaudeConversation(ConversationSession):
    PROVIDER = 'claude'
    PREFIX = 'CLAUDE'

    def texts(self, ids):
        return partner_texts(self.config, ids)

    def limits(self):
        s = settings(self.config)
        return {'model': s['claude_model'], 'request_timeout': s['claude_request_timeout_seconds'],
                'max_rounds': s['claude_max_tool_rounds'], 'token_limit': s['claude_history_token_limit'],
                'seed_chars': s['claude_seed_history_chars']}

    def endpoint(self):
        return endpoint(self.config)

    def prompt_digest(self):
        s = settings(self.config)
        return digest({'provider': self.PROVIDER, 'model': s['claude_model'],
                       'system': system_blocks(self.instructions), 'tools': tool_specs(self.tools)})

    def body(self, messages):
        s = settings(self.config)
        return {'anthropic_version': ANTHROPIC_VERSION, 'max_tokens': MAX_TOKENS, 'system': system_blocks(self.instructions),
                'tools': tool_specs(self.tools), 'tool_choice': {'type': 'auto'},
                'output_config': {'effort': s['claude_effort']},
                # Automatic caching: the growing message prefix of a multi-round turn is cached too.
                'cache_control': {'type': 'ephemeral'}, 'messages': messages}

    def client_error(self, code, detail):
        if code == 400 and b'bound to a different conversation' in detail:
            raise HistoryMismatch()

    def parse(self, raw):
        response = parse(raw)
        stop, content = response['stop_reason'], response['content']
        if stop not in ('end_turn', 'tool_use'):
            raise ConfigurationError('CLAUDE_STOP_' + re.sub(r'[^A-Z0-9]+', '_', stop.upper())[:40])
        if any(b['type'] not in BLOCKS for b in content):
            raise ConfigurationError('CLAUDE_UNEXPECTED_BLOCK')
        uses = [b for b in content if b['type'] == 'tool_use']
        if stop == 'tool_use' and not uses:
            raise ConfigurationError('CLAUDE_PROTOCOL_ERROR')
        usage = response.get('usage') if isinstance(response.get('usage'), dict) else {}
        return {'message': {'role': 'assistant', 'content': content},
                'calls': [{'name': b.get('name'), 'args': b.get('input'), 'id': b.get('id')} for b in uses],
                'input_tokens': input_tokens(usage),
                'audit': {'stop_reason': stop, 'input_tokens': input_tokens(usage),
                          'cache_read_input_tokens': usage.get('cache_read_input_tokens') or 0,
                          'output_tokens': usage.get('output_tokens') or 0}}

    def opening(self, prefix, request):
        return {'role': 'user', 'content': ([{'type': 'text', 'text': prefix}] if prefix else [])
                + [{'type': 'text', 'text': request}]}

    def results_message(self, results, note=None):
        import json
        content = []
        for result in results:
            block = {'type': 'tool_result', 'tool_use_id': result['call']['id'],
                     'content': result['value'] if result['error'] else json.dumps(result['value'], ensure_ascii=False)}
            if result['error']:
                block['is_error'] = True
            content.append(block)
        if note:
            content.append({'type': 'text', 'text': note})
        return {'role': 'user', 'content': content}

    def text_message(self, text):
        return {'role': 'user', 'content': [{'type': 'text', 'text': text}]}

    def row(self, message):
        return message['role'], message['content']

    def message(self, role, content):
        return {'role': role, 'content': content}

    @audited('model_turn', route='internal', plan=plan)
    def run(self, instructions, request):
        validate(self.config)
        return self.converse(instructions, request)
