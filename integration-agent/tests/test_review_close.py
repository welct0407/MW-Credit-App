"""R128: the Instagram-approved Loan Close (switch loan_close_execution_enabled, default off). The plan, texts, readback and
transport are tested directly; the review cycle runs with the real review database and journals and a mocked command API
(no real send or HTTP). The server route and SQL are tested in tests/unit/agent-receipt-command.test.mjs and
scripts/database/Test-AgentLoanClose.sql."""
import json
import tempfile
import time
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent import receipt_api
from mw_integration_agent.config import ConfigurationError, validate_config
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore, close_failure_line, close_notice, request_text
from mw_integration_agent.receipt_archive import Archive
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_rules import BANGKOK, ReceiptInvalid
from mw_integration_agent.review_cycle import cycle
from mw_integration_agent.review_execution import readback
from mw_integration_agent.review_proposal import close_rebate_path, plan, review_posts_close, same_posting_outcome

TODAY = datetime.now(BANGKOK).date().isoformat()
HASH, VERSION = 'a' * 64, 'b' * 64


def quote(**over):
    return {'loanId': 'L1', 'borrowerId': 'b', 'sourceVersion': VERSION, 'businessDate': TODAY, 'amount': '1100', 'planHash': HASH,
            'principalAmount': '1000.00', 'interestAmount': '100.00', 'lateChargeAmount': '0.00', 'rebate': None, **over}


def close(**over):
    return {'planHash': HASH, 'sourceVersion': VERSION, 'amount': '1100', 'businessDate': TODAY, 'principal': '1000.00', 'interest': '100.00',
            'late': '0.00', 'rebatePath': None, 'rebateAmount': None, 'rebateCovered': None, 'referrer': None, **over}


def facts():
    return {'loans': [{'id': 'L1', 'status': 'ยังไม่ปิดยอด', 'type': 'ดอกเบี้ยรายวัน', 'auto': True, 'principal': '1000', 'daily': '100',
                       'date': (datetime.now(BANGKOK).date() - timedelta(days=10)).isoformat(), 'loan_key': 'Cha - -฿1,000-26/10-1.5%'}],
            'charges': [{'id': 'c1', 'loan': 'L1', 'date': TODAY, 'principal': '0', 'interest': '100', 'late': '0'}]}


RECEIPT = {'amount': '1100.00', 'date': TODAY, 'time': '13:16', 'reference': 'SLIPREF123', 'account_id': 'a', 'account_label': 'Dad SCB'}
BORROWER = {'id': 'b', 'username': 'borrower', 'enabled': True, 'name_en': 'Cha', 'name_th': 'ชา'}
ON = {'loan_close_execution_enabled': True}


