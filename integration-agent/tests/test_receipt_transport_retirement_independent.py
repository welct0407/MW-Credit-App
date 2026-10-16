"""Independent route/recovery guards using owned SQLite, never live HTTP/SQL."""
import copy
import unittest
from contextlib import ExitStack
from unittest.mock import patch
import test_receipt_api as receipt_fixture
import test_review_cycle as cycle_fixture
from mw_integration_agent.review_execution import add_payment
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.receipt_rules import ReceiptInvalid


class RetirementTests(unittest.TestCase):
    setUp = cycle_fixture.CycleTests.setUp
    run_cycle = cycle_fixture.CycleTests.run_cycle
    enable_api = receipt_fixture.RoutingTests.enable_api

    def no_http(self):
        calls = []
        def refused(*args, **kwargs):
            calls.append(args)
            raise AssertionError('HTTP forbidden in the independent receipt fixture')
        stack = ExitStack()
        stack.enter_context(patch('urllib.request.urlopen', side_effect=refused))
        stack.enter_context(patch('urllib.request.OpenerDirector.open', side_effect=refused))
        self.addCleanup(stack.close)
        return calls

    def test_pre_cutoff_fresh_review_claims_only_native_identity_before_network(self):
        expected = self.enable_api()
        self.config['receipt_payment_api_cutoff'] = '2099-01-01T00:00:00+00:00'
        self.j.db.execute('UPDATE receipt_jobs SET created_at=0')
        self.j.db.commit()
        original = self.j.db.execute('SELECT proposal FROM partner_reviews').fetchone()[0]
        calls = self.no_http()
        def submitted(config, body):
            row = self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()
            self.assertEqual(tuple(row), ('POSTING', expected))
            self.assertEqual('pwa:' + body['command']['requestId'], expected)
            return {'kind':'recorded','reviewId':self.key,'financialMatch':True,
                    'originalOutcome':{'status':'posted','paymentId':expected}}
        self.submit.side_effect = submitted
        result = self.run_cycle()
        self.assertEqual(result['failures'], [])
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id,proposal FROM partner_reviews').fetchone()),
                         ('POSTED', expected, original))
        self.submit.assert_called_once(); self.add_payment.assert_not_called()
        self.assertEqual(calls, [])

    def test_fresh_authority_fact_account_actor_and_duplicate_guards_survive_old_cutoff(self):
        self.enable_api()
        self.config['receipt_payment_api_cutoff'] = '2099-01-01T00:00:00+00:00'
        original = self.j.db.execute('SELECT proposal FROM partner_reviews').fetchone()[0]
        baseline = copy.deepcopy(self.masters.return_value)
        calls = self.no_http()
        for case in ('reviewer', 'account', 'actor', 'facts', 'duplicate'):
            with self.subTest(case=case):
                self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',payment_id=NULL")
                self.j.db.commit(); self.masters.return_value = copy.deepcopy(baseline)
                self.read_query.return_value = ['actor@example.invalid']; self.plan.return_value = self.proposal
                self.check.side_effect = None
                if case == 'reviewer': self.masters.return_value['reviewer_ids'] = []
                elif case == 'account': self.masters.return_value['accounts'][0]['active'] = False
                elif case == 'actor': self.read_query.return_value = ['']
                elif case == 'facts': self.plan.return_value = {**self.proposal, 'unexpected':'changed'}
                else: self.check.side_effect = ReceiptInvalid('DUPLICATE_PAYMENT')
                self.run_cycle()
                state, identity, proposal = self.j.db.execute('SELECT state,payment_id,proposal FROM partner_reviews').fetchone()
                self.assertEqual(state, 'STALE'); self.assertIsNone(identity); self.assertEqual(proposal, original)
                self.submit.assert_not_called(); self.add_payment.assert_not_called()
        self.assertEqual(calls, [])

    def test_saved_legacy_identity_on_reset_state_is_retained_for_exact_key_readback(self):
        self.enable_api(); calls = self.no_http(); stored = 'igr:retained-original-dispatch'
        self.j.db.execute('UPDATE partner_reviews SET payment_id=?', (stored,)); self.j.db.commit()
        self.run_cycle(); self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()), ('UNKNOWN', stored))
        self.submit.assert_not_called(); self.status.assert_not_called(); self.readback.assert_not_called()
        self.masters.return_value['reviewer_ids'] = []
        self.run_cycle(); self.readback.assert_called_once_with(self.config, stored, self.proposal)
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()), ('POSTED', stored))
        self.submit.assert_not_called(); self.status.assert_not_called(); self.add_payment.assert_not_called(); self.assertEqual(calls, [])

    def test_native_saved_attempt_reconciles_only_status_after_reviewer_revocation(self):
        expected = self.enable_api(); calls = self.no_http()
        self.j.db.execute('UPDATE partner_reviews SET payment_id=?', (expected,)); self.j.db.commit()
        self.run_cycle(); self.submit.assert_not_called(); self.status.assert_not_called()
        self.masters.return_value['reviewer_ids'] = []
        self.status.return_value = {'kind':'recorded','reviewId':self.key,'financialMatch':True,
                                   'originalOutcome':{'status':'posted','paymentId':expected}}
        self.run_cycle(); self.status.assert_called_once_with(self.config, expected, self.key)
        self.readback.assert_called_once_with(self.config, expected, self.proposal)
        self.submit.assert_not_called(); self.add_payment.assert_not_called(); self.assertEqual(calls, [])

    def test_malformed_saved_identity_never_guesses_a_key_or_changes_the_journal(self):
        self.enable_api(); calls = self.no_http()
        for state in ('APPROVED', 'POSTING', 'UNKNOWN'):
            for identity in ('', 'unrecognized-route', 'igr:', 'pwa:'):
                with self.subTest(state=state, identity=identity):
                    self.j.db.execute('UPDATE partner_reviews SET state=?,payment_id=?', (state, identity)); self.j.db.commit()
                    before = tuple(self.j.db.execute('SELECT state,payment_id,proposal FROM partner_reviews').fetchone())
                    result = self.run_cycle()
                    self.assertIn({'stage':'execution','exception':'ConfigurationError'}, result['failures'])
                    self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id,proposal FROM partner_reviews').fetchone()), before)
                    self.submit.assert_not_called(); self.status.assert_not_called(); self.readback.assert_not_called(); self.add_payment.assert_not_called()
        self.assertEqual(calls, [])

    def test_old_null_unknown_is_sql_readback_only_even_if_native_is_disabled(self):
        self.enable_api(); self.config['receipt_payment_api_enabled'] = False; calls = self.no_http()
        self.j.db.execute("UPDATE partner_reviews SET state='UNKNOWN',payment_id=NULL"); self.j.db.commit()
        self.readback.return_value = False
        self.run_cycle(); self.run_cycle()
        self.assertEqual(self.readback.call_count, 2)
        self.readback.assert_called_with(self.config, 'igr:' + self.key[:48], self.proposal)
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()), ('UNKNOWN', None))
        self.submit.assert_not_called(); self.status.assert_not_called(); self.add_payment.assert_not_called(); self.assertEqual(calls, [])

    def test_disabled_native_and_missing_archive_remain_unattempted(self):
        self.enable_api(); calls = self.no_http()
        self.config['receipt_payment_api_enabled'] = False; self.run_cycle()
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()), ('APPROVED', None))
        self.config['receipt_payment_api_enabled'] = True
        self.j.db.execute('DELETE FROM receipt_assets'); self.j.db.commit(); self.run_cycle()
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()), ('APPROVED', None))
        self.submit.assert_not_called(); self.add_payment.assert_not_called(); self.assertEqual(calls, [])

    def test_retired_entrypoint_cannot_use_keys_or_privileged_flags_for_network(self):
        calls = self.no_http()
        for config in ({}, {'appsheet_app_id':'historical','appsheet_key_file':'missing'},
                       {'partner_review_execution_enabled':True,'_receipt_reviewer_approved':True,'_receipt_automatic':True}):
            with self.assertRaisesRegex(ConfigurationError, '^LEGACY_RECEIPT_TRANSPORT_RETIRED$'):
                add_payment(config, 'igr:old', self.proposal, 'actor@example.invalid')
        self.assertEqual(calls, [])


if __name__ == '__main__': unittest.main()
