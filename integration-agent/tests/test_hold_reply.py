import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.hold_reply import decide,queue_result,result_key
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.receipt_hold import event_key
from mw_integration_agent.receipt_health import assess


class HoldReplyTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);self.root=Path(temp.name)
        self.j=ReceiptJournal(self.root/'receipt-processing.db');self.addCleanup(self.j.close)
        self.reviews=ReviewStore(self.j.db)
        self.n=NoticeJournal(self.root/'partner-notices.db');self.addCleanup(self.n.close)
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        self.config={'state_directory':str(self.root),'receipt_hold_reply_cutoff':'1970-01-01T00:01:40+00:00','partner_review_cutoff':'1970-01-01T00:00:00+00:00'}
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,detail) VALUES ('j','image','borrower','','REVIEW',1,'AMOUNT_UNREADABLE')")
        self.j.db.execute("INSERT INTO receipt_keys VALUES ('image:test','j')");self.j.db.commit()
        self.key=event_key(self.job())
        notice_id=self.n.reserve(self.key,self.p,'subject','body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out',recipient_id='123' WHERE id=?",(notice_id,))
        self.notice=dict(self.n.db.execute('SELECT * FROM partner_notices').fetchone())
        self.event={'message_id':'in','reply_to':'out','sender_id':'123','text':' ReJeCt ','event_timestamp':110,'captured_at':111}
        self.identity={'id':'123','username':'partner'}
    def job(self):return dict(self.j.db.execute("SELECT * FROM receipt_jobs WHERE id='j'").fetchone())
    def decide(self,**kwargs):
        return decide(self.j.db,self.config,kwargs.get('event',self.event),kwargs.get('notice',self.notice),[self.p],kwargs.get('identity',self.identity),kwargs.get('reviewers',['p']),now=200)
    def test_reject_removes_hold_preserves_history_and_dedup(self):
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual((self.job()['status'],self.job()['detail']),('REJECTED','AMOUNT_UNREADABLE'))
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM receipt_keys').fetchone()[0],1)
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM partner_reviews').fetchone()[0],0)
        self.assertEqual(assess([self.job()],[],[],200)['held_receipts'],0)
    def test_restart_and_repeated_reply_are_idempotent(self):
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual(self.decide(event=dict(self.event,message_id='again')),'HOLD_NOT_ACTIVE')
    def test_reject_and_no_are_case_insensitive(self):
        for i,text in enumerate(('reject','REJECT','Reject','no','NO',' No ')):
            with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET status='REVIEW'")
            self.assertEqual(self.decide(event=dict(self.event,text=text,message_id='word'+str(i))),'HOLD_REJECTED')
    def test_authorization_and_correlation_fail_closed(self):
        for kwargs,expected in [({'reviewers':[]},'NOT_REVIEWER'),({'identity':{'id':'other','username':'partner'}},'UNAUTHORIZED'),
          ({'event':dict(self.event,reply_to='wrong')},'NOT_CORRELATED'),({'event':dict(self.event,sender_id='other')},'NOT_CORRELATED'),
          ({'notice':dict(self.notice,ig_status='UNKNOWN')},'NOT_CORRELATED')]:
            self.assertEqual(self.decide(**kwargs),expected)
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_approval_or_ambiguous_words_never_dismiss_or_post(self):
        for i,text in enumerate(('ok','yes','approved','why?','please do not reject')):
            self.assertEqual(self.decide(event=dict(self.event,text=text,message_id=str(i))),'HOLD_REJECT_REQUIRED')
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_old_replies_and_future_events_do_not_decide(self):
        for event in (dict(self.event,event_timestamp=90),dict(self.event,captured_at=90)):
            self.assertEqual(self.decide(event=event),'BEFORE_HOLD_REPLY_CUTOFF')
        self.assertEqual(self.decide(event=dict(self.event,event_timestamp=201)),'INVALID_TIME')
    def test_old_reason_or_existing_posting_cannot_be_cleared(self):
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='DATE_UNREADABLE'")
        self.assertEqual(self.decide(),'HOLD_NOT_ACTIVE')
        for i,state in enumerate(('PENDING','APPROVED','POSTING','POSTED','UNKNOWN')):
            with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='AMOUNT_UNREADABLE'")
            self.reviews.reserve('j',{},1)
            with self.j.db:self.j.db.execute('UPDATE partner_reviews SET state=?',(state,))
            self.assertEqual(self.decide(event=dict(self.event,message_id='protected'+str(i))),'HOLD_HAS_REVIEW')
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_ack_recovery_is_durable_and_failures_visible(self):
        self.decide()  # crash before acknowledgement reserve
        replies=[dict(r) for r in self.j.db.execute('SELECT * FROM partner_review_replies')]
        self.assertEqual(assess([self.job()],[],[],1000,replies)['failed_notifications'],1)
        queue_result(self.n,self.event,self.notice,[self.p],self.decide())
        queue_result(self.n,self.event,self.notice,[self.p],self.decide())
        self.assertEqual(len(self.n.due()),1)
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED' WHERE event_key=?",(result_key('in'),))
        notices=[dict(r) for r in self.n.db.execute('SELECT * FROM partner_notices')]
        self.assertEqual(assess([self.job()],[],notices,1000,replies)['status'],1)
    def test_cycle_routes_hold_reply_without_payment_and_retries_ack(self):
        from mw_integration_agent.review_cycle import cycle
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.capture('batch',[{'message_id':'in','sender_id':'123','timestamp':time.time()-1,'text':'reject','reply_to':'out'}]);ingress.close()
        live={'partners':[self.p],'reviewer_ids':['p'],'borrowers':[],'accounts':[]}
        with patch('mw_integration_agent.review_cycle.masters',return_value=live),patch.object(NoticeJournal,'dispatch'), \
             patch('mw_integration_agent.review_cycle.add_payment',create=True) as add,patch('mw_integration_agent.hold_reply.queue_result',side_effect=RuntimeError('crash')):
            self.assertTrue(cycle(self.config,self.j,lambda *_:self.identity)['failures'])
            self.assertEqual(self.job()['status'],'REJECTED');add.assert_not_called()
        with patch('mw_integration_agent.review_cycle.masters',return_value=live),patch.object(NoticeJournal,'dispatch') as dispatch, \
             patch('mw_integration_agent.review_cycle.add_payment',create=True) as add:
            self.assertFalse(cycle(self.config,self.j,lambda *_:self.identity)['failures'])
            self.assertEqual(len(self.n.due()),1);self.assertEqual(dispatch.call_count,1);add.assert_not_called()
