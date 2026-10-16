"""Real V33 trigger/role and central relay tests, synthetic disposable rows only."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch
import psycopg
from psycopg.rows import dict_row

from mw_integration_agent import audit, state, outbox
from mw_integration_agent import conversation_dml as dml
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.conversation_tools import ConversationTools


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'),'isolated PostgreSQL 18 lab required')
class TransactionAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab=json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if cls.lab['host']!='127.0.0.1' or cls.lab['port']==5432 or 'agent-state-lab-' not in cls.lab['root']:
            raise RuntimeError('Not a disposable target')
        cls.base=dict(host=cls.lab['host'],port=cls.lab['port'],user='postgres')
        with psycopg.connect(**cls.base,dbname='loan_manager_prod') as c:
            if Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()!=(Path(cls.lab['root'])/'data').resolve():
                raise RuntimeError('Wrong disposable server')
        cls.generation=str(uuid.uuid4())
        with psycopg.connect(**cls.base,dbname='mw_agent') as c:
            c.execute('''INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled)
                VALUES ('agent','postgres',%s,true) ON CONFLICT(service_name) DO UPDATE SET active_generation=EXCLUDED.active_generation,processing_enabled=true''',(cls.generation,))

    def setUp(self):
        self.key='audit-test-'+uuid.uuid4().hex
        self.config={'state_backend':'postgres','state_generation':self.generation,'audit_environment':'test','code_version':'synthetic',
            'reviewer_dml_enabled':True,'reviewer_dml_cutoff':'2026-01-01T00:00:00+00:00',
            '_conversation_event_timestamp':2000000000,'_conversation_captured_at':2000000000,
            'agent_database_host':'127.0.0.1','agent_database_port':self.lab['port'],'agent_database_name':'mw_agent',
            'database_name':'loan_manager_prod'}
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            c.execute('INSERT INTO public."Borrowers" ("Row ID","Borrower Name","City") VALUES (%s,%s,%s)',(self.key,'Synthetic audit fixture','Old city'))
        @contextmanager
        def connection(config,write=False):
            with psycopg.connect(**dict(self.base,user='mw_reviewer_dml'),dbname='loan_manager_prod',autocommit=True,row_factory=dict_row) as c:
                c.execute('BEGIN ISOLATION LEVEL SERIALIZABLE '+('READ WRITE' if write else 'READ ONLY'))
                yield c
                c.rollback()
        @contextmanager
        def relay_connection(config):
            with psycopg.connect(**dict(self.base,user='mw_agent_relay'),dbname='loan_manager_prod',autocommit=True) as c:yield c
        self.patches=[patch.object(state,'parameters',side_effect=lambda config,role='worker':dict(self.base,user='mw_agent_'+role,dbname='mw_agent',autocommit=True)),
            patch.object(dml,'connect',connection),patch.object(dml,'require_reviewer',return_value='reviewer@example.invalid'),
            patch.object(outbox,'business',relay_connection)]
        for p in self.patches:p.start();self.addCleanup(p.stop)
        self.store=ConversationStore('partner-conversations.db',self.config)
        definition={'permission':'ALL_CHANGES','key':'Row ID','columns':{'City':{'Read-Only':'No','Virtual?':'No'}}}
        self.bridge=ConversationTools(lambda:self.config,self.store,self.key,'Correct or delete this synthetic record.',partner_id='synthetic-reviewer',
            schema_reader=lambda c:{'apps':{'oltp':{'tables':{'Borrowers':definition}}}})

    def execute(self, action='UPDATE', values=None):
        observation=dml.read(self.bridge,'Borrowers',{'Row ID':self.key})['observation']
        plan=[{'action':action,'table':'Borrowers','row_id':self.key,'values':values if values is not None else ({} if action=='DELETE' else {'City':'New city'}),
               'expected_after':{},'observation':observation}]
        return dml.transaction(self.bridge,{'steps_json':json.dumps(plan),'instruction_quote':self.bridge.instruction,
            'reason':'atomic: bind exact before-image and approved effect set to this transaction'})

    def test_update_captures_before_image_and_relay_is_idempotent(self):
        result=self.execute()
        self.assertEqual(result['state'],'VERIFIED')
        op=audit.stable('reviewer_dml:'+result['operation'])
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            rows=c.execute('SELECT action,before_row,after_row FROM agent_audit.row_changes WHERE operation_id=%s',(op,)).fetchall()
            self.assertEqual(len(rows),1);self.assertEqual(rows[0][0],'UPDATE');self.assertEqual((rows[0][1]['City'],rows[0][2]['City']),('Old city','New city'))
        outbox.relay(self.config);outbox.relay(self.config)
        with psycopg.connect(**self.base,dbname='mw_agent') as c:
            self.assertEqual(c.execute("SELECT count(*) FROM audit.events WHERE operation_id=%s AND event_kind='row_changed'",(op,)).fetchone()[0],1)
            self.assertEqual(c.execute('SELECT state FROM runtime.operation_state WHERE operation_id=%s',(op,)).fetchone()[0],'VERIFIED')

    def test_delete_plan_is_refused_before_any_connection_and_role_has_no_delete(self):
        # Reviewer DELETE retired (16 October 2026): refused by the parser, and the lab role mirrors PROD (no DELETE on source tables).
        observation=dml.read(self.bridge,'Borrowers',{'Row ID':self.key})['observation']
        plan=[{'action':'DELETE','table':'Borrowers','row_id':self.key,'values':{},'expected_after':{},'observation':observation}]
        with patch.object(dml,'connect',side_effect=AssertionError('connected for a retired DELETE')):
            with self.assertRaisesRegex(ConfigurationError,'REVIEWER_DELETE_RETIRED'):
                dml.transaction(self.bridge,{'steps_json':json.dumps(plan),'instruction_quote':self.bridge.instruction,'reason':'atomic: retired delete'})
        self.assertIsNone(self.store.db.execute('SELECT 1 FROM conversation_dml WHERE message_id=?',(self.key,)).fetchone())
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            self.assertEqual(c.execute('''SELECT bool_or(has_table_privilege('mw_reviewer_dml',format('public.%%I',t),'DELETE'))
                FROM unnest(%s::text[]) t''',(['Borrowers','Loans','Charges','Repayments','Payments','Business Expenses','Settlements','Cash Pool Contributions'],)).fetchone()[0],False)
            self.assertTrue(c.execute('''SELECT has_table_privilege('mw_reviewer_dml','public."Cash Ledger"','DELETE')''').fetchone()[0])

    def test_unapproved_trigger_delete_rolls_back_all_rows(self):
        from psycopg import sql
        child=self.key+'-unapproved'
        name='synthetic_delete_'+uuid.uuid4().hex
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            c.execute('INSERT INTO public."Borrowers" ("Row ID","Borrower Name") VALUES (%s,%s)',(child,'Synthetic dependent'))
            # SECURITY DEFINER: the reviewer role itself holds no DELETE any more, so an invoker trigger
            # would fail on privilege (42501) before the cascade check; the definer form exercises the check.
            c.execute(sql.SQL('CREATE FUNCTION public.{}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS {}').format(
                sql.Identifier(name),sql.Literal('BEGIN IF OLD."Row ID"='+sql.Literal(self.key).as_string(c)+' THEN DELETE FROM public."Borrowers" WHERE "Row ID"='+sql.Literal(child).as_string(c)+'; END IF; RETURN NULL; END;')))
            c.execute(sql.SQL('CREATE TRIGGER {} AFTER UPDATE ON public."Borrowers" FOR EACH ROW EXECUTE FUNCTION public.{}()').format(sql.Identifier(name),sql.Identifier(name)))
        try:
            with self.assertRaisesRegex(ConfigurationError,'UNAPPROVED_CASCADE_ROLLBACK'):self.execute()
            with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
                self.assertEqual(c.execute('SELECT count(*) FROM public."Borrowers" WHERE "Row ID"=ANY(%s)',([self.key,child],)).fetchone()[0],2)
                self.assertEqual(c.execute('SELECT "City" FROM public."Borrowers" WHERE "Row ID"=%s',(self.key,)).fetchone()[0],'Old city')
        finally:
            with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
                c.execute(sql.SQL('DROP TRIGGER {} ON public."Borrowers"').format(sql.Identifier(name)))
                c.execute(sql.SQL('DROP FUNCTION public.{}()').format(sql.Identifier(name)))

    def test_lost_commit_ack_is_reconciled_without_mutation_retry(self):
        original=state.PostgresJournal.execute
        def fail_final(db,query,params=()):
            if query.startswith('UPDATE conversation_dml SET state=') and params[0]=='VERIFIED':
                raise OSError('simulated central failure after business commit')
            return original(db,query,params)
        with patch.object(state.PostgresJournal,'execute',fail_final):
            with self.assertRaisesRegex(ConfigurationError,'COMMIT_UNCERTAIN'):self.execute()
        legacy=self.store.db.execute('SELECT id,state FROM conversation_dml WHERE message_id=?',(self.key,)).fetchone()
        self.assertEqual(legacy['state'],'UNKNOWN')
        outbox.relay(self.config)
        self.assertGreaterEqual(outbox.reconcile(self.config)['verified'],1)
        self.assertEqual(self.store.db.execute('SELECT state FROM conversation_dml WHERE id=?',(legacy['id'],)).fetchone()[0],'VERIFIED')
        with self.assertRaisesRegex(ConfigurationError,'ALREADY_ATTEMPTED'):self.execute()

    def test_missing_marker_and_reviewer_schema_identity_changes_denied(self):
        for query in ('UPDATE public."Borrowers" SET "City"=\'bad\' WHERE "Row ID"=%s',
                      'UPDATE public."Partners" SET "AI Reviewer"=true WHERE "Row ID"=%s'):
            with self.assertRaises(psycopg.Error):
                with psycopg.connect(**dict(self.base,user='mw_reviewer_dml'),dbname='loan_manager_prod') as c:c.execute(query,(self.key,))
        # AGT-TEST-02: the real role defaults to read-only transactions; open a read-write one so the
        # privilege check (not the read-only guard) is what refuses the DDL.
        with self.assertRaises(psycopg.errors.InsufficientPrivilege):
            with psycopg.connect(**dict(self.base,user='mw_reviewer_dml'),dbname='loan_manager_prod',autocommit=True) as c:
                c.execute('BEGIN READ WRITE')
                try:c.execute('CREATE TABLE public.forbidden_audit_test(id integer)')
                finally:c.execute('ROLLBACK')

    def test_api_first_refuses_supported_single_row_plan(self):
        with self.assertRaisesRegex(ConfigurationError,'USE_API_FIRST'):
            dml.require_fallback(self.bridge,[{'action':'UPDATE','table':'Borrowers','values':{'City':'value'}}],'api_gap: pretend unsupported')

    def test_revocation_before_commit_rolls_back_marker_and_change(self):
        calls=0
        def reviewer(*args):
            nonlocal calls
            calls+=1
            if calls>=3:raise ConfigurationError('CURRENT_AI_REVIEWER_REQUIRED')
            return 'reviewer@example.invalid'
        with patch.object(dml,'require_reviewer',side_effect=reviewer):
            with self.assertRaisesRegex(ConfigurationError,'ROLLED_BACK'):self.execute()
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            self.assertEqual(c.execute('SELECT "City" FROM public."Borrowers" WHERE "Row ID"=%s',(self.key,)).fetchone()[0],'Old city')
            op=audit.stable('reviewer_dml:'+__import__('hashlib').sha256(('dml:'+self.key).encode()).hexdigest())
            self.assertIsNone(c.execute('SELECT 1 FROM agent_audit.commits WHERE operation_id=%s',(op,)).fetchone())
