"""R112: the options reply loop inside the review cycle (new file; Byte owns the code). The Instagram transport is mocked (no real
send); the review database, journals and reply authorization are real. """
import json
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.review_cycle import cycle
from mw_integration_agent.receipt_rules import BANGKOK
from mw_integration_agent import receipt_api
from mw_integration_agent.receipt_archive import Archive


def options(sha='a'*64):
    return {'planSha256':sha,'dueTotal':'300','remainder':'1200','forward':{'first':'2026-11-04','last':'2026-11-05','through':'2026-11-05','uncovered':'0'},
            'principal':[{'loanId':'L1','loanKey':'L-0398','amount':'1200','dailyAfter':'66','outstandingAfter':'1133'}],'blocked':[]}


def chosen(purpose,**over):
    # What review_proposal.chosen_plan returns for the chosen purpose (the server's plan; mocked here, the real SQL is tested elsewhere).
    return {'allocations':[{'chargeId':'c1','principal':'0','interest':'300','expectedPrincipalRemaining':'0','expectedInterestRemaining':'300','chargeDate':'2026-11-03'}],
            'materialize':[],'principal':[],'uncovered':'0','settles':[],'purpose':purpose,**over}


class OptionsCycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.j=ReceiptJournal(self.root/'receipt-processing.db');self.addCleanup(self.j.close)
        ingress=IngressJournal(self.root/'instagram-ingress.db');ingress.close()
        self.config={'state_directory':str(self.root),'partner_review_cutoff':'2026-01-01T00:00:00+00:00','partner_review_execution_enabled':True,'receipt_payment_api_enabled':True,'receipt_environment':'dev',
                     'pay_forward_options_enabled':True,'database_enabled':True}
        self.b={'id':'b','username':'borrower','enabled':True,'name_en':'Test'}
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        day=datetime.now(BANGKOK).date().isoformat()
        self.proposal={'action':'Pay forward options','borrower':self.b,'receipt':{'amount':'1500','date':day,'time':'12:10','reference':'TESTREF','account_id':'a','account_label':'Test'},
                       'facts':{},'loan_id':None,'loan_keys':['L-0398'],'options':options()}
        self.store=ReviewStore(self.j.db);self.key=self.store.reserve('job',self.proposal)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES ('job','message','123','','REVIEW_REQUESTED',0)");self.j.db.commit()
        notices=NoticeJournal(self.root/'partner-notices.db');n=notices.reserve('review:'+self.key,self.p,'subject','body')
        notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='sent',recipient_id='456' WHERE id=?",(n,));notices.db.commit();notices.close()
        self.current=dict(self.proposal)
        for target,kwargs in [('masters',{'return_value':{'partners':[self.p],'reviewer_ids':['p'],'borrowers':[self.b],'accounts':[{'id':'a','active':True}]}}),
              ('receipt_borrower',{'return_value':self.b}),('chosen_plan',{'side_effect':lambda config,proposal,purpose:chosen(purpose)}),
              ('check',{}),('facts',{'return_value':{}}),('plan',{'side_effect':lambda *a,**k:self.current}),('read_query',{'return_value':['actor@example.invalid']}),
              ('add_payment',{'create':True}),('readback',{'return_value':True})]:
            p=patch('mw_integration_agent.review_cycle.'+target,**kwargs);setattr(self,target,p.start());self.addCleanup(p.stop)
        Archive(self.config,self.j,storage=object())
        def payload(config,review,proposal,asset,automatic,plan=None):
            return {'actorPartnerId':review['deciding_partner'],'command':{'requestId':receipt_api.request_id('dev',review['id']),'reviewId':review['id'],'amountReceived':proposal['receipt']['amount'],'mode':'reviewed','plan':plan}}
        p=patch('mw_integration_agent.receipt_api.payload',side_effect=payload);self.payload=p.start();self.addCleanup(p.stop)
        def submitted(config,body):
            return {'kind':'recorded','reviewId':body['command']['reviewId'],'financialMatch':True,'originalOutcome':{'status':'posted','paymentId':'pwa:'+body['command']['requestId']}}
        p=patch('mw_integration_agent.receipt_api.submit',side_effect=submitted);self.submit=p.start();self.addCleanup(p.stop)
        p=patch('mw_integration_agent.receipt_api.status',return_value={'kind':'unresolved'});self.status=p.start();self.addCleanup(p.stop)
        p=patch('mw_integration_agent.partner_notice.NoticeJournal.dispatch');self.dispatch=p.start();self.addCleanup(p.stop)   # no real Instagram send
    def run_cycle(self,sender='456'):return cycle(self.config,self.j,lambda *_:{'id':sender,'username':'partner'})
    def reply(self,text,sender='456',message='reply1',reply_to='sent'):
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.db.execute("INSERT INTO messages(message_id,sender_id,event_timestamp,text,captured_at,status,reply_to) VALUES (?,?,?,?,?,?,?)",(message,sender,time.time(),text,time.time(),'CAPTURED_NO_PROCESSING',reply_to))
        ingress.db.commit();ingress.close()
    def state(self):return self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0]
    def option_notices(self):
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:return notices.db.execute("SELECT count(*) FROM partner_notices WHERE event_key LIKE 'review:%:options:%'").fetchone()[0]
        finally:notices.close()

    def test_no_post_without_a_numbered_reply(self):
        for _ in range(3):self.run_cycle()
        self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called();self.add_payment.assert_not_called()

    def test_an_unclear_reply_asks_again_and_posts_nothing(self):
        self.reply('maybe');first=self.run_cycle();self.run_cycle()
        self.assertEqual(first['failures'],[]);self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called()
        self.assertEqual(self.option_notices(),1,'the options are queued once per unclear reply')
        import hashlib
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertEqual(notices.db.execute("SELECT event_key FROM partner_notices WHERE event_key LIKE 'review:%:options:%'").fetchone()[0],'review:'+self.key+':options:'+hashlib.sha256(b'reply1').hexdigest())
        finally:notices.close()

    def test_yes_does_not_choose_a_path(self):
        self.reply('Yes');self.run_cycle();self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called()

    def test_a_numbered_reply_posts_once_then_reports(self):
        self.reply('1');self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1);self.assertEqual(self.state(),'POSTED')
        row=self.j.db.execute('SELECT * FROM partner_reviews').fetchone();self.assertEqual(json.loads(row['detail'])['purpose'],{'forward':True,'loans':None,'principal':[]})
        self.assertEqual(self.submit.call_args[0][1]['command']['plan']['purpose'],{'forward':True,'loans':None,'principal':[]},'the command is built from the chosen purpose plan')
        self.assertEqual(self.submit.call_args[0][1]['command']['requestId'],receipt_api.request_id('dev',self.key),'one slip, one request id')

    def test_a_withdrawn_split_reply_asks_again_and_posts_nothing(self):
        # R127 (owner, 5 November 2026): "3 <amount>" no longer splits; it gets the prompt and the options once.
        self.reply('3 800');self.assertEqual(self.run_cycle()['failures'],[]);self.run_cycle()
        self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called();self.add_payment.assert_not_called()
        self.assertEqual(self.option_notices(),1)
        self.assertEqual(self.j.db.execute("SELECT status FROM receipt_jobs WHERE id='job'").fetchone()[0],'REVIEW_REQUESTED')
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertTrue(notices.db.execute("SELECT body FROM partner_notices WHERE event_key LIKE 'review:%:options:%'").fetchone()[0].startswith('Reply 1, 2 or 3.\n'))
        finally:notices.close()

    def posted_notice(self):
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:return notices.db.execute("SELECT body FROM partner_notices WHERE event_key=?",('review-result:'+self.key+':POSTED',)).fetchone()[0]
        finally:notices.close()

    def test_option_two_posts_and_reports_the_interest_and_principal_split(self):
        # R127 (Echo AG-12), the owner's example: remainder 500, principal 410, so interest 90, from the saved options.
        o=dict(options(),remainder='500',principal=[{'loanId':'L1','loanKey':'L-0398','amount':'410','dailyAfter':'53','outstandingAfter':'9590'}])
        self.proposal['options']=o;self.proposal['receipt']=dict(self.proposal['receipt'],amount='950')
        self.j.db.execute("UPDATE partner_reviews SET proposal=?",(json.dumps(self.proposal,sort_keys=True,ensure_ascii=False),));self.j.db.commit()
        self.current=dict(self.proposal)
        self.reply('2');self.run_cycle();self.run_cycle()
        self.assertEqual(self.state(),'POSTED');self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.submit.call_args[0][1]['command']['plan']['purpose'],{'forward':False,'loans':None,'principal':[{'loanId':'L1','amount':'410'}]})
        self.assertTrue(self.posted_notice().endswith('\nRecorded ฿950 · interest ฿90 + principal ฿410, new interest ฿53/day'))

    def test_posted_notice_wording(self):
        from mw_integration_agent.review_cycle import posted_purpose
        o=dict(options(),remainder='500',principal=[{'loanId':'L1','loanKey':'L-0398','amount':'410','dailyAfter':'53','outstandingAfter':'9590'}])
        proposal=dict(self.proposal,options=o,receipt=dict(self.proposal['receipt'],amount='950'))
        def detail(forward,principal):return json.dumps({'purpose':{'forward':forward,'principal':principal,'loans':None}})
        principal=detail(False,[{'loanId':'L1','amount':'410'}])
        self.assertEqual(posted_purpose(proposal,principal,False),'Recorded ฿950 · interest ฿90 + principal ฿410, new interest ฿53/day')
        self.assertEqual(posted_purpose(proposal,principal,True),'บันทึก ฿950 · ดอกเบี้ย ฿90 + เงินต้น ฿410 ดอกเบี้ยใหม่ ฿53/วัน')
        # No accrued interest (AG-9): the principal only.
        whole=dict(proposal,options=dict(o,principal=[dict(o['principal'][0],amount='500')]))
        self.assertEqual(posted_purpose(whole,detail(False,[{'loanId':'L1','amount':'500'}]),False),'Recorded ฿950 · principal ฿500, new interest ฿53/day')
        self.assertEqual(posted_purpose(whole,detail(False,[{'loanId':'L1','amount':'500'}]),True),'บันทึก ฿950 · เงินต้น ฿500 ดอกเบี้ยใหม่ ฿53/วัน')
        # A split approved before the R127 deploy may still post: its saved detail keeps the R112 wording.
        split=detail(True,[{'loanId':'L1','amount':'200'}])
        self.assertEqual(posted_purpose(proposal,split,False),'Recorded ฿950 · principal ฿200, the rest pays forward')
        self.assertEqual(posted_purpose(proposal,split,True),'บันทึก ฿950 · เงินต้น ฿200 ส่วนที่เหลือชำระล่วงหน้า')
        self.assertEqual(posted_purpose(proposal,detail(True,[]),False),'Recorded ฿950 · pay forward, paid through 5 Nov')

    def test_a_split_approved_before_the_deploy_still_posts_and_reports(self):
        # The R112 "3 800" reply was decided before the deploy (as the old ReviewStore.decide recorded it); it posts now.
        detail=json.dumps({'purpose':{'forward':True,'principal':[{'loanId':'L1','amount':'800'}],'loans':None}},sort_keys=True,separators=(',',':'))
        self.reply('3 800',message='old')
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner='p',decision_message='old',detail=?",(detail,))
        self.j.db.execute("INSERT INTO partner_review_replies VALUES ('old',?,'APPROVED')",(self.key,));self.j.db.commit()
        self.run_cycle();self.assertEqual(self.option_notices(),0)
        self.assertEqual(self.state(),'POSTED');self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.submit.call_args[0][1]['command']['plan']['purpose']['principal'],[{'loanId':'L1','amount':'800'}])
        self.assertTrue(self.posted_notice().endswith('\nRecorded ฿1,500 · principal ฿800, the rest pays forward'))

    def test_a_changed_purpose_plan_means_no_post(self):
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        self.reply('1')
        with patch('mw_integration_agent.review_cycle.chosen_plan',side_effect=ReceiptInvalid('PAY_FORWARD_PLAN_CHANGED')):
            self.run_cycle()
        self.assertEqual(self.state(),'STALE');self.submit.assert_not_called()

    def test_switch_off_at_execution_posts_nothing(self):
        # Fail closed: an approved options review posts only while the switch is on.
        self.reply('1');self.run_cycle()
        self.assertEqual(self.submit.call_count,1)
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',payment_id=NULL");self.j.db.commit();self.submit.reset_mock()
        self.config['pay_forward_options_enabled']=False;self.run_cycle()
        self.submit.assert_not_called();self.assertEqual(self.state(),'MANUAL_REQUIRED')

    def test_a_stale_plan_means_no_post(self):
        self.reply('1');self.current=dict(self.proposal,options=options('b'*64))   # the forecast moved after the options were shown
        self.run_cycle();self.assertEqual(self.state(),'STALE');self.submit.assert_not_called()

    def test_an_unauthorized_sender_is_ignored(self):
        self.reply('1',sender='999');self.run_cycle(sender='999')
        self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called()

    def test_a_reply_to_another_message_is_ignored(self):
        self.reply('1',reply_to='elsewhere');self.run_cycle();self.assertEqual(self.state(),'PENDING');self.submit.assert_not_called()

    def test_an_uncertain_outcome_is_never_replayed(self):
        self.submit.side_effect=RuntimeError('connection reset after the POST left');self.reply('1')
        self.run_cycle();self.assertEqual(self.submit.call_count,1);self.assertEqual(self.state(),'UNKNOWN')
        for _ in range(3):self.run_cycle()
        self.assertEqual(self.submit.call_count,1,'a later cycle reads the status; it never posts again');self.assertTrue(self.status.called)

    def test_restart_mid_execution_recovers_by_status_read(self):
        key='pwa:'+receipt_api.request_id('dev',self.key)
        self.j.db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=?,deciding_partner='p',detail=? WHERE id=?",(key,json.dumps({'purpose':{'forward':True,'principal':[],'loans':None}}),self.key));self.j.db.commit()
        self.status.return_value={'kind':'recorded','reviewId':self.key,'financialMatch':True,'originalOutcome':{'status':'posted','paymentId':key}}
        self.run_cycle();self.submit.assert_not_called();self.assertEqual(self.state(),'POSTED')

    def test_a_rejected_outcome_needs_manual_handling_and_is_not_retried(self):
        self.submit.side_effect=None;self.submit.return_value={'kind':'recorded','reviewId':self.key,'originalOutcome':{'status':'rejected','code':'selection_unavailable'}}
        self.reply('1');self.run_cycle();self.run_cycle()
        self.assertEqual(self.state(),'MANUAL_REQUIRED');self.assertEqual(self.submit.call_count,1)

    def test_three_plans_the_slip_again_from_current_charges(self):
        # Owner request, 3 November 2026: after a late fee is added in the app, 3 (R127; 4 before) supersedes the options
        # and the next planning reads the current charges. Here the new plan is a different options proposal: a
        # replacement request goes out.
        self.j.db.execute("UPDATE receipt_jobs SET result=?,created_at=? WHERE id='job'",(json.dumps({'receipt':self.proposal['receipt'],'borrower':self.b}),time.time()));self.j.db.commit()
        self.reply('3');self.current=dict(self.proposal,options=options('c'*64))
        result=self.run_cycle();self.assertEqual(result['failures'],[])
        # The legacy order plans before it reads replies, so the next run plans again; the production order (with the
        # image phase) reads replies first and plans again in the same run.
        self.assertEqual(self.run_cycle()['failures'],[])
        old=self.j.db.execute('SELECT state,job_id FROM partner_reviews WHERE id=?',(self.key,)).fetchone()
        self.assertEqual(tuple(old),('SUPERSEDED','job:superseded:'+self.key))
        new=self.j.db.execute("SELECT id,state,proposal FROM partner_reviews WHERE job_id='job'").fetchone()
        self.assertIsNotNone(new,'the receipt was planned again');self.assertEqual(new['state'],'PENDING')
        self.assertEqual(json.loads(new['proposal'])['options']['planSha256'],'c'*64)
        self.submit.assert_not_called();self.add_payment.assert_not_called()
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:
            ack=notices.db.execute("SELECT body FROM partner_notices WHERE event_key=?",('review-result:'+self.key+':RECHECK',)).fetchone()
            self.assertIsNotNone(ack);self.assertIn('Nothing has been posted yet',ack[0])
            request=notices.db.execute("SELECT body FROM partner_notices WHERE event_key=?",('review:'+new['id'],)).fetchone()
            self.assertTrue(request[0].startswith('Corrected request'),'the new request says it replaces the earlier one')
        finally:notices.close()
        self.reply('1',message='reply2');self.run_cycle()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews WHERE id=?',(self.key,)).fetchone()[0],'SUPERSEDED','a reply to the old message decides nothing')

    def test_legacy_four_is_planned_again_in_the_same_run_with_the_image_phase(self):
        # A request sent before the R127 deploy offered "4 recheck"; that reply still rechecks.
        self.j.db.execute("UPDATE receipt_jobs SET result=?,created_at=? WHERE id='job'",(json.dumps({'receipt':self.proposal['receipt'],'borrower':self.b}),time.time()));self.j.db.commit()
        self.reply('4');self.current=dict(self.proposal,options=options('d'*64))
        result=cycle(self.config,self.j,lambda *_:{'id':'456','username':'partner'},images=lambda:None)
        self.assertEqual(result['failures'],[])
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='job'").fetchone()[0],'PENDING')
        self.submit.assert_not_called()

    def test_a_recheck_after_the_charge_edit_made_the_review_stale(self):
        # The incident of 3 November 2026: a "Review" resend checked the open review against the edited charges and
        # marked it STALE (PROPOSAL_FACTS_CHANGED); the recheck that followed must still plan the slip again.
        self.j.db.execute("UPDATE receipt_jobs SET result=?,created_at=? WHERE id='job'",(json.dumps({'receipt':self.proposal['receipt'],'borrower':self.b}),time.time()))
        self.j.db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED'");self.j.db.commit()
        self.reply('3');self.current=dict(self.proposal,options=options('e'*64))
        result=cycle(self.config,self.j,lambda *_:{'id':'456','username':'partner'},images=lambda:None)
        self.assertEqual(result['failures'],[])
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews WHERE id=?',(self.key,)).fetchone()[0],'SUPERSEDED')
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='job'").fetchone()[0],'PENDING')
        self.submit.assert_not_called()

    def test_switch_off_keeps_the_overpayment_hold_and_a_reply_number_means_nothing(self):
        # Off: today's hold. The proposal is the old action; any non-approval reply rejects, and no options are ever queued.
        self.config.pop('pay_forward_options_enabled')
        self.j.db.execute("UPDATE partner_reviews SET proposal=?",(json.dumps(dict(self.proposal,action='Overpayment review',approved_allocation_method='Lump Sum',options=None),sort_keys=True,ensure_ascii=False),));self.j.db.commit()
        self.current=dict(self.proposal,action='Overpayment review',approved_allocation_method='Lump Sum')
        self.reply('1');self.run_cycle();self.submit.assert_not_called();self.assertEqual(self.option_notices(),0)
        self.assertEqual(self.state(),'REJECTED')


if __name__=='__main__':unittest.main()