class PlanTests(unittest.TestCase):
    def plan(self, config=ON, receipt=RECEIPT, **kw):
        return plan(dict(receipt), BORROWER, facts(), TODAY, config=config, **kw)

    def test_switch_off_or_absent_keeps_the_manual_close_without_asking_the_server(self):
        with patch('mw_integration_agent.receipt_api.close_quote') as q:
            for config in (None, {}, {'loan_close_execution_enabled': False}, {'loan_close_execution_enabled': 'true'}):
                p = self.plan(config)
                self.assertEqual((p['action'], p['loan_id']), ('Loan Close', 'L1'))
                self.assertNotIn('close', p);self.assertFalse(review_posts_close(p))
            q.assert_not_called()

    def test_switch_on_keeps_the_quote_when_it_equals_the_slip(self):
        with patch('mw_integration_agent.receipt_api.close_quote', return_value=quote()) as q:
            p = self.plan()
        q.assert_called_once_with(ON, 'L1')
        self.assertTrue(review_posts_close(p));self.assertEqual(p['close'], close())

    def test_a_quote_other_than_the_slip_or_unavailable_keeps_the_manual_close(self):
        for side in (quote(amount='1150'), quote(businessDate='2026-01-01'), receipt_api.QuoteRefused('LOAN_CLOSE_QUOTE_REFUSED'),
                     ConfigurationError('LOAN_CLOSE_QUOTE_UNAVAILABLE'), TimeoutError()):
            with self.subTest(side=side), patch('mw_integration_agent.receipt_api.close_quote', **({'side_effect': side} if isinstance(side, Exception) else {'return_value': side})):
                p = self.plan()
                self.assertEqual(p['action'], 'Loan Close');self.assertNotIn('close', p)

    def test_strict_planning_names_the_change_and_lets_transport_faults_through(self):
        with patch('mw_integration_agent.receipt_api.close_quote', return_value=quote(amount='1150')):
            with self.assertRaisesRegex(ReceiptInvalid, '^LOAN_CLOSE_QUOTE_CHANGED:1150$'):self.plan(strict=True)
        with patch('mw_integration_agent.receipt_api.close_quote', return_value=quote(businessDate='2026-01-01')):
            with self.assertRaisesRegex(ReceiptInvalid, '^LOAN_CLOSE_QUOTE_CHANGED$'):self.plan(strict=True)
        with patch('mw_integration_agent.receipt_api.close_quote', side_effect=receipt_api.QuoteRefused('LOAN_CLOSE_QUOTE_REFUSED')):
            with self.assertRaisesRegex(ReceiptInvalid, '^LOAN_CLOSE_QUOTE_CHANGED$'):self.plan(strict=True)
        # Chase: a 404 (the loan not found or the agent route off) is no quote, not a change of the close.
        with patch('mw_integration_agent.receipt_api.close_quote', side_effect=receipt_api.QuoteRefused('LOAN_CLOSE_QUOTE_UNAVAILABLE')):
            with self.assertRaisesRegex(ReceiptInvalid, '^LOAN_CLOSE_QUOTE_UNAVAILABLE$'):self.plan(strict=True)
        with patch('mw_integration_agent.receipt_api.close_quote', side_effect=TimeoutError()):
            with self.assertRaises(TimeoutError):self.plan(strict=True)

    def test_a_slip_without_reference_or_time_stays_manual(self):
        with patch('mw_integration_agent.receipt_api.close_quote', return_value=quote()) as q:
            for receipt in (dict(RECEIPT, reference=None), dict(RECEIPT, reference=' '), dict(RECEIPT, time='')):
                self.assertNotIn('close', self.plan(receipt=receipt))
        q.assert_not_called()

    def test_a_slip_of_another_day_is_not_a_close(self):
        with patch('mw_integration_agent.receipt_api.close_quote') as q:
            p = self.plan(receipt=dict(RECEIPT, date=(datetime.now(BANGKOK).date() - timedelta(days=1)).isoformat()))
        self.assertNotEqual(p['action'], 'Loan Close');q.assert_not_called()

    def test_the_rebate_path_is_the_pwa_default(self):
        offer = {'amount': '30', 'hasOpenLoan': True, 'previousPath': None, 'offset': {'covered': '30', 'payable': '0'}, 'referrer': {'id': 'r', 'displayName': 'Ann'}}
        self.assertEqual(close_rebate_path(None), None)
        self.assertEqual(close_rebate_path(offer), 'offset')
        self.assertEqual(close_rebate_path(dict(offer, previousPath='expense')), 'expense')
        self.assertEqual(close_rebate_path(dict(offer, offset={'covered': '0', 'payable': '30'})), 'expense')
        self.assertEqual(close_rebate_path(dict(offer, hasOpenLoan=False)), 'expense')
        self.assertEqual(close_rebate_path(dict(offer, offset=None)), 'expense')
        with patch('mw_integration_agent.receipt_api.close_quote', return_value=quote(rebate=dict(offer, offset={'covered': '20', 'payable': '10'}))):
            p = self.plan()
        self.assertEqual({k: p['close'][k] for k in ('rebatePath', 'rebateAmount', 'rebateCovered', 'referrer')},
                         {'rebatePath': 'offset', 'rebateAmount': '30', 'rebateCovered': '20', 'referrer': 'Ann'})

    def test_same_posting_outcome_for_a_close(self):
        saved = {'action': 'Loan Close', 'receipt': RECEIPT, 'borrower': BORROWER, 'loan_id': 'L1', 'close': close()}
        self.assertTrue(same_posting_outcome(saved, dict(saved, facts={'c': 1}, close=close(sourceVersion='c' * 64)), False))
        for fresh in (dict(saved, close=close(planHash='c' * 64)), {k: v for k, v in saved.items() if k != 'close'}, dict(saved, loan_id='L2'),
                      dict(saved, receipt=dict(RECEIPT, reference='OTHER')), dict(saved, borrower=dict(BORROWER, id='x')), dict(saved, action='Lump Sum')):
            with self.subTest(fresh=sorted(fresh)):self.assertFalse(same_posting_outcome(saved, fresh, False))
        self.assertFalse(same_posting_outcome(saved, saved, True), 'never automatic')
        manual = {k: v for k, v in saved.items() if k != 'close'}
        self.assertFalse(same_posting_outcome(manual, saved, False))


