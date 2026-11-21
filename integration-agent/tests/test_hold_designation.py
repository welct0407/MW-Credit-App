"""R179: a Reviewer's Reply with the borrower's name to a borrower-identity hold reruns the slip for that borrower.

Archie's 13-group plan: the switch, each eligible code, name forms, preference, other replies and holds, authorization,
idempotency and races, the rerun (no identity read, automatic payment or the normal request), guards kept, the image
rule, learning (owner, 21 November 2026: "Yes remember the name"), the audit event, configuration; plus Echo's texts.
Synthetic names, accounts and identities only."""
import hashlib
import json
import tempfile
import time
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent.config import ConfigurationError, load_json, validate_config
from mw_integration_agent.hold_reply import (DESIGNATED, DESIGNATION_REASONS, NO_IMAGE, TOO_OLD, UNCLEAR, audit_designation, decide,
                                             queue_result, result_key)
from mw_integration_agent.partner_notice import NoticeJournal, display_notice
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.receipt_archive import Archive
from mw_integration_agent.receipt_hold import event_key, held_text
from mw_integration_agent.receipt_identity import designated_learning, named_borrower, receipt_context, resolve_payer
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_rules import BANGKOK, ReceiptInvalid
from test_config import ROOT
import test_payer_resolution as payer_fixture
import test_review_cycle as cycle_fixture

NOW = time.time()
TODAY = datetime.fromtimestamp(NOW, BANGKOK).date()


def borrower(row_id, th, en, username, payer=None, enabled=True):
    return {'id': row_id, 'username': username, 'enabled': enabled, 'name_th': th, 'name_en': en, 'payer': payer}


KEN = borrower('ken', 'เคน', 'Ken S.', 'ken_s', 'นาย เคน สมบูรณ์')
KENJI = borrower('kenji', 'เคนจิ', 'Kenji', 'kenji88')
KATHY = borrower('kathy', 'เคที', 'Kathy', 'kathy.k', 'น.ส. เคที ใจดี\nนาย สมศักดิ์ รักดี')
OLD_PUIFAI = borrower('puifai-old', 'ปุยฝ้าย', 'Puifai', 'puifai_old', enabled=False)
MASTER = {'borrowers': [KEN, KENJI, KATHY, OLD_PUIFAI], 'accounts': [{'id': 'a', 'label': 'Synthetic account', 'active': True}],
          'partners': [], 'reviewer_ids': ['p'], 'partner_names': {'p': 'Owner'}}
ON = {'receipt_hold_designation_enabled': True}


def extraction(day=None, payer='นาย สมชาย ใจดี'):
    return {'is_payment_receipt': True, 'transfer_successful': True, 'date': (day or TODAY).isoformat(), 'time': '09:14',
            'amount': '1000.00', 'currency': 'THB', 'reference': 'SYNREF179', 'payer_name': payer, 'account_numbers': ['xxx-x-x6789-x']}


