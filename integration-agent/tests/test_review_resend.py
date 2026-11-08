import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.review_resend import acknowledgement, queue, is_command
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.receipt_hold import base_key, event_key


class ResendTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.store = ReviewStore(self.db)
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.notices = NoticeJournal(Path(self.temp.name)/'notices.db'); self.addCleanup(self.notices.close)
        self.p = dict(id='p', username='reviewer', enabled=True, language='English', email='test@example.invalid')
        self.live = dict(partners=[self.p], reviewer_ids=['p'])
        self.identity = dict(id='sender', username='reviewer')
        self.event = dict(message_id='command', sender_id='sender', text=' ReViEw ', reply_to='', event_timestamp=200, captured_at=201)
        self.config = {'review_resend_cutoff':'1970-01-01T00:02:30+00:00'}
        self.proposal = dict(action='Lump Sum', borrower={'id':'b','name_en':'Test'}, receipt=dict(amount='100',date='2026-09-29',time='12:00',account_label='Test'))
        self.key = self.store.reserve('job', self.proposal,100)
        original = self.notices.reserve('review:'+self.key,self.p,'original','original')
        self.notices.db.execute("UPDATE partner_notices SET ig_status='UNAVAILABLE',email_status='SENT' WHERE id=?",(original,)); self.notices.db.commit()

    def run_command(self, **kwargs):
        queue(self.db,self.notices,self.config,kwargs.get('event',self.event),kwargs.get('live',self.live),kwargs.get('identity',self.identity),kwargs.get('now',210))

    def resent(self):
        return self.notices.db.execute("SELECT * FROM partner_notices WHERE event_key LIKE 'review:%:resend:%'").fetchall()

    def test_exact_standalone_only(self):
        for text in ('review',' REVIEWS ', 'ReSeNd ReViEw'):
            event=dict(self.event,text=text)
            self.assertTrue(is_command(event))
        self.assertFalse(is_command(dict(self.event,reply_to='original')))
        self.assertFalse(is_command(dict(self.event,text='review this borrower')))

    def test_email_fallback_resends_once_and_direct_reply_decides(self):
        self.run_command(); self.run_command()
        self.assertEqual(len(self.resent()),1)
        row=dict(self.resent()[0]); row.update(ig_status='ACCEPTED',message_id='resent',recipient_id='sender')
        result=self.store.decide(dict(self.event,message_id='approval',reply_to='resent',text='YES'),row,[self.p],self.identity,220,reviewer_ids=['p'])
        self.assertEqual(result,'APPROVED')
        self.assertEqual(self.db.execute('SELECT expires_at FROM partner_reviews').fetchone()[0],86500)
        original=self.notices.db.execute('SELECT * FROM partner_notices WHERE event_key=?',('review:'+self.key,)).fetchone()
        self.assertEqual(original['email_status'],'SENT'); self.assertEqual(original['ig_status'],'UNAVAILABLE')

    def test_authorization_and_old_command_fail_closed(self):
        cases=[dict(live=dict(self.live,reviewer_ids=[])),dict(identity=dict(self.identity,id='other')),
               dict(live=dict(self.live,partners=[self.p,dict(self.p,id='duplicate')])),
               dict(live=dict(self.live,partners=[dict(self.p,enabled=False)])),
               dict(event=dict(self.event,event_timestamp=140)),dict(event=dict(self.event,captured_at=140)),
               dict(now=90000),dict(event=dict(self.event,reply_to='sent'))]
        for case in cases:
            self.run_command(**case); self.assertEqual(len(self.resent()),0)

    def test_only_pending_unexpired_existing_at_command_time(self):
        self.db.execute("UPDATE partner_reviews SET state='REJECTED'"); self.db.commit()
        expired=self.store.reserve('expired',self.proposal,100)
        self.db.execute('UPDATE partner_reviews SET expires_at=199 WHERE id=?',(expired,)); self.db.commit()
        self.store.reserve('future',self.proposal,205)
        self.run_command(); self.assertEqual(len(self.resent()),0)
        ack=self.notices.db.execute("SELECT subject,body FROM partner_notices WHERE event_key LIKE 'review-command-result:%'").fetchone()
        self.assertEqual(tuple(ack),('Review list','Nothing is waiting for review: no payment requests and no held receipts.'))

    def test_restart_after_partial_reservation_is_idempotent(self):
        reserve=self.notices.reserve
        def fail_ack(key,*args):
            if key.startswith('review-command-result:'):raise RuntimeError('interrupted')
            return reserve(key,*args)
        with patch.object(self.notices,'reserve',side_effect=fail_ack):
            with self.assertRaises(RuntimeError):self.run_command()
        self.assertEqual(len(self.resent()),1)
        self.run_command(); self.assertEqual(len(self.resent()),1)
        self.assertEqual(self.db.execute('SELECT count(*) FROM partner_review_replies').fetchone()[0],1)

    def test_unknown_resend_not_reopened_on_command_replay(self):
        self.run_command()
        self.notices.db.execute("UPDATE partner_notices SET ig_status='UNKNOWN',email_status='UNKNOWN' WHERE event_key LIKE 'review:%:resend:%'"); self.notices.db.commit()
        self.run_command(); self.assertEqual(len(self.resent()),1)
        self.assertEqual(self.resent()[0]['ig_status'],'UNKNOWN')


