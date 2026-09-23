import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.review_cycle import cycle


class CycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.j=ReceiptJournal(self.root/'receipt-processing.db');self.addCleanup(self.j.close)
        ingress=IngressJournal(self.root/'instagram-ingress.db');ingress.close()
        self.config={'state_directory':str(self.root),'partner_review_cutoff':'2026-01-01T00:00:00+00:00','partner_review_execution_enabled':True}
        self.b={'id':'b','username':'borrower','enabled':True,'name_en':'Test'}
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        self.proposal={'action':'Lump Sum','borrower':self.b,'receipt':{'amount':'100.00','date':'2026-09-21','time':'12:10','reference':'TESTREF','account_id':'a','account_label':'Test'},'facts':{},'loan_id':None}
        from datetime import datetime
        from mw_integration_agent.receipt_rules import BANGKOK
        self.proposal['receipt']['date']=datetime.now(BANGKOK).date().isoformat()
        self.store=ReviewStore(self.j.db);self.key=self.store.reserve('job',self.proposal)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES ('job','message','123','','REVIEW_REQUESTED',0)")
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner='p' WHERE id=?",(self.key,));self.j.db.commit()
        notices=NoticeJournal(self.root/'partner-notices.db');n=notices.reserve('review:'+self.key,self.p,'subject','body')
        notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='sent',recipient_id='456' WHERE id=?",(n,));notices.db.commit();notices.close()
        self.patches=[]
        for target,kwargs in [('masters',{'return_value':{'partners':[self.p],'reviewer_ids':['p'],'borrowers':[self.b],'accounts':[{'id':'a','active':True}]}}),
              ('check',{}),('facts',{'return_value':{}}),('plan',{'return_value':self.proposal}),('read_query',{'return_value':['actor@example.invalid']}),
              ('add_payment',{}),('readback',{'return_value':True})]:
            p=patch('mw_integration_agent.review_cycle.'+target,**kwargs);setattr(self,target,p.start());self.addCleanup(p.stop)
        p=patch('mw_integration_agent.partner_notice.NoticeJournal.dispatch');self.dispatch=p.start();self.addCleanup(p.stop)
    def run_cycle(self):return cycle(self.config,self.j,lambda *_:{'id':'123','username':'borrower'})
    def test_approved_posts_once_then_result(self):
        self.run_cycle();self.run_cycle();self.assertEqual(self.add_payment.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')
    def test_unknown_never_retries_add(self):
        self.add_payment.side_effect=TimeoutError();self.readback.return_value=False
        self.run_cycle();self.run_cycle();self.assertEqual(self.add_payment.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'UNKNOWN')
    def test_changed_facts_no_write(self):
        self.plan.return_value={'changed':True};self.run_cycle();self.add_payment.assert_not_called()
    def test_manual_no_write_even_approved(self):
        self.proposal['action']='Loan Close'
        self.j.db.execute('UPDATE partner_reviews SET proposal=?',(json.dumps(self.proposal),));self.j.db.commit()
        self.run_cycle();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'MANUAL_REQUIRED')

    def overpayment(self,new_policy=True):
        self.proposal['action']='Overpayment review'
        if new_policy:self.proposal['approved_allocation_method']='Lump Sum'
        self.j.db.execute('UPDATE partner_reviews SET proposal=?',(json.dumps(self.proposal),));self.j.db.commit()

    def test_approved_overpayment_posts_full_amount_once(self):
        self.overpayment();self.run_cycle();self.run_cycle()
        self.assertEqual(self.add_payment.call_count,1)
        self.assertTrue(self.add_payment.call_args.args[0]['_receipt_reviewer_approved'])
        self.assertEqual(self.add_payment.call_args.args[2]['receipt']['amount'],'100.00')
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')

    def test_old_manual_only_overpayment_approval_stays_manual(self):
        self.overpayment(False);self.run_cycle();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'MANUAL_REQUIRED')

    def test_overpayment_pending_rejected_or_automatic_never_posts(self):
        self.overpayment()
        for state in ('PENDING','REJECTED'):
            self.j.db.execute('UPDATE partner_reviews SET state=?',(state,));self.j.db.commit()
            self.run_cycle();self.add_payment.assert_not_called()
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',detail=?",(AUTO_POLICY,));self.j.db.commit()
        self.run_cycle();self.add_payment.assert_not_called()

    def test_overpayment_unknown_never_repeats_add(self):
        self.overpayment();self.readback.return_value=False
        self.add_payment.side_effect=TimeoutError()
        self.run_cycle();self.run_cycle();self.assertEqual(self.add_payment.call_count,1)

    def test_overpayment_changed_facts_or_reviewer_removed_blocks_add(self):
        self.overpayment();self.plan.return_value={'changed':True}
        self.run_cycle();self.add_payment.assert_not_called()
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED'");self.j.db.commit()
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.add_payment.assert_not_called()
    def test_disabled_execution_no_write(self):
        self.config['partner_review_execution_enabled']=False;self.run_cycle();self.add_payment.assert_not_called()
    def test_reviewer_removed_after_approval_no_write(self):
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state,detail FROM partner_reviews').fetchone()[:],('STALE','APPROVING_REVIEWER_REMOVED'))
    def validated_job(self):
        import time
        self.j.db.execute("UPDATE partner_reviews SET state='SUPERSEDED',job_id='old'")
        self.j.db.execute("UPDATE receipt_jobs SET id='new-job',status='VALIDATED',created_at=?,result=?",(time.time(),json.dumps({'receipt':self.proposal['receipt'],'borrower':self.b})))
        self.j.db.commit()

    def enable_auto(self):
        self.config.update(receipt_auto_payment_enabled=True,receipt_auto_payment_cutoff='2026-01-01T00:00:00+00:00',
                           receipt_auto_actor_partner_id='p')

    def test_auto_posts_without_reviewer_or_request_and_restarts_safely(self):
        self.validated_job();self.enable_auto();self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.run_cycle()
        self.assertEqual(self.add_payment.call_count,1)
        self.assertTrue(self.add_payment.call_args.args[0]['_receipt_automatic'])
        self.assertEqual(self.add_payment.call_args.args[3],'actor@example.invalid')
        row=self.j.db.execute("SELECT id,state,decision_message FROM partner_reviews WHERE job_id='new-job'").fetchone()
        self.assertEqual(row['state'],'POSTED');self.assertIsNone(row['decision_message'])
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertIsNone(notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=?',('review:'+row['id'],)).fetchone())
        finally:notices.close()

    def test_auto_unknown_never_repeats_payment(self):
        self.validated_job();self.enable_auto();self.readback.return_value=False
        self.add_payment.side_effect=TimeoutError()
        self.run_cycle();self.run_cycle();self.assertEqual(self.add_payment.call_count,1)

    def test_auto_manual_actions_still_request_review(self):
        for action in ('Loan Close','Overpayment review'):
            with self.subTest(action=action):
                self.proposal['action']=action
                # Pure policy check ensures no manual action is auto-authorized.
                from mw_integration_agent.review_cycle import automatic_payment
                self.enable_auto()
                self.assertFalse(automatic_payment(self.config,{'created_at':9999999999},self.proposal))
        self.validated_job();self.run_cycle();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='new-job'").fetchone()[0],'PENDING')

    def test_auto_duplicate_or_changed_facts_blocks_post(self):
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        self.validated_job();self.enable_auto()
        self.check.side_effect=[None,ReceiptInvalid('PAYMENT_ALREADY_RECORDED')]
        self.run_cycle();self.add_payment.assert_not_called()
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='new-job'").fetchone()[0],'STALE')

    def test_auto_no_conversion_of_old_pending_review(self):
        self.enable_auto()
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING'");self.j.db.commit()
        self.run_cycle();self.add_payment.assert_not_called()

    def test_auto_disabled_after_reservation_does_not_post(self):
        self.enable_auto()
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.j.db.execute('UPDATE partner_reviews SET detail=?',(AUTO_POLICY,));self.j.db.commit()
        self.config['receipt_auto_payment_enabled']=False
        self.run_cycle();self.add_payment.assert_not_called()

    def test_auto_cutoff_keeps_earlier_validated_receipt_in_review(self):
        self.validated_job();self.enable_auto();self.config['receipt_auto_payment_cutoff']='2099-01-01T00:00:00+00:00'
        self.run_cycle();self.add_payment.assert_not_called()

    def test_success_only_enabled_partners(self):
        self.masters.return_value['partners'].append(dict(self.p,id='disabled',enabled=False))
        self.run_cycle()
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertEqual({r[0] for r in notices.db.execute("SELECT partner_id FROM partner_notices WHERE event_key LIKE 'review-result:%'")},{'p'})
        finally:notices.close()
    def test_new_requests_only_to_reviewer(self):
        self.validated_job()
        self.masters.return_value['partners'].append(dict(self.p,id='other',username='other'))
        self.run_cycle()
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertEqual({r[0] for r in notices.db.execute("SELECT partner_id FROM partner_notices WHERE event_key LIKE 'review:%'")},{'p'})
        finally:notices.close()
    def test_no_reviewer_keeps_validated_job_waiting(self):
        self.validated_job();self.masters.return_value['reviewer_ids']=[]
        self.run_cycle()
        self.assertEqual(self.j.db.execute('SELECT status,detail FROM receipt_jobs').fetchone()[:],('VALIDATED','NO_AI_REVIEWER'))
        self.add_payment.assert_not_called()
    def test_unsent_request_to_removed_reviewer_is_blocked(self):
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING'");self.j.db.commit()
        notices=NoticeJournal(self.root/'partner-notices.db')
        notices.db.execute("UPDATE partner_notices SET ig_status='PENDING'");notices.db.commit();notices.close()
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.dispatch.assert_not_called()
    def test_posted_results_still_go_to_all_partners(self):
        self.masters.return_value['partners'].append(dict(self.p,id='other',username='other'))
        self.run_cycle()
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertEqual({r[0] for r in notices.db.execute("SELECT partner_id FROM partner_notices WHERE event_key LIKE 'review-result:%'")},{'p','other'})
        finally:notices.close()
    def test_preexisting_ingress_schema_migrates_before_read(self):
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(self.root/'instagram-ingress.db')) as old:
            old.execute('ALTER TABLE messages DROP COLUMN reply_to')
            old.commit()
        self.run_cycle()
        with closing(sqlite3.connect(self.root/'instagram-ingress.db')) as current:
            self.assertIn('reply_to',{r[1] for r in current.execute('PRAGMA table_info(messages)')})
