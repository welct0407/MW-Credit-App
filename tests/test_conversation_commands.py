import unittest
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_commands import build_operation, FIELDS


class NativeCommandTests(unittest.TestCase):
    def command(self, table, action, supplied, current=None, defaults=None):
        columns={name:{'Type':'Text'} for name in FIELDS[table][1].values()}
        for name in ('Amount Received','Allocated Amount','Allocated Interest','Allocated Principal'):
            columns[name]={'Type':'Price'}
        definition={'columns':columns,'context':{'businessDate':'2026-10-12'}}
        return build_operation({'conversation_api_environment':'dev'},'message','stable',table,action,'source',supplied,definition,current,defaults)['command']

    def test_payment_creation_preserves_metadata_and_does_not_reuse_receipt_contract(self):
        source={name:None for name in FIELDS['Payments'][1].values()}
        source.update({'Ref Borrower':'b','Amount Received':'100.00','Payment Date':'2025-01-01',
                       'Created At':'2025-01-01 23:59:58.123456','Payment Method':'Cash',
                       'Allocation Method':'Lump Sum','Bank Reference':'source-reference','Status':'Processing'})
        result=self.command('Payments','Add',source)
        self.assertEqual(result['operation'],'payment.create')
        self.assertIsNone(result['receiptId'])
        self.assertEqual(result['inputs']['createdAt'],source['Created At'])
        self.assertEqual(result['inputs']['bankReference'],'source-reference')
        self.assertEqual(result['inputs']['amountReceived'],'100')
        self.assertEqual(result['targetId'],result['requestId'])
        with self.assertRaisesRegex(ConfigurationError,'ENGINE_OWNED'):
            self.command('Payments','Add',{**source,'Status':'Posted'})
        with self.assertRaisesRegex(ConfigurationError,'WHOLE_BAHT'):
            self.command('Payments','Add',{**source,'Amount Received':'100.01'})

    def test_correction_uses_observed_lineage_and_preserves_receipt(self):
        row={name:None for name in FIELDS['Payments'][1].values()}
        row.update({'_nativeVersion':'a'*64,'_nativeCommand':{'kind':'legacy-source','predecessorRequestId':'head'},
                    'Amount Received':'100','Selected Charge IDs':None})
        result=self.command('Payments','Edit',{'Notes':'corrected'},row)
        self.assertEqual(result['operation'],'payment.correct')
        self.assertEqual(result['predecessorRequestId'],'head')
        self.assertEqual(result['inputs']['receiptMode'],'preserve')
        metadata=self.command('Payments','Edit',{'Created At':'2026-01-01 00:00:00'},row)
        self.assertEqual(metadata['operation'],'payment.update-metadata')
        self.assertEqual(metadata['predecessorRequestId'],'head')
        with self.assertRaisesRegex(ConfigurationError,'SPLIT'):
            self.command('Payments','Edit',{'Created At':None,'Notes':'mixed'},row)

    def test_preference_targets_actor_not_context_row(self):
        row={'_nativeCommand':{'partnerId':'actor','language':'English','version':'b'*64},
             'Ref Cash Account':'account','Statement Date':'2026-10-11'}
        result=self.command('Cash Statement Context','Edit',{'Statement Date':'2026-10-12'},row)
        self.assertEqual(result['targetId'],'actor')
        self.assertEqual(result['expectedVersion'],'b'*64)
        self.assertEqual(result['inputs']['language'],'English')

    def test_unposted_allocation_has_exact_typed_source_fields_and_version(self):
        row={name:None for name in FIELDS['Payment Allocations'][1].values()}
        row.update({'Ref Payment':'p','Ref Charge':'c','Allocated Amount':'1.25','_nativeVersion':'c'*64})
        result=self.command('Payment Allocations','Edit',{'Allocated Amount':'2.50'},row)
        self.assertEqual(result['operation'],'allocation.update')
        self.assertEqual(result['inputs']['allocatedAmount'],'2.50')
        self.assertEqual(result['expectedVersion'],'c'*64)

    def test_quick_payment_is_new_native_effect_and_stale_token_never_dispatches(self):
        quick={'borrowerId':'b','amountReceived':'100','paymentDate':'2026-10-12','allocationMethod':'Receive All','targetChargeId':None,'targetLoanId':None}
        row={'_nativeVersion':'a'*64,'_nativeCommand':{'quickPayment':quick},'Payment Request Cash Account':'account'}
        defaults={'Created At':'2026-10-12 12:34:56','Ref Received By Cash Holder':'holder'}
        result=self.command('Borrowers','Edit',{'Payment Request Token':'2026-10-12|newnonce1'},row,defaults)
        self.assertEqual(result['operation'],'payment.create')
        self.assertEqual(result['inputs']['cashAccountId'],'account')
        self.assertIsNone(result['expectedVersion'])
        with self.assertRaisesRegex(ConfigurationError,'STALE'):
            self.command('Borrowers','Edit',{'Payment Request Token':'2026-10-11|newnonce1'},row,defaults)

    def test_posted_allocation_move_uses_parent_version_and_no_child_patch(self):
        row={'_nativeVersion':'a'*64,'_nativeCommand':{'allocationParent':{'id':'p','status':'Posted','version':'b'*64,'predecessorRequestId':'head'}}}
        result=self.command('Payment Allocations','Edit',{'Ref Charge':'new-charge'},row)
        self.assertEqual(result['operation'],'payment.move-interest')
        self.assertEqual(result['targetId'],'p')
        self.assertEqual(result['expectedVersion'],'b'*64)
        with self.assertRaisesRegex(ConfigurationError,'PARENT_PAYMENT'):
            self.command('Payment Allocations','Edit',{'Allocated Amount':'2'},row)


if __name__=='__main__':unittest.main()
