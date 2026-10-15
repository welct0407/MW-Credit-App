"""Real resumed Codex thread, synthetic API Delete transport only; no messaging."""
import json,secrets
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.codex_conversation import CodexConversation
from mw_integration_agent.conversation_store import ConversationStore,binding_key
from mw_integration_agent.conversation_tools import TOOLS
from mw_integration_agent.partner_conversation import INSTRUCTIONS

config=load_json('/etc/mw-integration-agent/config.json')
config.update(state_backend='sqlite',reviewer_delete_enabled=False)
root=Path(config['state_directory'])/'delete-conversation-verification'
root.mkdir(mode=0o700,exist_ok=True);config['state_directory']=str(root)
store=ConversationStore(root/'synthetic.db')
nonce=secrets.token_hex(8);binding=binding_key('synthetic','delete-test',nonce)
phase=0;finished=[];deletes=[]
legacy=[t for t in TOOLS if not t['name'].startswith('database_')]
def call(name,a,call_id):
    if name=='finish':
        assert nonce in a['message'];finished.append(phase);return {'accepted':True}
    assert phase==1
    if name=='data_catalogue':
        return {'apps':{'oltp':{'version':'synthetic','tables':{'Borrowers':{'permission':'ALL_CHANGES','key':'Row ID','columns':{'Row ID':{'type':'Text'},'City':{'type':'Text'}}}}}}}
    if name=='read_records':
        assert a['table']=='Borrowers' and a['keys']==['b1']
        return {'observation':'observation-1','app':'oltp','table':'Borrowers','rows':[{'Row ID':'b1','City':'Synthetic'}],'complete':True}
    if name=='api_action':
        assert a['app']=='appsheet_delete' and a['action']=='Edit' and a['row_id']=='b1'
        assert json.loads(a['row_json'])=={'owning_app':'oltp'} and json.loads(a['expected_final_json'])=={}
        assert a['observation']=='observation-1'
        deletes.append(a);return {'observation':'observation-2','state':'VERIFIED','operation':'synthetic-delete','row_absent':True}
    raise AssertionError('Unexpected tool; no external transport allowed')
try:
    CodexConversation(config,binding,store,legacy,call).run('Remember the token. Use finish CLARIFY with token and empty observations. Stop after finish.','Remember '+nonce)
    thread=store.thread(binding);phase=1
    CodexConversation(config,binding,store,TOOLS,call).run(INSTRUCTIONS,
        'Synthetic English fixture. I am the authenticated AI Reviewer. Delete Borrowers b1. '
        'The owning app is oltp and this isolated fixture has no dependent rows or triggers. '
        'Use the supported AppSheet Delete compatibility route available in this existing session, after discovery and exact-key observation. '
        'Include the remembered token in your final reply. All tools here are simulated.')
    assert finished==[0,1] and len(deletes)==1 and store.thread(binding)==thread
    print(json.dumps({'resumed_same_thread':True,'memory_preserved':True,'legacy_delete_alias':True,'simulated_deletes':1,'production_writes':0,'outbound_messages':0}))
finally:store.close()
