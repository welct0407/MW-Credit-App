import hashlib
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.receipt_archive import Archive, source
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_projection import reconcile
from mw_integration_agent.receipt_run import process
from mw_integration_agent.receipt_storage import BUCKET
from mw_integration_agent.conversation_schema import writable


class Storage:
    def __init__(self):
        self.objects={}; self.lost=False; self.calls=0
    def put(self,key,data,mime):
        self.calls+=1
        if key in self.objects and self.objects[key]!=data:
            raise ConfigurationError('RECEIPT_INTEGRITY_CONFLICT')
        self.objects[key]=data
        if self.lost:
            self.lost=False
            raise TimeoutError()
        return '12345678901234567890','crc'
    def read(self,key,generation):
        return self.objects[key]


class ReceiptArchiveTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.config={'state_directory':self.directory.name,'receipt_archive_enabled':True,
          'receipt_archive_cutoff':'2026-01-01T00:00:00+00:00','receipt_environment':'dev',
          'receipt_bucket':BUCKET,'instagram_account_id':'123'}
        self.journal=ReceiptJournal(Path(self.directory.name)/'receipt-processing.db')
        self.key=hashlib.sha256(b'message:0').hexdigest()
        self.job=dict(id=self.key,message_id='message',sender_id='456',url='https://x.fbcdn.net/image',
          source=source('webhook','message',0,'456',time.time()-1,time.time()),created_at=time.time(),attempts=0,image=None)
        with self.journal.db:
            self.journal.db.execute('INSERT INTO receipt_jobs(id,message_id,sender_id,url,source,created_at) VALUES (?,?,?,?,?,?)',
                tuple(self.job[k] for k in ('id','message_id','sender_id','url','source','created_at')))
        output=io.BytesIO(); Image.new('RGB',(12,8),'blue').save(output,format='JPEG')
        self.raw=output.getvalue(); self.storage=Storage()
        self.archive=Archive(self.config,self.journal,self.storage)
    def tearDown(self):
        self.journal.close();self.directory.cleanup()
    def capture(self):
        return self.archive.capture(self.job,lambda _:self.raw)
    def test_raw_original_not_normalized_and_terminal_job_keeps_asset(self):
        normalized,pixels=self.capture(); asset=self.archive.get(self.key)
        self.assertNotEqual(normalized,self.raw)
        self.assertEqual(self.storage.objects[asset['object_key']],self.raw)
        self.assertEqual(asset['raw_sha256'],hashlib.sha256(self.raw).hexdigest())
        self.assertEqual(asset['pixel_sha256'],pixels)
        self.assertEqual(asset['generation'],'12345678901234567890')
        self.journal.mark(self.key,'IGNORED','NOT_PAYMENT_RECEIPT')
        self.assertEqual(self.archive.get(self.key)['archive_state'],'ARCHIVED')
        self.assertEqual(self.capture()[0],normalized)
        self.assertEqual(self.storage.calls,1)
    def test_lost_upload_ack_reconciles_same_object_after_restart(self):
        self.storage.lost=True
        with self.assertRaises(ConfigurationError):self.capture()
        asset=self.archive.get(self.key)
        self.assertEqual(asset['archive_state'],'UPLOADING')
        self.assertTrue((self.archive.root/(asset['receipt_id']+'.raw')).exists())
        with self.journal.db:self.journal.db.execute('UPDATE receipt_assets SET next_attempt_at=0')
        self.archive=Archive(self.config,self.journal,self.storage)
        self.archive.capture(self.job,lambda _:self.fail('must not re-download'))
        self.assertEqual(len(self.storage.objects),1)
        self.assertEqual(self.archive.get(self.key)['archive_state'],'ARCHIVED')
    def test_corrupt_spool_blocks_overwrite(self):
        self.storage.lost=True
        with self.assertRaises(ConfigurationError):self.capture()
        asset=self.archive.get(self.key)
        altered=io.BytesIO();Image.new('RGB',(12,8),'red').save(altered,format='JPEG')
        (self.archive.root/(asset['receipt_id']+'.raw')).write_bytes(altered.getvalue())
        with self.journal.db:self.journal.db.execute('UPDATE receipt_assets SET next_attempt_at=0')
        with self.assertRaisesRegex(ConfigurationError,'INTEGRITY_CONFLICT'):self.capture()
        self.assertEqual(self.storage.calls,1)
    def test_archive_failure_does_not_spend_extraction_attempt_or_clear_url(self):
        with patch('mw_integration_agent.receipt_archive.Archive.capture',side_effect=TimeoutError()),patch('mw_integration_agent.receipt_run.extract') as extract:
            process(self.job,self.journal,self.config,{})
        row=self.journal.db.execute('SELECT * FROM receipt_jobs WHERE id=?',(self.key,)).fetchone()
        self.assertEqual(row['attempts'],0);self.assertEqual(row['status'],'PENDING');self.assertTrue(row['url'])
        extract.assert_not_called()
    def test_source_identity_conflict_and_quota(self):
        changed=dict(self.job,source=source('poll','different',0,'456',1,2))
        with self.assertRaisesRegex(ConfigurationError,'SOURCE_CONFLICT'):self.archive.capture(changed)
        self.config['receipt_spool_limit_bytes']=1
        with self.assertRaisesRegex(ConfigurationError,'SPOOL_FULL'):self.capture()
        self.assertFalse(self.storage.objects)
    def test_projection_unknown_retries_only_attachment(self):
        self.capture()
        proposal={'borrower':{'id':'b'},'receipt':{'amount':'25','date':'2026-09-27','time':'18:23','reference':'ref','account_id':'a'}}
        self.journal.db.execute('CREATE TABLE partner_reviews(id TEXT,job_id TEXT,state TEXT,payment_id TEXT,proposal TEXT)')
        with self.journal.db:self.journal.db.execute('INSERT INTO partner_reviews VALUES (?,?,?,?,?)',('review',self.key,'POSTED','payment',json.dumps(proposal)))
        calls=[]
        def transport(config,link,asset):
            calls.append(link['link_id'])
            if len(calls)==1:raise TimeoutError()
            return 'already_applied'
        self.assertEqual(reconcile(self.config,self.journal,transport,lambda *_:True,self.storage)['pending'],1)
        with self.journal.db:self.journal.db.execute('UPDATE receipt_payment_links SET next_attempt_at=0')
        self.assertEqual(reconcile(self.config,self.journal,transport,lambda *_:True,self.storage)['applied'],1)
        self.assertEqual(calls[0],calls[1])
        self.assertEqual(self.journal.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')
    def test_model_tools_cannot_change_evidence(self):
        for field in ('IG Receipt ID','Receipt Image','Receipt Received At'):
            definition={'key':'Row ID','columns':{field:{'Virtual?':'No','Read-Only':'No','Editable Initial Value?':'Yes'}}}
            self.assertFalse(writable('Payments',definition,field,'Add'))
            self.assertFalse(writable('Payments',definition,field,'Edit'))


class ProjectorSignInTests(unittest.TestCase):
    """ALL-ARCH-03 part 2b: receipt_projector_auth picks the projector's sign-in; no live database."""
    IAM_USER = 'mw-integration-agent@clever-oasis-508610-n7.iam'

    class Conn:
        def __init__(self):
            self.statements, self.autocommit, self.closed = [], None, False
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def execute(self, statement, *_):
            self.statements.append((statement, self.autocommit))
            return self
        def fetchone(self): return ['applied']
        def close(self): self.closed = True

    def config(self, secrets, **changes):
        return dict(dict(database_host='127.0.0.1', database_port=5432, database_name='loan_manager_prod',
                         receipt_environment='prod', secrets_directory=secrets,
                         receipt_projector_password_file=str(Path(secrets) / 'projector.txt')), **changes)

    def project(self, config, conn):
        from contextlib import contextmanager
        from mw_integration_agent import receipt_projection
        @contextmanager
        def central(_):
            yield None
        link = {'payment_id': 'p1', 'verification': '{}', 'link_id': '11111111-1111-4111-8111-111111111111'}
        asset = {'receipt_id': 'r1', 'object_key': 'k', 'source': json.dumps({'captured_at': 1760000000})}
        def connected(**kwargs):
            conn.autocommit = kwargs.get('autocommit', False)
            return conn
        with patch('psycopg.connect', side_effect=connected) as connect, \
             patch.object(receipt_projection, 'transaction', central), \
             patch.object(receipt_projection.receipt_audit, 'plan', return_value={}), \
             patch.object(receipt_projection.receipt_audit, 'begin', return_value='op'), \
             patch.object(receipt_projection.audit, 'event'):
            self.assertEqual(receipt_projection.project(config, link, asset), 'applied')
        return connect.call_args.kwargs

    def test_password_default_reads_the_projector_credential_on_5432(self):
        with tempfile.TemporaryDirectory() as secrets:
            Path(secrets, 'projector.txt').write_text('synthetic')
            conn = self.Conn()
            kwargs = self.project(self.config(secrets, database_auth='iam'), conn)
        self.assertEqual((kwargs['port'], kwargs['user'], kwargs['password']), (5432, 'mw_receipt_projector', 'synthetic'))
        self.assertTrue(conn.statements[0][0].startswith('SELECT public.attach_payment_receipt_evidence'))

    def test_iam_sets_role_first_outside_a_transaction_and_reads_no_password(self):
        from mw_integration_agent import receipt_projection
        conn = self.Conn()
        with patch.object(receipt_projection, 'load_secret', side_effect=AssertionError('no password under iam')):
            kwargs = self.project(self.config('/nonexistent', receipt_projector_auth='iam', database_iam_user=self.IAM_USER), conn)
        self.assertNotIn('password', kwargs)
        self.assertEqual((kwargs['port'], kwargs['user'], kwargs['dbname'], kwargs['autocommit']),
                         (5433, self.IAM_USER, 'loan_manager_prod', True))
        self.assertEqual(conn.statements[0], ('SET ROLE mw_receipt_projector', True))
        self.assertTrue(conn.statements[1][0].startswith('SELECT public.attach_payment_receipt_evidence'))
        self.assertIs(conn.statements[1][1], False)  # the attachment runs in its own transaction

    def test_iam_guards_refuse_before_any_audit_intent(self):
        from mw_integration_agent import receipt_projection
        base = self.config('/nonexistent', receipt_projector_auth='iam', database_iam_user=self.IAM_USER)
        for change in ({'iam_database_port': 5432}, {'database_iam_user': 'someone@example.com'}, {'receipt_projector_auth': 'token'},
                       {'database_name': 'loan_manager_dev'}, {'database_host': '10.0.0.5'}):
            with self.subTest(change=change), \
                 patch.object(receipt_projection.receipt_audit, 'plan', side_effect=AssertionError('no intent')), \
                 self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_RECEIPT_DATABASE|database_iam_user|iam_database_port'):
                receipt_projection.project(dict(base, **change), {}, {})
        # The 5432 guard belongs to the password branch only.
        with patch.object(receipt_projection.receipt_audit, 'plan', side_effect=RuntimeError('guard passed')), \
             self.assertRaisesRegex(RuntimeError, 'guard passed'):
            receipt_projection.project(dict(base, database_port=5433), {}, {})
        with patch.object(receipt_projection.receipt_audit, 'plan', side_effect=AssertionError('no intent')), \
             self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_RECEIPT_DATABASE'):
            receipt_projection.project(dict(base, receipt_projector_auth='password', database_port=5433), {}, {})

    def test_failed_set_role_closes_the_connection(self):
        import psycopg
        from mw_integration_agent import receipt_projection
        conn = self.Conn()
        conn.execute = lambda *_: (_ for _ in ()).throw(psycopg.errors.InsufficientPrivilege('no membership'))
        config = self.config('/nonexistent', receipt_projector_auth='iam', database_iam_user=self.IAM_USER)
        with patch('psycopg.connect', return_value=conn), self.assertRaises(psycopg.errors.InsufficientPrivilege):
            receipt_projection.open_projector(config, *receipt_projection.login(config))
        self.assertTrue(conn.closed)
