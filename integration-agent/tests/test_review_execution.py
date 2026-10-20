import unittest
from unittest.mock import patch
from mw_integration_agent.review_execution import add_payment
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.webhook import extract_messages
from mw_integration_agent.journal import IngressJournal
import tempfile
from pathlib import Path

class ExecutionBoundaryTests(unittest.TestCase):
    def test_legacy_payment_entrypoint_is_retired_without_network(self):
        with patch('urllib.request.urlopen') as call:
            for config in ({},{'partner_review_execution_enabled':True,'_receipt_reviewer_approved':True},{'_receipt_automatic':True}):
                with self.assertRaisesRegex(ConfigurationError,'LEGACY_RECEIPT_TRANSPORT_RETIRED'):
                    add_payment(config,'igr:historical',{'action':'Lump Sum'},'synthetic@example.invalid')
            call.assert_not_called()

    def test_signed_reply_link_survives_capture(self):
        payload={'object':'instagram','entry':[{'id':'999','messaging':[{'sender':{'id':'123'},'recipient':{'id':'999'},'timestamp':100000,'message':{'mid':'in','text':'YES','reply_to':{'mid':'out'}}}]}]}
        messages=extract_messages(payload,'999',now=101)
        with tempfile.TemporaryDirectory() as d:
            journal=IngressJournal(Path(d)/'in.db')
            try:
                journal.capture('hash',messages)
                self.assertEqual(journal.db.execute('SELECT reply_to FROM messages').fetchone()[0],'out')
            finally:journal.close()

    def test_same_posting_outcome_rule(self):
        from mw_integration_agent.review_proposal import same_posting_outcome
        lump={'action':'Lump Sum','receipt':{'amount':'100'},'borrower':{'id':'b'},'facts':{'charges':[1]}}
        over=dict(lump,action='Overpayment review',approved_allocation_method='Lump Sum')
        close=dict(lump,action='Loan Close',loan_id='l')
        changed=dict(lump,facts={'charges':[2]})
        self.assertTrue(same_posting_outcome(lump,changed,True));self.assertTrue(same_posting_outcome(lump,changed,False))
        self.assertTrue(same_posting_outcome(over,lump,False));self.assertTrue(same_posting_outcome(lump,over,False))
        self.assertFalse(same_posting_outcome(lump,over,True));self.assertFalse(same_posting_outcome(over,lump,True))
        self.assertFalse(same_posting_outcome(lump,close,False));self.assertFalse(same_posting_outcome(close,close,False))
        self.assertFalse(same_posting_outcome(dict(over,approved_allocation_method=None),lump,False))
        self.assertFalse(same_posting_outcome(lump,dict(lump,receipt={'amount':'100','time':'10:00'}),False))
        self.assertFalse(same_posting_outcome(lump,dict(lump,borrower={'id':'x'}),False))
        self.assertFalse(same_posting_outcome(lump,{},False));self.assertFalse(same_posting_outcome(None,lump,False))
