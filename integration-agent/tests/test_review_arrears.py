"""R177 item A: auto-post arrears (owner, 20 November 2026: exact total and partial).

With `receipt_arrears_auto_enabled` (default off) a slip above the latest charge day's total but not above every unpaid
charge dated on or before the slip date is an ordinary 'Lump Sum' (the database allocates newest charge first) instead of
'Overpayment review'; an exact payoff stays Loan Close and the switch reaches every plan() call that can post."""
import json
import unittest
from datetime import date, datetime, timedelta

from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.partner_notice import NoticeJournal, receipt_notice
from mw_integration_agent.receipt_rules import BANGKOK, ReceiptInvalid
from mw_integration_agent.review_proposal import arrears_enabled, arrears_left, fits, plan, same_posting_outcome
from test_config import ROOT
import test_review_cycle as cycle_fixture  # the harness only; its tests run in their own module

TODAY = '2026-11-20'
YESTERDAY = '2026-11-19'
B = {'id': 'b', 'username': 'borrower', 'enabled': True, 'name_en': 'Kathy', 'name_th': 'เคที'}


def loan(key='L1', principal='5000', daily='300', start='2026-11-01'):
    return {'id': key, 'loan_key': key, 'status': 'ยังไม่ปิดยอด', 'type': 'ดอกเบี้ยรายวัน', 'auto': True, 'principal': principal,
            'daily': daily, 'date': start}


def charge(key, day, interest, loan_id='L1', principal='0', late='0'):
    return {'id': key, 'loan': loan_id, 'date': day, 'principal': principal, 'interest': interest, 'late': late}


def two_days(today=TODAY, yesterday=YESTERDAY):
    """Charges of 300 yesterday and 300 today on one loan (the design's example)."""
    return {'loans': [loan()], 'charges': [charge('c1', yesterday, '300'), charge('c2', today, '300')]}


def receipt(amount, day=TODAY):
    return {'amount': str(amount), 'date': day, 'time': '10:13', 'reference': 'TESTREF', 'account_id': 'a', 'account_label': 'Test'}


