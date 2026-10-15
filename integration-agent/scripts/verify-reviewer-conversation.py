"""Real Codex, synthetic data: old tool schemas, resumed history, new DML aliases.

No database connection, business write, signed message or delivery occurs.
"""
import json
import secrets
from pathlib import Path
from mw_integration_agent.config import load_json
from mw_integration_agent.codex_conversation import CodexConversation
from mw_integration_agent.conversation_store import ConversationStore,binding_key
from mw_integration_agent.conversation_tools import TOOLS
from mw_integration_agent.partner_conversation import INSTRUCTIONS

config=load_json('/etc/mw-integration-agent/config.json')
config['conversation_timeout_seconds']=180
root=Path(config['state_directory'])/'reviewer-conversation-verification'
root.mkdir(mode=0o700,exist_ok=True);config['state_directory']=str(root)
store=ConversationStore(root/'synthetic.db')
nonce=secrets.token_hex(8);binding=binding_key('synthetic','reviewer-dml',nonce)
phase=0;finished=[];transactions=[]
legacy=[t for t in TOOLS if not t['name'].startswith('database_')]

def call(name,a,call_id):
    if name=='finish':
        assert nonce in a['message'], 'Persistent context lost'
        finished.append(phase)
        return {'accepted':True}
    assert phase==1 and a.get('app')=='database', 'Only synthetic database aliases allowed'
    if name=='data_catalogue':
        return {'tables':['Borrowers'],'table':'Borrowers','key':'Row ID',
                'columns':{'Row ID':{'type':'text'},'City':{'type':'text'}},
                'writable_fields':['City'],'constraints':[],'triggers':[]}
    if name=='read_records':
        assert a['keys']==['b1']
        return {'observation':'observation-1','database':True,'table':'Borrowers',
                'rows':[{'Row ID':'b1','City':'Old city'}],'complete':True}
    if name=='api_action':
        assert a['table']=='transaction' and a['action']=='Edit' and not a['row_id']
        assert a['operation_key']=='transaction' and not a['observation']
        assert json.loads(a['expected_final_json'])['reason']
        steps=json.loads(a['row_json']);assert len(steps)==1
        step=steps[0]
        assert step['action']=='UPDATE' and step['table']=='Borrowers' and step['row_id']=='b1'
        assert step['values']=={'City':'New city'} and step['observation']=='observation-1'
        transactions.append(steps)
        return {'observation':'observation-2','state':'VERIFIED','write_verified':True,
                'records':[{'table':'Borrowers','rows':[{'Row ID':'b1','City':'New city'}]}]}
    raise AssertionError('Unexpected synthetic tool')

try:
    CodexConversation(config,binding,store,legacy,call).run(
        'Synthetic test. Remember the token. Use finish status CLARIFY with the token in message and empty observations. Stop after finish.',
        'Remember this token: '+nonce)
    previous=store.thread(binding)
    phase=1
    CodexConversation(config,binding,store,TOOLS,call).run(INSTRUCTIONS,
        'Synthetic fixture, English, authenticated AI Reviewer. Use the database aliases available in this existing session. '
        'Correct Borrowers row b1 City to New city using one atomic database transaction. '
        'Discover metadata and observe the row first. This is synthetic data only. '
        'Include the token remembered from my previous message in your finish response.')
    assert finished==[0,1] and len(transactions)==1 and store.thread(binding)==previous
    print(json.dumps({'resumed_same_thread':True,'memory_preserved':True,'legacy_tool_database_aliases':True,
                      'simulated_transactions':1,'production_writes':0,'outbound_messages':0}))
finally:store.close()