class DesignationBase(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);self.root = Path(temp.name)
        self.j = ReceiptJournal(self.root / 'receipt-processing.db');self.addCleanup(self.j.close)
        self.reviews = ReviewStore(self.j.db)
        self.n = NoticeJournal(self.root / 'partner-notices.db');self.addCleanup(self.n.close)
        self.p = {'id': 'p', 'username': 'partner', 'enabled': True, 'language': 'English', 'email': 'test@example.invalid'}
        self.master = dict(MASTER, partners=[self.p])
        self.config = {'state_directory': str(self.root), 'receipt_hold_reply_cutoff': '1970-01-01T00:01:40+00:00',
                       'partner_review_cutoff': '1970-01-01T00:00:00+00:00', 'receipt_hold_designation_enabled': True,
                       'payer_name_cutoff': '1970-01-01T00:00:00+00:00', 'receipt_archive_enabled': True,
                       'receipt_archive_cutoff': '1970-01-01T00:00:00+00:00', 'receipt_environment': 'dev', 'instagram_account_id': '999'}
        Archive(self.config, self.j, storage=object())
        self.j.db.execute('CREATE TABLE IF NOT EXISTS receipt_reconsiderations (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)')
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken', 'kathy']})
        self.event = {'message_id': 'in', 'reply_to': 'out', 'sender_id': '123', 'text': 'Ken S.', 'event_timestamp': NOW - 60,
                      'captured_at': NOW - 59}
        self.identity = {'id': '123', 'username': 'partner'}

    def hold(self, detail, result, archived=True):
        with self.j.db:
            self.j.db.execute('DELETE FROM receipt_jobs')
            self.j.db.execute('DELETE FROM receipt_assets')
            self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,detail,result) VALUES ('j','image','borrower','','REVIEW',?,?,?)",
                              (NOW - 3600, detail, json.dumps(result)))
            if archived:
                self.j.db.execute("INSERT INTO receipt_assets(receipt_id,job_id,source,archive_state) VALUES ('r','j','{}','ARCHIVED')")
        self.key = event_key(self.job())
        with self.n.db:self.n.db.execute('DELETE FROM partner_notices')
        notice_id = self.n.reserve(self.key, self.p, 'subject', 'body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out',recipient_id='123' WHERE id=?", (notice_id,))
        self.notice = dict(self.n.db.execute('SELECT * FROM partner_notices WHERE id=?', (notice_id,)).fetchone())

    def job(self):
        return dict(self.j.db.execute("SELECT * FROM receipt_jobs WHERE id='j'").fetchone())

    def result(self):
        return json.loads(self.job()['result'])

    def decide(self, text=None, message_id='in', config=None, **event):
        value = dict(self.event, message_id=message_id, **event)
        if text is not None:value['text'] = text
        return decide(self.j.db, config or self.config, value, self.notice, [self.p], self.identity, ['p'], now=NOW, master=self.master)

    def counts(self):
        return tuple(self.j.db.execute(f'SELECT count(*) FROM {t}').fetchone()[0] for t in ('receipt_reconsiderations', 'partner_review_replies'))

    def ack(self, outcome, message_id='in', language='English', text=None):
        partner = dict(self.p, language=language)
        event = dict(self.event, message_id=message_id, **({'text': text} if text is not None else {}))
        queue_result(self.n, event, self.notice, [partner], outcome, db=self.j.db, config=self.config, master=dict(self.master, partners=[partner]))
        row = self.n.db.execute('SELECT * FROM partner_notices WHERE event_key=?', (result_key(message_id),)).fetchone()
        return dict(row)


class SwitchAndCodesTests(DesignationBase):
    def test_1_switch_off_is_todays_reject_only_behaviour(self):
        self.assertEqual(self.decide(config=dict(self.config, receipt_hold_designation_enabled=False)), 'HOLD_REJECT_REQUIRED')
        self.assertEqual((self.job()['status'], self.job()['detail']), ('REVIEW', 'PAYER_UNRESOLVED'))
        self.assertNotIn('designated_borrower_id', self.result())

    def test_2_each_eligible_code_designates(self):
        for code in DESIGNATION_REASONS:
            with self.subTest(code=code):
                self.hold(code, {'extraction': extraction(), 'payer_candidates': ['ken']} if code != 'IG_CONVERSATION_IDENTITY_AMBIGUOUS' else {})
                before = self.counts()
                self.assertEqual(self.decide(message_id='in-' + code), DESIGNATED)
                job = self.job();result = self.result()
                self.assertEqual((job['status'], job['detail'], job['attempts'], job['retry_after']), ('PENDING', 'REVIEWER_DESIGNATED_BORROWER', 0, 0))
                self.assertEqual((result['designated_borrower_id'], result['designated_by'], result['designated_message']), ('ken', 'p', 'in-' + code))
                if code != 'IG_CONVERSATION_IDENTITY_AMBIGUOUS':self.assertEqual(result['extraction'], extraction())
                self.assertEqual(self.counts(), (before[0] + 1, before[1] + 1))
                previous = json.loads(self.j.db.execute('SELECT previous FROM receipt_reconsiderations ORDER BY id DESC').fetchone()[0])
                self.assertEqual((previous['status'], previous['detail']), ('REVIEW', code))

    def test_5_other_replies_and_holds(self):
        for i, word in enumerate(('reject', 'No', 'ปฏิเสธ')):
            self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken']})
            self.assertEqual(self.decide(word, 'r' + str(i)), 'HOLD_REJECTED')
        for i, word in enumerate(('yes', 'Approve', 'อนุมัติ', '1', '2', '3', 'review', '2 1')):
            self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken']})
            self.assertEqual(self.decide(word, 'a' + str(i)), 'HOLD_REJECT_REQUIRED', word)
            self.assertEqual(self.job()['status'], 'REVIEW')
        for code in ('RECIPIENT_UNKNOWN_OR_AMBIGUOUS', 'DATE_OUTSIDE_TODAY_YESTERDAY', 'BORROWER_CHANGED', 'FORWARDED_GROUP_AMBIGUOUS'):
            self.hold(code, {'extraction': extraction()})
            self.assertEqual(self.decide('Ken S.', 'n-' + code), 'HOLD_REJECT_REQUIRED')
            self.assertEqual(self.job()['status'], 'REVIEW')

    def test_6_authorization_unchanged(self):
        for kwargs, expected in (({'reviewers': []}, 'NOT_REVIEWER'), ({'identity': {'id': 'other', 'username': 'partner'}}, 'UNAUTHORIZED'),
                                 ({'event': dict(self.event, sender_id='other')}, 'NOT_CORRELATED'),
                                 ({'event': dict(self.event, event_timestamp=50)}, 'BEFORE_HOLD_REPLY_CUTOFF'),
                                 ({'event': dict(self.event, event_timestamp=NOW + 60)}, 'INVALID_TIME')):
            outcome = decide(self.j.db, self.config, kwargs.get('event', self.event), self.notice, [self.p], kwargs.get('identity', self.identity),
                             kwargs.get('reviewers', ['p']), now=NOW, master=self.master)
            self.assertEqual(outcome, expected)
            self.assertEqual(self.job()['status'], 'REVIEW')
        # Older than 24 hours: the cycle reads replies of the last 24 hours only (review_cycle.decide_replies); the event
        # time before the slip itself is refused here.
        self.assertEqual(self.decide(event_timestamp=NOW - 7200), 'INVALID_TIME')


class NameResolutionTests(unittest.TestCase):
    def test_3_name_forms(self):
        for text in ('เคน', 'Ken S.', 'ken s.', '  KEN   s. ', '@ken_s', 'พี่เคน', "p'ken s.", 'นาย เคน สมบูรณ์'):
            with self.subTest(text=text):
                self.assertEqual(named_borrower(text, MASTER)[0]['id'], 'ken')
        self.assertEqual(named_borrower('นาย สมศักดิ์ รักดี', MASTER)[0]['id'], 'kathy')  # a full payer line
        self.assertIsNone(named_borrower('นาย สมศักดิ์ รักตี', MASTER)[0])  # near (ด/ต) never counts

    def test_4_preference_and_unclear(self):
        twins = dict(MASTER, borrowers=MASTER['borrowers'] + [borrower('ken2', 'เคน', 'Ken S.', 'ken_two')])
        self.assertEqual(named_borrower('เคน', twins, ['ken2', 'kathy'])[0]['id'], 'ken2')
        found, candidates = named_borrower('เคน', twins, ['ken', 'ken2'])
        self.assertIsNone(found);self.assertEqual([b['id'] for b in candidates], ['ken', 'ken2'])
        found, candidates = named_borrower('Somebody', MASTER, ['ken', 'kathy'])
        self.assertIsNone(found);self.assertEqual([b['id'] for b in candidates], ['ken', 'kathy'])
        self.assertEqual(named_borrower('ปุยฝ้าย', MASTER), (None, []))  # AI off: no match


class RacesTests(DesignationBase):
    def test_7_idempotency_and_races(self):
        self.assertEqual(self.decide(), DESIGNATED)
        counts = self.counts()
        self.assertEqual(self.decide(), DESIGNATED)  # the same message again: stored outcome, nothing more
        self.assertEqual(self.counts(), counts)
        self.assertEqual(self.decide('Kathy', 'second'), 'HOLD_NOT_ACTIVE')
        self.assertEqual(self.result()['designated_borrower_id'], 'ken')
        # A live review: HOLD_HAS_REVIEW, nothing moved.
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken']})
        self.reviews.reserve('j', {}, 1)
        self.assertEqual(self.decide(message_id='live'), 'HOLD_HAS_REVIEW')
        self.assertEqual(self.job()['status'], 'REVIEW')

    def test_7_job_changed_between_read_and_write_rolls_back(self):
        def change_then_resolve(text, master, preferred=()):
            # Another writer moves the job after it was read.
            self.j.db.execute("UPDATE receipt_jobs SET detail='PAYER_NAME_UNREADABLE'")
            return KEN, []
        before = self.counts()
        with patch('mw_integration_agent.receipt_identity.named_borrower', side_effect=change_then_resolve):
            self.assertEqual(self.decide(), 'HOLD_NOT_ACTIVE')
        self.assertEqual(self.counts(), (before[0], before[1] + 1))  # no reconsideration row; the reply is recorded
        self.assertEqual(self.job()['status'], 'REVIEW');self.assertNotIn('designated_borrower_id', self.result())

    def test_9_too_old_and_10_image(self):
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(TODAY - timedelta(days=2)), 'payer_candidates': ['ken']})
        self.assertEqual(self.decide(message_id='old'), TOO_OLD);self.assertEqual(self.job()['status'], 'REVIEW')
        self.hold('IG_CONVERSATION_IDENTITY_AMBIGUOUS', {}, archived=False)
        self.assertEqual(self.decide(message_id='noimage'), NO_IMAGE);self.assertEqual(self.job()['status'], 'REVIEW')
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken']}, archived=False)
        self.assertEqual(self.decide(message_id='noimage2'), NO_IMAGE)  # every rerun reads the image again
        self.assertEqual(self.decide(message_id='disabled', config=dict(self.config, receipt_archive_enabled=False)), NO_IMAGE)

    def test_unclear_keeps_the_hold_and_a_later_reply_decides(self):
        self.assertEqual(self.decide('Nobody'), UNCLEAR)
        self.assertEqual(self.job()['status'], 'REVIEW')
        self.assertEqual(self.decide('a' * 101, 'long'), UNCLEAR)
        self.assertEqual(self.decide('Ken S.\nKathy', 'lines'), UNCLEAR)
        self.assertEqual(self.decide('Kathy', 'later'), DESIGNATED)


