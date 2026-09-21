import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.receipt_prepare import prepare
from mw_integration_agent.receipt_rules import BANGKOK
from mw_integration_agent.config import ConfigurationError


class PrepareTests(unittest.TestCase):
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
            master['posted_references']=['TESTREF123']
            with self.assertRaises(ConfigurationError):prepare('config','catalogue','borrower-A',today)
