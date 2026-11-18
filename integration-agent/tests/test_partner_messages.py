"""R175: partner message wording (Echo copy, owner decisions D1-D4) and the shared length budget (Archie E-X-01).

Exact renders of the screenshot case, the one-loan late-charge case and the worst case; the loan label (D1); the fit
ladder; the results, hold and archive alerts; the reply word sets (D4); every new string at its worst case within
BODY_LIMIT; and the dispatch guard on the decorated text."""
import copy
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock

from mw_integration_agent.partner_notice import (BODY_LIMIT, HOLD_CLEARED, ICON_RESERVE, IG_TEXT_LIMIT, NoticeJournal, display_notice,
                                                 over_limit, receipt_notice)
from mw_integration_agent.partner_review import (APPROVE, CORRECTED, RECHECK, REJECT, UNCLEAR_CLOSE, UNCLEAR_OPTIONS, UNCLEAR_PLAIN,
                                                 ReviewStore, compose_request, loan_label, loan_labels, request_text)

K1 = 'เคที - Kathy-฿1,000-15/11-10%'
K2 = 'เคที - Kathy-฿2,000-09/11-10%'
# The PROD screenshot case (18 November 2026): ฿400, due ฿300, two loans.
SCREENSHOT = {'action': 'Pay forward options',
              'receipt': {'amount': '400', 'date': '2026-11-18', 'time': '18:16:00', 'reference': 'T', 'account_id': 'a', 'account_label': 'Dad TTB'},
              'borrower': {'id': 'b', 'name_en': 'Kathy', 'name_th': 'เคที'}, 'loan_keys': [K1, K2], 'facts': {}, 'planned_on': '2026-11-18',
              'options': {'planSha256': 'a' * 64, 'dueTotal': '300', 'remainder': '100',
                          'forward': {'first': '2026-11-19', 'last': '2026-11-19', 'through': '2026-11-19', 'uncovered': '0'},
                          'principal': [{'loanId': 'L1', 'loanKey': K1, 'amount': '100', 'dailyAfter': '90', 'outstandingAfter': '900'},
                                        {'loanId': 'L2', 'loanKey': K2, 'amount': '100', 'dailyAfter': '190', 'outstandingAfter': '1900'}],
                          'blocked': []}}
MANEE = 'มาณี - Manee-฿10,000-01/10-10%'
# One loan with a late charge (Echo A2).
LATE = {'action': 'Pay forward options',
        'receipt': {'amount': '950', 'date': '2026-11-05', 'time': '12:10', 'reference': 'T', 'account_id': 'a', 'account_label': 'Dad TTB'},
        'borrower': {'id': 'b', 'name_en': 'Manee', 'name_th': 'มาณี'}, 'loan_keys': [MANEE], 'facts': {}, 'planned_on': '2026-11-05',
        'options': {'planSha256': 'b' * 64, 'dueTotal': '450', 'duePrincipal': '100', 'dueInterest': '300', 'dueLate': '50', 'remainder': '500',
                    'forward': {'first': '2026-11-06', 'last': '2026-11-07', 'through': '2026-11-07', 'uncovered': '0'},
                    'principal': [{'loanId': 'L1', 'loanKey': MANEE, 'amount': '410', 'dailyAfter': '53', 'outstandingAfter': '9590'}],
                    'blocked': []}}


def worst():
    """Echo's worst case: five loans, a late charge, an unknown sender, the updated-request line, a long account label."""
    keys = [f'สมศักดิ์ วงศ์สวัสดิ์ - Somsak Wongsawat-฿100,000-0{n}/11-10%' for n in range(1, 6)]
    w = copy.deepcopy(LATE)
    w['loan_keys'] = keys
    w['borrower'] = {'id': 'b', 'name_en': 'Somsak Wongsawat', 'name_th': 'สมศักดิ์ วงศ์สวัสดิ์'}
    w['receipt'].update(amount='112500', date='2026-11-18', time='18:16', account_label='Kasikorn Savings 123-4-56789')
    w['options'].update(remainder='12500', forward={'first': '2026-11-30', 'last': '2026-12-28', 'through': '2026-12-27', 'uncovered': '0'},
                        principal=[{'loanId': f'L{n}', 'loanKey': k, 'amount': '12410', 'dailyAfter': '1234', 'outstandingAfter': '1'}
                                   for n, k in enumerate(keys, 1)])
    return w


def decorated(subject, body, event='review:x'):
    return display_notice({'event_key': event, 'subject': subject, 'body': body})[1]


