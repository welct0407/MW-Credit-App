"""R181: close choices (code 4) in the pay-forward options request (owner, 21 November 2026: "loan closure option should
be given"). With `loan_settle_options_enabled` (default off) a slip above what is due offers to close one or several of the
borrower's loans from the server plan's settle entries: one payment, agent command schemaVersion 11, reviewed mode only.
The server plan and the Loan Close quotes are mocked here; the SQL runs in scripts/database/Test-AgentReceiptSettle.sql."""
import json
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from mw_integration_agent import receipt_api
from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.partner_review import options_choice, request_text
from mw_integration_agent.receipt_rules import BANGKOK
from mw_integration_agent.review_proposal import chosen_plan, chosen_purpose, plan
from mw_integration_agent.review_cycle import automatic_payment
from test_config import ROOT
import test_review_cycle_options as cycle_fixture
from test_receipt_api_v9 import ASSET, CONFIG as API_CONFIG

DAY = datetime.now(BANGKOK).date().isoformat()
HA, HB, HC = 'a' * 64, 'b' * 64, 'c' * 64
OPTIONS = {'pay_forward_options_enabled': True, 'partner_review_execution_enabled': True, 'database_enabled': True}
SETTLE = dict(OPTIONS, loan_settle_options_enabled=True, receipt_payment_api_enabled=True)
B = {'id': 'k', 'username': 'kathy', 'enabled': True, 'name_en': 'Kathy', 'name_th': 'เคที'}


def loan(key, principal, daily, start, label):
    return {'id': key, 'status': 'ยังไม่ปิดยอด', 'type': 'ดอกเบี้ยรายวัน', 'auto': True, 'principal': principal, 'daily': daily, 'date': start,
            'loan_key': label}


def kathy():
    """Kathy's case: ฿1,000 (15 Nov, ฿100/day) and ฿2,000 (9 Nov, ฿200/day), interest ฿300 due today; the slip ฿3,300."""
    return {'loans': [loan('KA', '1000', '100', '2026-11-15', 'เคที - Kathy-฿1,000-15/11-10%'), loan('KB', '2000', '200', '2026-11-09', 'เคที - Kathy-฿2,000-09/11-10%')],
            'charges': [{'id': 'KA-today', 'loan': 'KA', 'date': DAY, 'principal': '0', 'interest': '100'},
                        {'id': 'KB-today', 'loan': 'KB', 'date': DAY, 'principal': '0', 'interest': '200'}]}


def receipt(amount, day=DAY):
    return {'amount': str(amount), 'date': day, 'time': '16:29', 'reference': 'TESTREF', 'account_id': 'a', 'account_label': 'Dad SCB'}


class Server:
    """The server's pay-forward plan and Loan Close quotes for synthetic loans {id: (payoffRemainder, planHash)}."""

    def __init__(self, remainder, loans, due='300', uncovered=None, quotes=None):
        self.remainder, self.loans, self.due = remainder, loans, due
        self.uncovered = uncovered or {}   # {frozenset(ids): uncovered} for a settle purpose
        self.quotes = quotes if quotes is not None else {i: {'planHash': h, 'rebate': None} for i, (_, h) in loans.items() if h}
        self.reads = []

    def rows(self, n):
        return [{'loanId': 'KB', 'chargeDate': (datetime.fromisoformat(DAY) + timedelta(days=i + 1)).date().isoformat()} for i in range(n)]

    def read(self, config, sql, variables=None):
        purpose = json.loads(variables['purpose']);self.reads.append(purpose)
        if not purpose['principal']:
            return {'dueTotal': self.due, 'remainder': str(self.remainder), 'uncovered': '0', 'settles': [], 'blocked': [], 'paidThrough': {'KB': DAY},
                    'forward': self.rows(3), 'allocations': [], 'due': [], 'principal': [],
                    'options': [{'loanId': i, 'kind': None, 'payoffRemainder': p, 'settlesWith': {'payoff': str(int(p) + 100), 'planHash': h} if h else None}
                                for i, (p, h) in self.loans.items()]}
        ids = [e['loanId'] for e in purpose['principal']]
        return {'uncovered': self.uncovered.get(frozenset(ids), '0'), 'settles': ids, 'blocked': [],
                'forward': self.rows(2) if purpose['forward'] else [], 'allocations': [{'chargeId': 'x'}], 'materialize': [],
                'principal': [{'loanId': e['loanId'], 'kind': 'settle', 'chargeId': e['loanId'] + '-today', 'chargeDate': DAY, 'amount': e['amount'],
                               'accruedInterest': '0', 'principalDue': e['amount'], 'planHash': self.loans[e['loanId']][1]} for e in purpose['principal']]}

    def quote(self, config, loan_id):
        if loan_id not in self.quotes:raise receipt_api.QuoteRefused('LOAN_CLOSE_QUOTE_UNAVAILABLE')
        return self.quotes[loan_id]