class ArrearsPlanTests(unittest.TestCase):
    def test_switch_off_is_todays_overpayment_review_byte_identical(self):
        off = plan(receipt(450), B, two_days(), TODAY)
        self.assertEqual(off['action'], 'Overpayment review')
        self.assertEqual(off, plan(receipt(450), B, two_days(), TODAY, arrears=False))
        self.assertEqual(off, plan(receipt(450), B, two_days(), TODAY, config={'receipt_arrears_auto_enabled': True}))  # config alone does nothing

    def test_switch_on_partial_and_exact_total_are_lump_sum_above_total_is_not(self):
        for amount in (450, 600):
            with self.subTest(amount=amount):
                proposal = plan(receipt(amount), B, two_days(), TODAY, arrears=True)
                self.assertEqual((proposal['action'], proposal['loan_id']), ('Lump Sum', None))
                self.assertNotIn('approved_allocation_method', proposal)
                # No new key: the proposal is the same shape as a first-tier Lump Sum.
                self.assertEqual(set(proposal), set(plan(receipt(300), B, two_days(), TODAY, arrears=True)))
                self.assertEqual(proposal['loan_keys'], ['L1'])
        self.assertEqual(plan(receipt(601), B, two_days(), TODAY, arrears=True)['action'], 'Overpayment review')
        # Above the total with the pay-forward switch on still reaches the options (unchanged entry condition).
        from unittest.mock import patch
        with patch('mw_integration_agent.review_proposal.pay_forward_options', return_value={'planSha256': 'x'}) as options:
            self.assertEqual(plan(receipt(601), B, two_days(), TODAY, config={'pay_forward_options_enabled': True}, arrears=True)['action'],
                             'Pay forward options')
            options.reset_mock()
            self.assertEqual(plan(receipt(450), B, two_days(), TODAY, config={'pay_forward_options_enabled': True}, arrears=True)['action'], 'Lump Sum')
            options.assert_not_called()

    def test_exact_payoff_wins_over_arrears(self):
        # Loan L2: principal 150 + its interest 100 today = payoff 250, inside the arrears tier (latest day 200 < 250 <= 500).
        current = {'loans': [loan(), loan('L2', principal='150', daily='100')],
                   'charges': [charge('c1', YESTERDAY, '300'), charge('c2', TODAY, '100'), charge('c3', TODAY, '100', 'L2')]}
        proposal = plan(receipt(250), B, current, TODAY, arrears=True)
        self.assertEqual((proposal['action'], proposal['loan_id']), ('Loan Close', 'L2'))
        # Two loans with the same payoff: ambiguous, as today.
        twin = {'loans': [loan(), loan('L2', principal='150', daily='100'), loan('L3', principal='150', daily='100')],
                'charges': [charge('c1', YESTERDAY, '300'), charge('c2', TODAY, '100', 'L2'), charge('c3', TODAY, '100', 'L3')]}
        with self.assertRaisesRegex(ReceiptInvalid, 'LOAN_CLOSE_AMBIGUOUS'):
            plan(receipt(250), B, twin, TODAY, arrears=True)
        # Two charges dated today on a candidate loan: refused, as today.
        doubled = {'loans': [loan()], 'charges': [charge('c1', YESTERDAY, '300'), charge('c2', TODAY, '150'), charge('c3', TODAY, '150')]}
        with self.assertRaisesRegex(ReceiptInvalid, 'MULTIPLE_TODAY_CHARGES'):
            plan(receipt(450), B, doubled, TODAY, arrears=True)

    def test_first_tier_unchanged_even_when_it_equals_a_small_payoff(self):
        current = {'loans': [loan(), loan('L2', principal='100', daily='100')],
                   'charges': [charge('c1', YESTERDAY, '300'), charge('c2', TODAY, '300'), charge('c3', TODAY, '100', 'L2')]}
        for arrears in (False, True):
            with self.subTest(arrears=arrears):
                self.assertEqual(plan(receipt(200), B, current, TODAY, arrears=arrears)['action'], 'Lump Sum')

    def test_yesterday_slip_counts_charges_through_yesterday_and_never_closes(self):
        current = {'loans': [loan()], 'charges': [charge('c0', '2026-11-18', '300'), charge('c1', YESTERDAY, '300'), charge('c2', TODAY, '300')]}
        self.assertEqual(plan(receipt(600, YESTERDAY), B, current, TODAY, arrears=True)['action'], 'Lump Sum')
        self.assertEqual(plan(receipt(601, YESTERDAY), B, current, TODAY, arrears=True)['action'], 'Overpayment review')
        # Even the loan's payoff is no close on a yesterday slip.
        payoff = 5000 + 900
        self.assertNotEqual(plan(receipt(payoff, YESTERDAY), B, current, TODAY, arrears=True)['action'], 'Loan Close')

    def test_fits_is_unchanged_identity_evidence(self):
        # A partial-arrears amount is not an exact fit; R095 narrowing keeps exact equality.
        self.assertFalse(fits(receipt(450), B, two_days()))
        self.assertTrue(fits(receipt(600), B, two_days()))

    def test_same_posting_outcome_automatic_stays_strict(self):
        saved = plan(receipt(450), B, two_days(), TODAY, arrears=True)
        fresh_off = plan(receipt(450), B, two_days(), TODAY)
        self.assertTrue(same_posting_outcome(saved, saved, True))
        self.assertFalse(same_posting_outcome(saved, fresh_off, True))
        # A reviewed Overpayment request approved after the switch is on re-plans as Lump Sum and keeps its approval.
        self.assertTrue(same_posting_outcome(fresh_off, saved, False))

    def test_switch_helper(self):
        self.assertTrue(arrears_enabled({'receipt_arrears_auto_enabled': True}))
        for config in (None, {}, {'receipt_arrears_auto_enabled': 'true'}, {'receipt_arrears_auto_enabled': 1}):
            self.assertFalse(arrears_enabled(config))


