import json
import os
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

from mw_integration_agent import conversation_dml as dml
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_reviewer import require_reviewer
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.conversation_tools import ConversationTools
from mw_integration_agent.conversation_write import api_action


def step(**kwargs):
    return dict({'action':'UPDATE','table':'Borrowers','row_id':'b1',
                 'values':{'City':'New city'},'expected_after':{},'observation':'observation-1'},**kwargs)


class Boundaries(unittest.TestCase):
    def test_reviewer_requires_current_true_role_and_login(self):
        for rows in ([],[None],['invalid'],['a@example.com','b@example.com']):
            with patch('mw_integration_agent.cash_statement.read_query',return_value=rows):
                with self.assertRaises(ConfigurationError): require_reviewer({},'p1')
        with patch('mw_integration_agent.cash_statement.read_query',return_value=['a@example.com']) as query:
            self.assertEqual(require_reviewer({},'p1'),'a@example.com')
            self.assertIn('"AI Reviewer" IS TRUE',query.call_args.args[1])

    def test_plan_denies_sql_ddl_delete_identities_and_extra_keys(self):
        for change in ({'action':'DELETE'},{'action':'CREATE'},{'table':'Partners'},
                       {'table':'Borrowers; DROP TABLE Loans'}, {'table':'Cash Ledger'}, {'sql':'DROP TABLE x'},
                       {'values':{'Row ID':'other'}},{'values':{'City':{'sql':'now()'}}}):
            with self.subTest(change=change), self.assertRaises(ConfigurationError):
                dml.parse_plan(json.dumps([step(**change)]))
        with self.assertRaises(ConfigurationError): dml.parse_plan(json.dumps([step()]*2))
        with self.assertRaises(ConfigurationError): dml.parse_plan('[{"action":"UPDATE","action":"INSERT"}]')

    def test_delete_steps_are_refused_before_any_database_call(self):
        # Reviewer DELETE retired (16 October 2026): the plan parser refuses it and the catalogue no longer offers it.
        with self.assertRaisesRegex(ConfigurationError, '^REVIEWER_DELETE_RETIRED$'):
            dml.parse_plan(json.dumps([step(action='DELETE', values={}, expected_after={})]))
        bridge = type('Bridge', (), {'authorize': lambda s: {'reviewer_dml_enabled': True, 'reviewer_dml_cutoff': '2026-01-01T00:00:00+00:00',
                                                            '_conversation_event_timestamp': 2000000000, '_conversation_captured_at': 2000000000},
                                     'partner_id': 'p1'})()
        with patch.object(dml, 'require_reviewer', return_value='a@example.com'), \
             patch('psycopg.connect', side_effect=AssertionError('no connection for the resource list')):
            catalogue = dml.catalogue(bridge, '')
        self.assertEqual(catalogue['actions'], ['INSERT', 'UPDATE'])
        self.assertIn('DELETE is retired', catalogue['limits'])

    def test_literal_sql_text_is_a_value(self):
        value="'; DROP TABLE public.\"Loans\"; --"
        self.assertEqual(dml.parse_plan(json.dumps([step(values={'City':value})]))[0]['values']['City'],value)

    def test_api_requires_reviewer_before_dispatch(self):
        bridge=type('Bridge',(),{'authorize':lambda s:{'conversation_writes_enabled':True},'partner_id':'p1'})()
        with patch('mw_integration_agent.conversation_write.require_reviewer',side_effect=ConfigurationError('CURRENT_AI_REVIEWER_REQUIRED')):
            with self.assertRaisesRegex(ConfigurationError,'CURRENT_AI_REVIEWER_REQUIRED'):
                api_action(bridge,{})

    def test_dev_target_connects_to_dev_database_with_dev_role(self):
        # ALL-ARCH-02: the environment picks the database/role pair; a mismatched pair is refused.
        class Conn:
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def execute(self, *_): return self
            def rollback(self): return None
        with tempfile.TemporaryDirectory() as secrets:
            Path(secrets, 'dml.txt').write_text('synthetic')
            base = dict(database_host='127.0.0.1', database_port=5432, secrets_directory=secrets,
                        database_dml_password_file=str(Path(secrets) / 'dml.txt'))
            with patch('psycopg.connect', return_value=Conn()) as connect:
                with dml.connect(dict(base, database_name='loan_manager_dev', database_dml_user='mw_reviewer_dml_dev')):
                    pass
                self.assertEqual((connect.call_args.kwargs['dbname'], connect.call_args.kwargs['user']), ('loan_manager_dev', 'mw_reviewer_dml_dev'))
                with dml.connect(dict(base, database_name='loan_manager_prod', database_dml_user='mw_reviewer_dml')):
                    pass
                self.assertEqual((connect.call_args.kwargs['dbname'], connect.call_args.kwargs['user']), ('loan_manager_prod', 'mw_reviewer_dml'))
                for change in ({'database_name': 'loan_manager_dev', 'database_dml_user': 'mw_reviewer_dml'},
                               {'database_name': 'loan_manager_prod', 'database_dml_user': 'mw_reviewer_dml_dev'},
                               {'database_name': 'loan_manager_test', 'database_dml_user': 'mw_reviewer_dml'}):
                    with self.subTest(change=change), self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_DML_DATABASE'):
                        with dml.connect(dict(base, **change)):
                            pass

    def test_iam_sign_in_sets_role_first_and_reads_no_password(self):
        # ALL-ARCH-03 part 2b: database_dml_auth='iam' logs in as the IAM user on 5433 and SET ROLE before BEGIN.
        class Conn:
            def __init__(self): self.statements = []
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def execute(self, statement, *_): self.statements.append(statement); return self
            def rollback(self): return None
        iam_user = 'mw-integration-agent@clever-oasis-508610-n7.iam'
        base = dict(database_host='127.0.0.1', database_port=5432, database_dml_auth='iam', database_iam_user=iam_user,
                    iam_database_port=5433, secrets_directory='/nonexistent')
        for database, role in (('loan_manager_prod', 'mw_reviewer_dml'), ('loan_manager_dev', 'mw_reviewer_dml_dev')):
            conn = Conn()
            with self.subTest(database=database), patch('psycopg.connect', return_value=conn) as connect, \
                    patch.object(dml, 'load_secret', side_effect=AssertionError('no password under iam')):
                with dml.connect(dict(base, database_name=database, database_dml_user=role), write=True):
                    pass
                kwargs = connect.call_args.kwargs
                self.assertNotIn('password', kwargs)
                self.assertEqual((kwargs['port'], kwargs['user'], kwargs['dbname'], kwargs['autocommit']), (5433, iam_user, database, True))
                self.assertEqual(kwargs['options'], '-c default_transaction_read_only=on')
                self.assertEqual(conn.statements[:2], ['SET ROLE ' + role, 'BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE'])
                self.assertIn("SET LOCAL statement_timeout = '15s'", conn.statements)
        # The 5432 guard belongs to the password branch; the IAM branch needs the IAM user and fixed listener.
        with patch('psycopg.connect', return_value=Conn()):
            with dml.connect(dict(base, database_name='loan_manager_prod', database_dml_user='mw_reviewer_dml', database_port=5433)):
                pass
        for change in ({'iam_database_port': 5432}, {'database_iam_user': 'someone@example.com'}, {'database_dml_auth': 'token'},
                       {'database_dml_user': 'mw_reviewer_dml_dev'}, {'database_host': '10.0.0.5'}):
            with self.subTest(change=change), patch('psycopg.connect', side_effect=AssertionError('refused before connecting')), \
                    self.assertRaises(ConfigurationError):
                with dml.connect(dict(dict(base, database_name='loan_manager_prod', database_dml_user='mw_reviewer_dml'), **change)):
                    pass

    def test_dml_disabled_old_message_and_revoked_reviewer(self):
        config={'reviewer_dml_enabled':False}
        bridge=type('Bridge',(),{'authorize':lambda s:config,'partner_id':'p1'})()
        with self.assertRaisesRegex(ConfigurationError,'DISABLED'): dml.authorize(bridge)
        config.update(reviewer_dml_enabled=True,reviewer_dml_cutoff='2026-09-22T00:00:00+00:00')
        with self.assertRaisesRegex(ConfigurationError,'PREDATES'): dml.authorize(bridge)
        config.update(_conversation_event_timestamp=2000000000,_conversation_captured_at=2000000000)
        with patch.object(dml,'require_reviewer',side_effect=ConfigurationError('CURRENT_AI_REVIEWER_REQUIRED')):
            with self.assertRaisesRegex(ConfigurationError,'CURRENT_AI_REVIEWER_REQUIRED'): dml.authorize(bridge)


