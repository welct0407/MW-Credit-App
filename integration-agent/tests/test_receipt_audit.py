import copy
import json
import unittest
import uuid
from mw_integration_agent import audit, receipt_audit as ra
from mw_integration_agent.config import ConfigurationError


class ReceiptAuditTests(unittest.TestCase):
    def setUp(self):
        self.config = {'receipt_environment': 'prod', 'instagram_account_id': 'synthetic'}
        receipt = audit.digest(['receipt-v1', 'prod', 'synthetic', 'job'])
        self.asset = {'receipt_id': receipt, 'job_id': 'job', 'archive_state': 'ARCHIVED',
            'generation': '123', 'object_key': 'receipts/prod/synthetic.png',
            'source': json.dumps({'environment': 'prod', 'instagram_account_id': 'synthetic', 'captured_at': 1790481600})}
        self.link = {'link_id': str(uuid.uuid5(uuid.NAMESPACE_URL, 'mw-receipt:'+receipt+':payment')),
            'receipt_id': receipt, 'payment_id': 'payment', 'business_environment': 'prod',
            'verification': '{}', 'verification_digest': audit.digest({})}
        self.plan = ra.plan(self.config, self.link, self.asset)
        self.rows = [(1, 'public', 'Payments', 'UPDATE', '{"Row ID":"payment"}',
                     json.dumps(dict.fromkeys(ra.FIELDS)), json.dumps(self.plan['after']))]

    def verify(self, rows=None, **overrides):
        args = dict(op=uuid.UUID(self.link['link_id']), receipt_hash=self.asset['receipt_id'],
                    actor=ra.ACTOR['id'], login=ra.ACTOR['login'], rows=rows or self.rows,
                    value=self.plan, database='loan_manager_prod')
        args.update(overrides)
        ra.verify_marker(**args)

    def test_distinct_hash_contract_binds_exact_effect(self):
        self.assertNotEqual(audit.digest(self.plan), self.asset['receipt_id'])
        self.verify()

    def test_tampered_marker_actor_operation_or_database_rejected(self):
        for change in ({'op': uuid.uuid4()}, {'receipt_hash': '0'*64}, {'actor': 'reviewer'},
                       {'login': 'other'}, {'database': 'loan_manager_dev'}):
            with self.subTest(change=change), self.assertRaises(ConfigurationError):
                self.verify(**change)

    def test_financial_extra_or_wrong_metadata_cannot_be_exported(self):
        for changed in ({**self.plan['after'], 'Amount Received': 999},
                        {**self.plan['after'], 'Receipt Image': '//other'}):
            rows = [(*self.rows[0][:-1], json.dumps(changed))]
            with self.assertRaises(ConfigurationError): self.verify(rows)
        with self.assertRaises(ConfigurationError): self.verify(self.rows*2)
        rows = [(*self.rows[0][:5], '{"IG Receipt ID":"old"}', self.rows[0][6])]
        with self.assertRaises(ConfigurationError): self.verify(rows)

    def test_asset_or_link_tampering_fails_closed(self):
        for target, key, bad in (('asset','receipt_id','0'*64), ('asset','generation',None),
                                 ('link','link_id',str(uuid.uuid4())), ('link','verification','{"x":1}'),
                                 ('link','business_environment','dev')):
            asset, link = copy.deepcopy(self.asset), copy.deepcopy(self.link)
            (asset if target == 'asset' else link)[key] = bad
            with self.subTest(key=key), self.assertRaises(ConfigurationError):
                ra.plan(self.config, link, asset)