TOKEN = hashlib.sha256(b'command').hexdigest()


class HoldResendTests(unittest.TestCase):
    """R135: the `review` command also resends every active validation hold, oldest first with the requests."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.journal = ReceiptJournal(root/'receipt-processing.db'); self.addCleanup(self.journal.close)
        self.db = self.journal.db; self.store = ReviewStore(self.db)
        self.notices = NoticeJournal(root/'partner-notices.db'); self.addCleanup(self.notices.close)
        self.p = dict(id='p', username='reviewer', enabled=True, language='English', email='test@example.invalid')
        self.live = dict(partners=[self.p], reviewer_ids=['p'], accounts=[], borrowers=[])
        self.identity = dict(id='sender', username='reviewer')
        # Command sent 8 Nov 2026 12:00 Bangkok; processed a minute later.
        self.sent = 1794114000
        self.event = dict(message_id='command', sender_id='sender', text='review', reply_to='', event_timestamp=self.sent, captured_at=self.sent+1)
        self.config = {'review_resend_cutoff':'2026-01-01T00:00:00+00:00','receipt_hold_notice_cutoff':'2026-01-01T00:00:00+00:00'}
        self.proposal = dict(action='Lump Sum', borrower={'id':'b','name_en':'Test'}, receipt=dict(amount='100',date='2026-11-08',time='12:00',account_label='Test'))

    def hold(self, job_id, created_at, detail='AMOUNT_UNREADABLE', status='REVIEW'):
        with self.db:
            self.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,detail) VALUES (?,?,?,?,?,?,?)",
                            (job_id, 'image-'+job_id, 'borrower', '', status, created_at, detail))
        return dict(self.db.execute('SELECT * FROM receipt_jobs WHERE id=?', (job_id,)).fetchone())

    def request(self, job_id, created_at):
        return self.store.reserve(job_id, self.proposal, created_at)

    def run_command(self, **kwargs):
        queue(self.db, self.notices, kwargs.get('config', self.config), kwargs.get('event', self.event), self.live, self.identity,
              kwargs.get('now', self.sent+60), borrower=kwargs.get('borrower'))

    def resent(self):
        return [dict(r) for r in self.notices.db.execute("SELECT * FROM partner_notices WHERE event_key LIKE '%:resend:%'")]

    def ordered(self):
        return sorted(self.resent(), key=lambda n:int(n['body'].split('/')[0]))

    def ack(self):
        row = self.notices.db.execute("SELECT subject,body FROM partner_notices WHERE event_key LIKE 'review-command-result:%'").fetchone()
        return row and tuple(row)

    def test_hold_is_resent_under_its_own_key_with_the_still_held_line(self):
        job = self.hold('j', self.sent - 3*86400)
        self.run_command(borrower=lambda row:{'name_en':'Synthetic borrower'})
        [copy] = self.resent()
        self.assertEqual(copy['event_key'], event_key(job)+':resend:'+TOKEN)
        self.assertEqual(base_key(copy['event_key']), event_key(job))
        lines = copy['body'].split('\n')
        self.assertEqual(lines[0], '1/1 · Still held since 5 Nov (3 days)')
        self.assertEqual(lines[1], 'Receipt held — reviewer attention needed')
        self.assertIn('Borrower: Synthetic borrower', copy['body'])
        self.assertTrue(copy['body'].endswith('Then use Reply on this message and send Reject to clear it from the list.'))
        self.assertEqual(copy['body'].count('1/1'), 1)
        self.assertEqual(self.ack(), ('Review list', 'Review list: 1 held receipt. They follow now, oldest first. Use Reply on each message; '
                                     'each one says which replies it accepts. Decided or expired requests are not resent.'))

    def test_thai_still_held_line_and_one_day(self):
        self.p['language'] = 'ไทย'
        self.hold('j', self.sent - 86400)
        self.run_command()
        [copy] = self.resent()
        self.assertTrue(copy['body'].startswith('1/1 · ยังพักไว้ตั้งแต่ 7 พ.ย. (1 วัน)\nสลิปถูกพักไว้ กรุณาตรวจสอบ\n'), copy['body'])
        self.p['language'] = 'English'
        from mw_integration_agent.receipt_hold import still_held
        self.assertEqual(still_held({'created_at':self.sent-86400}, False, self.sent), 'Still held since 7 Nov (1 day)')

    def test_requests_and_holds_merge_oldest_first_with_counter_on_first_line_only(self):
        self.hold('old-hold', self.sent - 5*86400)
        self.request('request-job', self.sent - 20*3600)  # requests expire after 24 hours
        self.hold('new-hold', self.sent - 3600)
        self.run_command()
        rows = self.ordered()
        self.assertEqual([n['event_key'].split(':')[0]+':'+n['body'].split(' · ')[0] for n in rows],
                         ['receipt-held:1/3', 'review:2/3', 'receipt-held:3/3'])
        self.assertIn(':old-hold:', rows[0]['event_key']); self.assertIn(':new-hold:', rows[2]['event_key'])
        self.assertTrue(rows[1]['body'].startswith('2/3 · Payment approval requested\nBorrower: Test'))
        self.assertEqual(rows[1]['event_key'], 'review:'+self.store.db.execute('SELECT id FROM partner_reviews').fetchone()[0]+':resend:'+TOKEN)
        self.assertTrue(rows[2]['body'].startswith('3/3 · Still held since 8 Nov (0 days)\n'))
        for n in rows:
            self.assertEqual(n['body'].count(' · ', 0, n['body'].index('\n')), 1)
            self.assertNotIn('/3', n['body'].split('\n', 1)[1])
        self.assertEqual(self.ack()[1].split('.')[0], 'Review list: 1 payment request · 2 held receipts')

    def test_delivery_follows_the_counter_across_kinds(self):
        from mw_integration_agent.review_cycle import notice_rank, resend_position
        self.hold('a', self.sent - 9000); self.request('r', self.sent - 8000); self.hold('b', self.sent - 7000); self.request('s', self.sent - 6000)
        self.run_command()
        due = sorted(self.notices.due(), key=lambda n:(notice_rank(n), resend_position(n)))
        self.assertTrue(due[0]['event_key'].startswith('review-command-result:'))
        self.assertEqual([n['body'].split(' · ')[0] for n in due[1:]], ['1/4', '2/4', '3/4', '4/4'])
        first = dict(due[1], event_key=base_key(due[1]['event_key']))
        self.assertEqual((notice_rank(first), resend_position(first)), (4, 0))

    def test_skipped_holds_and_kinds_not_resent(self):
        for i, state in enumerate(('PENDING', 'APPROVED', 'POSTING', 'POSTED', 'UNKNOWN')):
            self.hold('has-'+state, self.sent - 100)
            self.store.reserve('has-'+state, dict(self.proposal, n=i), self.sent - 100)
            with self.db:self.db.execute('UPDATE partner_reviews SET state=?,expires_at=0 WHERE job_id=?', (state, 'has-'+state))
        self.hold('stale-review', self.sent - 100); self.store.reserve('stale-review', dict(self.proposal, n='stale'), self.sent - 100)
        with self.db:self.db.execute("UPDATE partner_reviews SET state='STALE' WHERE job_id='stale-review'")
        self.hold('rejected', self.sent - 100, status='REJECTED')
        self.hold('archive', self.sent - 9000, detail='RECEIPT_ARCHIVE_PENDING', status='PENDING')
        self.hold('after-command', self.sent + 30)
        expired = self.request('expired', self.sent - 100)
        with self.db:self.db.execute('UPDATE partner_reviews SET expires_at=? WHERE id=?', (self.sent, expired))
        self.run_command()
        self.assertEqual([n['event_key'].split(':')[1] for n in self.resent()], ['stale-review'])
        self.assertEqual(self.ack()[1].split('.')[0], 'Review list: 1 held receipt')

    def test_holds_need_the_hold_notice_switch(self):
        self.hold('j', self.sent - 100)
        self.run_command(config={'review_resend_cutoff':self.config['review_resend_cutoff']})
        self.assertEqual(self.resent(), [])
        self.assertEqual(self.ack()[1], 'Nothing is waiting for review: no payment requests and no held receipts.')

    def test_same_command_replayed_is_idempotent(self):
        self.hold('j', self.sent - 100); self.request('r', self.sent - 100)
        self.run_command(); self.run_command(); self.run_command(now=self.sent+3600)
        self.assertEqual(len(self.resent()), 2)
        self.assertEqual(self.notices.db.execute("SELECT count(*) FROM partner_notices WHERE event_key LIKE 'review-command-result:%'").fetchone()[0], 1)
        self.assertEqual(self.db.execute('SELECT outcome FROM partner_review_replies').fetchall()[0][0], 'RESEND_QUEUED')

    def test_restart_after_partial_reservation_completes_once(self):
        for i in range(3):self.hold(f'j{i}', self.sent - 1000 + i)
        reserve = self.notices.reserve
        calls = []
        def fail_second(key, *args):
            calls.append(key)
            if len(calls) == 2:raise RuntimeError('interrupted')
            return reserve(key, *args)
        with patch.object(self.notices, 'reserve', side_effect=fail_second):
            with self.assertRaises(RuntimeError):self.run_command()
        self.assertEqual(len(self.resent()), 1); self.assertIsNone(self.ack())
        self.assertEqual(self.db.execute('SELECT count(*) FROM partner_review_replies').fetchone()[0], 0)
        self.run_command(now=self.sent+120)
        self.assertEqual(sorted(n['body'].split(' · ')[0] for n in self.resent()), ['1/3', '2/3', '3/3'])
        self.assertEqual(self.ack()[1].split('.')[0], 'Review list: 3 held receipts')
        self.run_command(now=self.sent+180); self.assertEqual(len(self.resent()), 3)

    def test_counter_is_dropped_rather_than_exceed_the_instagram_limit(self):
        self.request('r', self.sent - 100)
        with patch('mw_integration_agent.review_resend.request_text', return_value=('subject', 'x'*998)):
            self.run_command()
        self.assertEqual(self.resent()[0]['body'], 'x'*998)


class AcknowledgementTests(unittest.TestCase):
    def test_counts_per_kind_singular_more_and_none(self):
        tail = ' They follow now, oldest first. Use Reply on each message; each one says which replies it accepts. Decided or expired requests are not resent.'
        self.assertEqual(acknowledgement(2, 3, False), ('Review list', 'Review list: 2 payment requests · 3 held receipts.'+tail))
        self.assertEqual(acknowledgement(1, 0, False)[1], 'Review list: 1 payment request.'+tail)
        self.assertEqual(acknowledgement(0, 1, False)[1], 'Review list: 1 held receipt.'+tail)
        self.assertEqual(acknowledgement(6, 0, False)[1], 'Review list: 6 payment requests.'+tail)
        self.assertEqual(acknowledgement(4, 3, False)[1], 'Review list: 4 payment requests · 3 held receipts.'+tail+' More follow over the next few minutes.')
        self.assertEqual(acknowledgement(0, 0, False), ('Review list', 'Nothing is waiting for review: no payment requests and no held receipts.'))
        thai = ' จะส่งตามมาทีละข้อความ เรียงจากเก่าสุด ใช้ Reply ตอบแต่ละข้อความ แต่ละข้อความระบุคำตอบที่ใช้ได้ คำขอที่ตัดสินแล้วหรือหมดอายุจะไม่ส่งซ้ำ'
        self.assertEqual(acknowledgement(2, 1, True), ('รายการรอตรวจสอบ', 'รายการรอตรวจสอบ: คำขออนุมัติ 2 รายการ · สลิปที่พักไว้ 1 รายการ'+thai))
        self.assertEqual(acknowledgement(0, 7, True)[1], 'รายการรอตรวจสอบ: สลิปที่พักไว้ 7 รายการ'+thai+' ที่เหลือจะส่งตามมาในอีกไม่กี่นาที')
        self.assertEqual(acknowledgement(1, 0, True)[1], 'รายการรอตรวจสอบ: คำขออนุมัติ 1 รายการ'+thai)
        self.assertEqual(acknowledgement(0, 0, True), ('รายการรอตรวจสอบ', 'ไม่มีรายการรอตรวจสอบ ทั้งคำขออนุมัติและสลิปที่พักไว้'))
