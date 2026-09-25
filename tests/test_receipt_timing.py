import unittest
from datetime import date

from mw_integration_agent.receipt_rules import ReceiptInvalid,validate_receipt,summary


class ReceiptTimingTests(unittest.TestCase):
    def value(self):
        return {'is_payment_receipt':True,'transfer_successful':True,'date':'2026-09-20',
                'time':'18:23:12',
                'amount':'100.00','currency':'THB','reference':'TIMETEST123',
                'recipient_numbers':['1234567890']}

    def validate(self,value):
        return validate_receipt(value,[{'id':'a','active':True,'number':'1234567890',
                                      'alternative':'','label':'Test'}],date(2026,9,21))

    def test_receipt_time_is_normalized_to_owner_selected_minute_precision(self):
        v=self.value();r=self.validate(v)
        self.assertEqual(r['timestamp'],'2026-09-20T18:23+07:00')
        self.assertEqual(r['payment_fields'],{'Payment Date':'2026-09-20','Created At':'2026-09-20 18:23'})
        _,body=summary(r,{'id':'b','name_en':'Test'},['English'])
        self.assertIn('18:23 (UTC+07:00)',body)
        self.assertNotIn('18:23:12',body)

    def test_seconds_and_fractions_do_not_change_payment_minute(self):
        for clock in ['00:01','23:59:59.123']:
            v=self.value();v.update(time=clock)
            r=self.validate(v)
            self.assertEqual(r['timestamp'],'2026-09-20T'+clock[:5]+'+07:00')

    def test_missing_invalid_time_is_review_not_processing_clock(self):
        for clock in ('','24:00','18:60','18:23:60','18:23:12Z',None):
            v=self.value();v['time']=clock
            with self.subTest(clock=clock),self.assertRaises(ReceiptInvalid):self.validate(v)


if __name__=='__main__':unittest.main()
