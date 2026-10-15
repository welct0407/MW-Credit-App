"""Synthetic fresh/resumed Instagram formatting check; no business reads or sends."""
import json
import re
import secrets
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.codex_conversation import CodexConversation
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import spec, STR
from mw_integration_agent.partner_conversation import INSTRUCTIONS

config = load_json('/etc/mw-integration-agent/config.json')
config['conversation_timeout_seconds'] = 180
root = Path(config['state_directory']) / 'conversation-format-verification'
root.mkdir(mode=0o700, exist_ok=True)
config['state_directory'] = str(root)
store = ConversationStore(root / 'synthetic.db')
binding = binding_key('synthetic', 'format-check', secrets.token_hex(8))
answers = []
tools = [spec('finish', 'Return the synthetic formatted message.', {'message': STR})]

def call(name, args, call_id):
    assert name == 'finish' and set(args) == {'message'}
    answers.append(args['message'])
    return {'accepted': True}

try:
    for language in ('English', 'ไทย'):
        request = json.dumps({'partner_language': language, 'message':
            'Synthetic formatting exercise, not live business facts. Explain expected payment '
            'tomorrow 28 September 2026: loan A dated 1 September, principal due 0, interest 300; '
            'loan B dated 3 September, principal due 0, interest 100; total THB400. Exclude '
            'overdue THB1050. This is a projection as of 27 September 2026 23:40 Bangkok. '
            'Use finish with message only. Preserve these figures and caveats.'}, ensure_ascii=False)
        CodexConversation(config, binding, store, tools, call).run(INSTRUCTIONS, request)
    assert len(answers) == 2 and store.thread(binding)
    for answer in answers:
        assert not re.search(r'\||```|\*\*|^#{1,6}\s|\[[^]]+\]\(', answer, re.M)
        assert '\n' in answer
        for amount in ('300', '100', '400', '1050'):
            assert amount in answer.replace(',', '')
    print(json.dumps({'fresh_and_resumed_turns': 2, 'languages': ['English', 'Thai'],
                      'plain_text': True, 'amounts_preserved': True,
                      'business_reads': 0, 'business_writes': 0, 'messages_sent': 0}))
    for answer in answers:
        print(answer)
finally:
    store.close()