class TextTests(unittest.TestCase):
    proposal = {'action': 'Loan Close', 'receipt': RECEIPT, 'borrower': BORROWER, 'loan_id': 'L1', 'loan_keys': ['Cha - -฿1,000-26/10-1.5%'], 'close': close()}

    def test_close_request_english_and_thai(self):
        self.assertEqual(request_text(self.proposal, 'English'), ('Loan close approval requested', '\n'.join([
            'Loan close approval requested', 'Borrower: Cha', 'Amount: 1100.00 baht', f'Transferred: {TODAY} 13:16 (Bangkok)', 'Account: Dad SCB',
            'Loan: Cha - -฿1,000-26/10-1.5%', 'Closing amount ฿1,100 (principal ฿1,000 + interest ฿100) matches this slip.',
            'Proposed: Close the loan; agent records the Loan Close',
            'Use Reply on THIS message: Yes / Approve / Approved (any case) to close the loan. Other direct replies reject. Nothing has been posted.'])))
        self.assertEqual(request_text(self.proposal, 'ไทย'), ('ขออนุมัติปิดสัญญา', '\n'.join([
            'ขออนุมัติปิดสัญญา', 'ผู้กู้: ชา', 'ยอด: 1100.00 บาท', f'เวลาโอน: {TODAY} 13:16', 'บัญชีรับ: Dad SCB', 'สัญญา: Cha - -฿1,000-26/10-1.5%',
            'ยอดปิด ฿1,100 (เงินต้น ฿1,000 + ดอกเบี้ย ฿100) ตรงกับสลิป', 'รายการที่เสนอ: ปิดสัญญา ระบบจะบันทึกการปิดให้',
            'กรุณาใช้ Reply ตอบข้อความนี้ว่า อนุมัติ เพื่อปิดสัญญา คำตอบอื่นถือว่าปฏิเสธ ยังไม่ได้บันทึกรายการ'])))
        for language in ('English', 'ไทย'):
            self.assertNotIn('yourself', request_text(self.proposal, language)[1]);self.assertNotIn('ด้วยตนเอง', request_text(self.proposal, language)[1])

    def test_breakdown_late_charge_unavailable_parts_and_rebates(self):
        late = dict(self.proposal, close=close(principal='1000.00', interest='60.00', late='40.00'))
        self.assertIn('Closing amount ฿1,100 (principal ฿1,000 + interest ฿60 + late charge ฿40) matches this slip.', request_text(late, 'English')[1])
        self.assertIn('ยอดปิด ฿1,100 (เงินต้น ฿1,000 + ดอกเบี้ย ฿60 + ค่าปรับล่าช้า ฿40) ตรงกับสลิป', request_text(late, 'ไทย')[1])
        bare = dict(self.proposal, close=close(principal=None, interest=None, late=None))
        self.assertIn('\nClosing amount ฿1,100 matches this slip.\n', request_text(bare, 'English')[1])
        self.assertIn('\nยอดปิด ฿1,100 ตรงกับสลิป\n', request_text(bare, 'ไทย')[1])
        offset = dict(self.proposal, close=close(rebatePath='offset', rebateAmount='30', rebateCovered='30', referrer='Ann'))
        self.assertIn("matches this slip.\nReferral rebate ฿30: offset to Ann's loan\nProposed:", request_text(offset, 'English')[1])
        self.assertIn('ตรงกับสลิป\nค่าแนะนำ ฿30: หักกับสินเชื่อของ Ann\nรายการที่เสนอ', request_text(offset, 'ไทย')[1])
        payout = dict(self.proposal, close=close(rebatePath='expense', rebateAmount='30', referrer='Ann'))
        self.assertIn('\nReferral rebate ฿30: pay out to Ann\n', request_text(payout, 'English')[1])
        self.assertIn('\nค่าแนะนำ ฿30: จ่ายให้ Ann\n', request_text(payout, 'ไทย')[1])
        partial = dict(self.proposal, close=close(rebatePath='offset', rebateAmount='30', rebateCovered='20', referrer='Ann'))
        self.assertIn("\nReferral rebate ฿20: offset to Ann's loan\nReferral rebate ฿10: pay out to Ann\n", request_text(partial, 'English')[1])
        self.assertNotIn('Referral', request_text(self.proposal, 'English')[1], 'no rebate line without a rebate')

    def test_a_proposal_from_before_the_deploy_keeps_its_wording(self):
        manual = {k: v for k, v in self.proposal.items() if k != 'close'}
        body = request_text(manual, 'English')[1]
        self.assertTrue(body.startswith('Payment approval requested\n'));self.assertIn('Review loan closure; partner records manually', body)
        self.assertIn('If you approve, please record this in the app yourself.', body)

    def test_worst_case_request_and_notice_fit_1000_characters(self):
        from mw_integration_agent.review_proposal import loan_display_key
        for language, name, description, referrer in (('English', 'Wilaiwan Phongphanit-Srisuwan', 'Fruit stall at the night market', 'Somchai Rattanakosin-Prasert'),
                                                     ('ไทย', 'วิไลวรรณ พงษ์พานิช-ศรีสุวรรณ', 'ร้านผลไม้ตลาดนัดกลางคืน', 'สมชาย รัตนโกสินทร์-ประเสริฐ')):
            key = loan_display_key(name, description, '1500000', '2026-03-12', '1.5')
            worst = dict(self.proposal, borrower=dict(BORROWER, name_en=name, name_th=name), loan_keys=[key],
                         receipt=dict(RECEIPT, amount='1612345.00', account_label='Kasikornbank 123-4-56789-0 (Lisa business)'),
                         close=close(amount='1612345', principal='1500000.00', interest='100345.00', late='12000.00', rebatePath='offset',
                                     rebateAmount='1000', rebateCovered='400', referrer=referrer))
            with self.subTest(language=language):
                body = request_text(worst, language)[1]
                self.assertLessEqual(len(body), 1000);self.assertEqual(body.count(key), 1)
                self.assertEqual(body.count('฿600'), 1, 'the payout part');self.assertEqual(body.count('฿400'), 1, 'the offset part')
                detail = json.dumps({'closeRebate': {'path': 'offset', 'amount': '1000', 'offsetAmount': '400', 'payable': '600'}})
                notice = close_notice(worst, language, 'pwa:' + '1' * 36, detail)[1]
                self.assertLessEqual(len(notice), 1000);self.assertIn(key, notice)
                for state, detail in (('STALE', 'LOAN_CLOSE_QUOTE_CHANGED:1612400'), ('MANUAL_REQUIRED', 'LOAN_CLOSE_REJECTED'), ('UNKNOWN', '')):
                    self.assertLessEqual(len(close_failure_line(state, detail, worst, language == 'ไทย')), 200)

    def test_posted_notice_and_failure_lines(self):
        detail = json.dumps({'closeRebate': {'path': 'offset', 'amount': '30', 'offsetAmount': '30', 'payable': '0'}})
        subject, body = close_notice(dict(self.proposal, close=close(referrer='Ann')), 'English', 'pwa:x', detail)
        self.assertEqual(subject, 'Loan closed')
        self.assertEqual(body, '\n'.join(['Loan closed', 'Borrower: Cha', 'Amount: 1,100.00 baht', f'Transferred: {TODAY} 13:16 (Bangkok)', 'Received into: Dad SCB',
                                         'Payment ID: pwa:x', 'Loan closed: Cha - -฿1,000-26/10-1.5%', "Referral rebate ฿30: offset to Ann's loan"]))
        subject, body = close_notice(dict(self.proposal, close=close(referrer='Ann')), 'ไทย', 'pwa:x', json.dumps({'closeRebate': {'path': 'expense', 'amount': '30', 'offsetAmount': '0', 'payable': '30'}}))
        self.assertEqual(subject, 'ปิดสัญญาสำเร็จ');self.assertTrue(body.startswith('ปิดสัญญาสำเร็จ\nผู้ชำระ: ชา\n'))
        self.assertTrue(body.endswith('\nรายการชำระเงิน: pwa:x\nปิดสัญญาแล้ว: Cha - -฿1,000-26/10-1.5%\nค่าแนะนำ ฿30: จ่ายให้ Ann'))
        self.assertNotIn('Referral', close_notice(self.proposal, 'English', 'pwa:x', json.dumps({'closeRebate': None}))[1])
        p = self.proposal
        self.assertEqual(close_failure_line('STALE', 'LOAN_CLOSE_QUOTE_CHANGED:1150', p, False), 'Closing amount is now ฿1,150; slip ฿1,100. Loan not closed; nothing posted. Close it in the app.')
        self.assertEqual(close_failure_line('STALE', 'LOAN_CLOSE_QUOTE_CHANGED:1150', p, True), 'ยอดปิดตอนนี้ ฿1,150 สลิป ฿1,100 ยังไม่ได้ปิดสัญญาและยังไม่ได้บันทึกรายการ กรุณาปิดในแอป')
        # AG-20a: only a change of the close says "closing details changed".
        for state, detail in (('STALE', 'LOAN_CLOSE_QUOTE_CHANGED'), ('STALE', 'PROPOSAL_FACTS_CHANGED'), ('STALE', 'RECEIVING_ACCOUNT_CHANGED'), ('STALE', 'LOAN_CLOSE_DAY_PASSED'),
                              ('MANUAL_REQUIRED', 'LOAN_CLOSE_REJECTED:plan_changed'), ('MANUAL_REQUIRED', 'LOAN_CLOSE_REJECTED')):
            self.assertEqual(close_failure_line(state, detail, p, False), 'Loan not closed: closing details changed. Nothing posted. Close it in the app.')
            self.assertEqual(close_failure_line(state, detail, p, True), 'ยังไม่ได้ปิดสัญญา: ข้อมูลการปิดเปลี่ยน ยังไม่ได้บันทึกรายการ กรุณาปิดในแอป')
        # AG-20b: the switch off and no quote (404) get the neutral line.
        for state, detail in (('MANUAL_REQUIRED', 'LOAN_CLOSE_EXECUTION_OFF'), ('STALE', 'LOAN_CLOSE_QUOTE_UNAVAILABLE')):
            self.assertEqual(close_failure_line(state, detail, p, False), 'Loan not closed. Nothing posted. Close it in the app.')
            self.assertEqual(close_failure_line(state, detail, p, True), 'ยังไม่ได้ปิดสัญญา ยังไม่ได้บันทึกรายการ กรุณาปิดในแอป')
        # Other reasons (the duplicate check: the payment already recorded) keep only their own line.
        for state, detail in (('STALE', 'PAYMENT_ALREADY_RECORDED'), ('STALE', 'POSSIBLE_EXISTING_PAYMENT_REVIEW'), ('STALE', 'REFERENCE_UNREADABLE'), ('MANUAL_REQUIRED', ''), ('STALE', '')):
            self.assertEqual(close_failure_line(state, detail, p, False), '', detail);self.assertEqual(close_failure_line(state, detail, p, True), '', detail)
        self.assertEqual(close_failure_line('UNKNOWN', '', p, False), 'Check the loan in the app before closing it again.')
        self.assertEqual(close_failure_line('UNKNOWN', '', p, True), 'ตรวจสอบสัญญาในแอปก่อนปิดอีกครั้ง')
        self.assertEqual(close_failure_line('REJECTED', '', p, False), '');self.assertEqual(close_failure_line('EXPIRED', '', p, False), '')