@unittest.skipUnless(os.environ.get('MW_DML_TEST_DSN'),'disposable PostgreSQL fixture required')
class DatabaseTransactions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dsn=os.environ['MW_DML_TEST_DSN']
        with psycopg.connect(cls.dsn,autocommit=True) as conn:
            host=conn.info.host
            if host not in ('127.0.0.1','localhost') or not conn.info.dbname.startswith('mw_dml_test'):
                raise RuntimeError('Synthetic tests require named disposable loopback database')
            conn.execute('''CREATE TABLE public."Borrowers" ("Row ID" text PRIMARY KEY,
                "City" text CHECK ("City" <> 'blocked'), "Created By" text)''')

    def setUp(self):
        with psycopg.connect(self.dsn,autocommit=True) as conn:
            conn.execute('TRUNCATE public."Borrowers"')
            conn.execute('INSERT INTO public."Borrowers" VALUES (%s,%s,%s),(%s,%s,%s)',
                         ('b1','Old city','creator@example.com','b2','Old city','creator@example.com'))
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store=ConversationStore(Path(self.temp.name)/'journal.db');self.addCleanup(self.store.close)
        self.config={'reviewer_dml_enabled':True,'reviewer_dml_cutoff':'2026-09-22T00:00:00+00:00',
                     '_conversation_event_timestamp':2000000000,'_conversation_captured_at':2000000000}
        schema={'apps':{'oltp':{'tables':{'Borrowers':{'key':'Row ID','columns':{
            f:{'Read-Only':'No','Virtual?':'No'} for f in ('Row ID','City','Created By')}}}}}}
        self.bridge=ConversationTools(lambda:self.config,self.store,'m1','Correct these cities',
                                      partner_id='p1',schema_reader=lambda _:schema)
        self.revoked=False;self.fail_commit=False
        def reviewer(*_):
            if self.revoked: raise ConfigurationError('CURRENT_AI_REVIEWER_REQUIRED')
            return 'reviewer@example.com'
        @contextmanager
        def connect(_,write=False):
            with psycopg.connect(self.dsn,autocommit=True,row_factory=dict_row) as conn:
                conn.execute('BEGIN ISOLATION LEVEL SERIALIZABLE '+('READ WRITE' if write else 'READ ONLY'))
                if self.fail_commit:
                    class LostAck:
                        def execute(s,*args,**kwargs): return conn.execute(*args,**kwargs)
                        def commit(s):
                            conn.commit(); raise OSError('lost acknowledgement')
                    yield LostAck()
                else: yield conn
                conn.rollback()
        for name,value in [('require_reviewer',reviewer),('connect',connect)]:
            p=patch.object(dml,name,value);p.start();self.addCleanup(p.stop)

    def observe(self,key='b1'):
        return dml.read(self.bridge,'Borrowers',{'Row ID':key})['observation']

    def execute(self,steps=None):
        return dml.transaction(self.bridge,{'steps_json':json.dumps(steps or [step()]),
            'instruction_quote':'Correct these cities','reason':'Reviewer requested correction'})

    def city(self,key='b1'):
        with psycopg.connect(self.dsn) as conn:
            return conn.execute('SELECT "City" FROM public."Borrowers" WHERE "Row ID"=%s',(key,)).fetchone()[0]

    def test_commit_and_durable_audit(self):
        self.observe();result=self.execute()
        self.assertTrue(result['write_verified']);self.assertEqual(self.city(),'New city')
        saved=self.store.db.execute('SELECT * FROM conversation_dml').fetchone()
        self.assertEqual(saved['actor'],'reviewer@example.com')
        self.assertIn('Old city',saved['request']);self.assertEqual(saved['state'],'VERIFIED')
        with self.assertRaisesRegex(ConfigurationError,'ALREADY_ATTEMPTED'):self.execute()

    def test_transaction_is_atomic_on_second_step_failure(self):
        first=self.observe();second=self.observe('b2')
        with self.assertRaisesRegex(ConfigurationError,'ROLLED_BACK'):
            self.execute([step(observation=first),step(row_id='b2',values={'City':'blocked'},observation=second)])
        self.assertEqual(self.city(),'Old city');self.assertEqual(self.city('b2'),'Old city')
        self.assertEqual(self.store.db.execute('SELECT state FROM conversation_dml').fetchone()[0],'ROLLED_BACK')

    def test_stale_value_rolls_back(self):
        self.observe()
        with psycopg.connect(self.dsn,autocommit=True) as conn:
            conn.execute('UPDATE public."Borrowers" SET "City"=%s WHERE "Row ID"=%s',('Concurrent city','b1'))
        with self.assertRaisesRegex(ConfigurationError,'CHANGED_SINCE_OBSERVATION'):self.execute()
        self.assertEqual(self.city(),'Concurrent city')

    def test_wrong_final_state_rolls_back(self):
        self.observe()
        with self.assertRaisesRegex(ConfigurationError,'FINAL_STATE_MISMATCH'):
            self.execute([step(expected_after={'City':'different'})])
        self.assertEqual(self.city(),'Old city')

    def test_review_revoked_after_dml_rolls_back(self):
        self.observe()
        original=dml.writable_fields
        def revoke(*args):
            self.revoked=True
            return original(*args)
        with patch.object(dml,'writable_fields',side_effect=revoke):
            with self.assertRaisesRegex(ConfigurationError,'CURRENT_AI_REVIEWER_REQUIRED'):self.execute()
        self.assertEqual(self.city(),'Old city')

    def test_insert_actor_and_duplicate_key(self):
        obs=self.observe('new')
        self.execute([step(action='INSERT',row_id='new',observation=obs,values={'City':'Added'})])
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(conn.execute('SELECT "Created By" FROM public."Borrowers" WHERE "Row ID"=%s',('new',)).fetchone()[0],'reviewer@example.com')

    def test_identical_insert_blocked_in_new_message(self):
        obs=self.observe('new')
        self.execute([step(action='INSERT',row_id='new',observation=obs,values={'City':'Added'})])
        self.bridge.message_id='m2'
        obs=self.observe('another-key')
        with self.assertRaisesRegex(ConfigurationError,'IDENTICAL_DML_INSERT'):
            self.execute([step(action='INSERT',row_id='another-key',observation=obs,values={'City':'Added'})])

    def test_api_unknown_blocks_dml(self):
        from mw_integration_agent.conversation_write import journal
        db=journal(self.bridge)
        with db:
            db.execute('INSERT INTO conversation_operations VALUES (?,?,?,?,?,?,?,?,?,?,NULL)',
                ('op','other-message','fp','oltp','Borrowers','b2','Edit','{}','{}','UNKNOWN'))
        self.observe()
        with self.assertRaisesRegex(ConfigurationError,'PRIOR_OPERATION_UNCERTAIN'):self.execute()
        self.assertEqual(self.city(),'Old city')

    def test_unknown_commit_blocks_restart_replay(self):
        self.observe();self.fail_commit=True
        with self.assertRaisesRegex(ConfigurationError,'COMMIT_UNCERTAIN'):self.execute()
        self.assertEqual(self.city(),'New city')
        self.assertTrue(dml.unknown(self.bridge))
        self.store.close();self.store=ConversationStore(Path(self.temp.name)/'journal.db')
        self.bridge.store=self.store;self.addCleanup(self.store.close)
        self.bridge.message_id='new-message'
        with self.assertRaisesRegex(ConfigurationError,'PRIOR_OPERATION_UNCERTAIN'):self.execute()

    def test_sql_injection_is_literal(self):
        self.observe();value="'; DROP TABLE public.\"Borrowers\"; --"
        self.execute([step(values={'City':value})]);self.assertEqual(self.city(),value)

    def test_protected_field_is_denied(self):
        self.observe()
        with self.assertRaisesRegex(ConfigurationError,'PROTECTED_OR_COMPUTED'):
            self.execute([step(values={'AI Reviewer':True})])
        self.assertEqual(self.city(),'Old city')

    def test_creation_actor_cannot_be_rewritten(self):
        self.observe()
        with self.assertRaisesRegex(ConfigurationError,'ACTOR_IMMUTABLE'):
            self.execute([step(values={'Created By':'__ACTOR__'})])

    def test_database_metadata_and_constraints(self):
        data=dml.catalogue(self.bridge,'Borrowers')
        self.assertIn('City',data['writable_fields']);self.assertTrue(data['constraints'])

    def test_persistent_session_tool_aliases_use_same_transaction(self):
        self.bridge.dispatch('data_catalogue',{'app':'database','table':'Borrowers'})
        observed=self.bridge.dispatch('read_records',{'app':'database','table':'Borrowers','keys':['b1'],
            'columns':['Row ID'],'offset':0,'limit':1,'match_field':'','match_text':'','filter':''})
        result=self.bridge.dispatch('api_action',{'app':'database','table':'transaction','action':'Edit',
            'row_id':'','operation_key':'transaction','observation':'',
            'row_json':json.dumps([step(observation=observed['observation'])]),
            'expected_final_json':json.dumps({'reason':'Current reviewer correction'}),
            'instruction_quote':'Correct these cities'})
        self.assertTrue(result['write_verified']);self.assertEqual(self.city(),'New city')


if __name__=='__main__':unittest.main()