class OptionsRequestTests(unittest.TestCase):
    def test_the_screenshot_case_reads_as_echo_drafted_it(self):
        self.assertEqual(request_text(SCREENSHOT, 'English')[1], '\n'.join([
            'Slip ฿400 from Kathy: choose how to use ฿100', 'Transferred 18 Nov 18:16 · Dad TTB', 'Due today ฿300 is paid first.', '',
            'Reply with one code:', '1 = pay forward: 19 Nov',
            '2 1 = loan ฿1,000 (15 Nov, 10%): pay principal ฿100 → new interest ฿90/day',
            '2 2 = loan ฿2,000 (9 Nov, 10%): pay principal ฿100 → new interest ฿190/day',
            '3 = recheck (edit the charges in the app first, then reply 3)', 'Reject (or No) = record nothing for this slip', '',
            'Use Reply on THIS message. Nothing recorded yet.']))
        self.assertEqual(request_text(SCREENSHOT, 'ไทย')[1], '\n'.join([
            'สลิป ฿400 จาก เคที: เลือกวิธีใช้ยอด ฿100', 'โอน 18 พ.ย. 18:16 · บัญชี Dad TTB', 'หักยอดครบกำหนดวันนี้ ฿300 ก่อน', '',
            'ตอบด้วยรหัสเดียว:', '1 = ชำระล่วงหน้า: 19 พ.ย.',
            '2 1 = สัญญา ฿1,000 (15 พ.ย., 10%): ชำระเงินต้น ฿100 → ดอกเบี้ยใหม่ ฿90/วัน',
            '2 2 = สัญญา ฿2,000 (9 พ.ย., 10%): ชำระเงินต้น ฿100 → ดอกเบี้ยใหม่ ฿190/วัน',
            '3 = ตรวจใหม่ (แก้ยอดในแอปก่อน แล้วตอบ 3)', 'ปฏิเสธ = ไม่บันทึกสลิปนี้', '',
            'ใช้ Reply ตอบข้อความนี้ ยังไม่ได้บันทึกรายการ']))
        self.assertTrue(decorated(*request_text(SCREENSHOT, 'English')).startswith('❓ Slip ฿400 from Kathy: '))

    def test_one_loan_with_a_late_charge(self):
        self.assertEqual(request_text(LATE, 'English')[1], '\n'.join([
            'Slip ฿950 from Manee: choose how to use ฿500', 'Transferred 5 Nov 12:10 · Dad TTB', 'Loan ฿10,000 (1 Oct, 10%)',
            'Due today ฿450 (principal ฿100 + interest ฿300 + late charge ฿50) is paid first.', '',
            'Reply with one code:', '1 = pay forward: 6–7 Nov', '2 = pay interest ฿90 + principal ฿410 → new interest ฿53/day',
            '3 = recheck (edit the charges in the app first, then reply 3)', 'Reject (or No) = record nothing for this slip', '',
            'Use Reply on THIS message. Nothing recorded yet.']))
        self.assertEqual(request_text(LATE, 'ไทย')[1], '\n'.join([
            'สลิป ฿950 จาก มาณี: เลือกวิธีใช้ยอด ฿500', 'โอน 5 พ.ย. 12:10 · บัญชี Dad TTB', 'สัญญา ฿10,000 (1 ต.ค., 10%)',
            'หักยอดครบกำหนดวันนี้ ฿450 (เงินต้น ฿100 + ดอกเบี้ย ฿300 + ค่าปรับล่าช้า ฿50) ก่อน', '',
            'ตอบด้วยรหัสเดียว:', '1 = ชำระล่วงหน้า: 6–7 พ.ย.', '2 = ชำระดอกเบี้ย ฿90 + เงินต้น ฿410 → ดอกเบี้ยใหม่ ฿53/วัน',
            '3 = ตรวจใหม่ (แก้ยอดในแอปก่อน แล้วตอบ 3)', 'ปฏิเสธ = ไม่บันทึกสลิปนี้', '',
            'ใช้ Reply ตอบข้อความนี้ ยังไม่ได้บันทึกรายการ']))

    def test_the_unclear_and_corrected_first_lines(self):
        for language, thai in (('English', False), ('ไทย', True)):
            plain = request_text(LATE, language)[1]
            self.assertEqual(request_text(LATE, language, unclear=True)[1], UNCLEAR_OPTIONS[thai] + '\n' + plain)
            self.assertEqual(request_text(LATE, language, corrected=True)[1], CORRECTED[thai] + '\n' + plain)
            self.assertEqual(request_text(LATE, language, corrected=True)[1].count(CORRECTED[thai]), 1)
        self.assertEqual(CORRECTED, ('Updated request: use this one, not the earlier message', 'คำขอแก้ไข: ใช้ข้อความนี้แทนข้อความก่อนหน้า'))
        self.assertEqual(UNCLEAR_OPTIONS, ('Reply not understood; nothing was done. Reply with a code below.',
                                           'ไม่เข้าใจคำตอบ ยังไม่ได้ดำเนินการ กรุณาตอบด้วยรหัสด้านล่าง'))

    def test_the_worst_case_uses_the_short_form_only_when_the_full_one_does_not_fit(self):
        w = worst()
        english = request_text(w, 'English', unidentified=True, corrected=True)[1]
        self.assertGreater(len(compose_request(w, 'English', False, True, True, False)[1]), BODY_LIMIT)
        self.assertEqual(english, '\n'.join([
            'Updated request: use this one, not the earlier message', 'Slip ฿112,500 from Somsak Wongsawat: choose how to use ฿12,500',
            'Transferred 18 Nov 18:16 · Kasikorn Savings 123-4-56789', 'Sender is not a known borrower; matched by the payer name on the slip.',
            'Due today ฿450 (principal ฿100 + interest ฿300 + late charge ฿50) is paid first.', '',
            'Reply with one code (→ = daily interest after):', '1 = pay forward: 30 Nov – 28 Dec (fully paid through 27 Dec)',
            *[f'2 {n} = loan ฿100,000 ({n} Nov, 10%): interest ฿90 + principal ฿12,410 → ฿1,234/day' for n in range(1, 6)],
            '3 = recheck (edit the charges in the app first, then reply 3)', 'Reject (or No) = record nothing for this slip', '',
            'Use Reply on THIS message. Nothing recorded yet.']))
        self.assertLessEqual(len(decorated('s', english)), IG_TEXT_LIMIT)
        # Thai fits in full (Echo's Thai Reject line is shorter), so it keeps the full wording, the note and the line.
        thai = request_text(w, 'ไทย', unidentified=True, corrected=True)[1]
        self.assertNotIn('(→ = ', thai);self.assertIn('ผู้ส่งไม่ใช่ผู้กู้ที่รู้จัก', thai);self.assertTrue(thai.startswith(CORRECTED[1] + '\n'))
        self.assertLessEqual(len(decorated('s', thai)), IG_TEXT_LIMIT)
        for language in ('English', 'ไทย'):
            # The unclear re-ask of the same request also fits (the propose step builds it before reserving).
            self.assertLessEqual(len(request_text(w, language, unclear=True, unidentified=True)[1]), BODY_LIMIT)

    def test_one_character_under_the_limit_stays_in_full_form(self):
        w = worst()
        full = compose_request(w, 'English', False, False, False, False)[1]
        w['receipt']['account_label'] += 'x' * (BODY_LIMIT - len(full))
        body = request_text(w, 'English')[1]
        self.assertEqual(len(body), BODY_LIMIT);self.assertNotIn('(→ = ', body)
        w['receipt']['account_label'] += 'x'
        self.assertIn('(→ = ', request_text(w, 'English')[1])

    def test_the_fit_ladder_and_the_too_long_hold(self):
        w = worst()
        w['receipt']['account_label'] = 'A' * 300
        from mw_integration_agent.config import ConfigurationError
        with self.assertRaisesRegex(ConfigurationError, 'REVIEW_REQUEST_TOO_LONG'):
            request_text(w, 'English', unidentified=True)
        w['receipt']['account_label'] = 'A' * 90
        sizes = {(note, short): len(compose_request(w, 'English', False, note, False, short)[1]) for note in (True, False) for short in (False, True)}
        body = request_text(w, 'English', unidentified=True)[1]
        expected = next(k for k in ((True, False), (True, True), (False, False), (False, True)) if sizes[k] <= BODY_LIMIT)
        self.assertEqual(len(body), sizes[expected])

    def test_nothing_due_and_paid_through_rules(self):
        nothing = copy.deepcopy(LATE);nothing['options']['dueTotal'] = '0'
        self.assertNotIn('Due today', request_text(nothing, 'English')[1])
        self.assertIn('\n1 = pay forward: 6–7 Nov\n', request_text(LATE, 'English')[1])  # through == last: not named
        partial = copy.deepcopy(LATE);partial['options']['forward']['through'] = '2026-11-06'
        self.assertIn('\n1 = pay forward: 6–7 Nov (fully paid through 6 Nov)\n', request_text(partial, 'English')[1])
        self.assertIn('\n1 = ชำระล่วงหน้า: 6–7 พ.ย. (ครบถึง 6 พ.ย.)\n', request_text(partial, 'ไทย')[1])

    def test_notes_follow_the_reject_line(self):
        settled = copy.deepcopy(LATE)
        settled['options']['blocked'] = [{'loanId': 'L9', 'reason': 'settles', 'loanKey': 'มาณี - Manee-฿5,000-02/10-10%'}]
        settled['options']['forward']['uncovered'] = '0'
        lines = request_text(settled, 'English')[1].split('\n')
        at = lines.index('Reject (or No) = record nothing for this slip')
        self.assertEqual(lines[at + 1], 'Remainder settles ฿5,000 (2 Oct, 10%): record in the app.')
        self.assertEqual(lines[at + 2:], ['', 'Use Reply on THIS message. Nothing recorded yet.'])
        beyond = copy.deepcopy(LATE);beyond['options']['forward']['uncovered'] = '25'
        lines = request_text(beyond, 'English')[1].split('\n')
        self.assertEqual(lines[lines.index('Reject (or No) = record nothing for this slip') + 1], '฿25 is beyond the next 93 days and cannot be allocated.')

    def test_no_bangkok_and_24_hour_times(self):
        late_evening = copy.deepcopy(LATE);late_evening['receipt']['time'] = '23:05:59'
        for language in ('English', 'ไทย'):
            body = request_text(late_evening, language)[1]
            self.assertIn(' 23:05 ', body);self.assertNotIn('Bangkok', body);self.assertNotIn('เวลาไทย', body);self.assertNotIn('PM', body)