class ReadbackTests(unittest.TestCase):
    row = {'status': 'Posted', 'borrower': 'b', 'amount': '1100', 'date': TODAY, 'clock': TODAY + ' 13:16', 'account': 'a', 'reference': 'SLIPREF123',
           'method': 'Loan Close', 'loan': 'L1', 'posted': '1100'}
    proposal = {'action': 'Loan Close', 'receipt': RECEIPT, 'borrower': BORROWER, 'loan_id': 'L1', 'close': close()}

    def test_repayments_include_the_late_charge_and_a_close_is_its_loan_close(self):
        with patch('mw_integration_agent.review_execution.read_query', return_value=[self.row]) as q:
            self.assertTrue(readback({}, 'pwa:k', self.proposal))
        self.assertIn('"Late Charge Paid"', q.call_args.args[1])
        for change in ({'method': 'Selected Charges'}, {'loan': 'L2'}, {'posted': '1060'}, {'clock': TODAY + ' 13:17'}, {'reference': None}):
            with self.subTest(change=change), patch('mw_integration_agent.review_execution.read_query', return_value=[dict(self.row, **change)]):
                self.assertFalse(readback({}, 'pwa:k', self.proposal))
        lump = {'action': 'Lump Sum', 'receipt': RECEIPT, 'borrower': BORROWER, 'loan_id': None}
        with patch('mw_integration_agent.review_execution.read_query', return_value=[dict(self.row, method='Lump Sum', loan=None)]):
            self.assertTrue(readback({}, 'pwa:k', lump), 'an ordinary payment needs no close facts')