def kathy_server(**kw):
    return Server(3000, {'KA': ('1000', HA), 'KB': ('2000', HB)}, **kw)


def propose(server, config=SETTLE, amount=3300, facts=None, day=DAY):
    with patch('mw_integration_agent.review_proposal.read_query', side_effect=server.read), \
            patch('mw_integration_agent.receipt_api.close_quote', side_effect=server.quote):
        return plan(receipt(amount, day), B, facts or kathy(), DAY, config=config)


class CloseChoicesTests(unittest.TestCase):
    def test_1_switch_off_is_todays_request_byte_for_byte(self):
        off = propose(kathy_server(), OPTIONS)
        self.assertNotIn('close', off['options'])
        self.assertEqual(off, propose(kathy_server(), dict(OPTIONS, loan_settle_options_enabled=False)))
        self.assertEqual([b['reason'] for b in off['options']['blocked']], ['settles', 'settles'])
        self.assertIsNone(chosen_purpose(off['options'], options_choice('4')), '4 asks again without close choices')
        self.assertIn('Remainder settles', request_text(off, 'English')[1])

    def test_2_kathy_both_loans_and_the_singles_with_the_rest_forward(self):
        proposal = propose(kathy_server())
        close = proposal['options']['close']
        self.assertEqual([[l['loanId'] for l in c['loans']] for c in close], [['KA'], ['KB'], ['KA', 'KB']])
        both = close[2]
        self.assertEqual((both['forward'], both['rest'], [l['planHash'] for l in both['loans']]), (False, '0', [HA, HB]))
        self.assertEqual([(c['forward'], c['rest']) for c in close[:2]], [(True, '2000'), (True, '1000')])
        self.assertEqual(chosen_purpose(proposal['options'], options_choice('4 3')),
                         {'forward': False, 'principal': [{'loanId': 'KA', 'amount': '1000'}, {'loanId': 'KB', 'amount': '2000'}], 'loans': None})
        # planSha256 covers every plan read: a changed quote hash of one loan changes it.
        changed = propose(Server(3000, {'KA': ('1000', HA), 'KB': ('2000', HC)}))
        self.assertNotEqual(changed['options']['planSha256'], proposal['options']['planSha256'])

    def test_3_close_and_rest_forward_only_when_the_plan_covers_everything(self):
        proposal = propose(kathy_server(uncovered={frozenset(['KA']): '500'}))
        self.assertEqual([[l['loanId'] for l in c['loans']] for c in proposal['options']['close']], [['KB'], ['KA', 'KB']])

    def test_4_two_exact_sets_are_both_offered_and_the_cap_is_three(self):
        server = Server(3000, {'L1': ('1000', HA), 'L2': ('2000', HB), 'L3': ('3000', HC)})
        facts = {'loans': [loan(i, p, '10', '2026-11-01', i) for i, p in (('L1', '1000'), ('L2', '2000'), ('L3', '3000'))], 'charges': []}
        proposal = propose(server, amount=3300, facts=dict(facts, charges=[{'id': 'c', 'loan': 'L1', 'date': DAY, 'principal': '0', 'interest': '300'}]))
        close = proposal['options']['close']
        self.assertEqual(len(close), 3)
        sets = [[l['loanId'] for l in c['loans']] for c in close]
        self.assertIn(['L3'], sets);self.assertIn(['L1', 'L2'], sets)
        self.assertEqual(options_choice('4 2'), {'kind': 'close', 'loan': 2})

    def test_5_not_offered(self):
        # No quote basis (defaulted, several charges today, not daily-interest: no settlesWith) or an unreadable quote.
        proposal = propose(Server(3000, {'KA': ('1000', None), 'KB': ('2000', HB)}))
        self.assertEqual([[l['loanId'] for l in c['loans']] for c in proposal['options']['close']], [['KB']])
        proposal = propose(kathy_server(quotes={'KB': {'planHash': HB, 'rebate': None}}))
        self.assertEqual([[l['loanId'] for l in c['loans']] for c in proposal['options']['close']], [['KB']])
        # A quote that no longer matches the plan's hash drops the choice.
        proposal = propose(kathy_server(quotes={'KA': {'planHash': HC, 'rebate': None}, 'KB': {'planHash': HB, 'rebate': None}}))
        self.assertEqual([[l['loanId'] for l in c['loans']] for c in proposal['options']['close']], [['KB']])
        # A slip dated yesterday gets no options request at all (as today).
        yesterday = (datetime.fromisoformat(DAY) - timedelta(days=1)).date().isoformat()
        self.assertEqual(propose(kathy_server(), day=yesterday)['action'], 'Overpayment review')

    def test_6_plan_is_unchanged(self):
        # The slip equal to one loan's payoff (฿1,000 + its ฿100 today) is the R128 Loan Close; inside the latest day a Lump Sum.
        self.assertEqual(propose(kathy_server(), amount=1100)['action'], 'Loan Close')
        self.assertEqual(propose(kathy_server(), amount=300)['action'], 'Lump Sum')

    def test_7_reply_parsing(self):
        self.assertEqual(options_choice('4'), {'kind': 'close', 'loan': None})
        self.assertEqual(options_choice(' 4  2 '), {'kind': 'close', 'loan': 2})
        proposal = propose(kathy_server())
        self.assertIsNone(chosen_purpose(proposal['options'], options_choice('4')), 'several choices: 4 alone asks again')
        self.assertIsNone(chosen_purpose(proposal['options'], options_choice('4 9')))
        one = propose(Server(1000, {'KA': ('1000', HA)}), amount=1300)
        self.assertEqual(chosen_purpose(one['options'], options_choice('4')), {'forward': False, 'principal': [{'loanId': 'KA', 'amount': '1000'}], 'loans': None})

    def test_request_text(self):
        proposal = propose(kathy_server(quotes={'KA': {'planHash': HA, 'rebate': {'amount': '50', 'hasOpenLoan': True, 'offset': {'covered': '50'}, 'referrer': {'displayName': 'Lisa'}}},
                                                'KB': {'planHash': HB, 'rebate': None}}))
        english = request_text(proposal, 'English')[1].split('\n')
        self.assertIn('4 3 = close both loans: ฿1,000 (15 Nov, 10%) + ฿2,000 (9 Nov, 10%)', english)
        self.assertTrue(any(line.startswith('4 1 = close loan ฿1,000 (15 Nov, 10%); rest ฿2,000: pay forward ') for line in english), english)
        self.assertIn("If 4 1: referral rebate ฿50 offset to Lisa's loan", english)
        self.assertIn("If 4 3: referral rebate ฿50 offset to Lisa's loan", english)
        self.assertFalse(any(line.startswith('Remainder settles') for line in english), 'the offered loans leave the record-in-the-app line')
        self.assertLess(english.index('4 3 = close both loans: ฿1,000 (15 Nov, 10%) + ฿2,000 (9 Nov, 10%)'), english.index('3 = recheck (edit the charges in the app first, then reply 3)'))
        thai = request_text(proposal, 'ไทย')[1]
        self.assertIn('4 3 = ปิดทั้ง 2 สัญญา: ฿1,000 (15 พ.ย., 10%) + ฿2,000 (9 พ.ย., 10%)', thai)
        # UX-R181-06: too long, the rebate notes go first, then the single-loan lines, keeping the line closing both.
        from mw_integration_agent import partner_notice
        with patch.object(partner_notice, 'BODY_LIMIT', len(request_text(proposal, 'English')[1]) - 1):
            squeezed = request_text(proposal, 'English')[1]
        self.assertNotIn('If 4 1:', squeezed)

    def test_8_chosen_plan_requires_the_approved_settles_and_hashes(self):
        proposal = propose(kathy_server())
        purpose = chosen_purpose(proposal['options'], options_choice('4 3'))
        with patch('mw_integration_agent.review_proposal.read_query', side_effect=kathy_server().read):
            self.assertEqual([e['kind'] for e in chosen_plan(SETTLE, proposal, purpose)['principal']], ['settle', 'settle'])
        for server in (Server(3000, {'KA': ('1000', HA), 'KB': ('2000', HC)}), kathy_server(uncovered={frozenset(['KA', 'KB']): '1'})):
            with patch('mw_integration_agent.review_proposal.read_query', side_effect=server.read), self.assertRaisesRegex(Exception, 'PAY_FORWARD_PLAN_CHANGED'):
                chosen_plan(SETTLE, proposal, purpose)

    def test_8_payload_is_v11_with_the_settle_plan_hashes(self):
        proposal = propose(kathy_server())
        purpose = chosen_purpose(proposal['options'], options_choice('4 3'))
        with patch('mw_integration_agent.review_proposal.read_query', side_effect=kathy_server().read):
            read = dict(chosen_plan(SETTLE, proposal, purpose), purpose=purpose)
        read['allocations'] = [{'chargeId': 'KA-today', 'principal': '1000', 'interest': '100', 'expectedPrincipalRemaining': '1000', 'expectedInterestRemaining': '100', 'chargeDate': DAY}]
        review = {'id': 'r1', 'deciding_partner': 'p'}
        command = receipt_api.payload(API_CONFIG, review, proposal, ASSET, False, plan=read)['command']
        self.assertEqual(command['schemaVersion'], 11)
        self.assertEqual([(e['kind'], e['planHash']) for e in command['principal']], [('settle', HA), ('settle', HB)])
        # Any other choice stays v10 without planHash.
        read['principal'] = [{'loanId': 'KA', 'kind': 'raise', 'chargeId': 'KA-today', 'chargeDate': DAY, 'amount': '10', 'accruedInterest': '0', 'principalDue': '10', 'planHash': None}]
        command = receipt_api.payload(API_CONFIG, review, proposal, ASSET, False, plan=read)['command']
        self.assertEqual((command['schemaVersion'], 'planHash' in command['principal'][0]), (10, False))

    def test_9_automatic_mode_never_carries_a_close(self):
        proposal = propose(kathy_server())
        config = dict(SETTLE, receipt_auto_payment_enabled=True, receipt_auto_payment_cutoff='2026-01-01T00:00:00+00:00')
        self.assertFalse(automatic_payment(config, {'created_at': 9e9, 'result': '{}'}, proposal))
        with self.assertRaisesRegex(ConfigurationError, 'PAY_FORWARD_PLAN_REQUIRED'):
            receipt_api.payload(API_CONFIG, {'id': 'r1', 'deciding_partner': 'p'}, proposal, ASSET, True, plan={'purpose': {}})


