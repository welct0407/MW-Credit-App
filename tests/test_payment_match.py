import unittest
from unittest.mock import patch
from mw_integration_agent.payment_match import decision,check
from mw_integration_agent.receipt_rules import ReceiptInvalid

class PaymentMatchTests(unittest.TestCase):
    def setUp(self):
        self.receipt={'reference':'BANK123','date':'2026-09-21','time':'12:10','amount':'1300.00','account_id':'a'}
        self.borrower={'id':'b'}
        self.row={'status':'Posted','borrower':'b','amount':'1300','date':'2026-09-21','account':'a','reference':'','minute':'2026-09-21 12:10'}
    def test_manual_without_reference_exact_minute(self):
        self.assertEqual(decision(self.receipt,self.borrower,[self.row]),'PAYMENT_ALREADY_RECORDED')
    def test_entry_time_or_account_difference_needs_review(self):
        for delta in ({'minute':'2026-09-21 14:00'},{'minute':None},{'account':'other'},{'status':'Processing'},{'status':'Error'}):
            self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,**delta)]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_reference_with_different_entry_time(self):
        self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,reference='bank-123',minute=None)]),'PAYMENT_ALREADY_RECORDED')
    def test_multiple_matches_review(self):
        self.assertEqual(decision(self.receipt,self.borrower,[self.row,self.row]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_unrelated_payment_clear(self):
        self.assertIsNone(decision(self.receipt,self.borrower,[dict(self.row,borrower='other')]))
    def test_conflicting_reference_review(self):
        self.assertEqual(decision(self.receipt,self.borrower,[dict(self.row,borrower='other',reference='BANK123')]),'POSSIBLE_EXISTING_PAYMENT_REVIEW')
    def test_fresh_read_blocks(self):
        with patch('mw_integration_agent.payment_match.read_query',return_value=[self.row]) as read:
            with self.assertRaisesRegex(ReceiptInvalid,'PAYMENT_ALREADY_RECORDED'):check({},self.receipt,self.borrower)
            self.assertEqual(read.call_count,1)