class LoanLabelTests(unittest.TestCase):
    def test_the_key_parts_and_their_fallbacks(self):
        self.assertEqual(loan_label(K1, False), '฿1,000 (15 Nov, 10%)')
        self.assertEqual(loan_label(K2, True), '฿2,000 (9 พ.ย., 10%)')
        self.assertEqual(loan_label('Anne-Marie - Shop-Two-฿12,500-03/01-1.5%', False), '฿12,500 (3 Jan, 1.5%)', 'dashes in the name')
        for key in ('Ann - Shop-฿1,000-15/11-Unavailable', 'Ann - Shop-฿1,000--10%', 'Ann - Shop--฿1,000-15/11-10%', 'L-0398', 'L1', '',
                    None, 'Ann - Shop-฿1,000-31/13-10%', 'Ann - Shop-1,000-15/11-10%'):
            with self.subTest(key=key):self.assertIsNone(loan_label(key, False))
        self.assertEqual(loan_labels(['L-0398', K1], False), {'L-0398': 'L-0398', K1: '฿1,000 (15 Nov, 10%)'})

    def test_equal_labels_print_every_key_in_full(self):
        twin = 'เคที - Kathy (shop)-฿1,000-15/11-10%'
        self.assertEqual(loan_labels([K1, twin, K2], False), {K1: K1, twin: twin, K2: K2})
        two = copy.deepcopy(SCREENSHOT);two['loan_keys'] = [K1, twin];two['options']['principal'][1]['loanKey'] = twin
        body = request_text(two, 'English')[1]
        self.assertIn(f'2 1 = loan {K1}: ', body);self.assertIn(f'2 2 = loan {twin}: ', body)


