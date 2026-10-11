import copy
import hashlib
import json
import unittest
import uuid

from mw_integration_agent import audit, operator_audit as oa
from mw_integration_agent.config import ConfigurationError


class OperatorContractTests(unittest.TestCase):
    def setUp(self):
        self.raw = '{"steps": [{"table": "Borrowers", "values": {"City": "Synthetic"}}]}'
        self.op = str(uuid.uuid4())
        self.marker = (self.op, hashlib.sha256(self.raw.encode()).hexdigest(), 'operator-label',
            'operator-login-label', '123', '2026-10-04 05:26:27+00', 'owner-approved synthetic correction',
            '['+self.raw+']', 'synthetic-origin')
        self.rows = [(1, 'public', 'Borrowers', 'UPDATE', '{"Row ID": "synthetic"}',
                      '{"City": "Old"}', '{"City": "Synthetic"}', '123')]
        self.evidence = {'origin_reference': 'synthetic-original-evidence',
                         'authorization_reference': 'synthetic-repair-approval'}
        self.captured = (self.marker, self.rows, self.raw)
        self.value = oa.plan(self.captured, 'loan_manager_prod', self.evidence)

    def intent(self, value=None):
        value = self.value if value is None else value
        return (audit.digest(value), self.marker[2], self.marker[3], oa.SERVICE, value, 'operator')

    def test_distinct_original_hashes_both_verified(self):
        self.assertNotEqual(self.marker[1], self.value['original_plan_canonical_sha256'])
        oa.verify(self.captured, 'loan_manager_prod', self.intent())

    def test_no_generic_digest_substitution(self):
        marker = list(self.marker)
        marker[1] = audit.digest(json.loads(self.raw))
        with self.assertRaisesRegex(ConfigurationError, 'SOURCE_CONTRACT'):
            oa.plan((marker, self.rows, self.raw), 'loan_manager_prod', self.evidence)

    def test_wrong_central_hash_actor_kind_and_service_rejected(self):
        for index, bad in ((0, self.marker[1]), (1, 'another-actor'), (2, 'another-login'),
                           (3, 'reviewer_dml'), (5, 'reviewer')):
            intent = list(self.intent()); intent[index] = bad
            with self.subTest(index=index), self.assertRaises(ConfigurationError):
                oa.verify(self.captured, 'loan_manager_prod', intent)

    def test_source_marker_transaction_effect_or_plan_change_rejected(self):
        for index, bad in ((0, str(uuid.uuid4())), (2, 'other-actor'), (4, '124'),
                           (5, '2026-10-04 05:27:00+00'), (8, 'other-code')):
            marker = list(self.marker); marker[index] = bad
            with self.subTest(index=index), self.assertRaises(ConfigurationError):
                oa.verify((marker, self.rows, self.raw), 'loan_manager_prod', self.intent())
        for rows in (self.rows*2, [(2, *self.rows[0][1:])],
                     [(*self.rows[0][:6], '{"City":"Other"}', '123')]):
            with self.assertRaises(ConfigurationError):
                oa.verify((self.marker, rows, self.raw), 'loan_manager_prod', self.intent())
        with self.assertRaises(ConfigurationError):
            oa.verify(self.captured, 'loan_manager_dev', self.intent())

    def test_canonical_content_tampering_rejected_even_with_recomputed_hash(self):
        for field, replacement in (('original_plan', {'steps': []}), ('retrospective', False),
                                   ('original_plan_canonical_sha256', '0'*64)):
            value = copy.deepcopy(self.value); value[field] = replacement
            with self.subTest(field=field), self.assertRaises(ConfigurationError):
                oa.verify(self.captured, 'loan_manager_prod', self.intent(value))

    def test_private_manifest_pins_all_source_guards(self):
        manifest = {k: self.value['source'][k] for k in
                    ('plan_sha256', 'marker_sha256', 'effects_sha256', 'effect_count')}
        manifest.update(operation_id=self.op,
                        original_plan_canonical_sha256=self.value['original_plan_canonical_sha256'])
        oa.check_manifest(self.value, manifest)
        for key in manifest:
            bad = dict(manifest); bad[key] = 'changed'
            with self.subTest(key=key), self.assertRaises(ConfigurationError):
                oa.check_manifest(self.value, bad)
