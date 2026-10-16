import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.review_resend import queue, is_command
from mw_integration_agent.partner_conversation import is_receipt_reply


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
            self.assertTrue(is_command(event)); self.assertTrue(is_receipt_reply(None,event))
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
        ack=self.notices.db.execute("SELECT body FROM partner_notices WHERE event_key LIKE 'review-command-result:%'").fetchone()[0]
        self.assertIn('no pending',ack)

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