class PlainRequestTests(unittest.TestCase):
    STANDARD = {'action': 'Lump Sum', 'borrower': {'id': 'b', 'name_en': 'Kathy', 'name_th': 'เคที'}, 'facts': {}, 'loan_id': None,
                'loan_keys': [K1], 'receipt': {'amount': '800.50', 'date': '2026-11-18', 'time': '18:16', 'account_label': 'Dad TTB'}}

    def test_the_plain_request_and_its_re_ask(self):
        self.assertEqual(request_text(self.STANDARD, 'English')[1], '\n'.join([
            'Slip ฿800.50 from Kathy: approval needed', 'Transferred 18 Nov 18:16 · Dad TTB', 'Loan ฿1,000 (15 Nov, 10%)', '',
            'Reply with one word:', 'Yes = record this payment', 'Reject (or No) = record nothing', 'Any other reply is asked again.', '',
            'Use Reply on THIS message. Nothing recorded yet.']))
        self.assertEqual(request_text(self.STANDARD, 'ไทย')[1], '\n'.join([
            'สลิป ฿800.50 จาก เคที: รออนุมัติ', 'โอน 18 พ.ย. 18:16 · บัญชี Dad TTB', 'สัญญา ฿1,000 (15 พ.ย., 10%)', '',
            'ตอบด้วยคำเดียว:', 'อนุมัติ = บันทึกการชำระเงินนี้', 'ปฏิเสธ = ไม่บันทึกรายการ', 'คำตอบอื่นจะถามใหม่', '',
            'ใช้ Reply ตอบข้อความนี้ ยังไม่ได้บันทึกรายการ']))
        for language, thai in (('English', False), ('ไทย', True)):
            self.assertEqual(request_text(self.STANDARD, language, unclear=True)[1], UNCLEAR_PLAIN[thai] + '\n' + request_text(self.STANDARD, language)[1])
        self.assertEqual(UNCLEAR_CLOSE[0], 'Reply not understood; nothing was done. Reply Yes to close the loan or Reject (or No) to record nothing.')


class ReplyWordTests(unittest.TestCase):
    """D4 (owner): no new Thai reply words; the sets are R174's, and every Thai word a message prints is accepted."""

    def test_the_sets_are_unchanged(self):
        from mw_integration_agent import hold_reply
        self.assertEqual(APPROVE, {'yes', 'approve', 'approved', 'อนุมัติ'})
        self.assertEqual(REJECT, {'reject', 'rejected', 'no', 'ปฏิเสธ'})
        self.assertEqual(RECHECK, {'3', '4', 'recheck', 'ตรวจใหม่'})
        self.assertEqual(hold_reply.REJECT, {'reject', 'rejected', 'no', 'ignore', 'drop', 'ปฏิเสธ', 'ไม่อนุมัติ'})

    def test_every_thai_word_a_request_names_is_accepted(self):
        from mw_integration_agent.receipt_hold import held_text
        bodies = [request_text(p, 'ไทย', unclear=u)[1] for p in (SCREENSHOT, LATE, PlainRequestTests.STANDARD) for u in (False, True)]
        job = {'id': 'j', 'detail': 'AMOUNT_UNREADABLE', 'created_at': time.time(), 'result': '{}'}
        bodies.append(held_text(job, None, 'ไทย', [])[1])
        accepted = APPROVE | REJECT | RECHECK
        for body in bodies:
            for word in ('อนุมัติ', 'ปฏิเสธ', 'ตรวจใหม่'):
                if word in body:self.assertIn(word, accepted)
            self.assertNotIn('ไม่อนุมัติ', body);self.assertNotIn('Reject', body);self.assertNotIn('Yes', body)