class SettleCycleTests(unittest.TestCase):
    """Group 8 in the review cycle (harness of test_review_cycle_options; its own tests run there)."""
    setUp = cycle_fixture.OptionsCycleTests.setUp
    run_cycle = cycle_fixture.OptionsCycleTests.run_cycle
    reply = cycle_fixture.OptionsCycleTests.reply
    state = cycle_fixture.OptionsCycleTests.state
    posted_notice = cycle_fixture.OptionsCycleTests.posted_notice

    def close_request(self, switch=True):
        self.config.update(loan_settle_options_enabled=switch)
        self.proposal['receipt'] = dict(self.proposal['receipt'], amount='3300')
        self.proposal['facts'] = kathy()
        self.proposal['options'] = propose(kathy_server(quotes={'KA': {'planHash': HA, 'rebate': {'amount': '50', 'hasOpenLoan': True, 'offset': {'covered': '50'},
                                                                                                    'referrer': {'displayName': 'Lisa'}}},
                                                                 'KB': {'planHash': HB, 'rebate': None}}))['options']
        self.j.db.execute('UPDATE partner_reviews SET proposal=?', (json.dumps(self.proposal, sort_keys=True, ensure_ascii=False),));self.j.db.commit()
        self.current = dict(self.proposal)

    def detail(self):
        return self.j.db.execute('SELECT detail FROM partner_reviews').fetchone()[0]

    def test_an_approved_close_posts_once_and_reports_both_loans(self):
        self.close_request()
        self.reply('4 3');self.run_cycle();self.run_cycle()
        self.assertEqual((self.state(), self.submit.call_count), ('POSTED', 1))
        purpose = self.submit.call_args[0][1]['command']['plan']['purpose']
        self.assertEqual([p['loanId'] for p in purpose['principal']], ['KA', 'KB'])
        body = self.posted_notice()
        self.assertTrue(body.startswith('Recorded ฿3,300 from Test · 2 loans closed: ฿1,000 (15 Nov, 10%); ฿2,000 (9 Nov, 10%)\n'), body)
        self.assertIn("\nReferral rebate ฿50 (loan ฿1,000, 15 Nov): offset to Lisa's loan", body)

    def test_a_changed_plan_or_day_passed_is_stale_and_says_no_loan_closed(self):
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        self.close_request()
        self.chosen_plan.side_effect = ReceiptInvalid('PAY_FORWARD_PLAN_CHANGED')
        self.reply('4 3');self.run_cycle()
        self.assertEqual((self.state(), self.detail()), ('STALE', 'PAY_FORWARD_PLAN_CHANGED:CLOSE:2'))
        self.submit.assert_not_called()
        from mw_integration_agent.partner_notice import NoticeJournal
        notices = NoticeJournal(self.root / 'partner-notices.db')
        try:body = notices.db.execute("SELECT body FROM partner_notices WHERE event_key LIKE 'review-result:%:STALE'").fetchone()[0]
        finally:notices.close()
        self.assertTrue(body.endswith('Loans not closed: closing details changed. Nothing recorded. Close them in the app.'), body)

    def test_the_switch_turned_off_after_approval_is_manual(self):
        self.close_request()
        self.reply('4 3');self.config['partner_review_execution_enabled'] = False;self.run_cycle()
        self.assertEqual(self.state(), 'APPROVED')
        self.config.update(partner_review_execution_enabled=True, loan_settle_options_enabled=False);self.run_cycle()
        self.assertEqual(self.state(), 'MANUAL_REQUIRED');self.submit.assert_not_called()

    def test_an_uncertain_outcome_is_reconciled_by_status_only(self):
        self.close_request()
        self.submit.side_effect = TimeoutError();self.readback.return_value = False
        self.reply('4 3');self.run_cycle()
        self.assertEqual(self.state(), 'UNKNOWN')
        key = self.j.db.execute('SELECT id FROM partner_reviews').fetchone()[0]
        request = receipt_api.request_id('dev', key)
        self.status.return_value = {'kind': 'recorded', 'reviewId': key, 'financialMatch': True, 'originalOutcome': {'status': 'posted', 'paymentId': 'pwa:' + request}}
        self.readback.return_value = True
        self.run_cycle();self.run_cycle()
        self.assertEqual((self.state(), self.submit.call_count), ('POSTED', 1), 'never a second POST')

    def test_switch_off_four_asks_again(self):
        self.close_request(switch=False)
        self.proposal['options'] = {k: v for k, v in self.proposal['options'].items() if k != 'close'}
        self.j.db.execute('UPDATE partner_reviews SET proposal=?', (json.dumps(self.proposal, sort_keys=True, ensure_ascii=False),));self.j.db.commit()
        self.reply('4');self.run_cycle()
        self.assertEqual(self.state(), 'PENDING');self.submit.assert_not_called()


class SettleConfigTests(unittest.TestCase):
    def test_config(self):
        config = load_json(ROOT / 'config.example.json')
        self.assertIs(config['loan_settle_options_enabled'], False)
        validate_config(config)
        for change, message in (({'loan_settle_options_enabled': 'true'}, 'loan_settle_options_enabled must be boolean'),
                                ({'loan_settle_options_enabled': True}, 'requires pay_forward_options_enabled and receipt_payment_api_enabled')):
            with self.subTest(change), self.assertRaisesRegex(ConfigurationError, message):
                validate_config(dict(config, **change))


if __name__ == '__main__':
    unittest.main()