class StillUnpaidTests(unittest.TestCase):
    def test_left_after_newest_first(self):
        current = {'loans': [loan()], 'charges': [charge('c0', '2026-11-17', '200'), charge('c1', '2026-11-18', '150'),
                                                  charge('c2', YESTERDAY, '300'), charge('c3', TODAY, '300')]}
        proposal = plan(receipt(600), B, current, TODAY, arrears=True)
        self.assertEqual(arrears_left(proposal), {'amount': '350', 'first': '2026-11-17', 'last': '2026-11-18'})
        self.assertEqual(arrears_left(plan(receipt(700), B, current, TODAY, arrears=True)),
                         {'amount': '250', 'first': '2026-11-17', 'last': '2026-11-18'})
        self.assertIsNone(arrears_left(plan(receipt(950), B, current, TODAY, arrears=True)))  # the exact total
        self.assertIsNone(arrears_left(plan(receipt(1000), B, current, TODAY, arrears=True)))  # Overpayment review
        self.assertIsNone(arrears_left({'action': 'Lump Sum'}))  # unreadable facts: no line, never an error

    def test_notice_line(self):
        unpaid = {'amount': '350', 'first': '2026-11-16', 'last': '2026-11-17'}
        _, body = receipt_notice(receipt(600), B, 'English', 'pay-1', unpaid=unpaid)
        self.assertEqual(body.split('\n')[:3], ['Recorded ฿600 from Kathy', 'Transferred 20 Nov 10:13 · Test', 'Still unpaid: ฿350 from 16–17 Nov'])
        _, body = receipt_notice(receipt(600), B, 'ไทย', 'pay-1', unpaid=dict(unpaid, first='2026-11-17'))
        self.assertEqual(body.split('\n')[2], 'ยังค้าง ฿350 ของ 17 พ.ย.')
        # Without unpaid, or before posting, nothing changes.
        self.assertEqual(receipt_notice(receipt(600), B, 'English', 'pay-1'), receipt_notice(receipt(600), B, 'English', 'pay-1', unpaid=None))
        self.assertNotIn('Still unpaid', receipt_notice(receipt(600), B, 'English', None, unpaid=unpaid)[1])


class ArrearsConfigTests(unittest.TestCase):
    def setUp(self):
        self.config = load_json(ROOT / 'config.example.json')

    def test_default_off_and_strict_boolean(self):
        self.assertIs(self.config['receipt_arrears_auto_enabled'], False)
        validate_config(self.config)
        for value in ('true', 1, None, 'false'):
            with self.subTest(value=value), self.assertRaisesRegex(ConfigurationError, 'receipt_arrears_auto_enabled must be boolean'):
                validate_config(dict(self.config, receipt_arrears_auto_enabled=value))

    def test_on_requires_automatic_payment(self):
        with self.assertRaisesRegex(ConfigurationError, 'receipt_arrears_auto_enabled requires receipt_auto_payment_enabled'):
            validate_config(dict(self.config, receipt_arrears_auto_enabled=True))


def today_iso(offset=0):
    return (datetime.now(BANGKOK).date() - timedelta(days=offset)).isoformat()