class OptionsReplyGrammarTests(unittest.TestCase):
    """Every reply the options request accepted before R175 still decides it (mixed case, spaces)."""

    def setUp(self):
        import sqlite3
        self.db = sqlite3.connect(':memory:');self.db.row_factory = sqlite3.Row;self.addCleanup(self.db.close)
        self.store = ReviewStore(self.db)
        self.db.executescript('''CREATE TABLE receipt_jobs(id TEXT PRIMARY KEY,status TEXT,detail TEXT,result TEXT,attempts INTEGER,retry_after REAL);
          CREATE TABLE receipt_reconsiderations(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL);''')
        self.p = {'id': 'p', 'username': 'partner', 'enabled': True, 'language': 'English', 'email': 'x@example.invalid'}

    def decide(self, proposal, text, n):
        job = f'job{n}'
        self.db.execute("INSERT INTO receipt_jobs VALUES (?,'REVIEW_REQUESTED','','{}',1,0)", (job,))
        key = self.store.reserve(job, proposal, 100)
        notice = {'ig_status': 'ACCEPTED', 'event_key': 'review:' + key, 'message_id': 'out', 'recipient_id': '1', 'partner_id': 'p', 'partner': json.dumps(self.p)}
        event = {'reply_to': 'out', 'sender_id': '1', 'message_id': f'm{n}', 'event_timestamp': 110, 'text': text}
        return self.store.decide(event, notice, [self.p], {'id': '1', 'username': 'partner'}, 120, reviewer_ids=['p'])

    def test_options_replies(self):
        cases = [('1', 'APPROVED'), (' 2 1 ', 'APPROVED'), ('2  2', 'APPROVED'), ('3', 'RECHECK_QUEUED'), ('4', 'RECHECK_QUEUED'),
                 ('ReCheck', 'RECHECK_QUEUED'), ('ตรวจใหม่', 'RECHECK_QUEUED'), ('REJECT', 'REJECTED'), (' Rejected', 'REJECTED'),
                 ('No', 'REJECTED'), ('ปฏิเสธ', 'REJECTED'), ('yes', 'OPTIONS_REQUIRED'), ('2', 'OPTIONS_REQUIRED'), ('ไม่', 'OPTIONS_REQUIRED')]
        for n, (text, outcome) in enumerate(cases):
            with self.subTest(text=text):self.assertEqual(self.decide(SCREENSHOT, text, n), outcome)

    def test_plain_replies(self):
        cases = [('Yes', 'APPROVED'), ('APPROVE', 'APPROVED'), (' approved ', 'APPROVED'), ('อนุมัติ', 'APPROVED'), ('reject', 'REJECTED'),
                 ('Rejected', 'REJECTED'), ('NO', 'REJECTED'), ('ปฏิเสธ', 'REJECTED'), ('ok', 'OPTIONS_REQUIRED'), ('ไม่', 'OPTIONS_REQUIRED'),
                 ('ไม่อนุมัติ', 'OPTIONS_REQUIRED'), ('3', 'OPTIONS_REQUIRED'), ('recheck', 'OPTIONS_REQUIRED'), ('', 'OPTIONS_REQUIRED')]
        for n, (text, outcome) in enumerate(cases):
            with self.subTest(text=text):
                self.assertEqual(self.decide(PlainRequestTests.STANDARD, text, 100 + n), outcome)
                if outcome == 'OPTIONS_REQUIRED':
                    row = self.db.execute("SELECT state FROM partner_reviews WHERE job_id=?", (f'job{100 + n}',)).fetchone()
                    self.assertEqual(row['state'], 'PENDING')
                    self.assertEqual(self.db.execute('SELECT outcome FROM partner_review_replies WHERE message_id=?', (f'm{100 + n}',)).fetchone()[0], 'OPTIONS_REQUIRED')