class TransportTests(unittest.TestCase):
    config = {'receipt_payment_api_enabled': True, 'receipt_payment_api_cutoff': '2026-01-01T00:00:00+07:00', 'receipt_environment': 'dev',
              'receipt_payment_api_audience': 'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',
              'receipt_payment_api_origin': 'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app',
              'database_name': 'loan_manager_dev', 'receipt_archive_enabled': True}
    review = {'id': 'f' * 64, 'deciding_partner': 'p'}
    proposal = {'action': 'Loan Close', 'receipt': RECEIPT, 'borrower': BORROWER, 'loan_id': 'L1', 'close': close()}

    def test_close_request_id_is_its_own_namespace(self):
        self.assertEqual(receipt_api.close_request_id('dev', 'synthetic-review-1'), '8b6f217a-418f-4139-875e-71a5adfde4ff')  # the Node contract's value
        self.assertNotEqual(receipt_api.close_request_id('dev', 'r'), receipt_api.request_id('dev', 'r'))
        self.assertNotEqual(receipt_api.close_request_id('dev', 'r'), receipt_api.close_request_id('prod', 'r'))

    def test_close_payload(self):
        body = receipt_api.close_payload(self.config, self.review, self.proposal)
        self.assertEqual(body, {'actorPartnerId': 'p', 'command': {'requestId': receipt_api.close_request_id('dev', 'f' * 64), 'targetId': 'L1', 'expectedVersion': VERSION,
            'inputs': {'paymentDate': TODAY, 'cashAccountId': 'a', 'paymentMethod': 'Bank Transfer', 'notes': 'Approved Instagram receipt review igr:' + 'f' * 48,
                       'expectedAmount': '1100', 'expectedPlanHash': HASH, 'bankReference': 'SLIPREF123', 'transferTime': '13:16'},
            'reviewId': 'f' * 64, 'environment': 'dev'}})
        rebate = dict(self.proposal, close=close(rebatePath='offset', rebateAmount='30'))
        self.assertEqual(receipt_api.close_payload(self.config, self.review, rebate)['command']['inputs']['rebatePath'], 'offset')
        for bad in (dict(self.proposal, receipt=dict(RECEIPT, reference=None)), dict(self.proposal, receipt=dict(RECEIPT, time='')),
                    dict(self.proposal, close=close(amount='1150'))):
            with self.assertRaises(ConfigurationError):receipt_api.close_payload(self.config, self.review, bad)
        with self.assertRaises(ConfigurationError):receipt_api.close_payload(dict(self.config, receipt_payment_api_enabled=False), self.review, self.proposal)

    def test_quote_shape_refusal_and_routes(self):
        with patch('mw_integration_agent.receipt_api.call', return_value=quote()) as c:
            self.assertEqual(receipt_api.close_quote(self.config, 'L1')['amount'], '1100')
        self.assertEqual(c.call_args.kwargs, {'route': 'loan-closes/quote/L1', 'answered': (404, 422)})
        with patch('mw_integration_agent.receipt_api.call', return_value=quote(loanId='L 1/x')) as c:
            receipt_api.close_quote(self.config, 'L 1/x')
        self.assertEqual(c.call_args.kwargs['route'], 'loan-closes/quote/L%201%2Fx')
        with patch('mw_integration_agent.receipt_api.call', return_value={'error': 'record_requires_reconciliation'}):
            with self.assertRaisesRegex(receipt_api.QuoteRefused, '^LOAN_CLOSE_QUOTE_REFUSED$'):receipt_api.close_quote(self.config, 'L1')
        with patch('mw_integration_agent.receipt_api.call', return_value={'error': 'not_found'}):
            with self.assertRaisesRegex(receipt_api.QuoteRefused, '^LOAN_CLOSE_QUOTE_UNAVAILABLE$'):receipt_api.close_quote(self.config, 'L1')
        for bad in (quote(loanId='L2'), quote(planHash='x'), quote(amount='1100.50'), [], quote(sourceVersion=None)):
            with self.subTest(bad=bad), patch('mw_integration_agent.receipt_api.call', return_value=bad):
                with self.assertRaisesRegex(ConfigurationError, 'LOAN_CLOSE_QUOTE_UNAVAILABLE'):receipt_api.close_quote(self.config, 'L1')
        with patch('mw_integration_agent.receipt_api.call', side_effect=receipt_api.NotSent('RECEIPT_API_NOT_SENT_401')):
            with self.assertRaises(receipt_api.NotSent):receipt_api.close_quote(self.config, 'L1')
        with patch('mw_integration_agent.receipt_api.call', return_value={'kind': 'unresolved'}) as c:
            receipt_api.close_status(self.config, 'pwa:' + receipt_api.close_request_id('dev', 'r'))
        self.assertEqual(c.call_args.kwargs, {'request': receipt_api.close_request_id('dev', 'r'), 'route': 'loan-closes'})
        with self.assertRaisesRegex(ConfigurationError, 'INVALID_RECEIPT_API_ROUTE'):receipt_api.call(self.config, 'GET', route='other')

    def test_close_posted(self):
        result = {'kind': 'recorded', 'originalOutcome': {'status': 'applied', 'result': {'operation': 'loan.close', 'targetId': 'L1', 'paymentId': 'pwa:k'}}}
        self.assertTrue(receipt_api.close_posted(result, 'pwa:k', 'L1'))
        for bad in ({'kind': 'unresolved'}, {'kind': 'conflict'}, dict(result, originalOutcome={'status': 'rejected', 'code': 'plan_changed', 'result': None}),
                    dict(result, originalOutcome={'status': 'applied', 'result': {'operation': 'loan.close', 'targetId': 'L2', 'paymentId': 'pwa:k'}})):
            self.assertFalse(receipt_api.close_posted(bad, 'pwa:k', 'L1'))
        self.assertFalse(receipt_api.close_posted(result, 'pwa:other', 'L1'))


