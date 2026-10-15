"""Synthetic App Server continuity check. No messages or business data writes."""
import json
import secrets
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.codex_conversation import CodexConversation
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import spec, STR

config = load_json('/etc/mw-integration-agent/config.json')
config['conversation_timeout_seconds'] = 180
root = Path(config['state_directory']) / 'conversation-verification'
root.mkdir(mode=0o700, exist_ok=True)
config['state_directory'] = str(root)
store = ConversationStore(root / 'synthetic.db')
nonce = secrets.token_hex(8)
binding = binding_key('synthetic', 'continuity-check', nonce)
results = []
tools = [spec('finish', 'Report the synthetic remembered token.', {'token': STR})]
def call(name, args, call_id):
    if name != 'finish' or set(args) != {'token'}:
        raise ValueError('Unexpected tool')
    results.append(args['token'])
    return {'accepted': True}
instructions = 'Synthetic memory test. Use only finish. Never access files, shell, apps, network or other tools. Remember the user token and return it using finish. After finish stop.'
try:
    for request in ('Remember this token: ' + nonce, 'What token did I give you? Use finish without asking me again.'):
        CodexConversation(config, binding, store, tools, call).run(instructions, request)
    assert results == [nonce, nonce], 'continuity or tool completion failed'
    assert store.thread(binding)
    print(json.dumps({'synthetic_turns': 2, 'process_restart_resume': True,
                      'dynamic_tools': True, 'business_writes': 0, 'outbound_messages': 0}))
finally:
    store.close()