class ResultTests(unittest.TestCase):
    PARTNER = {'id': 'p', 'username': 'reviewer_one', 'enabled': True, 'language': 'English', 'email': 'x@example.invalid'}

    def result(self, state, detail='', proposal=None, language='English', live=None, now=None, deciding='p', expires=1e12):
        from mw_integration_agent.review_cycle import result_text
        review = {'state': state, 'detail': detail, 'deciding_partner': deciding, 'expires_at': expires}
        partner = dict(self.PARTNER, language=language)
        live = live if live is not None else {'partners': [partner], 'partner_names': {}}
        return result_text(review, proposal or PlainRequestTests.STANDARD, partner, live, now if now is not None else 1e11)[1]

    def test_rejected_names_the_reviewer(self):
        self.assertEqual(self.result('REJECTED', live={'partners': [self.PARTNER], 'partner_names': {'p': 'Nok'}}),
                         'Kathy ฿800.50 (18 Nov 18:16) rejected by Nok. Nothing recorded.')
        self.assertEqual(self.result('REJECTED', language='ไทย'), 'เคที ฿800.50 (18 พ.ย. 18:16) @reviewer_one ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ')
        self.assertEqual(self.result('REJECTED', live={'partners': [], 'partner_names': {}}),
                         'Kathy ฿800.50 (18 Nov 18:16) rejected by a Reviewer. Nothing recorded.')
        self.assertEqual(self.result('REJECTED', language='ไทย', live={'partners': []}), 'เคที ฿800.50 (18 พ.ย. 18:16) ผู้ตรวจสอบ ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ')

    def test_stale_sentences(self):
        head = 'Kathy ฿800.50 (18 Nov 18:16) not recorded\n'
        self.assertEqual(self.result('STALE', 'PAY_FORWARD_DAY_PASSED'),
                         head + "The choice arrived after the slip's day ended, so the plan no longer applies. Record it in the app.")
        self.assertEqual(self.result('STALE', 'RECEIVING_ACCOUNT_CHANGED'),
                         head + 'The receiving account Dad TTB is no longer active in the app. Check the account, then record it in the app.')
        self.assertEqual(self.result('STALE', 'PAYMENT_ALREADY_RECORDED:extra'), head + "A payment with this bank reference is already recorded. Don't record it again.")
        self.assertEqual(self.result('STALE', 'SOMETHING_NEW'),
                         head + 'Something changed after the request, so it was not recorded automatically. Check and record it in the app.')
        self.assertEqual(self.result('STALE', 'BORROWER_CHANGED', language='ไทย'),
                         'เคที ฿800.50 (18 พ.ย. 18:16) ยังไม่ได้บันทึก\nข้อมูลผู้กู้ของสลิปนี้ในแอปเปลี่ยนหลังส่งคำขอ กรุณาตรวจสอบผู้กู้แล้วบันทึกในแอป')
        # The recheck variant only when a "3" would still recheck: options request, a RECHECK_STALE reason, not expired.
        options = copy.deepcopy(SCREENSHOT)
        recheck = 'The charges changed after the request was sent. Reply 3 on the request to recheck, or record it in the app.'
        plain = 'The charges changed after the request was sent. Check them and record it in the app.'
        self.assertTrue(self.result('STALE', 'PROPOSAL_FACTS_CHANGED', options, now=10, expires=20).endswith(recheck))
        self.assertTrue(self.result('STALE', 'PAY_FORWARD_PLAN_CHANGED', options, now=10, expires=20).endswith(recheck))
        self.assertTrue(self.result('STALE', 'PROPOSAL_FACTS_CHANGED', options, now=30, expires=20).endswith(plain))
        self.assertTrue(self.result('STALE', 'PROPOSAL_FACTS_CHANGED', now=10, expires=20).endswith(plain))

    def test_manual_unknown_and_expired(self):
        detail = json.dumps({'purpose': {'forward': True, 'principal': [], 'loans': None}})
        self.assertEqual(self.result('MANUAL_REQUIRED', detail, SCREENSHOT).split('\n'),
                         ['Kathy ฿400 (18 Nov 18:16) not recorded', 'Record it in the app.', 'Your choice: pay forward: 19 Nov'])
        self.assertEqual(self.result('MANUAL_REQUIRED', 'RECEIPT_API_REJECTED', SCREENSHOT).split('\n'),
                         ['Kathy ฿400 (18 Nov 18:16) not recorded', 'Record it in the app.'])
        self.assertEqual(self.result('MANUAL_REQUIRED').split('\n')[2], 'Your choice: record this payment')
        self.assertEqual(self.result('UNKNOWN'), "Kathy ฿800.50 (18 Nov 18:16)\nNot sure it was recorded. Check the app first; don't record it twice.")
        self.assertEqual(self.result('EXPIRED', language='ไทย'), 'เคที ฿800.50 (18 พ.ย. 18:16) คำขอหมดอายุ ยังไม่ได้บันทึกรายการ')

    def test_every_result_fits_at_its_worst(self):
        long = dict(PlainRequestTests.STANDARD, borrower={'id': 'b', 'name_en': 'N' * 100, 'name_th': 'น' * 100},
                    receipt=dict(PlainRequestTests.STANDARD['receipt'], amount='9999999.99', account_label='A' * 100))
        live = {'partners': [self.PARTNER], 'partner_names': {'p': 'P' * 100}}
        from mw_integration_agent.review_cycle import STALE_SENTENCES
        for language in ('English', 'ไทย'):
            for state, detail in [('REJECTED', ''), ('EXPIRED', ''), ('UNKNOWN', ''), ('MANUAL_REQUIRED', '')] + [('STALE', d) for d in STALE_SENTENCES]:
                with self.subTest(language=language, state=state, detail=detail):
                    self.assertFalse(over_limit(self.result(state, detail, long, language, live)))


class AcknowledgementTextTests(unittest.TestCase):
    def test_closed_and_bare_answer_texts_fit(self):
        from mw_integration_agent import review_cycle
        notices = Mock();reserved = []
        notices.reserve.side_effect = lambda key, partner, subject, body: reserved.append((key, subject, body))
        notices.db.execute.return_value.fetchone.return_value = None
        long = dict(PlainRequestTests.STANDARD, borrower={'id': 'b', 'name_en': 'N' * 100, 'name_th': 'น' * 100})
        import sqlite3
        db = sqlite3.connect(':memory:');db.row_factory = sqlite3.Row;self.addCleanup(db.close)
        ReviewStore(db)
        for n, (state, language) in enumerate([(s, l) for s in ('REJECTED', 'SUPERSEDED') for l in ('English', 'ไทย')]):
            db.execute("INSERT INTO partner_reviews(id,job_id,proposal,state,created_at,expires_at) VALUES (?,?,?,?,0,0)",
                       (f'r{n}', f'j{n}', json.dumps(long), state))
            partner = dict(ResultTests.PARTNER, language=language)
            review_cycle.closed_answer(db, notices, {'message_id': f'm{n}', 'event_timestamp': time.time()},
                                       {'event_key': f'review:r{n}', 'partner_id': 'p'}, {'partners': [partner]})
        self.assertEqual([s for _, s, _ in reserved], ['Request already closed', 'คำขอปิดแล้ว', 'Request replaced', 'คำขอถูกแทนแล้ว'])
        for key, _, body in reserved:
            self.assertTrue(key.startswith('review-reply-result:'));self.assertFalse(over_limit(body))
        self.assertTrue(reserved[2][2].endswith('\nThat request was replaced by an updated request; nothing was done. Reply on the updated request.'))