class ArrearsCycleTests(unittest.TestCase):
    """The three plan() call sites in one cycle each: proposal, execution re-plan and pending-request freshness. The
    harness is test_review_cycle.CycleTests' (its own tests run there, not again here)."""
    setUp = cycle_fixture.CycleTests.setUp
    run_cycle = cycle_fixture.CycleTests.run_cycle
    validated_job = cycle_fixture.CycleTests.validated_job
    enable_auto = cycle_fixture.CycleTests.enable_auto

    def arrears_job(self, amount='450.00', unidentified=False):
        from mw_integration_agent.review_proposal import plan as real_plan
        self.proposal['receipt']['amount'] = amount
        self.facts.return_value = two_days(today_iso(), today_iso(1))
        self.plan.side_effect = real_plan
        self.validated_job();self.enable_auto();self.masters.return_value['reviewer_ids'] = ['p']
        if unidentified:
            self.j.db.execute("UPDATE receipt_jobs SET result=?", (json.dumps({'receipt': self.proposal['receipt'], 'borrower': self.b,
                                                                              'unidentified_sender': True}),))
            self.j.db.commit()

    def review(self):
        return self.j.db.execute("SELECT id,state,detail,proposal FROM partner_reviews WHERE job_id='new-job'").fetchone()

    def test_switch_on_partial_arrears_posts_automatically_with_still_unpaid_line(self):
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.arrears_job();self.config['receipt_arrears_auto_enabled'] = True
        self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count, 1)
        self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
        row = self.review()
        self.assertEqual((row['state'], row['detail'], json.loads(row['proposal'])['action']), ('POSTED', AUTO_POLICY, 'Lump Sum'))
        notices = NoticeJournal(self.root / 'partner-notices.db')
        try:body = notices.db.execute('SELECT body FROM partner_notices WHERE event_key=?', ('review-result:' + row['id'] + ':POSTED',)).fetchone()[0]
        finally:notices.close()
        yesterday = date.fromisoformat(today_iso(1))
        self.assertEqual(body.split('\n')[2], f'Still unpaid: ฿150 from {yesterday.day} {yesterday.strftime("%b")}')

    def test_switch_off_keeps_the_overpayment_review_request(self):
        self.arrears_job()
        self.run_cycle()
        self.submit.assert_not_called()
        row = self.review()
        self.assertEqual((row['state'], json.loads(row['proposal'])['action']), ('PENDING', 'Overpayment review'))

    def test_exact_total_posts_without_still_unpaid_line(self):
        self.arrears_job('600.00');self.config['receipt_arrears_auto_enabled'] = True
        self.run_cycle()
        row = self.review()
        self.assertEqual(row['state'], 'POSTED')
        notices = NoticeJournal(self.root / 'partner-notices.db')
        try:body = notices.db.execute('SELECT body FROM partner_notices WHERE event_key=?', ('review-result:' + row['id'] + ':POSTED',)).fetchone()[0]
        finally:notices.close()
        self.assertNotIn('Still unpaid', body)

    def test_switch_turned_off_before_execution_goes_stale(self):
        self.arrears_job();self.config.update(receipt_arrears_auto_enabled=True, partner_review_execution_enabled=False)
        self.run_cycle()
        self.assertEqual(self.review()['state'], 'APPROVED')
        self.config.update(receipt_arrears_auto_enabled=False, partner_review_execution_enabled=True)
        self.run_cycle()
        self.submit.assert_not_called()
        self.assertEqual(tuple(self.review())[1:3], ('STALE', 'PROPOSAL_FACTS_CHANGED'))

    def test_switch_kept_on_execution_replan_posts(self):
        self.arrears_job();self.config.update(receipt_arrears_auto_enabled=True, partner_review_execution_enabled=False)
        self.run_cycle()
        self.config['partner_review_execution_enabled'] = True
        self.run_cycle()
        self.assertEqual(self.submit.call_count, 1)
        self.assertEqual(self.review()['state'], 'POSTED')

    def test_amount_above_due_before_execution_goes_stale(self):
        self.arrears_job();self.config.update(receipt_arrears_auto_enabled=True, partner_review_execution_enabled=False)
        self.run_cycle()
        self.facts.return_value = {'loans': [loan()], 'charges': [charge('c1', today_iso(1), '100'), charge('c2', today_iso(), '300')]}
        self.config['partner_review_execution_enabled'] = True
        self.run_cycle()
        self.submit.assert_not_called()
        self.assertEqual(tuple(self.review())[1:3], ('STALE', 'PROPOSAL_FACTS_CHANGED'))

    def test_unidentified_sender_gets_a_request_never_an_automatic_payment(self):
        self.arrears_job(unidentified=True);self.config['receipt_arrears_auto_enabled'] = True
        self.run_cycle();self.run_cycle()
        self.submit.assert_not_called()
        row = self.review()
        self.assertEqual((row['state'], json.loads(row['proposal'])['action']), ('PENDING', 'Lump Sum'))

    def test_pending_arrears_request_still_goes_out_after_a_charge_edit(self):
        # An arrears Lump Sum request (unidentified sender); a late charge is added before delivery: the freshness check
        # re-plans with the switch (Lump Sum again, the same consequence), so the request still goes out.
        self.arrears_job(unidentified=True);self.config['receipt_arrears_auto_enabled'] = True
        self.run_cycle()
        row = self.review()
        self.assertEqual((row['state'], json.loads(row['proposal'])['action']), ('PENDING', 'Lump Sum'))
        self.facts.return_value = {'loans': [loan()], 'charges': [charge('c1', today_iso(1), '300', late='10'), charge('c2', today_iso(), '300')]}
        self.dispatch.reset_mock()
        self.run_cycle()
        self.assertEqual(self.review()['state'], 'PENDING')
        self.assertIn('review:' + row['id'], [c.args[0]['event_key'] for c in self.dispatch.call_args_list])


if __name__ == '__main__':
    unittest.main()
