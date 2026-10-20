from copy import deepcopy
import unittest
from unittest.mock import patch
from mw_integration_agent.review_proposal import facts, loan_display_key, same_posting_outcome
from mw_integration_agent.receipt_rules import ReceiptInvalid


class NativeReceiptFactsTests(unittest.TestCase):
    def test_native_receiving_formatter_golden_parity(self):
        # Generated from MW-Credit-App paymentLoanDisplayKey, not AppSheet network.
        for args, expected in [
            (('ชื่อ','Name','12345','2026-10-12','1.50'),'ชื่อ - Name-฿12,345-12/10-1.50%'),
            ((None,None,None,None,None),' - ---Unavailable'),
            (('A','B','1234.5','2024-02-29','0'),'A - B-฿1,235-29/02-0%'),
            (('A','B','-1234.5','2024-02-29',None),'A - B--฿1,235-29/02-Unavailable')]:
            self.assertEqual(loan_display_key(*args),expected)
        for principal, day in [('NaN','2026-10-12'),('10','2026-02-30'),('10','20261012')]:
            with self.assertRaises(ReceiptInvalid):loan_display_key('A','B',principal,day,None)

    def test_single_fixed_sql_snapshot_supplies_labels_without_appsheet(self):
        row={'id':'loan','principal':'90','date':'2026-10-12','label_borrower_id':"borrower'quoted",'label_name':'A','label_description':'B','label_principal':'100','label_rate':None}
        with patch('mw_integration_agent.review_proposal.read_query',return_value={'loans':[row],'charges':[]}) as read:
            result=facts({},"borrower'quoted")
        self.assertEqual(read.call_count,1)
        self.assertIn("borrower''quoted",read.call_args.args[1])
        self.assertEqual(result,{'loans':[{'id':'loan','principal':'90','date':'2026-10-12','loan_key':'A - B-฿100-12/10-Unavailable'}],'charges':[]})
        with patch('mw_integration_agent.review_proposal.read_query',return_value={'loans':[{'label_borrower_id':None}],'charges':[]}):
            with self.assertRaises(ReceiptInvalid):facts({},'missing')

    def test_label_or_balance_changes_keep_approval_only_while_outcome_is_unchanged(self):
        old={'facts':{'loans':[{'id':'loan','principal':'100','loan_key':'old'}],'charges':[]},'loan_keys':['old'],'receipt':{'amount':'100'},'borrower':{'id':'b'},'action':'Lump Sum'}
        fresh=deepcopy(old);fresh['facts']['loans'][0]['loan_key']='native';fresh['loan_keys']=['native']
        fresh['facts']['loans'][0]['principal']='101';snapshot=deepcopy(old)
        self.assertTrue(same_posting_outcome(old,fresh,True));self.assertEqual(old,snapshot)
        changed=deepcopy(fresh);changed['receipt']['amount']='101';self.assertFalse(same_posting_outcome(old,changed,False))
        changed=deepcopy(fresh);changed['borrower']={'id':'other'};self.assertFalse(same_posting_outcome(old,changed,False))

if __name__=='__main__':unittest.main()
