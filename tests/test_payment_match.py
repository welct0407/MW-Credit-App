import unittest
from unittest.mock import patch
from mw_integration_agent.payment_match import decision,check
from mw_integration_agent.receipt_rules import ReceiptInvalid

class PaymentMatchTests(unittest.TestCase):
    def setUp(self):
        self.receipt={'reference':'BANK123','date':'2026-09-21','time':'12:10','amount':'1300.00','account_id':'a'}
        self.borrower={'id':'b'}
        self.row={'status':'Posted','borrower':'b','amount':'1300','date':'2026-09-21','account':'a','reference':'','minute':'2026-09-21 12:10'}
    def test_manual_without_reference_does_not_match_even_at_same_minute(self):
        for reference in ('',None,'  '):
            self.assertIsNone(decision(self.receipt,self.borrower,[dict(self.row,reference=reference)]))
    def test_same_amount_borrower_date_account_and_time_with_different_reference_is_clear(self):
        for minute in ('2026-09-21 12:10','2026-09-21 00:17',None):
            self.assertIsNone(decision(self.receipt,self.borrower,[dict(self.row,reference='BANK456',minute=minute)]))
    def test_same_reference_conflicting_facts_or_unposted_state_needs_review(self):
        for delta in ({'account':'other'},{'borrower':'other'},{'date':'2026-09-20'},
                      {'amount':'600'},{'status':'Processing'},{'status':'Error'}):
            self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,reference='BANK123',**delta)]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_reference_with_different_entry_time(self):
        self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,reference='bank-123',minute=None)]),'PAYMENT_ALREADY_RECORDED')
    def test_multiple_matches_review(self):
        row=dict(self.row,reference='BANK123')
        self.assertEqual(decision(self.receipt,self.borrower,[row,row]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_one_reference_match_among_repeated_amounts_is_duplicate(self):
        rows=[dict(self.row,reference=r) for r in ('BANK456','BANK123','BANK789','')]
        self.assertEqual(decision(self.receipt,self.borrower,rows),'PAYMENT_ALREADY_RECORDED')
    def test_both_reference_inputs_are_normalized(self):
        receipt=dict(self.receipt,reference=' bank-123 ')
        self.assertEqual(decision(receipt,self.borrower,[dict(self.row,reference='BaNk 123')]),'PAYMENT_ALREADY_RECORDED')
    def test_missing_or_invalid_receipt_reference_fails_closed(self):
        for reference in ('',None,'---','short',"BANK'123"):
            receipt=dict(self.receipt,reference=reference)
            with self.assertRaisesRegex(ReceiptInvalid,'REFERENCE_UNREADABLE'):decision(receipt,self.borrower,[])
            with patch('mw_integration_agent.payment_match.read_query') as read:
                with self.assertRaisesRegex(ReceiptInvalid,'REFERENCE_UNREADABLE'):check({},receipt,self.borrower)
                read.assert_not_called()
    def test_unrelated_payment_clear(self):
        self.assertIsNone(decision(self.receipt,self.borrower,[dict(self.row,borrower='other')]))
    def test_conflicting_reference_review(self):
        self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,borrower='other',reference='BANK123')]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_fresh_read_blocks(self):
        with patch('mw_integration_agent.payment_match.read_query',return_value=[dict(self.row,reference='BANK123')]) as read:
            with self.assertRaisesRegex(ReceiptInvalid,'PAYMENT_ALREADY_RECORDED'):check({},dict(self.receipt,reference='bank-123'),self.borrower)
            self.assertEqual(read.call_count,1)
            where=read.call_args.args[1].split('WHERE',1)[1]
            self.assertIn("='BANK123'",where)
            self.assertNotIn('Amount Received',where);self.assertNotIn('Ref Borrower',where)
