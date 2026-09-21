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

    def test_success_and_summary_distinct_localized_minutes(self):
        receipt={'amount':'1300.00','date':'2026-09-21','time':'12:10:59','account_label':'Test TTB'}
        borrower={'id':'b','name_en':'Test Borrower','name_th':'ผู้กู้ทดสอบ'}
        for language in ('English','ไทย'):
            subject,body=receipt_notice(receipt,borrower,language,'payment-test')
            self.assertIn('1,300.00',body);self.assertIn('12:10',body);self.assertNotIn('12:10:59',body)
            self.assertIn('payment-test',body)
        subject,body=receipt_notice(receipt,borrower,'English')
        self.assertIn('has not been recorded',body);self.assertNotIn('processed',subject)