class AcknowledgementTests(DesignationBase):
    def test_designated_rechecking(self):
        self.assertEqual(self.decide(), DESIGNATED)
        row = self.ack(DESIGNATED)
        self.assertEqual(row['subject'], 'Rechecking')
        self.assertEqual(row['body'], f'Ken S. ฿1,000 ({TODAY.day} {TODAY.strftime("%b")} 09:14)\nRechecking as Ken S. (named by Owner). The result follows.')
        self.assertTrue(display_notice(row)[0].startswith('🔄 '))
        thai = self.ack(DESIGNATED, 'in-th', 'ไทย')
        self.assertEqual((thai['subject'], thai['body'].split('\n')[1]), ('กำลังตรวจใหม่', 'กำลังตรวจใหม่สำหรับ เคน (ระบุโดย Owner) ผลจะส่งตามมา'))

    def test_unclear_texts(self):
        row = self.ack(UNCLEAR, 'u1', text='Nobody at all')
        self.assertEqual(row['body'].split('\n')[1:], ['No borrower matches "Nobody at all". Nothing was changed. Use Reply on the hold message with the name as it appears in the app, or Reject.',
                                                     'Possible borrowers: Ken S., Kathy'])
        self.assertTrue(row['body'].startswith('Borrower unknown ฿1,000'))
        self.assertTrue(display_notice(row)[0].startswith('ℹ️ Borrower not found'))
        self.master['borrowers'] = MASTER['borrowers'] + [borrower('ken2', 'เคน', 'Ken S.', 'ken_two')]
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['kathy']})
        self.assertEqual(self.ack(UNCLEAR, 'u2', text='Ken S.')['body'].split('\n')[1],
                         '"Ken S." matches 2 borrowers: Ken S., Ken S.. Use Reply on the hold message with one of these names, or Reject.')
        self.assertEqual(self.ack(UNCLEAR, 'u3', text='Puifai')['body'].split('\n')[1],
                         "Puifai is in the app, but slips for this borrower aren't handled automatically. Record it in the app, then Reply Reject.")
        thai = self.ack(UNCLEAR, 'u4', 'ไทย', text='ใครก็ไม่รู้')
        self.assertEqual(thai['subject'], 'ไม่พบผู้กู้')
        self.assertIn('ใช้ Reply ที่ข้อความแจ้งพักสลิป', thai['body'])

    def test_other_outcomes(self):
        self.assertEqual(self.ack(TOO_OLD, 'o1')['body'].split('\n')[-1],
                         "This slip isn't from today or yesterday, so it can't be rechecked here. Nothing was changed. Record it in the app, then Reply Reject.")
        self.assertEqual(self.ack(TOO_OLD, 'o1-th', 'ไทย')['body'].split('\n')[-1],
                         'สลิปนี้ไม่ใช่ของวันนี้หรือเมื่อวาน ตรวจใหม่ผ่านข้อความไม่ได้ ยังไม่ได้เปลี่ยนแปลงอะไร กรุณาบันทึกในแอป แล้วตอบ ปฏิเสธ')
        self.assertIn("The slip image isn't saved", self.ack(NO_IMAGE, 'o2')['body'])
        self.assertEqual(self.ack('HOLD_REJECT_REQUIRED', 'o3')['body'].split('\n')[-1], "Held slips can't be approved. Reply with the borrower's name, or Reject.")
        # Already rechecked (UX-R179-12) and already cleared by a named Reviewer.
        self.assertEqual(self.decide(), DESIGNATED);self.ack(DESIGNATED)
        self.assertEqual(self.ack('HOLD_NOT_ACTIVE', 'o4')['body'].split('\n')[-1], 'Already rechecked as Ken S. by Owner. This reply changed nothing.')
        self.hold('PAYER_UNRESOLVED', {'extraction': extraction(), 'payer_candidates': ['ken']})
        self.assertEqual(self.decide('reject', 'clear'), 'HOLD_REJECTED');self.ack('HOLD_REJECTED', 'clear')
        self.assertEqual(self.ack('HOLD_NOT_ACTIVE', 'o5')['body'].split('\n')[-1], 'Already cleared by Owner. This reply changed nothing.')

    def test_switch_off_keeps_the_r135_texts(self):
        self.config['receipt_hold_designation_enabled'] = False
        row = self.ack('HOLD_REJECT_REQUIRED', 'off')
        self.assertEqual(row['body'], "Held slip reply\nHeld slips can't be approved. Use Reply on the hold message and send Reject. If the payment is genuine, record it in the app first.")