class ConfigTests(unittest.TestCase):
    def test_the_switch_is_boolean_and_needs_execution_and_the_api(self):
        base = json.loads((Path(__file__).resolve().parents[1] / 'config.example.json').read_text(encoding='utf-8'))
        self.assertIs(base['loan_close_execution_enabled'], False)
        validate_config(base)
        validate_config(dict(base, loan_close_execution_enabled=False))
        # A non-boolean is refused, and true without the review execution or the receipt payment API.
        for change, message in (({'loan_close_execution_enabled': 'yes'}, 'must be boolean'),
                                ({'loan_close_execution_enabled': True, 'partner_review_execution_enabled': False}, 'requires review execution'),
                                ({'loan_close_execution_enabled': True, 'partner_review_execution_enabled': True, 'partner_review_enabled': True,
                                  'partner_review_cutoff': '2026-01-01T00:00:00+07:00', 'receipt_payment_api_enabled': False}, 'requires review execution')):
            with self.subTest(change=change), self.assertRaisesRegex(ConfigurationError, message):
                validate_config(dict(base, **change))


class CloseCycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name);self.j = ReceiptJournal(self.root / 'receipt-processing.db');self.addCleanup(self.j.close)
        ingress = IngressJournal(self.root / 'instagram-ingress.db');ingress.close()
        self.config = {'state_directory': str(self.root), 'partner_review_cutoff': '2026-01-01T00:00:00+00:00', 'partner_review_execution_enabled': True,
                       'receipt_payment_api_enabled': True, 'receipt_environment': 'dev', 'loan_close_execution_enabled': True}
        self.p = {'id': 'p', 'username': 'partner', 'enabled': True, 'language': 'English', 'email': 'test@example.invalid'}
        self.proposal = {'action': 'Loan Close', 'borrower': BORROWER, 'receipt': dict(RECEIPT), 'facts': {}, 'loan_id': 'L1',
                         'loan_keys': ['Cha - -฿1,000-26/10-1.5%'], 'close': close(rebatePath='offset', rebateAmount='30', rebateCovered='30', referrer='Ann')}
        self.reserve(self.proposal)
        self.current = self.proposal
        for target, kwargs in [('masters', {'return_value': {'partners': [self.p], 'reviewer_ids': ['p'], 'borrowers': [BORROWER], 'accounts': [{'id': 'a', 'active': True}]}}),
                               ('receipt_borrower', {'return_value': BORROWER}), ('check', {}), ('facts', {'return_value': {}}),
                               ('plan', {'side_effect': self.planned}), ('read_query', {'return_value': ['actor@example.invalid']}), ('readback', {'return_value': True})]:
            p = patch('mw_integration_agent.review_cycle.' + target, **kwargs);setattr(self, target, p.start());self.addCleanup(p.stop)
        Archive(self.config, self.j, storage=object())
        def payload(config, review, proposal):
            return {'actorPartnerId': review['deciding_partner'], 'command': {'requestId': receipt_api.close_request_id('dev', review['id']), 'reviewId': review['id'],
                                                                             'targetId': proposal['loan_id'], 'close': proposal['close']}}
        p = patch('mw_integration_agent.receipt_api.close_payload', side_effect=payload);self.close_payload = p.start();self.addCleanup(p.stop)
        self.submit_close = self.patched('submit_close', side_effect=self.applied)
        self.close_status = self.patched('close_status', return_value={'kind': 'unresolved'})
        self.close_quote = self.patched('close_quote', return_value=quote())
        self.submit = self.patched('submit');self.status = self.patched('status')
        p = patch('mw_integration_agent.partner_notice.NoticeJournal.dispatch');self.dispatch = p.start();self.addCleanup(p.stop)

    def patched(self, name, **kwargs):
        p = patch('mw_integration_agent.receipt_api.' + name, **kwargs);mock = p.start();self.addCleanup(p.stop);return mock

    def reserve(self, proposal):
        store = ReviewStore(self.j.db)
        self.j.db.execute('DELETE FROM partner_reviews');self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.commit()
        self.key = store.reserve('job', proposal)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES ('job','message','123','','REVIEW_REQUESTED',0)")
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner='p' WHERE id=?", (self.key,));self.j.db.commit()
        notices = NoticeJournal(self.root / 'partner-notices.db');notices.db.execute('DELETE FROM partner_notices')
        n = notices.reserve('review:' + self.key, self.p, 'subject', 'body')
        notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='sent',recipient_id='456' WHERE id=?", (n,));notices.db.commit();notices.close()

    def planned(self, receipt, borrower, current, config=None, strict=False):
        self.plan_calls = getattr(self, 'plan_calls', []) + [(config is not None, strict)]
        if isinstance(self.current, Exception):raise self.current
        return self.current

    @staticmethod
    def applied(config, body, rebate=None):
        key = 'pwa:' + body['command']['requestId']
        return {'kind': 'recorded', 'originalOutcome': {'status': 'applied', 'code': None, 'result': {'operation': 'loan.close', 'targetType': 'loan', 'targetId': body['command']['targetId'],
                'paymentId': key, 'rebate': {'path': 'offset', 'amount': '30', 'referrerId': 'r', 'offsetPaymentId': 'ro122:' + key, 'offsetAmount': '30', 'payable': '0'}}}}

    def run_cycle(self):return cycle(self.config, self.j, lambda *_: {'id': '123', 'username': 'borrower'})
    def review(self):return self.j.db.execute('SELECT * FROM partner_reviews').fetchone()
    def result_body(self):
        notices = NoticeJournal(self.root / 'partner-notices.db')
        try:return notices.db.execute("SELECT body FROM partner_notices WHERE event_key LIKE 'review-result:%'").fetchone()[0]
        finally:notices.close()

    def test_an_approved_close_posts_once_and_reports_the_close(self):
        self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit_close.call_count, 1);self.submit.assert_not_called()
        self.assertEqual(self.plan_calls[0], (True, True), 're-planned with the quote, strictly')
        row = self.review();self.assertEqual(row['state'], 'POSTED')
        self.assertEqual(row['payment_id'], 'pwa:' + receipt_api.close_request_id('dev', self.key))
        self.assertEqual(json.loads(row['detail']), {'closeRebate': {'path': 'offset', 'amount': '30', 'offsetAmount': '30', 'payable': '0'}})
        self.assertTrue(self.submit_close.call_args.args[0]['_receipt_reviewer_approved'])
        body = self.result_body()
        self.assertTrue(body.startswith('Loan closed\nBorrower: Cha\n'));self.assertIn('\nLoan closed: Cha - -฿1,000-26/10-1.5%\nReferral rebate ฿30: offset to Ann\'s loan', body)

    def test_a_changed_plan_hash_version_or_rebate_is_stale_and_says_so(self):
        for fresh in (close(planHash='c' * 64), close(sourceVersion='c' * 64), close(rebatePath='expense', rebateAmount='30', referrer='Ann')):
            with self.subTest(fresh=fresh):
                self.reserve(self.proposal);self.current = dict(self.proposal, close=fresh, facts={'c': 1})
                self.run_cycle()
                row = self.review();self.assertEqual((row['state'], row['detail']), ('STALE', 'LOAN_CLOSE_QUOTE_CHANGED'))
                self.assertTrue(self.result_body().endswith('\nLoan not closed: closing details changed. Nothing posted. Close it in the app.'))
        self.submit_close.assert_not_called()

    def test_a_changed_closing_amount_names_it(self):
        self.current = ReceiptInvalid('LOAN_CLOSE_QUOTE_CHANGED:1150');self.run_cycle()
        self.assertEqual(self.review()['detail'], 'LOAN_CLOSE_QUOTE_CHANGED:1150')
        self.assertTrue(self.result_body().endswith('\nClosing amount is now ฿1,150; slip ฿1,100. Loan not closed; nothing posted. Close it in the app.'))
        # Facts that are no longer a close: the current quote names the amount.
        self.reserve(self.proposal);self.current = dict(self.proposal, action='Lump Sum', close=None);self.close_quote.return_value = quote(amount='1200')
        self.run_cycle();self.assertEqual(self.review()['detail'], 'LOAN_CLOSE_QUOTE_CHANGED:1200');self.submit_close.assert_not_called()

    def test_the_day_must_still_be_the_slip_day(self):
        yesterday = (datetime.now(BANGKOK).date() - timedelta(days=1)).isoformat()
        self.reserve(dict(self.proposal, receipt=dict(RECEIPT, date=yesterday)));self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('STALE', 'LOAN_CLOSE_DAY_PASSED'));self.submit_close.assert_not_called()

    def test_switch_off_at_execution_is_manual_with_the_close_note(self):
        self.config['loan_close_execution_enabled'] = False;self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('MANUAL_REQUIRED', 'LOAN_CLOSE_EXECUTION_OFF'))
        self.submit_close.assert_not_called()
        self.assertTrue(self.result_body().endswith('\nPartner must record this manually. Agent has not posted it.\nLoan not closed. Nothing posted. Close it in the app.'))

    def test_no_quote_at_execution_is_stale_with_the_neutral_line(self):
        self.current = ReceiptInvalid('LOAN_CLOSE_QUOTE_UNAVAILABLE');self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('STALE', 'LOAN_CLOSE_QUOTE_UNAVAILABLE'));self.submit_close.assert_not_called()
        self.assertTrue(self.result_body().endswith('\nLoan not closed. Nothing posted. Close it in the app.'))
        # The best-effort re-quote of a changed plan also names a 404 as no quote.
        self.reserve(self.proposal);self.current = dict(self.proposal, close=close(planHash='c' * 64))
        self.close_quote.side_effect = receipt_api.QuoteRefused('LOAN_CLOSE_QUOTE_UNAVAILABLE');self.run_cycle()
        self.assertEqual(self.review()['detail'], 'LOAN_CLOSE_QUOTE_UNAVAILABLE')

    def test_a_close_already_recorded_keeps_only_the_duplicate_line(self):
        self.check.side_effect = ReceiptInvalid('PAYMENT_ALREADY_RECORDED');self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('STALE', 'PAYMENT_ALREADY_RECORDED'))
        self.assertTrue(self.result_body().endswith('\nFacts changed or payment already exists. Check manually; no agent posting.'))

    def test_a_proposal_from_before_the_deploy_stays_manual_with_its_old_result(self):
        manual = {k: v for k, v in self.proposal.items() if k != 'close'}
        self.reserve(manual);self.current = manual;self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('MANUAL_REQUIRED', ''))
        self.submit_close.assert_not_called();self.close_quote.assert_not_called()
        self.assertTrue(self.result_body().endswith('\nPartner must record this manually. Agent has not posted it.'))

    def test_not_sent_releases_the_claim_and_waits(self):
        self.submit_close.side_effect = receipt_api.NotSent('RECEIPT_API_NOT_SENT_403')
        self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['payment_id']), ('APPROVED', None))
        self.assertGreater(self.j.db.execute("SELECT retry_after FROM receipt_jobs WHERE id='job'").fetchone()[0], time.time() + 800)
        self.run_cycle();self.assertEqual(self.submit_close.call_count, 1, 'waits out the retry')
        self.j.db.execute("UPDATE receipt_jobs SET retry_after=0");self.j.db.commit()
        self.submit_close.side_effect = self.applied;self.run_cycle()
        self.assertEqual(self.submit_close.call_count, 2);self.assertEqual(self.review()['state'], 'POSTED')
        self.assertEqual(self.submit_close.call_args_list[0].args[1]['command']['requestId'], self.submit_close.call_args_list[1].args[1]['command']['requestId'])

    def test_an_uncertain_post_is_reconciled_by_status_only(self):
        self.submit_close.side_effect = TimeoutError();self.run_cycle()
        self.assertEqual(self.review()['state'], 'UNKNOWN');self.assertTrue(self.result_body().endswith('\nCheck the loan in the app before closing it again.'))
        self.run_cycle();self.assertEqual(self.submit_close.call_count, 1);self.assertEqual(self.review()['state'], 'UNKNOWN')
        self.close_status.return_value = self.applied({}, {'command': {'requestId': receipt_api.close_request_id('dev', self.key), 'targetId': 'L1'}})
        self.run_cycle();self.assertEqual(self.submit_close.call_count, 1)
        row = self.review();self.assertEqual(row['state'], 'POSTED');self.assertEqual(json.loads(row['detail'])['closeRebate']['offsetAmount'], '30')
        self.status.assert_not_called()

    def test_a_refused_close_is_manual_with_its_code(self):
        self.submit_close.side_effect = lambda config, body: {'kind': 'recorded', 'originalOutcome': {'status': 'rejected', 'code': 'plan_changed', 'result': None}}
        self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('MANUAL_REQUIRED', 'LOAN_CLOSE_REJECTED:plan_changed'))
        self.assertTrue(self.result_body().endswith('\nLoan not closed: closing details changed. Nothing posted. Close it in the app.'))

    def test_a_close_that_does_not_read_back_stays_unknown(self):
        self.readback.return_value = False;self.run_cycle()
        self.assertEqual(self.review()['state'], 'UNKNOWN');self.assertEqual(self.submit_close.call_count, 1)

    def test_an_ordinary_review_that_now_closes_says_close_it_in_the_app(self):
        lump = {'action': 'Lump Sum', 'borrower': BORROWER, 'receipt': dict(RECEIPT), 'facts': {}, 'loan_id': None}
        self.reserve(lump);self.current = dict(lump, action='Loan Close', loan_id='L1', facts={'c': 1});self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('MANUAL_REQUIRED', 'LOAN_CLOSE_REQUIRED'))
        self.assertTrue(self.result_body().endswith('\nLoan details changed after approval: this payment now closes the loan. Close it in the app.'))
        self.assertEqual(self.plan_calls[-1], (False, False), 'an ordinary review is not re-quoted')

    def pending(self, current):
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING',deciding_partner=NULL");self.j.db.commit()
        notices = NoticeJournal(self.root / 'partner-notices.db')
        notices.db.execute("UPDATE partner_notices SET ig_status='PENDING',message_id=NULL");notices.db.commit();notices.close()
        self.facts.return_value = {'c': 1};self.current = current

    def test_a_pending_close_request_goes_out_while_the_server_plan_is_the_same(self):
        self.pending(dict(self.proposal, facts={'c': 1}, close=dict(self.proposal['close'], sourceVersion='c' * 64)));self.run_cycle()
        self.assertEqual(self.review()['state'], 'PENDING');self.assertEqual(self.plan_calls[-1], (True, True))
        self.assertEqual([c.args[0]['event_key'] for c in self.dispatch.call_args_list], ['review:' + self.key])

    def test_a_pending_close_request_with_another_plan_is_stale(self):
        self.pending(dict(self.proposal, facts={'c': 1}, close=dict(self.proposal['close'], planHash='c' * 64)));self.run_cycle()
        row = self.review();self.assertEqual((row['state'], row['detail']), ('STALE', 'PROPOSAL_FACTS_CHANGED'))
        self.assertNotIn('review:' + self.key, [c.args[0]['event_key'] for c in self.dispatch.call_args_list])


if __name__ == '__main__':
    unittest.main()
