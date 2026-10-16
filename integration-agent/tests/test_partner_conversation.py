import copy
import json
from pathlib import Path
import tempfile
import sys
import time
import uuid
from datetime import datetime, UTC
import unittest
from unittest.mock import patch

from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import ConversationTools
from mw_integration_agent.conversation_write import api_action, verify_operation, dispatch_action
from mw_integration_agent.conversation_schema import load_schema
from mw_integration_agent.conversation_commands import FIELDS
from mw_integration_agent.partner_conversation import authenticate, execute, PartnerDenied, is_receipt_reply
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.journal import IngressJournal

PARTNER = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English',
           'email': 'test@example.com', 'enabled': True}
ROW = {'Row ID': 'b1', 'Borrower Name': 'Synthetic', 'Description': 'Example', 'City': 'Old city',
       'Address': '', 'Working Location': '', 'Borrower Note': '', 'Amount': '0.10', 'Payment Request Token': 'hidden'}


class Conversations(unittest.TestCase):
    def setUp(self):
        def no_http(request,*args,**kwargs):
            url=getattr(request,'full_url',str(request))
            self.assertNotIn('appsheet.com',url,'Native workflow attempted retired AppSheet HTTP')
            raise AssertionError('Unmocked external HTTP in native conversation fixture')
        for target in ('urllib.request.urlopen','urllib.request.OpenerDirector.open'):
            http_tripwire=patch(target,side_effect=no_http)
            http_tripwire.start();self.addCleanup(http_tripwire.stop)
        reviewer_patch = patch('mw_integration_agent.conversation_write.require_reviewer', return_value='actor@example.com')
        reviewer_patch.start(); self.addCleanup(reviewer_patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = ConversationStore(self.root / 'conversations.db')
        self.config = {'state_directory': str(self.root), 'instagram_account_id': '100',
                       'partner_conversations_enabled': True, 'conversation_writes_enabled': True,
                       'conversation_api_environment':'dev'}
        self.rows = [copy.deepcopy(ROW)]
        for field in FIELDS['Borrowers'][1].values():self.rows[0].setdefault(field,None)
        self.rows[0]['Hidden Flag']=False
        self.rows[0]['_nativeVersion']='a'*64
        self.finds = []
        parent = self
        class Client:
            def __init__(self, config, app='oltp'):
                self.app = app
            def query(self, table, columns, predicate, limit):
                parent.finds.append((self.app, table, predicate))
                rows=parent.rows
                if predicate and predicate.get('field')=='Row ID':
                    values=predicate['value'] if predicate['op']=='in' else [predicate['value']]
                    rows=[r for r in rows if r['Row ID'] in values]
                return copy.deepcopy(rows[:limit])
        self.Client = Client
        self.event = {'message_id': 'event1', 'sender_id': '999', 'text': 'Change the city to New city', 'attachments': '[]'}
        columns = {k: {'Type': 'Price' if k=='Amount' else 'Yes/No' if k=='Hidden Flag' else 'Text',
                       'nativeStatus':'physical','nativeWriteActions':['Add','Edit']} for k in self.rows[0] if not k.startswith('_')}
        columns['Instagram Username'] = dict(columns['City'])
        self.schema_data = {'apps':{app:{'version':'synthetic','tables':{
            'Borrowers':{'key':'Row ID','permission':'ALL_CHANGES','columns':columns,'native':True,'defaults':{'values':{'Hidden Flag':False}},'context':{'businessDate':'2026-10-12'}},
            'Partners':{'key':'Row ID','permission':'ALL_CHANGES','columns':columns}}}
            for app in ('oltp','olap')}}
        self.tools = self.bridge('event1')
        def status_call(config,route,payload=None,request_id=None):
            self.assertEqual(route,'status')
            op=self.store.db.execute('SELECT request FROM conversation_operations ORDER BY rowid DESC LIMIT 1').fetchone()
            command=json.loads(op[0])['nativeRequest']['command']
            return 200,{'kind':'recorded','originalOutcome':{'status':'applied','result':{'operation':command['operation'],'targetId':command['targetId']}}}
        native_patch=patch('mw_integration_agent.conversation_api.call',side_effect=status_call)
        native_patch.start();self.addCleanup(native_patch.stop)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def query(self, **overrides):
        args = {'app':'oltp', 'table': 'Borrowers', 'keys': ['b1'], 'match_field': '', 'match_text': '', 'filter':'',
                'columns': ['City', 'Amount'], 'offset': 0, 'limit': 100}
        args.update(overrides)
        return self.tools.call('read_records', args, 'query-' + uuid.uuid4().hex)

    def bridge(self, message):
        return ConversationTools(lambda:self.config,self.store,message,self.event['text'],self.Client,
                                 partner_id='synthetic-partner',schema_reader=lambda _:self.schema_data)

    def edit_args(self):
        observed = self.query()
        return {'app':'oltp','table':'Borrowers','action':'Edit','row_id':'b1',
                'operation_key':'change-city','observation':observed['observation'],
                'instruction_quote':self.event['text'],'row_json':'{"City":"New city"}',
                'expected_final_json':'{}'}

    def perform(self, args, writer=None):
        def update(c,app,table,action,row,actor):
            command=row['nativeRequest']['command']
            values={FIELDS[table][1][k]:v for k,v in command['inputs'].items()}
            if action=='Edit': self.rows[0].update(values)
            else:self.rows.append({'Row ID':command['targetId'],**values,'_nativeVersion':'a'*64})
        return api_action(self.tools,args,writer or update,lambda *_:'actor@example.com')

    def test_persistent_binding_and_cross_partner_sender_account_isolation(self):
        keys = {binding_key(*v) for v in [('a','p','s'), ('a','q','s'), ('a','p','t'), ('b','p','s')]}
        self.assertEqual(len(keys), 4)
        key = binding_key('a', 'p', 's')
        self.store.bind(key, 'thread1')
        self.store.close()
        self.store = ConversationStore(self.root / 'conversations.db')
        self.assertEqual(self.store.thread(key), 'thread1')
        with self.assertRaises(ConfigurationError):
            self.store.bind(key, 'thread2')

    def test_abandoned_turn_is_not_replayed(self):
        self.assertTrue(self.store.reserve(self.event, 'binding', PARTNER))
        self.store.recover()
        self.assertFalse(self.store.reserve(self.event, 'binding', PARTNER))
        self.assertEqual(self.store.db.execute('SELECT status FROM turns').fetchone()[0], 'INTERRUPTED')

    def test_authentication_rejects_unknown_revoked_duplicate_wrong_sender_language(self):
        identity = lambda *_: {'id': '999', 'username': 'testpartner'}
        self.assertEqual(authenticate(self.config, '999', [PARTNER], identity), PARTNER)
        for rows in ([], [dict(PARTNER, enabled=False)], [PARTNER, PARTNER], [dict(PARTNER, language='')]):
            with self.assertRaises(PartnerDenied):
                authenticate(self.config, '999', rows, identity)
        with self.assertRaises(PartnerDenied):
            authenticate(self.config, '998', [PARTNER], identity)

    def test_current_data_and_decimal_sum(self):
        observation = self.query()
        result = self.tools.call('sum_field', {'observation': observation['observation'], 'field': 'Amount', 'group_by': ''}, 'sum1')
        self.assertEqual(result['totals'], {'total': '0.10'})
        self.assertTrue(result['complete'])
        with self.assertRaises(ConfigurationError):
            self.tools.call('sum_field', {'observation': 'old-turn', 'field': 'Amount', 'group_by': ''}, 'sum2')

    def test_no_hidden_fields_or_arbitrary_tables(self):
        for args in ({'columns': ['_RowNumber']}, {'table': 'Unknown Table'}, {'table': 'flyway_schema_history'}):
            with self.assertRaises(ConfigurationError):
                self.query(**args)

    def test_bounds_injection_and_partial_sums(self):
        with self.assertRaises(ConfigurationError):
            self.query(keys=['x") OR TRUE'])
        self.rows = [dict(ROW, **{'Row ID': f'b{i}'}) for i in range(1001)]
        with self.assertRaises(ConfigurationError):
            self.query(keys=[])
        self.rows = [dict(ROW, **{'Row ID': f'b{i}'}) for i in range(2)]
        result = self.query(keys=[], limit=1)
        self.assertFalse(result['complete'])

    def test_duplicate_tool_call_and_unknown_tool(self):
        a = {'app':'oltp','table': 'Borrowers'}
        self.tools.call('data_catalogue', a, 'one')
        with self.assertRaises(ConfigurationError):
            self.tools.call('data_catalogue', a, 'one')
        with self.assertRaises(ConfigurationError):
            self.tools.call('exec', {'command': 'anything'}, 'two')

    def test_generic_edit_and_readback(self):
        result = self.perform(self.edit_args())
        self.assertTrue(result['write_verified'])
        self.assertEqual(self.store.db.execute('SELECT state FROM conversation_operations').fetchone()[0], 'VERIFIED')

    def test_native_discovery_read_command_recovery_without_old_credentials(self):
        self.assertFalse(any(key.startswith('appsheet_') or key.startswith('conversation_schema_') for key in self.config))
        self.tools.call('data_catalogue',{'app':'oltp','table':'Borrowers'},'native-discovery')
        result=self.perform(self.edit_args())
        self.assertTrue(result['write_verified'])
        self.assertTrue(verify_operation(self.tools,result['operation'])['write_verified'])

    def test_native_add_on_reviewed_table_and_unknown_resource_denied(self):
        self.rows=[]
        a={'app':'oltp','table':'Borrowers','action':'Add','row_id':'',
           'operation_key':'new-borrower','observation':self.query(keys=[],columns=['Borrower Name'])['observation'],
           'instruction_quote':self.event['text'],'row_json':'{"Borrower Name":"Example","Hidden Flag":false}','expected_final_json':'{}'}
        result=self.perform(a)
        self.assertTrue(result['write_verified'])
        self.assertEqual(len(self.rows[0]['Row ID']),36)
        self.assertEqual(self.rows[0]['Borrower Name'],'Example')
        a['observation']=self.query(keys=[],columns=['Borrower Name'])['observation']
        with self.assertRaisesRegex(ConfigurationError,'IDENTICAL_ADD'):
            self.perform(a)
        with self.assertRaisesRegex(ConfigurationError,'UNKNOWN_APP_OR_TABLE'):
            self.query(table='Synthetic Inventory')

    def test_uncertain_write_blocks_other_messages_and_can_only_be_read_back(self):
        a=self.edit_args()
        def uncertain(*_): raise TimeoutError()
        with self.assertRaisesRegex(ConfigurationError,'UNCERTAIN'):
            self.perform(a,uncertain)
        operation=self.store.db.execute('SELECT id FROM conversation_operations').fetchone()[0]
        self.tools=self.bridge('new-event')
        with self.assertRaisesRegex(ConfigurationError,'PRIOR_OPERATION_UNCERTAIN'):
            self.perform(self.edit_args())
        with self.assertRaises(ConfigurationError):verify_operation(self.tools,operation)
        self.tools=self.bridge('event1')
        self.assertFalse(verify_operation(self.tools,operation)['write_verified'])
        self.rows[0]['City']='New city'
        self.assertTrue(verify_operation(self.tools,operation)['write_verified'])

    def test_native_unknown_status_never_resubmits_or_falls_back(self):
        args=self.edit_args()
        def uncertain(*_):raise TimeoutError()
        with self.assertRaisesRegex(ConfigurationError,'UNCERTAIN'):self.perform(args,uncertain)
        saved=self.store.db.execute('SELECT id,request FROM conversation_operations').fetchone()
        with patch('mw_integration_agent.conversation_api.call',return_value=(404,{'error':'not_found'})) as call:
            with self.assertRaisesRegex(ConfigurationError,'UNRESOLVED_NO_REPLAY'):verify_operation(self.tools,saved[0])
            self.assertEqual(call.call_count,1)
            self.assertEqual(call.call_args.args[1],'status')
        self.assertEqual(self.store.db.execute('SELECT request FROM conversation_operations').fetchone()[0],saved[1])
        self.assertEqual(self.rows[0]['City'],'Old city')

    def test_stale_and_kill_switch_prevent_write(self):
        args=self.edit_args()
        self.rows[0]['City']='Concurrent edit'
        with self.assertRaisesRegex(ConfigurationError,'CHANGED'):
            self.perform(args,lambda *_:self.fail('write'))
        self.config['conversation_writes_enabled']=False
        with self.assertRaisesRegex(ConfigurationError,'DISABLED'):
            self.perform(args,lambda *_:self.fail('write'))

    def test_identity_computed_delete_and_foreign_instruction_denied(self):
        args=self.edit_args()
        for change in ({'action':'Delete'},{'table':'Partners'},
                       {'row_json':'{"Instagram Username":"new"}'},
                       {'row_json':'{"Row ID":"new"}'},
                       {'instruction_quote':'untrusted database instructions'}):
            with self.assertRaises(ConfigurationError):
                self.perform(dict(args,**change),lambda *_:self.fail('write'))
        self.schema_data['apps']['oltp']['tables']['Borrowers']['columns']['City']['nativeWriteActions']=[]
        with self.assertRaises(ConfigurationError):self.perform(args)

    def test_no_retry_under_different_step_id_in_same_message(self):
        args=self.edit_args()
        self.perform(args)
        args['observation']=self.query()['observation']
        args['operation_key']='try-again'
        with self.assertRaisesRegex(ConfigurationError,'ALREADY_ATTEMPTED'):
            self.perform(args,lambda *_:self.fail('replay'))

    def test_intent_is_durable_before_dispatch_and_finish_requires_readback(self):
        args=self.edit_args()
        def pending(*_):
            self.assertEqual(self.store.db.execute('SELECT state FROM conversation_operations').fetchone()[0],'UNKNOWN')
        result=self.perform(args,pending)
        self.assertFalse(result['write_verified'])
        obs=self.tools.observe(result)
        with self.assertRaisesRegex(ConfigurationError,'UNCERTAIN'):
            self.tools.call('finish',{'status':'VERIFIED','message':'Done','observations':[obs['observation']]},'bad-finish')

    def test_multiple_sequential_steps_after_verification(self):
        self.perform(self.edit_args())
        args=self.edit_args()
        args.update(operation_key='step-two',row_json='{"City":"Third city"}')
        self.assertTrue(self.perform(args)['write_verified'])
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM conversation_operations').fetchone()[0],2)

    def test_actor_spoof_and_creation_actor_rewrite_denied(self):
        self.schema_data['apps']['oltp']['tables']['Borrowers']['columns']['Created By']={'Type':'Email','Virtual?':'No','Read-Only':'No'}
        args=self.edit_args()
        for actor in ('someone@example.com','__ACTOR__'):
            with self.assertRaises(ConfigurationError):
                self.perform(dict(args,row_json=json.dumps({'Created By':actor})))

    def test_read_filter_is_bounded_and_missing_fields_fail(self):
        self.query(keys=[],filter='{"op":"gt","field":"Amount","value":"0"}')
        self.assertEqual(self.finds[-1][2],{'op':'gt','field':'Amount','value':'0'})
        for expression in ('true), 99999)', '"unclosed'):
            with self.assertRaises(ConfigurationError):self.query(keys=[],filter=expression)
        self.tools.cache.clear()
        del self.rows[0]['Amount']
        with self.assertRaisesRegex(ConfigurationError,'SCHEMA_CHANGED'):self.query()

    def test_native_schema_digest_and_actor_binding_without_appsheet_bootstrap(self):
        config={'_conversation_partner_id':'actor','conversation_api_manifest_sha256':'a'*64}
        def catalogue(config,route,payload):
            self.assertEqual(route,'catalogue');self.assertEqual(payload['actorPartnerId'],'actor')
            return 200,{'manifestSha256':'a'*64,'resources':[{'scope':payload['scope'],'resource':'Borrowers',
                'key':'Row ID','legacyPermission':'ALL_CHANGES','mutationProtected':False,
                'fields':[{'name':'Row ID','sourceType':'Text','nativeStatus':'physical','legacyWriteActions':[]}]}]}
        with patch('mw_integration_agent.conversation_api.call',side_effect=catalogue):
            schema=load_schema(config)
            self.assertEqual(set(schema['apps']),{'oltp','olap'})
            self.assertTrue(schema['apps']['oltp']['tables']['Borrowers']['native'])
            with self.assertRaisesRegex(ConfigurationError,'SCHEMA'):load_schema(dict(config,conversation_api_manifest_sha256='b'*64))
            with self.assertRaisesRegex(ConfigurationError,'PARTNER'):load_schema({})

    def test_transport_exact_api_payload_actor_and_no_other_endpoint(self):
        config={'conversation_writes_enabled':True}
        request={'version':1,'actorPartnerId':'actor','kind':'operation','command':{'requestId':'synthetic'}}
        with patch('mw_integration_agent.conversation_api.call',return_value=(200,{})) as send:
            dispatch_action(config,'oltp','Borrowers','Add',{'nativeRequest':request},'actor@example.com')
            self.assertEqual(send.call_args.args,(config,'commands',request))
            with self.assertRaises(ConfigurationError):
                dispatch_action(config,'oltp','Anything','Delete',{},'actor@example.com')
            with self.assertRaisesRegex(ConfigurationError,'CANONICAL'):
                dispatch_action(config,'oltp','Borrowers','Add',{'Row ID':'raw'},'actor@example.com')
            self.assertEqual(send.call_count,1)

    def test_finish_needs_current_evidence_and_stops_tools(self):
        args = {'status': 'VERIFIED', 'message': 'Current answer', 'observations': []}
        with self.assertRaises(ConfigurationError):
            self.tools.call('finish', args, 'bad')
        args['observations'] = [self.query()['observation']]
        self.tools.call('finish', args, 'finish')
        with self.assertRaises(ConfigurationError):
            self.query()

    def test_execute_is_once_only_and_revocation_blocks_completion(self):
        parent = self
        class Session:
            def __init__(self, c, binding, store, tools, call):
                self.call = call
            def run(self, instructions, request):
                self.call('finish', {'status': 'CLARIFY', 'message': 'Which borrower?', 'observations': []}, 'finish')
        auth = lambda *_: PARTNER
        execute(self.event, PARTNER, self.store, lambda: self.config, Session, auth, self.Client)
        execute(self.event, PARTNER, self.store, lambda: self.config,
                lambda *_: parent.fail('duplicate turn'), auth, self.Client)
        self.assertEqual(self.store.db.execute('SELECT status FROM turns').fetchone()[0], 'READY')
        changed = dict(self.event, message_id='event2')
        execute(changed, PARTNER, self.store, lambda: self.config, Session,
                lambda *_: dict(PARTNER, enabled=False), self.Client)
        self.assertEqual(self.store.db.execute('SELECT status FROM turns WHERE message_id=?', ('event2',)).fetchone()[0], 'FAILED')

    def test_correlated_receipt_reply_never_enters_conversation(self):
        notices = NoticeJournal(self.root / 'partner-notices.db')
        key = notices.reserve('review:test', PARTNER, 'subject', 'body')
        with notices.db:
            notices.db.execute('UPDATE partner_notices SET message_id=? WHERE id=?', ('receipt-message', key))
        notices.close()
        self.assertTrue(is_receipt_reply(self.root, dict(self.event, reply_to='receipt-message')))
        self.assertTrue(is_receipt_reply(self.root, dict(self.event, reply_to='other')))
        self.assertFalse(is_receipt_reply(self.root, dict(self.event, reply_to='')))

    def test_configuration_requires_cutoff_dependencies_and_separate_write_control(self):
        config = load_json(Path(__file__).resolve().parents[1] / 'config.example.json')
        config['partner_conversations_enabled'] = True
        with self.assertRaises(ConfigurationError):
            validate_config(config)

    @unittest.skipIf(sys.platform == 'win32', 'Linux process lock')
    def test_worker_cutoff_receipt_ownership_and_once_only_reply_after_restart(self):
        from mw_integration_agent.partner_conversation import run
        now=time.time()
        self.config['partner_conversation_cutoff']=datetime.fromtimestamp(now-10,UTC).isoformat()
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.capture('synthetic-batch',[
            {'message_id':'old','sender_id':'999','timestamp':now-20,'text':'old'},
            {'message_id':'new','sender_id':'999','timestamp':now-1,'text':'new'},
            {'message_id':'unmatched','sender_id':'999','timestamp':now-1,'text':'reject','reply_to':'unknown-outbound'},
            {'message_id':'review','sender_id':'999','timestamp':now-1,'text':'Approve','reply_to':'receipt-message'},
            {'message_id':'borrower','sender_id':'777','timestamp':now-1,'text':'unsupported borrower'},
        ])
        ingress.close()
        notices=NoticeJournal(self.root/'partner-notices.db')
        key=notices.reserve('review:test',PARTNER,'subject','body')
        with notices.db:notices.db.execute('UPDATE partner_notices SET message_id=? WHERE id=?',('receipt-message',key))
        notices.close()
        def auth(c,sender,rows=None):
            if sender!='999':raise PartnerDenied('not partner')
            return PARTNER
        def complete(event,partner,store,get_config):
            self.assertEqual(event['message_id'],'new')
            store.reserve(event,'binding',partner)
            store.finish(event['message_id'],'READY',{'status':'CLARIFY','message':'Which record?'})
        module='mw_integration_agent.partner_conversation.'
        with patch(module+'controls',return_value=self.config),patch(module+'authenticate',side_effect=auth), \
             patch(module+'partners',return_value=[PARTNER]),patch(module+'execute',side_effect=complete) as execute_mock, \
             patch.object(NoticeJournal,'dispatch'):
            run('unused','unused');run('unused','unused')
            self.assertEqual(execute_mock.call_count,1)
        db=ConversationStore(self.root/'partner-conversations.db')
        states={r['message_id']:r['status'] for r in db.db.execute('SELECT * FROM turns')}
        db.close()
        self.assertEqual(states,{'new':'QUEUED','review':'IGNORED','unmatched':'IGNORED','borrower':'IGNORED'})
        outbox=NoticeJournal(self.root/'conversation-notices.db')
        self.assertEqual(len(outbox.due()),1)
        outbox.close()


if __name__ == '__main__':
    unittest.main()