class HoldAlertTests(DesignationBase):
    def text(self, designation=True, language='English', **kwargs):
        return held_text(self.job(), None, language, self.master['accounts'], self.master['borrowers'], designation=designation, live=self.master, **kwargs)[1]

    def test_closing_line_and_candidates_above_it(self):
        lines = self.text().split('\n')
        self.assertEqual(lines[-2:], ['Possible borrowers: Ken S., Kathy',
                                      "Reply with the borrower's name to check it again for them, or Reply Reject to clear it (for example if you already recorded it in the app)."])
        self.assertIn("Next time, send the borrower's nickname right after the slip.", lines)
        self.assertTrue(self.text(language='ไทย').endswith('\nใช้ Reply ตอบชื่อผู้กู้เพื่อตรวจสลิปใหม่สำหรับผู้กู้รายนั้น หรือตอบ ปฏิเสธ เพื่อนำออกจากรายการ (เช่น เมื่อบันทึกในแอปแล้ว)'))
        # Switch off: today's alert, byte for byte.
        self.assertEqual(self.text(designation=False), held_text(self.job(), None, 'English', self.master['accounts'], self.master['borrowers'])[1])
        # Resent copies carry the same block (UX-R179-13).
        self.assertTrue(self.text(resent_at=NOW).endswith("(for example if you already recorded it in the app)."))

    def test_twin_names_show_the_username_and_trim_order(self):
        self.master['borrowers'] = MASTER['borrowers'] + [borrower('ken2', 'เคน', 'Ken S.', 'ken_two')]
        self.hold('PAYER_UNRESOLVED', {'extraction': dict(extraction(), payer_name='ก' * 190), 'payer_candidates': ['ken', 'ken2', 'kathy']})
        self.assertIn('Possible borrowers: @ken_s, @ken_two, Kathy', self.text())
        from mw_integration_agent import receipt_hold
        with patch('mw_integration_agent.partner_notice.over_limit', side_effect=lambda body, reserve=0: 'Next time' in body):
            text = self.text()
        self.assertNotIn('Next time', text);self.assertIn('Possible borrowers', text)  # the tip goes first
        self.assertTrue(receipt_hold.NAME_CLOSE[0] in text)

    def test_a_follow_up_hold_is_reject_only_with_the_named_line(self):
        self.hold('DATE_OUTSIDE_TODAY_YESTERDAY', {'extraction': extraction(), 'designated_borrower_id': 'ken', 'designated_by': 'p', 'designated_message': 'in'})
        text = self.text(designation=False)
        self.assertIn('\nBorrower named by Owner\n', text)
        self.assertTrue(text.endswith("Can't approve here. If genuine, record it in the app, then Reply Reject to clear it."))


