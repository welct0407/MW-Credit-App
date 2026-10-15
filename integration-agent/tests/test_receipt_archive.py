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
