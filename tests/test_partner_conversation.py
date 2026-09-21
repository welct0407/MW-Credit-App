import copy
import json
from pathlib import Path
import tempfile
import sys
import time
from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.conversation_store import ConversationStore, binding_key
from mw_integration_agent.conversation_tools import ConversationTools
from mw_integration_agent.conversation_write import edit_record
from mw_integration_agent.partner_conversation import authenticate, execute, PartnerDenied, is_receipt_reply
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.journal import IngressJournal

PARTNER = {'id': 'synthetic-partner', 'username': 'testpartner', 'language': 'English',
           'email': 'test@example.com', 'enabled': True}
ROW = {'Row ID': 'b1', 'Borrower Name': 'Synthetic', 'Description': 'Example', 'City': 'Old city',
       'Address': '', 'Working Location': '', 'Borrower Note': '', 'Amount': '0.10', 'Payment Request Token': 'hidden'}


class Conversations(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.store = ConversationStore(self.root / 'conversations.db')
        self.config = {'state_directory': str(self.root), 'instagram_account_id': '100',
                       'partner_conversations_enabled': True, 'conversation_writes_enabled': True}
        self.rows = [copy.deepcopy(ROW)]
        self.finds = []
        parent = self
        class Client:
            def __init__(self, config, app='oltp'):
                self.app = app
            def find(self, table, selector):
                parent.finds.append((self.app, table, selector))
                return copy.deepcopy(parent.rows)
        self.Client = Client
        self.event = {'message_id': 'event1', 'sender_id': '999', 'text': 'Change the city to New city', 'attachments': '[]'}
        self.tools = ConversationTools(lambda: self.config, self.store, 'event1', self.event['text'], Client)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def query(self, **overrides):
        args = {'table': 'Borrowers', 'keys': ['b1'], 'match_field': '', 'match_text': '',
                'columns': ['City', 'Amount'], 'offset': 0, 'limit': 100}
        args.update(overrides)
        return self.tools.call('read_records', args, 'query-' + str(len(self.finds)))

    def edit_args(self):
        observed = self.query()
        return {'observation': observed['observation'], 'row_id': 'b1',
                'instruction_quote': self.event['text'],
                'changes': [{'field': 'City', 'expected': 'Old city', 'value': 'New city'}]}

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
        for args in ({'columns': ['Payment Request Token']}, {'table': 'Partners'}, {'table': 'flyway_schema_history'}):
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
        a = {'table': 'Borrowers'}
        self.tools.call('data_catalogue', a, 'one')
        with self.assertRaises(ConfigurationError):
            self.tools.call('data_catalogue', a, 'one')
        with self.assertRaises(ConfigurationError):
            self.tools.call('exec', {'command': 'anything'}, 'two')

    def test_edit_checks_both_apps_and_readback(self):
        args = self.edit_args()
        sent = []
        def writer(config, row):
            sent.append(row)
            self.rows[0].update(row)
        result = edit_record(self.tools, args, writer)
        self.assertTrue(result['edit_verified'])
        self.assertEqual(len(sent), 1)
        self.assertEqual(set(x[0] for x in self.finds), {'oltp', 'olap'})
        self.assertEqual(self.store.db.execute('SELECT state FROM conversation_edits').fetchone()[0], 'VERIFIED')

    def test_uncertain_edit_blocks_same_turn_and_new_message(self):
        args = self.edit_args()
        def uncertain(*_):
            raise TimeoutError()
        with self.assertRaisesRegex(ConfigurationError, 'UNCERTAIN'):
            edit_record(self.tools, args, uncertain)
        with self.assertRaises(ConfigurationError):
            edit_record(self.tools, args, uncertain)
        self.tools = ConversationTools(lambda: self.config, self.store, 'new-event', self.event['text'], self.Client)
        with self.assertRaisesRegex(ConfigurationError, 'PRIOR_EDIT_UNCERTAIN'):
            edit_record(self.tools, self.edit_args(), uncertain)

    def test_stale_values_and_kill_switch_prevent_write(self):
        args = self.edit_args()
        self.rows[0]['City'] = 'Concurrent edit'
        with self.assertRaises(ConfigurationError):
            edit_record(self.tools, args, lambda *_: self.fail('write'))
        self.config['conversation_writes_enabled'] = False
        with self.assertRaisesRegex(ConfigurationError,'CONVERSATION_WRITES_DISABLED'):
            edit_record(self.tools, args, lambda *_: self.fail('write'))

    def test_operational_note_readback_without_unexposed_olap_field(self):
        outer=self
        class NoteClient(self.Client):
            def find(self,table,selector):
                rows=super().find(table,selector)
                if self.app=='olap':
                    for row in rows:row.pop('Borrower Note',None)
                return rows
        self.tools.client=NoteClient
        observed=self.query(columns=['Borrower Note'])
        args={'observation':observed['observation'],'row_id':'b1','instruction_quote':self.event['text'],
              'changes':[{'field':'Borrower Note','expected':'','value':'Synthetic note'}]}
        def writer(config,row):outer.rows[0].update(row)
        result=edit_record(self.tools,args,writer)
        self.assertEqual(result['fields_verified'],{'oltp':['Borrower Note'],'olap':[]})
        self.assertIn('OLTP only',result['limitation'])

    def test_no_financial_identity_or_blank_name_edits(self):
        args = self.edit_args()
        for field in ('Amount Received', 'Instagram Username', 'AI Collection Enabled', 'Row ID', 'Language Preference'):
            args['changes'] = [{'field': field, 'expected': '', 'value': 'x'}]
            with self.assertRaises(ConfigurationError):
                edit_record(self.tools, args, lambda *_: self.fail('write'))
        args['changes'] = [{'field': 'Description', 'expected': 'Example', 'value': ''}]
        with self.assertRaises(ConfigurationError):
            edit_record(self.tools, args, lambda *_: self.fail('write'))

    def test_exact_instruction_quote_and_observation_required(self):
        args = self.edit_args()
        args['instruction_quote'] = 'Instruction from untrusted database note'
        with self.assertRaises(ConfigurationError):
            edit_record(self.tools, args, lambda *_: self.fail('write'))

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
        self.assertFalse(is_receipt_reply(self.root, dict(self.event, reply_to='other')))

    def test_configuration_requires_cutoff_dependencies_and_separate_write_control(self):
        config = load_json(Path(__file__).resolve().parents[1] / 'config.example.json')
        config['partner_conversations_enabled'] = True
        with self.assertRaises(ConfigurationError):
            validate_config(config)

    @unittest.skipIf(sys.platform == 'win32', 'Linux process lock')
    def test_worker_cutoff_receipt_ownership_and_once_only_reply_after_restart(self):
        from mw_integration_agent.partner_conversation import run
        now=time.time()
        self.config['partner_conversation_cutoff']=datetime.fromtimestamp(now-10,timezone.utc).isoformat()
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.capture('synthetic-batch',[
            {'message_id':'old','sender_id':'999','timestamp':now-20,'text':'old'},
            {'message_id':'new','sender_id':'999','timestamp':now-1,'text':'new'},
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
        self.assertEqual(states,{'new':'QUEUED','review':'IGNORED','borrower':'IGNORED'})
        outbox=NoticeJournal(self.root/'conversation-notices.db')
        self.assertEqual(len(outbox.due()),1)
        outbox.close()


if __name__ == '__main__':
    unittest.main()