class RerunTests(payer_fixture.PayerBase):
    """Groups 8, 9 and 11 through receipt_run.process (archive off here: the image comes from fetch)."""

    def designated(self, mid='m1', borrower_id='b1', extra=None, value=None):
        job = self.webhook(mid)
        value = value or payer_fixture.slip('นาย ญาติ คนอื่น')
        with self.j.db:
            self.j.db.execute("UPDATE receipt_jobs SET result=? WHERE id=?",
                              (json.dumps({'extraction': value, 'unidentified_sender': True, 'designated_borrower_id': borrower_id,
                                           'designated_by': 'p', 'designated_message': 'in', **(extra or {})}), job['id']))
        return dict(self.j.db.execute('SELECT * FROM receipt_jobs WHERE id=?', (job['id'],)).fetchone())

    def run_designated(self, job, m, config=None):
        def forbidden(*_a, **_k):raise AssertionError('no sender, poll or forwarder read for a designated job')
        from mw_integration_agent.receipt_run import process
        with patch('mw_integration_agent.receipt_identity.poll_row', side_effect=forbidden):
            process(job, self.j, config or self.config, m, fetch=lambda _: (b'image-' + job['id'].encode(), hashlib.sha256(job['id'].encode()).hexdigest()),
                    extractor=forbidden, identity_reader=forbidden)
        return dict(self.j.db.execute('SELECT * FROM receipt_jobs WHERE id=?', (job['id'],)).fetchone())

    def test_8_designated_rerun_validates_for_the_named_borrower(self):
        m = payer_fixture.master(payer_fixture.borrower('b1', 'ken', 'สมชาย ใจดี'), payer_fixture.borrower('b2', 'kathy', None))
        row = self.run_designated(self.designated(), m)
        self.assertEqual(row['status'], 'VALIDATED')
        result = json.loads(row['result'])
        self.assertEqual((result['borrower']['id'], result['designated_borrower_id'], result['designated_by']), ('b1', 'b1', 'p'))
        self.assertIsNone(result['receipt']['payer_lines'])  # learning off

    def test_9_guards_kept(self):
        m = payer_fixture.master(payer_fixture.borrower('b1', 'ken', None))
        # Disabled before the rerun: BORROWER_CHANGED.
        m_off = payer_fixture.master(payer_fixture.borrower('b1', 'ken', None, enabled=False))
        self.assertEqual((lambda r: (r['status'], r['detail']))(self.run_designated(self.designated('m1'), m_off)), ('REVIEW', 'BORROWER_CHANGED'))
        # Aged before the rerun.
        old = payer_fixture.slip('นาย ญาติ คนอื่น', date=(TODAY - timedelta(days=2)).isoformat(), reference='SYNOLD179')
        self.assertEqual(self.run_designated(self.designated('m2', value=old), m)['detail'], 'DATE_OUTSIDE_TODAY_YESTERDAY')
        # Unknown receiving account.
        stranger = payer_fixture.slip('นาย ญาติ คนอื่น', account_numbers=['987-6-54321-0'], reference='SYNACC179')
        self.assertEqual(self.run_designated(self.designated('m3', value=stranger), m)['detail'], 'RECIPIENT_UNKNOWN_OR_AMBIGUOUS')
        # An existing bank reference: the payment check decides as for any slip.
        from mw_integration_agent import receipt_run
        with patch.object(receipt_run, 'check_existing_payment', side_effect=ReceiptInvalid('PAYMENT_ALREADY_RECORDED')):
            self.assertEqual(self.run_designated(self.designated('m4', value=payer_fixture.slip('x', reference='SYNDUP179')), m)['status'], 'DUPLICATE')
        # R177 outgoing transfer still IGNORED.
        senders = {'receipt_outgoing_ignore_enabled': True, 'receipt_outgoing_senders': {'a': 'ทดลอง บัญชีเรา'}}
        outgoing = payer_fixture.slip('นางสาว ทดลอง บัญชีเรา', account_numbers=['xxx-x-x6789-x', '987-6-54321-0'], reference='SYNOUT179')
        row = self.run_designated(self.designated('m5', value=outgoing), m, config=dict(self.config, **senders))
        self.assertEqual((row['status'], row['detail']), ('IGNORED', 'OUTGOING_TRANSFER'))

    def test_11_learning(self):
        config = dict(self.config, receipt_hold_designation_enabled=True, receipt_hold_designation_learn_enabled=True)
        m = payer_fixture.master(payer_fixture.borrower('b1', 'ken', 'สมชาย ใจดี'), payer_fixture.borrower('b2', 'kathy', 'น.ส. เคที ใจดี'))
        with patch('mw_integration_agent.hold_reply.audit_not_learned') as audit:
            row = self.run_designated(self.designated('m1'), m, config)
            self.assertEqual(json.loads(row['result'])['receipt']['payer_lines'], {'before': 'สมชาย ใจดี', 'after': 'สมชาย ใจดี\nนาย ญาติ คนอื่น'})
            audit.assert_not_called()
            # Five lines already: nothing evicted, the reason audited (never the name).
            full = payer_fixture.master(payer_fixture.borrower('b1', 'ken', '\n'.join(['ก กกก', 'ข ขขข', 'ค คคค', 'ง งงง', 'จ จจจ'])))
            row = self.run_designated(self.designated('m2', value=payer_fixture.slip('นาย ญาติ คนอื่น', reference='SYNFULL179')), full, config)
            self.assertIsNone(json.loads(row['result'])['receipt']['payer_lines'])
            self.assertEqual(audit.call_args.args[1:], (row['id'], 'b1', 'PAYER_LINES_FULL'))
            # The name matches another enabled borrower's line: not learned.
            row = self.run_designated(self.designated('m3', value=payer_fixture.slip('น.ส. เคที ใจดี', reference='SYNOTHER179')), m, config)
            self.assertIsNone(json.loads(row['result'])['receipt']['payer_lines'])
            self.assertEqual(audit.call_args.args[3], 'PAYER_NAME_OTHER_BORROWER')
            # Unreadable or empty.
            row = self.run_designated(self.designated('m4', value=payer_fixture.slip('', reference='SYNEMPTY179')), m, config)
            self.assertIsNone(json.loads(row['result'])['receipt']['payer_lines'])
            self.assertEqual(audit.call_args.args[3], 'PAYER_NAME_UNREADABLE')

    def test_11_learning_pure_rules(self):
        ken = payer_fixture.borrower('b1', 'ken', 'สมชาย ใจดี')
        m = payer_fixture.master(ken, payer_fixture.borrower('b2', 'kathy', 'น.ส. เคที ใจดี'))
        self.assertEqual(designated_learning(ken, 'นาย สมชาย ใจดี', m), (None, 'PAYER_NAME_KNOWN'))
        self.assertEqual(designated_learning(ken, 'ส***', m), (None, 'PAYER_NAME_UNREADABLE'))
        context = receipt_context(dict(self.config, receipt_hold_designation_enabled=True), {'result': json.dumps({'designated_borrower_id': 'b1'}),
                                  'created_at': 0, 'message_id': 'x'}, self.j, m, None)
        self.assertEqual((context['kind'], context['fill']), ('designated', False))
        self.assertEqual(resolve_payer(context, {'payer_name': 'นาย ญาติ คนอื่น'}, {}, m), (ken, None, 'designated'))