class BareAnswerTests(unittest.TestCase):
    def test_a_borrowers_yes_costs_no_identity_read(self):
        # Only a sender a waiting request was delivered to (its recipient_id) is looked up.
        import sqlite3
        from unittest.mock import patch
        from mw_integration_agent import review_cycle
        db = sqlite3.connect(':memory:');db.row_factory = sqlite3.Row;self.addCleanup(db.close)
        store = ReviewStore(db);key = store.reserve('j', PlainRequestTests.STANDARD)
        tmp = tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup)
        notices = NoticeJournal(Path(tmp.name) / 'n.db');self.addCleanup(notices.close)
        n = notices.reserve('review:' + key, ResultTests.PARTNER, 's', 'b')
        with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out',recipient_id='456' WHERE id=?", (n,))
        identity = Mock(return_value={'id': '456', 'username': 'reviewer_one'})
        live = {'partners': [ResultTests.PARTNER], 'reviewer_ids': ['p']}
        with patch('mw_integration_agent.review_cycle.masters', return_value=live) as masters:
            for message_id, sender, text in (('b1', '123', 'yes'), ('b2', '123', '1'), ('r1', '456', 'hello')):
                review_cycle.bare_answer(db, notices, {}, {'message_id': message_id, 'sender_id': sender, 'event_timestamp': time.time(), 'text': text}, identity)
            identity.assert_not_called();masters.assert_not_called()
            review_cycle.bare_answer(db, notices, {}, {'message_id': 'r2', 'sender_id': '456', 'event_timestamp': time.time(), 'text': ' NO '}, identity)
        self.assertEqual(identity.call_count, 1)
        self.assertEqual(notices.db.execute("SELECT count(*) FROM partner_notices WHERE event_key LIKE 'review-reply-result:%'").fetchone()[0], 1)


class HoldAndArchiveTests(unittest.TestCase):
    def job(self, detail='AMOUNT_UNREADABLE', result=None, created=None):
        return {'id': 'j', 'detail': detail, 'created_at': created or 1795000560,  # 18 Nov 2026 18:16 Bangkok
                'result': json.dumps(result if result is not None else {'receipt': {'amount': '400', 'date': '2026-11-18', 'time': '18:16:00',
                                                                                     'account_label': 'Dad TTB', 'payer_name': 'KATHY S'}})}

    def test_the_hold_alert_layout(self):
        from mw_integration_agent.receipt_hold import held_text
        subject, body = held_text(self.job('PAYMENT_ALREADY_RECORDED'), {'name_en': 'Kathy', 'name_th': 'เคที'}, 'English', [])
        self.assertEqual(subject, 'Slip held')
        self.assertEqual(body.split('\n'), ['Slip held: this bank reference is already recorded. Check the existing payment.',
                                            'Kathy · ฿400 (read from the slip, not verified)', 'Transferred 18 Nov 18:16 · Dad TTB',
                                            'Payer on slip: KATHY S', 'Received 18 Nov 18:16',
                                            "Can't approve here. If genuine, record it in the app, then Reply Reject to clear it."])
        thai = held_text(self.job('PAYMENT_ALREADY_RECORDED'), {'name_en': 'Kathy', 'name_th': 'เคที'}, 'ไทย', [])[1]
        self.assertEqual(thai.split('\n')[:3], ['สลิปถูกพัก: เลขอ้างอิงนี้บันทึกแล้ว กรุณาตรวจสอบรายการเดิม', 'เคที · ฿400 (อ่านจากสลิป ยังไม่ยืนยัน)',
                                                'โอน 18 พ.ย. 18:16 · บัญชี Dad TTB'])
        self.assertTrue(decorated(subject, body, 'receipt-held:j:x').startswith('⚠️ Slip held: '))
        satang = held_text(self.job(result={'extraction': {'amount': '1,200.50'}}), None, 'English', [])[1]
        self.assertIn('\nBorrower unknown · ฿1,200.50 (read from the slip, not verified)\n', satang)

    def test_a_long_hold_is_trimmed_to_fit(self):
        from mw_integration_agent.receipt_hold import held_text
        borrowers = [{'id': f'b{n}', 'name_en': 'B' * 40, 'name_th': 'บ' * 40} for n in range(5)]
        result = {'extraction': {'amount': '400', 'date': '2026-11-18', 'time': '18:16', 'account_label': 'A' * 100, 'payer_name': 'P' * 100},
                  'payer_candidates': [b['id'] for b in borrowers]}
        for language in ('English', 'ไทย'):
            with self.subTest(language=language):
                body = held_text(self.job('PAYER_UNRESOLVED', result), {'name_en': 'N' * 100, 'name_th': 'น' * 100}, language, [], borrowers,
                                 resent_at=time.time())[1]
                self.assertFalse(over_limit(body));self.assertFalse(over_limit('12/12 · ' + body) and len(body) > BODY_LIMIT)

    def test_hold_cleared_and_archive_alert(self):
        from mw_integration_agent.hold_reply import queue_result
        from mw_integration_agent.receipt_hold import archive_pending_text
        notices = Mock();reserved = []
        notices.reserve.side_effect = lambda key, partner, subject, body: reserved.append((key, subject, body))
        queue_result(notices, {'message_id': 'm'}, {'partner_id': 'p'}, [ResultTests.PARTNER], 'HOLD_REJECTED')
        key, subject, body = reserved[0]
        self.assertEqual(subject, 'Held slip cleared')
        self.assertTrue(decorated(subject, body, key).startswith('✅ Held slip cleared\n'))
        english = archive_pending_text(self.job(), {'name_en': 'Kathy'}, 'English', 3600)
        self.assertEqual(english, ('Slip delayed', 'Slip from Kathy delayed: the image is not saved yet\nReceived 18 Nov 18:16\n'
                                   'Retrying automatically. Nothing recorded yet; another message follows. No reply needed.'))
        thai = archive_pending_text(self.job(), {'name_th': 'เคที'}, 'ไทย', 7200)[1]
        self.assertEqual(thai.count('\n'), 2);self.assertNotIn('ชั่วโมง', thai)


