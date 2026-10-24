import tempfile
import unittest
from pathlib import Path
from mw_integration_agent.partner_notice import NoticeJournal,receipt_notice
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.graph_email import EmailRejected
from mw_integration_agent.instagram import InstagramAPIError, InstagramRejected


def window_expired():
    return InstagramAPIError(400,10,2534022,window_expired=True)


class NoticeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'notices.db'
        self.j=NoticeJournal(self.path)
        self.rows=[{'id':'p','username':'partner','language':'English','email':'test@example.com','enabled':True}]
        self.config={'state_directory':self.tmp.name,'receipt_summary_enabled':True,
                     'email_fallback_enabled':True,'instagram_account_id':'123'}
        self.sent=[];self.mail=[]
        outer=self
        class API:
            def request(self,path,body):
                outer.sent.append(body);return {'message_id':'accepted-1'}
        class Mail:
            def send(self,*args):outer.mail.append(args)
        self.api=API();self.mailer=Mail()
        self.key=self.j.reserve('event',self.rows[0],'subject','body')

    def tearDown(self):self.j.close();self.tmp.cleanup()

    def dispatch(self):
        item=dict(self.j.db.execute('SELECT * FROM partner_notices').fetchone())
        self.j.dispatch(item,self.config,self.rows,api=self.api,mailer=self.mailer,resolver=lambda *_:'999')

    def notice(self):
        return dict(self.j.db.execute('SELECT * FROM partner_notices').fetchone())

    def provider(self,error):
        def failing(path,body):self.sent.append(body);raise error
        self.api.request=failing

    def test_instagram_first_no_email_no_borrower_destination(self):
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(self.mail,[])
        self.assertEqual(self.sent[0]['recipient'],{'id':'999'})

    def test_no_local_window_gate_before_authorized_send(self):
        # R058: the send is attempted without local ingress evidence; the journal has no messages table.
        self.dispatch()
        self.assertEqual(len(self.sent),1)
        self.assertEqual((self.notice()['ig_status'],self.notice()['message_id']),('ACCEPTED','accepted-1'))

    def test_provider_window_expiry_email_fallback_once(self):
        self.provider(window_expired())
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(len(self.mail),1)
        self.assertEqual((self.notice()['ig_status'],self.notice()['email_status']),('WINDOW_EXPIRED','SENT'))
        self.assertIn('WINDOW_EXPIRED',self.notice()['detail'])

    def test_accepted_at_set_only_on_definite_acceptance(self):
        import time
        before=time.time();self.dispatch()
        self.assertEqual(self.notice()['ig_status'],'ACCEPTED');self.assertGreaterEqual(self.notice()['accepted_at'],before)
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit();self.j.reserve('event',self.rows[0],'subject','body')
        self.provider(window_expired());before=time.time();self.dispatch()
        self.assertEqual((self.notice()['ig_status'],self.notice()['email_status']),('WINDOW_EXPIRED','SENT'))
        self.assertGreaterEqual(self.notice()['accepted_at'],before)
        def email_failure(error):
            def send(*args):raise error
            return send
        for error,mail,expected in [(InstagramAPIError(400,100),None,('REJECTED','PENDING')),
                                    (TimeoutError(),None,('UNKNOWN','PENDING')),
                                    (window_expired(),email_failure(EmailRejected('no')),('WINDOW_EXPIRED','REJECTED')),
                                    (window_expired(),email_failure(TimeoutError()),('WINDOW_EXPIRED','UNKNOWN'))]:
            with self.subTest(expected=expected):
                self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit();self.j.reserve('event',self.rows[0],'subject','body')
                self.provider(error);self.mailer.send=mail or self.mailer.send;self.dispatch()
                self.assertEqual((self.notice()['ig_status'],self.notice()['email_status']),expected)
                self.assertIsNone(self.notice()['accepted_at'])
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit();self.j.reserve('event',self.rows[0],'subject','body')
        self.rows[0]['email']='other@example.com';self.dispatch()
        self.assertEqual((self.notice()['ig_status'],self.notice()['accepted_at']),('REVIEW',None))

    def test_existing_journal_gains_accepted_at_without_backfill(self):
        import sqlite3
        path=Path(self.tmp.name)/'old.db'
        with sqlite3.connect(path) as db:
            db.execute('''CREATE TABLE partner_notices (id TEXT PRIMARY KEY,event_key TEXT NOT NULL,partner_id TEXT NOT NULL,
              partner TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,ig_status TEXT NOT NULL DEFAULT 'PENDING',message_id TEXT,
              email_status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,
              retry_after REAL NOT NULL DEFAULT 0,detail TEXT NOT NULL DEFAULT '',recipient_id TEXT)''')
            db.execute("INSERT INTO partner_notices(id,event_key,partner_id,partner,subject,body,ig_status) VALUES ('old','e','p','{}','s','b','ACCEPTED')")
        old=NoticeJournal(path);self.addCleanup(old.close)
        self.assertIsNone(old.db.execute("SELECT accepted_at FROM partner_notices WHERE id='old'").fetchone()[0])

    def test_definite_rejection_blocks_email_and_replay(self):
        self.provider(InstagramAPIError(400,100))
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(self.mail,[])
        self.assertEqual((self.notice()['ig_status'],self.notice()['email_status']),('REJECTED','PENDING'))

    def test_instagram_failures_record_detail_codes(self):
        # AGT-SEND-01: the reason survives in the journal, with the Graph code for definite rejections.
        for error,status,detail in [(InstagramRejected(400,100),'REJECTED','IG_REJECTED_100'),
                                    (InstagramRejected(403),'REJECTED','IG_REJECTED_HTTP403'),
                                    (InstagramAPIError(503,2),'UNKNOWN','IG_UNKNOWN_HTTP503'),
                                    (window_expired(),'WINDOW_EXPIRED','IG_WINDOW_EXPIRED'),
                                    (TimeoutError(),'UNKNOWN','IG_UNKNOWN_TimeoutError')]:
            with self.subTest(detail=detail):
                self.sent.clear();self.mail.clear()
                self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit()
                self.j.reserve('event',self.rows[0],'subject','body')
                self.provider(error)
                self.dispatch();self.dispatch()
                self.assertEqual(len(self.sent),1)
                self.assertEqual((self.notice()['ig_status'],self.notice()['detail']),(status,detail))
                self.assertEqual(len(self.mail),1 if status=='WINDOW_EXPIRED' else 0)

    def test_unknown_ig_does_not_replay_or_fall_back_after_restart(self):
        def uncertain(*args,**kwargs):self.sent.append('uncertain');raise TimeoutError()
        self.api.request=uncertain
        self.dispatch();self.j.close();self.j=NoticeJournal(self.path);self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(self.mail,[])
        self.assertEqual(self.notice()['ig_status'],'UNKNOWN')

    def test_unknown_email_does_not_retry(self):
        with self.j.db:self.j.db.execute("UPDATE partner_notices SET ig_status='WINDOW_EXPIRED'")
        def uncertain(*args):self.mail.append(args);raise TimeoutError()
        self.mailer.send=uncertain
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.mail),1);self.assertEqual(self.sent,[])
        # AGT-SEND-02: the uncertain outcome keeps its reason.
        self.assertEqual((self.notice()['email_status'],self.notice()['detail']),('UNKNOWN','EMAIL_UNKNOWN_TimeoutError'))

    def test_email_requires_provider_window_evidence(self):
        self.rows[0]['enabled']=False
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit()
        self.j.reserve('event',self.rows[0],'subject','body')
        self.dispatch();self.dispatch()
        self.assertEqual(self.sent+self.mail,[])
        self.assertEqual((self.notice()['ig_status'],self.notice()['detail']),('REVIEW','IG_PREFLIGHT_FAILED'))

    def test_changed_recipient_and_kill_switch_fail_closed(self):
        self.rows[0]['email']='other@example.com';self.dispatch()
        self.assertEqual(self.sent+self.mail,[])
        self.assertEqual(self.j.db.execute('SELECT ig_status FROM partner_notices').fetchone()[0],'REVIEW')

    def test_definite_email_retries_bounded(self):
        self.provider(window_expired())
        def reject(*args):self.mail.append(args);raise EmailRejected('no')
        self.mailer.send=reject
        for _ in range(5):
            self.dispatch()
            self.j.db.execute('UPDATE partner_notices SET retry_after=0');self.j.db.commit()
        self.assertEqual(len(self.sent),1);self.assertEqual(len(self.mail),3)

    def test_payload_change_cannot_reuse_key(self):
        with self.assertRaises(ConfigurationError):self.j.reserve('event',self.rows[0],'subject','changed')

    def test_terminal_notice_keeps_snapshot_after_partner_change_and_restart(self):
        for ig,email in [('ACCEPTED','PENDING'),('UNAVAILABLE','SENT'),('REJECTED','PENDING'),
                         ('UNKNOWN','UNKNOWN'),('REVIEW','PENDING'),('WINDOW_EXPIRED','SENT'),('UNAVAILABLE','REVIEW')]:
            with self.subTest(ig=ig,email=email):
                with self.j.db:
                    self.j.db.execute('UPDATE partner_notices SET ig_status=?,email_status=? WHERE id=?',
                                      (ig,email,self.key))
                before=dict(self.j.db.execute('SELECT * FROM partner_notices WHERE id=?',(self.key,)).fetchone())
                self.j.close();self.j=NoticeJournal(self.path)
                changed=dict(self.rows[0],enabled=False,language='ไทย')
                self.assertEqual(self.j.reserve('event',changed,'new subject','new body'),self.key)
                self.dispatch()
                after=dict(self.j.db.execute('SELECT * FROM partner_notices WHERE id=?',(self.key,)).fetchone())
                self.assertEqual(before,after)
                self.assertEqual(self.sent+self.mail,[])
        new_key=self.j.reserve('new-review',self.rows[0],'subject','new review')
        self.assertEqual([r['id'] for r in self.j.due()],[new_key])
        self.j.dispatch(self.j.due()[0],self.config,self.rows,api=self.api,mailer=self.mailer,
                        resolver=lambda *_:'999')
        self.assertEqual(len(self.sent),1)

    def test_pending_partner_change_still_rejected(self):
        with self.assertRaises(ConfigurationError):
            self.j.reserve('event',dict(self.rows[0],enabled=False),'subject','body')

    def test_retired_conversation_notice_is_refused_on_both_channels(self):
        # R091: conversation replies left with the Instagram Partner conversation; a leftover event sends nothing.
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit()
        self.j.reserve('conversation:synthetic',self.rows[0],'reply','response')
        with self.assertRaisesRegex(ConfigurationError,'CONVERSATION_NOTICES_RETIRED'):
            self.j.dispatch(self.j.due()[0],self.config,self.rows,api=self.api,mailer=self.mailer)
        self.assertEqual(self.sent+self.mail,[])
        self.assertEqual((self.notice()['ig_status'],self.notice()['email_status']),('PENDING','PENDING'))

    def test_success_and_summary_distinct_localized_minutes(self):
        receipt={'amount':'1300.00','date':'2026-09-21','time':'12:10:59','account_label':'Test TTB'}
        borrower={'id':'b','name_en':'Test Borrower','name_th':'ผู้กู้ทดสอบ'}
        for language in ('English','ไทย'):
            subject,body=receipt_notice(receipt,borrower,language,'payment-test')
            self.assertIn('1,300.00',body);self.assertIn('12:10',body);self.assertNotIn('12:10:59',body)
            self.assertIn('payment-test',body)
        subject,body=receipt_notice(receipt,borrower,'English')
        self.assertIn('has not been recorded',body);self.assertNotIn('processed',subject)