class CycleTests(unittest.TestCase):
    """Group 8 in the review cycle: automatic payment for a designated (formerly unidentified) job, the request otherwise."""
    setUp = cycle_fixture.CycleTests.setUp
    run_cycle = cycle_fixture.CycleTests.run_cycle
    validated_job = cycle_fixture.CycleTests.validated_job
    enable_auto = cycle_fixture.CycleTests.enable_auto

    def designated_job(self, designated=True):
        self.validated_job();self.enable_auto()
        self.masters.return_value['partner_names'] = {'p': 'Owner'}
        extra = {'designated_borrower_id': 'b', 'designated_by': 'p', 'designated_message': 'in'} if designated else {}
        with self.j.db:
            self.j.db.execute('UPDATE receipt_jobs SET result=?', (json.dumps({'receipt': self.proposal['receipt'], 'borrower': self.b,
                                                                             'unidentified_sender': True, **extra}),))

    def review(self):
        return self.j.db.execute("SELECT id,state,detail FROM partner_reviews WHERE job_id='new-job'").fetchone()

    def body(self, key):
        notices = NoticeJournal(self.root / 'partner-notices.db')
        try:return notices.db.execute('SELECT body FROM partner_notices WHERE event_key=?', (key,)).fetchone()[0]
        finally:notices.close()

    def test_designated_ordinary_payment_posts_automatically_with_the_named_line(self):
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.designated_job()
        self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count, 1)
        self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
        row = self.review()
        self.assertEqual((row['state'], row['detail']), ('POSTED', AUTO_POLICY))
        self.assertIn('\nBorrower named by Owner', self.body('review-result:' + row['id'] + ':POSTED'))

    def test_undesignated_unidentified_still_never_posts_automatically(self):
        self.designated_job(designated=False)
        self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.review()['state'], 'PENDING')

    def test_designated_overpayment_opens_the_request_with_the_named_line(self):
        self.proposal['action'] = 'Overpayment review';self.proposal['approved_allocation_method'] = 'Lump Sum'
        self.designated_job()
        self.run_cycle();self.submit.assert_not_called()
        row = self.review()
        self.assertEqual(row['state'], 'PENDING')
        body = self.body('review:' + row['id'])
        self.assertIn('\nBorrower named by Owner\n', body);self.assertNotIn('Sender is not a known borrower', body)
        # UX-R179-14: the rechecked slip is listed once, as a request.
        from mw_integration_agent.review_resend import pending_items
        self.assertEqual([k for _, k, _ in pending_items(self.j.db, self.config, {'event_timestamp': 9e9}, 0)], ['review'])


