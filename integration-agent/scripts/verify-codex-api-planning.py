"""Real Codex + synthetic API: prove model-selected edits and persistent follow-up.

No production records, AppSheet requests or outbound notifications are used.
"""
import copy
import json
import secrets
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.config import load_json
from mw_integration_agent.codex_conversation import CodexConversation
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import ConversationTools, TOOLS
from mw_integration_agent.conversation_write import api_action
from mw_integration_agent.partner_conversation import INSTRUCTIONS

config=load_json('/etc/mw-integration-agent/config.json')
config['conversation_timeout_seconds']=300
config['conversation_writes_enabled']=True
root=Path(config['state_directory'])/'conversation-verification'
root.mkdir(mode=0o700,exist_ok=True)
config['state_directory']=str(root)
nonce=secrets.token_hex(8)
store=ConversationStore(root/('planning-'+nonce+'.db'))
binding=binding_key('synthetic','api-planning',nonce)
rows=[{'Row ID':'synthetic-alpha','Item':'Alpha','Memo':'Pending'}]
schema={'apps':{'oltp':{'version':'synthetic','tables':{'Synthetic Work Items':{
    'key':'Row ID','permission':'ALL_CHANGES','columns':{
      k:{'Type':'Text','Virtual?':'No','Read-Only':'No','Editable Initial Value?':'Yes'}
      for k in rows[0]}}}}}}
class Client:
    def __init__(self,*_): pass
    def find(self,table,selector):
        assert table=='Synthetic Work Items'
        return copy.deepcopy(rows)
sent=[]
def writer(config,app,table,action,row,actor):
    assert (app,table,action)==('oltp','Synthetic Work Items','Edit')
    assert row=={'Row ID':'synthetic-alpha','Memo':'Reviewed'}
    sent.append(row)
    rows[0].update(row)

try:
    for i,request in enumerate(('Change the memo on work item Alpha to Reviewed.',
                                'What is its memo now? Do not edit anything.')):
        bridge=ConversationTools(lambda:config,store,'synthetic-'+nonce+str(i),request,Client,
                                 partner_id='synthetic',schema_reader=lambda _:schema)
        with patch('mw_integration_agent.conversation_write.api_action',
                   side_effect=lambda b,a:api_action(b,a,writer,lambda *_:'synthetic@example.com')):
            CodexConversation(config,binding,store,TOOLS,bridge.call).run(INSTRUCTIONS,
                json.dumps({'partner_language':'English','request':request,'writes_enabled':True}))
        assert bridge.result and bridge.result['status']=='VERIFIED'
        assert 'Reviewed' in bridge.result['message'] or 'reviewed' in bridge.result['message']
    assert len(sent)==1
    print(json.dumps({'synthetic_turns':2,'codex_selected_api_edit':True,
                      'followup_resumed':True,'synthetic_writes':1,'production_writes':0,'messages_sent':0}))
finally:
    store.close()