class IconTests(unittest.TestCase):
    def test_icons_and_their_reserve(self):
        cases = {'review:x': '❓', 'receipt-held:x': '⚠️', 'receipt-archive-pending:x': '⌛', 'review-result:x:POSTED': '✅',
                 'review-result:x:REJECTED': '❌', 'review-result:x:MANUAL_REQUIRED': '📝', 'review-result:x:STALE': '⚠️',
                 'review-result:x:EXPIRED': '⌛', 'review-result:x:UNKNOWN': '⚠️', 'review-result:x:RECHECK': '🔄',
                 'review-reply-result:x': 'ℹ️', 'receipt:x': '📩'}
        for event, icon in cases.items():
            with self.subTest(event=event):
                subject, body = display_notice({'event_key': event, 'subject': 's', 'body': 'b'})
                self.assertEqual(body, icon + ' b');self.assertLessEqual(len(body) - 1, ICON_RESERVE)
        for subject in HOLD_CLEARED:
            self.assertTrue(display_notice({'event_key': 'hold-reply-result:x', 'subject': subject, 'body': 'b'})[1].startswith('✅ '))
        self.assertTrue(display_notice({'event_key': 'hold-reply-result:x', 'subject': 'Held slip reply', 'body': 'b'})[1].startswith('ℹ️ '))
        self.assertEqual(BODY_LIMIT, IG_TEXT_LIMIT - ICON_RESERVE)


class DispatchBudgetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.j = NoticeJournal(Path(self.tmp.name) / 'notices.db');self.addCleanup(self.j.close)
        self.rows = [{'id': 'p', 'username': 'partner', 'language': 'English', 'email': 'test@example.com', 'enabled': True}]
        self.config = {'state_directory': self.tmp.name, 'receipt_summary_enabled': True, 'email_fallback_enabled': True, 'instagram_account_id': '1'}
        self.api = Mock();self.api.request.return_value = {'message_id': 'accepted'};self.mailer = Mock()

    def dispatch(self, key):
        item = dict(self.j.db.execute('SELECT * FROM partner_notices WHERE id=?', (key,)).fetchone())
        self.j.dispatch(item, self.config, self.rows, api=self.api, mailer=self.mailer, resolver=lambda *_: '9')
        return dict(self.j.db.execute('SELECT * FROM partner_notices WHERE id=?', (key,)).fetchone())

    def test_a_body_of_exactly_body_limit_goes_out_with_its_icon(self):
        for event in ('review:a', 'receipt-held:a:b'):
            with self.subTest(event=event):
                row = self.dispatch(self.j.reserve(event, self.rows[0], 's', 'x' * BODY_LIMIT))
                self.assertEqual(row['ig_status'], 'ACCEPTED')
                self.assertLessEqual(len(self.api.request.call_args.kwargs['body']['message']['text']), IG_TEXT_LIMIT)
        legacy = self.dispatch(self.j.reserve('review:legacy', self.rows[0], 's', 'x' * IG_TEXT_LIMIT))
        self.assertEqual((legacy['ig_status'], legacy['detail']), ('REVIEW', 'IG_MESSAGE_TOO_LONG'))

    def test_an_acknowledgement_is_never_emailed(self):
        from mw_integration_agent.instagram import InstagramAPIError
        self.api.request.side_effect = InstagramAPIError(400, 10, 2534022, window_expired=True)
        row = self.dispatch(self.j.reserve('review-reply-result:' + 'a' * 64, self.rows[0], 'Use Reply', 'Nothing was done.'))
        self.assertEqual((row['ig_status'], row['email_status'], row['detail']), ('WINDOW_EXPIRED', 'REVIEW', 'ACKNOWLEDGEMENT_NOT_EMAILED'))
        self.mailer.send.assert_not_called()
        self.assertEqual(self.j.due(), [])


class NoticeLimitTests(unittest.TestCase):
    def test_the_received_and_recorded_notices_count_the_icon(self):
        from mw_integration_agent.config import ConfigurationError
        borrower = {'id': 'b', 'name_en': 'Kathy'}
        receipt = {'amount': '400', 'date': '2026-11-18', 'time': '18:16', 'account_label': 'A'}
        base = len(receipt_notice(receipt, borrower, 'English', 'pwa:x')[1])
        receipt['account_label'] = 'A' * (BODY_LIMIT - base + 1)
        self.assertEqual(len(receipt_notice(receipt, borrower, 'English', 'pwa:x')[1]), BODY_LIMIT)
        receipt['account_label'] += 'A'
        with self.assertRaisesRegex(ConfigurationError, 'NOTICE_TOO_LONG'):receipt_notice(receipt, borrower, 'English', 'pwa:x')


if __name__ == '__main__':
    unittest.main()
