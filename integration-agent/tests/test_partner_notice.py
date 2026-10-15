import copy
import tempfile
import unittest
from pathlib import Path
from mw_integration_agent.partner_notice import NoticeJournal,receipt_notice
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.graph_email import EmailRejected


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

    def dispatch(self,**kwargs):
        item=dict(self.j.db.execute('SELECT * FROM partner_notices').fetchone())
        self.j.dispatch(item,self.config,self.rows,api=self.api,mailer=self.mailer,
                        resolver=lambda *_:'999',window=kwargs.get('window',lambda *_:None))

    def test_instagram_first_no_email_no_borrower_destination(self):
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(self.mail,[])
        self.assertEqual(self.sent[0]['recipient'],{'id':'999'})

    def test_closed_window_email_fallback_once(self):
        def closed(*_):raise ConfigurationError('closed')
        self.dispatch(window=closed);self.dispatch()
        self.assertEqual(self.sent,[]);self.assertEqual(len(self.mail),1)

    def test_unknown_ig_does_not_replay_after_restart(self):
        def uncertain(*args,**kwargs):self.sent.append('uncertain');raise TimeoutError()
        self.api.request=uncertain
        self.dispatch();self.j.close();self.j=NoticeJournal(self.path);self.dispatch()
        self.assertEqual(len(self.sent),1);self.assertEqual(len(self.mail),1)

    def test_unknown_email_does_not_retry(self):
        self.rows[0]['enabled']=False
        # New event reserved with the actual disabled IG preference: email fallback is permitted.
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit()
        self.j.reserve('event',self.rows[0],'subject','body')
        def uncertain(*args):self.mail.append(args);raise TimeoutError()
        self.mailer.send=uncertain
        self.dispatch();self.dispatch()
        self.assertEqual(len(self.mail),1);self.assertEqual(self.sent,[])

    def test_changed_recipient_and_kill_switch_fail_closed(self):
        self.rows[0]['email']='other@example.com';self.dispatch()
        self.assertEqual(self.sent+self.mail,[])
        self.assertEqual(self.j.db.execute('SELECT ig_status FROM partner_notices').fetchone()[0],'REVIEW')

    def test_definite_email_retries_bounded(self):
        def closed(*_):raise ConfigurationError('closed')
        def reject(*args):self.mail.append(args);raise EmailRejected('no')
        self.mailer.send=reject
        for _ in range(5):
            self.dispatch(window=closed)
            self.j.db.execute('UPDATE partner_notices SET retry_after=0');self.j.db.commit()
        self.assertEqual(len(self.mail),3)

    def test_payload_change_cannot_reuse_key(self):
        with self.assertRaises(ConfigurationError):self.j.reserve('event',self.rows[0],'subject','changed')

    def test_terminal_notice_keeps_snapshot_after_partner_change_and_restart(self):
        for ig,email in [('ACCEPTED','PENDING'),('UNAVAILABLE','SENT'),
                         ('UNKNOWN','UNKNOWN'),('REVIEW','PENDING'),('UNAVAILABLE','REVIEW')]:
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
                        resolver=lambda *_:'999',window=lambda *_:None)
        self.assertEqual(len(self.sent),1)

    def test_pending_partner_change_still_rejected(self):
        with self.assertRaises(ConfigurationError):
            self.j.reserve('event',dict(self.rows[0],enabled=False),'subject','body')

    def conversation(self, body='response'):
        self.j.db.execute('DELETE FROM partner_notices');self.j.db.commit()
        key=self.j.reserve('conversation:synthetic',self.rows[0],'reply',body)
        with self.j.db:self.j.db.execute('UPDATE partner_notices SET recipient_id=? WHERE id=?',('999',key))
        self.config['partner_conversations_enabled']=True

    def test_conversation_opt_out_blocks_both_channels(self):
        self.rows[0]['enabled']=False
        self.conversation()
        self.dispatch()
        self.assertEqual(self.sent+self.mail,[])

    def test_conversation_has_independent_switch(self):
        self.conversation()
        self.config['receipt_summary_enabled']=False
        self.dispatch()
        self.assertEqual(len(self.sent),1)

    def test_conversation_long_reply_complete_email(self):
        self.conversation('x'*1001)
        self.dispatch()
        self.assertEqual(self.sent,[])
        self.assertEqual(len(self.mail),1)
        self.assertIn('x'*1001,self.mail[0][2])

    def test_conversation_remapped_sender_blocks_both_channels(self):
        self.conversation()
        with self.j.db:self.j.db.execute("UPDATE partner_notices SET recipient_id='998'")
        self.dispatch()
        self.assertEqual(self.sent+self.mail,[])

    def test_success_and_summary_distinct_localized_minutes(self):
        receipt={'amount':'1300.00','date':'2026-09-21','time':'12:10:59','account_label':'Test TTB'}
        borrower={'id':'b','name_en':'Test Borrower','name_th':'ผู้กู้ทดสอบ'}
        for language in ('English','ไทย'):
            subject,body=receipt_notice(receipt,borrower,language,'payment-test')
            self.assertIn('1,300.00',body);self.assertIn('12:10',body);self.assertNotIn('12:10:59',body)
            self.assertIn('payment-test',body)
        subject,body=receipt_notice(receipt,borrower,'English')
        self.assertIn('has not been recorded',body);self.assertNotIn('processed',subject)