class AuditAndConfigTests(DesignationBase):
    def test_12_audit_event_has_no_reference_name_or_text(self):
        self.assertEqual(self.decide(), DESIGNATED)
        seen = []

        @contextmanager
        def activity(config, service, action, route, plan, key=None):
            seen.append(('op', service, key, plan));yield 'op'

        @contextmanager
        def transaction(config):yield 'conn'
        with patch('mw_integration_agent.state.enabled', return_value=True), patch('mw_integration_agent.audit.activity', activity), \
                patch('mw_integration_agent.state.transaction', transaction), \
                patch('mw_integration_agent.audit.event', side_effect=lambda conn, op, kind, payload, route, key=None: seen.append((kind, payload))):
            audit_designation(self.config, self.j.db, self.event, self.notice)
        kind, payload = seen[-1]
        self.assertEqual(kind, 'hold_borrower_designated')
        self.assertEqual(payload, {'job_id': 'j', 'partner_id': 'p', 'borrower_id': 'ken', 'message_sha256': hashlib.sha256(b'in').hexdigest(),
                                   'prior_code': 'PAYER_UNRESOLVED'})
        text = json.dumps(seen, ensure_ascii=False)
        for secret in ('SYNREF179', 'สมชาย', 'Ken S.'):self.assertNotIn(secret, text)

    def test_13_config(self):
        config = load_json(ROOT / 'config.example.json')
        self.assertIs(config['receipt_hold_designation_enabled'], False);self.assertIs(config['receipt_hold_designation_learn_enabled'], False)
        validate_config(config)
        on = dict(config, receipt_hold_designation_enabled=True, receipt_hold_reply_cutoff='2026-11-21T00:00:00+07:00', payer_name_cutoff='2026-11-21T00:00:00+07:00')
        validate_config(on);validate_config(dict(on, receipt_hold_designation_learn_enabled=True))
        for change, message in (({'receipt_hold_designation_enabled': 'true'}, 'receipt_hold_designation_enabled must be boolean'),
                                ({'receipt_hold_designation_enabled': True}, 'requires receipt_hold_reply_cutoff and payer_name_cutoff'),
                                ({'receipt_hold_designation_learn_enabled': 1}, 'receipt_hold_designation_learn_enabled must be boolean'),
                                ({'receipt_hold_designation_learn_enabled': True}, 'requires receipt_hold_designation_enabled')):
            with self.subTest(change), self.assertRaisesRegex(ConfigurationError, message):
                validate_config(dict(config, **change))


if __name__ == '__main__':
    unittest.main()
