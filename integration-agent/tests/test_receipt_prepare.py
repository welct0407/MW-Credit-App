import tempfile
import os
import hashlib
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.receipt_prepare import prepare
from mw_integration_agent.receipt_rules import BANGKOK
from mw_integration_agent.config import ConfigurationError


class PrepareTests(unittest.TestCase):
    @unittest.skipUnless(os.name=='posix','Operator preparation uses the Debian flock')
    def test_archiving_terminal_selection_uses_fresh_url_without_requeue(self):
        from mw_integration_agent.receipt_journal import ReceiptJournal
        today=datetime.now(BANGKOK).date().isoformat()
        borrower={'id':'b','username':'borrower','enabled':True,'name_en':'Test'}
        message={'id':'old-message','created_time':today+'T12:10:00+07:00','from':{'id':'123','username':'borrower'},
                 'attachments':{'data':[{'image_data':{'url':'https://scontent.fbcdn.net/fresh'}}]}}
        page={'data':[{'participants':{'data':[{'id':'123','username':'borrower'}]},'messages':{'data':[message]}}]}
        key=hashlib.sha256(b'old-message:0').hexdigest()
        with tempfile.TemporaryDirectory() as d:
            journal=ReceiptJournal(Path(d)/'receipt-processing.db')
            with journal.db:journal.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES (?,?,?,'','IGNORED',1)",(key,'old-message','123'))
            journal.close()
            with patch('mw_integration_agent.receipt_prepare.controls',return_value={'state_directory':d,'instagram_account_id':'999','receipt_archive_enabled':True}),\
                 patch('mw_integration_agent.receipt_prepare.masters',return_value={'borrowers':[borrower],'accounts':[]}),\
                 patch('mw_integration_agent.receipt_prepare.Instagram') as api,\
                 patch('mw_integration_agent.receipt_prepare.conversation_identity',return_value={'id':'123','username':'borrower'}),\
                 patch('mw_integration_agent.receipt_archive.Archive') as archive,\
                 patch('mw_integration_agent.receipt_prepare.extract',return_value={}),\
                 patch('mw_integration_agent.receipt_prepare.validate_receipt',return_value={'amount':'25','date':today,'time':'12:10','account_label':'Synthetic'}):
                api.return_value.request.return_value=page;archive.return_value.capture.return_value=(b'image','digest')
                result=prepare('config','catalogue','b',today)
                self.assertFalse(result['payment_created'])
                selected=archive.return_value.capture.call_args.args[0]
                self.assertEqual(selected['url'],'https://scontent.fbcdn.net/fresh')
                self.assertEqual(selected['status'],'IGNORED')
            journal=ReceiptJournal(Path(d)/'receipt-processing.db')
            saved=journal.db.execute('SELECT status,url FROM receipt_jobs WHERE id=?',(key,)).fetchone()
            self.assertEqual(tuple(saved),('IGNORED',''));journal.close()
    def setUp(self):
        payment_check=patch('mw_integration_agent.receipt_prepare.check_existing_payment')
        self.payment_check=payment_check.start();self.addCleanup(payment_check.stop)
    def test_shared_rules_parameterized_and_no_effects(self):
        today=datetime.now(BANGKOK).date().isoformat()
        borrower={'id':'borrower-A','username':'borrower','enabled':True,'name_en':'Test'}
        raw={'is_payment_receipt':True,'transfer_successful':True,'date':today,'time':'12:10',
             'amount':'1300.00','currency':'THB','reference':'TESTREF123','recipient_numbers':['1234567890']}
        master={'borrowers':[borrower],'accounts':[{'id':'a','number':'1234567890','active':True,'label':'Test'}],
                'posted_references':[]}
        message={'id':'message-A','created_time':today+'T12:10:00+07:00','from':{'id':'123','username':'borrower'},
                 'attachments':{'data':[{'image_data':{'url':'https://scontent.fbcdn.net/test'}}]}}
        page={'data':[{'participants':{'data':[{'id':'123','username':'borrower'}]},'messages':{'data':[message]}}]}
        with tempfile.TemporaryDirectory() as d, patch('mw_integration_agent.receipt_prepare.controls',return_value={'state_directory':d,'instagram_account_id':'999'}),\
             patch('mw_integration_agent.receipt_prepare.masters',return_value=master),\
             patch('mw_integration_agent.receipt_prepare.Instagram') as api,\
             patch('mw_integration_agent.receipt_prepare.conversation_identity',return_value={'id':'123','username':'borrower'}),\
             patch('mw_integration_agent.receipt_prepare.download',return_value=(b'image','digest')),\
             patch('mw_integration_agent.receipt_prepare.extract',return_value=raw):
            api.return_value.request.return_value=page
            result=prepare('config','catalogue','borrower-A',today)
            self.assertEqual(result['amount'],'1300.00');self.assertFalse(result['payment_created'])
            self.assertTrue(Path(result['candidate']).exists())
            self.assertEqual(prepare('config','catalogue','borrower-A',today)['job_id'],result['job_id'])
            with self.assertRaises(ConfigurationError):prepare('config','catalogue','other',today)
            self.payment_check.side_effect=ConfigurationError('PAYMENT_ALREADY_RECORDED')
            with self.assertRaises(ConfigurationError):prepare('config','catalogue','borrower-A',today)
