import json
import unittest
from unittest.mock import patch,MagicMock
from mw_integration_agent.review_execution import add_payment
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.webhook import extract_messages
from mw_integration_agent.journal import IngressJournal
import tempfile
from pathlib import Path

class ExecutionBoundaryTests(unittest.TestCase):
    def test_only_approved_scope_and_exact_row(self):
        c={'partner_review_execution_enabled':True,'appsheet_app_id':'93844270-6aa5-420b-a960-bcdf08abd357'}
        p={'action':'Lump Sum','borrower':{'id':'b'},'receipt':{'amount':'100.00','reference':'TESTREF','account_id':'a','date':'2026-09-21','time':'12:10'}}
        response=MagicMock();response.__enter__.return_value.read.return_value=b'[]'
        with patch('mw_integration_agent.review_execution.load_secret',return_value='synthetic'),patch('urllib.request.urlopen',return_value=response) as call:
            add_payment(c,'igr:test',p,'actor@example.invalid')
            data=json.loads(call.call_args.args[0].data);row=data['Rows'][0]
            self.assertEqual(row['Created At'],'09/21/2026 12:10:00');self.assertEqual(row['Amount Received'],'100.00')
            self.assertEqual(row['Allocation Method'],'Lump Sum');self.assertEqual(data['Action'],'Add')
            p['action']='Loan Close'
            with self.assertRaises(ConfigurationError):add_payment(c,'igr:test',p,'actor@example.invalid')
            self.assertEqual(call.call_count,1)
    def test_signed_reply_link_survives_capture(self):
        payload={'object':'instagram','entry':[{'id':'999','messaging':[{'sender':{'id':'123'},'recipient':{'id':'999'},'timestamp':100000,'message':{'mid':'in','text':'YES','reply_to':{'mid':'out'}}}]}]}
        messages=extract_messages(payload,'999',now=101)
        with tempfile.TemporaryDirectory() as d:
            journal=IngressJournal(Path(d)/'in.db')
            try:
                journal.capture('hash',messages)
                self.assertEqual(journal.db.execute('SELECT reply_to FROM messages').fetchone()[0],'out')
            finally:journal.close()
