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
from mw_integration_agent import receipt_api
from mw_integration_agent.receipt_archive import Archive
REAL_RECEIPT_PAYLOAD=receipt_api.payload
REAL_DISPATCH=NoticeJournal.dispatch


class CycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.j=ReceiptJournal(self.root/'receipt-processing.db');self.addCleanup(self.j.close)
        ingress=IngressJournal(self.root/'instagram-ingress.db');ingress.close()
        self.config={'state_directory':str(self.root),'partner_review_cutoff':'2026-01-01T00:00:00+00:00','partner_review_execution_enabled':True,'receipt_payment_api_enabled':True,'receipt_environment':'dev'}
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
              ('add_payment',{'create':True}),('readback',{'return_value':True})]:  # retired transport: not imported, patched as a tripwire
            p=patch('mw_integration_agent.review_cycle.'+target,**kwargs);setattr(self,target,p.start());self.addCleanup(p.stop)
        Archive(self.config,self.j,storage=object())
        def payload(config,review,proposal,asset,automatic):
            return {'actorPartnerId':review['deciding_partner'],'command':{'requestId':receipt_api.request_id('dev',review['id']),'reviewId':review['id'],'amountReceived':proposal['receipt']['amount'],'mode':'automatic' if automatic else 'reviewed'}}
        p=patch('mw_integration_agent.receipt_api.payload',side_effect=payload);self.payload=p.start();self.addCleanup(p.stop)
        def submitted(config,body):
            return {'kind':'recorded','reviewId':body['command']['reviewId'],'financialMatch':True,'originalOutcome':{'status':'posted','paymentId':'pwa:'+body['command']['requestId']}}
        p=patch('mw_integration_agent.receipt_api.submit',side_effect=submitted);self.submit=p.start();self.addCleanup(p.stop)
        p=patch('mw_integration_agent.receipt_api.status',return_value={'kind':'unresolved'});self.status=p.start();self.addCleanup(p.stop)
        p=patch('mw_integration_agent.partner_notice.NoticeJournal.dispatch');self.dispatch=p.start();self.addCleanup(p.stop)
    def run_cycle(self):return cycle(self.config,self.j,lambda *_:{'id':'123','username':'borrower'})
    def test_resend_only_accepted_notice_can_support_posting(self):
        notices=NoticeJournal(self.root/'partner-notices.db')
        notices.db.execute("UPDATE partner_notices SET ig_status='UNAVAILABLE',email_status='SENT'")
        key=notices.reserve('review:'+self.key+':resend:'+'a'*64,self.p,'resent','resent')
        notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='resent' WHERE id=?",(key,))
        notices.db.commit();notices.close()
        self.j.db.execute("UPDATE partner_reviews SET decision_message='approval'");self.j.db.commit()
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.db.execute("INSERT INTO messages(message_id,sender_id,event_timestamp,text,captured_at,status,reply_to) VALUES ('approval','456',0,'yes',0,'CAPTURED_NO_PROCESSING','resent')")
        ingress.db.commit();ingress.close()
        self.run_cycle()
        self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')

    def test_signed_standalone_command_queues_requests_not_payment(self):
        import time
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING'");self.j.db.commit()
        self.config['review_resend_cutoff']='2026-01-01T00:00:00+00:00'
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.db.execute("INSERT INTO messages(message_id,sender_id,event_timestamp,text,captured_at,status,reply_to) VALUES (?,?,?,?,?,?,?)",
            ('command','456',time.time(),' ReViEw ',time.time(),'CAPTURED_NO_PROCESSING',''))
        ingress.db.commit();ingress.close()
        identity=lambda *_:{'id':'456','username':'partner'}
        first=cycle(self.config,self.j,identity);second=cycle(self.config,self.j,identity)
        self.assertEqual(first['failures'],[]);self.assertEqual(second['failures'],[])
        self.submit.assert_not_called()
        notices=NoticeJournal(self.root/'partner-notices.db')
        self.assertEqual(notices.db.execute("SELECT count(*) FROM partner_notices WHERE event_key LIKE 'review:%:resend:%'").fetchone()[0],1)
        notices.close()

    def test_approved_posts_once_then_result(self):
        self.run_cycle();self.run_cycle();self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')

    def test_one_directory_read_serves_reply_posting_and_result_notices(self):
        import time
        from mw_integration_agent.receipt_run import Directory
        class API:
            def __init__(self):self.calls=[]
            def request(self,path,query=None,body=None):
                self.calls.append(path)
                if path=='999/conversations':
                    return {'data':[{'participants':{'data':[{'id':'999','username':'business'},{'id':i,'username':n}]}}
                                    for i,n in (('123','borrower'),('456','partner'),('789','partner2'))]}
                if path=='999/messages':return {'message_id':'m-'+body['recipient']['id']}
                return {'id':path,'username':{'456':'partner','789':'partner2'}[path]}
        api=API();self.config.update(instagram_account_id='999',receipt_summary_enabled=True)
        self.masters.return_value['partners'].append(dict(self.p,id='p2',username='partner2'))
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING',deciding_partner=NULL");self.j.db.commit()
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.db.execute("INSERT INTO messages(message_id,sender_id,event_timestamp,text,captured_at,status,reply_to) VALUES ('approval','456',?,'yes',?,'CAPTURED_NO_PROCESSING','sent')",(time.time(),time.time()))
        ingress.db.commit();ingress.close()
        directory=Directory(self.config,api)
        with patch.object(NoticeJournal,'dispatch',new=lambda journal,item,config,rows,**kw:REAL_DISPATCH(journal,item,config,rows,api=api,**kw)):
            result=cycle(self.config,self.j,directory.identity,directory.recipient)
        self.assertEqual(result['failures'],[])
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')
        self.assertEqual(api.calls.count('999/conversations'),1)
        self.assertEqual(sorted(c for c in api.calls if c.isdigit()),['456','789'])
        self.assertEqual(api.calls.count('999/messages'),2)

    def test_results_of_this_run_lead_capped_delivery(self):
        old=self.store.reserve('job3',dict(self.proposal,receipt=dict(self.proposal['receipt'],reference='OLD')))
        self.j.db.execute("UPDATE partner_reviews SET state='REJECTED' WHERE id=?",(old,));self.j.db.commit()
        pending=self.store.reserve('job2',dict(self.proposal,receipt=dict(self.proposal['receipt'],reference='OTHER')))
        notices=NoticeJournal(self.root/'partner-notices.db')
        notices.reserve('review:'+pending,self.p,'s','b')
        for i in range(3):notices.reserve(f'review-command-result:m{i}',self.p,'s','b')
        notices.close()
        self.run_cycle()
        order=[c.args[0]['event_key'] for c in self.dispatch.call_args_list]
        self.assertEqual(order[:2],['review-result:'+self.key+':POSTED','review-result:'+old+':REJECTED'])
        self.assertTrue(all(k.startswith('review-command-result:') for k in order[2:5]))
        self.assertEqual(order[5:],['review:'+pending])
        self.dispatch.reset_mock()
        notices=NoticeJournal(self.root/'partner-notices.db')
        for i in range(8):notices.reserve(f'review-command-result:n{i}',self.p,'s','b')
        notices.close();self.run_cycle()
        self.assertEqual(self.dispatch.call_count,6)

    def test_not_sent_returns_review_to_approved_and_resubmits_same_request_id(self):
        # AGT-SEND-03: a command that never reached the API releases the claim; the next cycle re-submits
        # under the same deterministic requestId. Nothing else about the row changes.
        expected='pwa:'+receipt_api.request_id('dev',self.key)
        submitted=self.submit.side_effect
        for code in ('RECEIPT_API_NOT_SENT_TOKEN','RECEIPT_API_NOT_SENT_401','RECEIPT_API_NOT_SENT_403'):
            with self.subTest(code=code):
                self.j.db.execute('UPDATE receipt_jobs SET retry_after=0');self.j.db.commit()
                self.submit.side_effect=receipt_api.NotSent(code)
                result=self.run_cycle()
                self.assertIn({'stage':'submit','exception':code},result['failures'])
                row=self.j.db.execute('SELECT state,payment_id,deciding_partner FROM partner_reviews').fetchone()
                self.assertEqual(tuple(row),('APPROVED',None,'p'))
                self.status.assert_not_called();self.readback.assert_not_called()
        self.assertEqual(self.submit.call_count,3)
        self.j.db.execute('UPDATE receipt_jobs SET retry_after=0');self.j.db.commit()
        self.assertEqual({c.args[1]['command']['requestId'] for c in self.submit.call_args_list},{expected.removeprefix('pwa:')})
        self.submit.side_effect=submitted
        self.assertEqual(self.run_cycle()['failures'],[])
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()),('POSTED',expected))
        self.assertEqual(self.submit.call_count,4)

    def test_not_sent_retry_is_bounded_to_fifteen_minutes(self):
        import time
        from mw_integration_agent.review_cycle import NOT_SENT_RETRY_SECONDS
        self.assertEqual(NOT_SENT_RETRY_SECONDS,900)
        self.submit.side_effect=receipt_api.NotSent('RECEIPT_API_NOT_SENT_403')
        before=time.time();self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1)  # two cycles inside the window: one submit
        job=self.j.db.execute('SELECT retry_after,detail,status FROM receipt_jobs').fetchone()
        self.assertGreaterEqual(job['retry_after'],before+900);self.assertEqual((job['detail'],job['status']),('RECEIPT_API_NOT_SENT_403','REVIEW_REQUESTED'))
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id FROM partner_reviews').fetchone()),('APPROVED',None))
        self.j.db.execute('UPDATE receipt_jobs SET retry_after=?',(time.time()-1,));self.j.db.commit()  # window elapsed
        self.run_cycle()
        self.assertEqual(self.submit.call_count,2)
        self.assertEqual({c.args[1]['command']['requestId'] for c in self.submit.call_args_list},{receipt_api.request_id('dev',self.key)})

    def test_not_sent_keeps_the_automatic_policy_marker(self):
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.config.update(receipt_auto_payment_enabled=True,receipt_auto_payment_cutoff='2026-01-01T00:00:00+00:00',receipt_auto_actor_partner_id='auto')
        self.j.db.execute("UPDATE partner_reviews SET deciding_partner='auto',detail=?",(AUTO_POLICY,))
        self.j.db.execute('UPDATE receipt_jobs SET created_at=?',(2000000000,));self.j.db.commit()
        self.masters.return_value['partners'].append({'id':'auto','username':'auto','enabled':True,'language':'English'})
        self.submit.side_effect=receipt_api.NotSent('RECEIPT_API_NOT_SENT_401')
        self.run_cycle()
        self.assertEqual(tuple(self.j.db.execute('SELECT state,payment_id,detail FROM partner_reviews').fetchone()),('APPROVED',None,AUTO_POLICY))
        self.j.db.execute('UPDATE receipt_jobs SET retry_after=0');self.j.db.commit()
        self.submit.side_effect=None
        self.submit.return_value={'kind':'recorded','reviewId':self.key,'financialMatch':True,'originalOutcome':{'status':'posted','paymentId':'pwa:'+receipt_api.request_id('dev',self.key)}}
        self.run_cycle()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')
        self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
    def test_unknown_never_retries_add(self):
        self.submit.side_effect=TimeoutError();self.readback.return_value=False
        self.run_cycle();self.run_cycle();self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'UNKNOWN')
    def test_changed_facts_no_write(self):
        self.plan.return_value={'changed':True};self.run_cycle();self.submit.assert_not_called()
    def test_manual_no_write_even_approved(self):
        self.proposal['action']='Loan Close'
        self.j.db.execute('UPDATE partner_reviews SET proposal=?',(json.dumps(self.proposal),));self.j.db.commit()
        self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'MANUAL_REQUIRED')

    def overpayment(self,new_policy=True):
        self.proposal['action']='Overpayment review'
        if new_policy:self.proposal['approved_allocation_method']='Lump Sum'
        self.j.db.execute('UPDATE partner_reviews SET proposal=?',(json.dumps(self.proposal),));self.j.db.commit()

    def test_approved_overpayment_posts_full_amount_once(self):
        self.overpayment();self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1)
        self.assertTrue(self.submit.call_args.args[0]['_receipt_reviewer_approved'])
        self.assertEqual(self.payload.call_args.args[2]['receipt']['amount'],'100.00')
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'POSTED')

    def test_old_manual_only_overpayment_approval_stays_manual(self):
        self.overpayment(False);self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'MANUAL_REQUIRED')

    def test_overpayment_pending_rejected_or_automatic_never_posts(self):
        self.overpayment()
        for state in ('PENDING','REJECTED'):
            self.j.db.execute('UPDATE partner_reviews SET state=?',(state,));self.j.db.commit()
            self.run_cycle();self.submit.assert_not_called()
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',detail=?",(AUTO_POLICY,));self.j.db.commit()
        self.run_cycle();self.submit.assert_not_called()

    def test_overpayment_unknown_never_repeats_add(self):
        self.overpayment();self.readback.return_value=False
        self.submit.side_effect=TimeoutError()
        self.run_cycle();self.run_cycle();self.assertEqual(self.submit.call_count,1)

    def test_overpayment_changed_facts_or_reviewer_removed_blocks_add(self):
        self.overpayment();self.plan.return_value={'changed':True}
        self.run_cycle();self.submit.assert_not_called()
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED'");self.j.db.commit()
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.submit.assert_not_called()
    def test_disabled_execution_no_write(self):
        self.config['partner_review_execution_enabled']=False;self.run_cycle();self.submit.assert_not_called()
    def test_reviewer_removed_after_approval_no_write(self):
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.submit.assert_not_called()
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
        self.assertEqual(self.submit.call_count,1)
        self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
        self.assertEqual(self.submit.call_args.args[1]['actorPartnerId'],'p')
        row=self.j.db.execute("SELECT id,state,decision_message FROM partner_reviews WHERE job_id='new-job'").fetchone()
        self.assertEqual(row['state'],'POSTED');self.assertIsNone(row['decision_message'])
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertIsNone(notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=?',('review:'+row['id'],)).fetchone())
        finally:notices.close()

    def test_auto_unknown_never_repeats_payment(self):
        self.validated_job();self.enable_auto();self.readback.return_value=False
        self.submit.side_effect=TimeoutError()
        self.run_cycle();self.run_cycle();self.assertEqual(self.submit.call_count,1)

    def test_real_plan_partial_charge_above_small_principal_uses_automatic_executor(self):
        from mw_integration_agent.review_proposal import plan
        self.proposal['receipt']['amount']='1500.00'
        day=self.proposal['receipt']['date']
        self.facts.return_value={'loans':[
            {'id':key,'loan_key':key,'status':'ยังไม่ปิดยอด','type':'ดอกเบี้ยรายวัน',
             'auto':True,'principal':principal,'daily':'100','date':day}
            for key,principal in [('large','5000'),('small','1000')]],
            'charges':[{'loan':key,'date':day,'principal':'0','interest':amount}
                       for key,amount in [('large','2000'),('small','0')]]}
        self.plan.side_effect=plan
        self.validated_job();self.enable_auto();self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.payload.call_args.args[2]['action'],'Lump Sum')
        self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
        row=self.j.db.execute("SELECT state,decision_message FROM partner_reviews WHERE job_id='new-job'").fetchone()
        self.assertEqual(row['state'],'POSTED');self.assertIsNone(row['decision_message'])

    def test_auto_manual_actions_still_request_review(self):
        for action in ('Loan Close','Overpayment review'):
            with self.subTest(action=action):
                self.proposal['action']=action
                # Pure policy check ensures no manual action is auto-authorized.
                from mw_integration_agent.review_cycle import automatic_payment
                self.enable_auto()
                self.assertFalse(automatic_payment(self.config,{'created_at':9999999999},self.proposal))
        self.validated_job();self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='new-job'").fetchone()[0],'PENDING')

    def test_auto_duplicate_or_changed_facts_blocks_post(self):
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        self.validated_job();self.enable_auto()
        self.check.side_effect=[None,ReceiptInvalid('PAYMENT_ALREADY_RECORDED')]
        self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='new-job'").fetchone()[0],'STALE')

    def test_auto_repeated_amount_with_different_reference_posts_once(self):
        from mw_integration_agent.payment_match import check
        self.validated_job();self.enable_auto();self.check.side_effect=check
        r=self.proposal['receipt']
        earlier={'status':'Posted','borrower':'b','amount':r['amount'],'date':r['date'],
                 'account':'a','reference':'OTHERREF','minute':r['date']+' '+r['time']}
        with patch('mw_integration_agent.payment_match.read_query',return_value=[earlier]):
            self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1)

    def test_auto_same_reference_never_posts_again(self):
        from mw_integration_agent.payment_match import check
        self.validated_job();self.enable_auto();self.check.side_effect=check
        r=self.proposal['receipt']
        earlier={'status':'Posted','borrower':'b','amount':r['amount'],'date':r['date'],
                 'account':'a','reference':r['reference'],'minute':None}
        with patch('mw_integration_agent.payment_match.read_query',return_value=[earlier]):
            self.run_cycle();self.run_cycle()
        self.submit.assert_not_called()

    def held_job(self):
        self.validated_job()
        self.config['receipt_hold_notice_cutoff']='2026-01-01T00:00:00+00:00'
        self.j.db.execute("UPDATE receipt_jobs SET status='REVIEW',detail='POSSIBLE_EXISTING_PAYMENT_REVIEW'")
        self.j.db.commit()

    def hold_notices(self):
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:return [dict(r) for r in notices.db.execute("SELECT * FROM partner_notices WHERE event_key LIKE 'receipt-held:%'")]
        finally:notices.close()

    def test_held_receipt_notifies_only_reviewer_once_and_never_posts(self):
        self.held_job();self.masters.return_value['partners'].append(dict(self.p,id='other'))
        self.run_cycle();self.run_cycle()
        rows=self.hold_notices();self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['partner_id'],'p');self.assertIn('bank reference',rows[0]['body'])
        self.assertIn('cannot post',rows[0]['body']);self.submit.assert_not_called()
        self.assertIsNone(self.j.db.execute("SELECT 1 FROM partner_reviews WHERE job_id='new-job'").fetchone())
        from mw_integration_agent.partner_notice import display_notice
        self.assertTrue(display_notice(rows[0])[0].startswith('⚠️'))

    def test_unresolved_old_hold_is_surfaced_without_replaying_and_missing_reviewer_waits(self):
        self.held_job();self.config['receipt_hold_notice_cutoff']='2099-01-01T00:00:00+00:00'
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.assertEqual(self.hold_notices(),[])
        self.masters.return_value['reviewer_ids']=['p']
        self.run_cycle();self.assertEqual(len(self.hold_notices()),1)
        self.submit.assert_not_called()

    def test_readback_outage_keeps_unknown_and_still_queues_reconciliation_notice(self):
        self.readback.side_effect=RuntimeError('private response')
        result=self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,1)
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'UNKNOWN')
        self.assertTrue(result['failures'])
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:self.assertEqual(notices.db.execute("SELECT count(*) FROM partner_notices WHERE event_key LIKE 'review-result:%:UNKNOWN'").fetchone()[0],1)
        finally:notices.close()

    def test_malformed_job_does_not_block_other_automatic_payment(self):
        self.validated_job();self.enable_auto()
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,result) VALUES ('bad','bad','123','','VALIDATED',9999999999,'not-json')");self.j.db.commit()
        result=self.run_cycle()
        self.assertEqual(self.submit.call_count,1);self.assertTrue(result['failures'])
        self.assertEqual(self.j.db.execute("SELECT status FROM receipt_jobs WHERE id='bad'").fetchone()[0],'REVIEW')

    def test_interrupted_reservation_with_changed_facts_becomes_stale(self):
        self.j.db.execute("UPDATE receipt_jobs SET status='VALIDATED',created_at=9999999999,result=?",(json.dumps({'receipt':self.proposal['receipt'],'borrower':self.b}),))
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING'");self.j.db.commit()
        self.plan.return_value=dict(self.proposal,facts={'changed':True})
        self.run_cycle();self.submit.assert_not_called()
        self.assertEqual(self.j.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'STALE')
        self.assertEqual(self.j.db.execute('SELECT status FROM receipt_jobs').fetchone()[0],'REVIEW_REQUESTED')

    def test_partial_cycle_failure_has_nonzero_service_exit(self):
        from mw_integration_agent.cli import build_parser,execute
        args=build_parser().parse_args(['receipt-cycle','--config','unused','--catalogue','unused'])
        with patch('mw_integration_agent.receipt_run.run',return_value={'failures':[{'stage':'delivery'}]}),patch('builtins.print'):
            self.assertEqual(execute(args),2)

    def test_broken_saved_payload_and_identity_outage_still_alert(self):
        self.held_job()
        self.j.db.execute("UPDATE receipt_jobs SET result='not-json'");self.j.db.commit()
        with patch('mw_integration_agent.receipt_hold.receipt_borrower',side_effect=RuntimeError('unavailable')):
            self.run_cycle()
        self.assertEqual(len(self.hold_notices()),1);self.submit.assert_not_called()

    def test_notice_failure_does_not_block_other_partner(self):
        self.masters.return_value['partners'].append(dict(self.p,id='other',username='other'))
        self.dispatch.side_effect=[RuntimeError('unavailable'),None]
        result=self.run_cycle()
        self.assertEqual(self.dispatch.call_count,2);self.assertEqual(result['failures'],[])
        self.assertTrue(result['notification_failures'])

    def test_removed_reviewer_cannot_receive_queued_hold(self):
        self.held_job();self.run_cycle();self.dispatch.reset_mock()
        self.masters.return_value['reviewer_ids']=[]
        self.run_cycle();self.dispatch.assert_not_called()
        self.assertEqual(self.hold_notices()[0]['ig_status'],'REVIEW')

    def test_resolved_hold_suppresses_queued_alert(self):
        self.held_job();self.run_cycle();self.dispatch.reset_mock()
        self.j.db.execute("UPDATE receipt_jobs SET status='DUPLICATE'");self.j.db.commit()
        self.run_cycle();self.dispatch.assert_not_called()
        self.assertEqual(self.hold_notices()[0]['ig_status'],'REVIEW')

    def test_unverified_identity_and_unreadable_extraction_still_alert_reviewer(self):
        self.held_job();self.p['language']='ไทย'
        self.j.db.execute("UPDATE receipt_jobs SET result=?,detail='AMOUNT_UNREADABLE'",(json.dumps({'extraction':{'amount':None}}),));self.j.db.commit()
        from mw_integration_agent.config import ConfigurationError
        with patch('mw_integration_agent.receipt_hold.receipt_borrower',side_effect=ConfigurationError('unavailable')):
            self.run_cycle()
        row=self.hold_notices()[0];self.assertIn('อ่านจำนวนเงิน',row['body']);self.assertIn('ไม่ทราบ',row['body'])
        self.assertLess(len(row['body']),1000);self.submit.assert_not_called()

    def test_auto_no_conversion_of_old_pending_review(self):
        self.enable_auto()
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING'");self.j.db.commit()
        self.run_cycle();self.submit.assert_not_called()

    def test_auto_disabled_after_reservation_does_not_post(self):
        self.enable_auto()
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.j.db.execute('UPDATE partner_reviews SET detail=?',(AUTO_POLICY,));self.j.db.commit()
        self.config['receipt_auto_payment_enabled']=False
        self.run_cycle();self.submit.assert_not_called()

    def test_auto_cutoff_keeps_earlier_validated_receipt_in_review(self):
        self.validated_job();self.enable_auto();self.config['receipt_auto_payment_cutoff']='2099-01-01T00:00:00+00:00'
        self.run_cycle();self.submit.assert_not_called()

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
        self.submit.assert_not_called()
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

    def test_closed_ig_and_locked_email_do_not_block_next_receipt_or_duplicate_post(self):
        from mw_integration_agent.graph_email import EmailRejected
        from mw_integration_agent.instagram import InstagramAPIError
        from unittest.mock import Mock
        self.config.update(receipt_summary_enabled=True,email_fallback_enabled=True,instagram_account_id='123')
        mailer=Mock();mailer.send.side_effect=EmailRejected('account locked')
        # R058: no local gate; the provider's explicit window rejection is the only email trigger.
        api=Mock();api.request.side_effect=InstagramAPIError(400,10,2534022,window_expired=True)
        self.dispatch.side_effect=lambda journal,item,config,rows,**_: REAL_DISPATCH(
            journal,item,config,rows,api=api,mailer=mailer,
            resolver=lambda *_:'456')
        # Bound methods require autospec when replacing the class method.
        with patch.object(NoticeJournal,'dispatch',new=self.dispatch.side_effect):
            self.run_cycle()
            self.assertEqual(self.submit.call_count,1)
            self.validated_job();self.enable_auto()
            self.run_cycle();self.run_cycle()
        self.assertEqual(self.submit.call_count,2)
        self.assertEqual(self.j.db.execute("SELECT state FROM partner_reviews WHERE job_id='new-job'").fetchone()[0],'POSTED')
        notices=NoticeJournal(self.root/'partner-notices.db')
        self.addCleanup(notices.close)
        rows=notices.db.execute("SELECT * FROM partner_notices WHERE event_key LIKE 'review-result:%'").fetchall()
        self.assertEqual(len(rows),2)
        self.assertTrue(all(n['ig_status']=='WINDOW_EXPIRED' and n['email_status']=='REJECTED' and n['attempts']==1 for n in rows))
        self.assertEqual(mailer.send.call_count,2) # backoff, no immediate retry

    def test_optional_failure_does_not_fail_service_exit(self):
        from mw_integration_agent.cli import build_parser,execute
        args=build_parser().parse_args(['receipt-cycle','--config','unused','--catalogue','unused'])
        with patch('mw_integration_agent.receipt_run.run',return_value={'failures':[],
                  'notification_failures':[{'stage':'delivery'}]}),patch('builtins.print'):
            self.assertEqual(execute(args),0)

    def test_notification_preparation_failure_does_not_reopen_posting(self):
        with patch('mw_integration_agent.review_cycle.notify',side_effect=RuntimeError('private')):
            result=self.run_cycle();self.run_cycle()
        self.assertEqual(result['failures'],[])
        self.assertEqual(result['notification_failures'],[{'stage':'notification-cycle','exception':'RuntimeError'}])
        self.assertEqual(self.submit.call_count,1)

    def test_delivery_backlog_bounded_and_failed_item_deferred(self):
        self.masters.return_value['partners'].extend(dict(self.p,id=str(i)) for i in range(11))
        self.dispatch.side_effect=RuntimeError('unavailable')
        self.run_cycle()
        self.assertEqual(self.dispatch.call_count,6)
        first={call.args[0]['id'] for call in self.dispatch.call_args_list}
        self.dispatch.reset_mock();self.run_cycle()
        self.assertEqual(self.dispatch.call_count,6)
        second={call.args[0]['id'] for call in self.dispatch.call_args_list}
        self.assertFalse(first & second)

    def identity(self,*_):return {'id':'123','username':'borrower'}
    def review(self,job='job'):return self.j.db.execute('SELECT * FROM partner_reviews WHERE job_id=?',(job,)).fetchone()
    def notice_rows(self,prefix):
        notices=NoticeJournal(self.root/'partner-notices.db')
        try:return [dict(r) for r in notices.db.execute('SELECT * FROM partner_notices WHERE event_key LIKE ?',(prefix+'%',))]
        finally:notices.close()

    def test_images_run_after_approvals_in_one_run(self):
        order=[];submitted=self.submit.side_effect
        self.submit.side_effect=lambda c,b:(order.append('post'),submitted(c,b))[1]
        cycle(self.config,self.j,self.identity,images=lambda:order.append('image'))
        self.assertEqual(order,['post','image'])

    def test_phase_order_legacy_and_with_images(self):
        from mw_integration_agent.review_cycle import Run
        order=[]
        names=('expire','propose_validated','decide_replies','execute_approved','notify')
        patches=[patch.object(Run,n,lambda self,n=n:order.append(n)) for n in names]
        for p in patches:p.start();self.addCleanup(p.stop)
        cycle(self.config,self.j,self.identity)
        self.assertEqual(order,list(names));order.clear()
        cycle(self.config,self.j,self.identity,images=lambda:order.append('images'))
        self.assertEqual(order,['expire','decide_replies','execute_approved','notify','images','propose_validated','execute_approved','notify'])

    def test_second_execute_pass_does_not_reconcile_unknown_twice(self):
        self.j.db.execute("UPDATE partner_reviews SET state='UNKNOWN',payment_id=?",('pwa:'+receipt_api.request_id('dev',self.key),));self.j.db.commit()
        cycle(self.config,self.j,self.identity,images=lambda:None)
        self.assertEqual(self.status.call_count,1)

    def test_automatic_review_from_image_phase_posts_in_same_run(self):
        self.enable_auto();self.j.db.execute("UPDATE partner_reviews SET state='POSTED'");self.j.db.commit()
        cycle(self.config,self.j,self.identity,images=self.validated_job)
        self.assertEqual(self.review('new-job')['state'],'POSTED');self.assertEqual(self.submit.call_count,1)
        self.assertEqual(len(self.notice_rows('review-result:'+self.review('new-job')['id'])),1)

    def test_charge_raised_then_approved_posts_with_note_and_saved_proposal_hash(self):
        self.plan.return_value=dict(self.proposal,facts={'charges':['raised']},loan_keys=['changed'])
        self.run_cycle()
        row=self.review()
        self.assertEqual((row['state'],row['detail']),('POSTED','FACTS_CHANGED_SAME_OUTCOME'))
        self.assertEqual(self.payload.call_args.args[2],self.proposal)
        self.assertEqual(self.submit.call_args.args[0]['_receipt_facts_outcome'],'FACTS_CHANGED_SAME_OUTCOME')
        self.assertIn('Note: loan details were updated after approval',self.notice_rows('review-result:')[0]['body'])

    def test_unchanged_facts_post_without_note(self):
        self.run_cycle()
        self.assertEqual(self.review()['detail'],'');self.assertNotIn('_receipt_facts_outcome',self.submit.call_args.args[0])
        self.assertNotIn('Note:',self.notice_rows('review-result:')[0]['body'])

    def test_label_only_change_posts_without_note(self):
        loan={'id':'loan','principal':'90','loan_key':'old label'}
        self.proposal['facts']={'loans':[loan],'charges':[]};self.proposal['loan_keys']=['old label']
        self.j.db.execute('UPDATE partner_reviews SET proposal=?',(json.dumps(self.proposal,sort_keys=True,ensure_ascii=False),));self.j.db.commit()
        self.plan.return_value=dict(self.proposal,facts={'loans':[dict(loan,loan_key='new label')],'charges':[]},loan_keys=['new label'])
        self.run_cycle()
        row=self.review();self.assertEqual((row['state'],row['detail']),('POSTED',''))
        self.assertNotIn('_receipt_facts_outcome',self.submit.call_args.args[0])
        self.assertNotIn('Note:',self.notice_rows('review-result:')[0]['body'])

    def test_reviewer_approval_survives_fresh_overpayment(self):
        self.plan.return_value=dict(self.proposal,action='Overpayment review',approved_allocation_method='Lump Sum',facts={'c':1})
        self.run_cycle();self.assertEqual(self.review()['state'],'POSTED')

    def test_fresh_loan_close_ends_manual_required_with_result_notice(self):
        self.plan.return_value=dict(self.proposal,action='Loan Close',loan_id='loan',facts={'c':1})
        self.run_cycle();self.submit.assert_not_called()
        row=self.review();self.assertEqual((row['state'],row['detail']),('MANUAL_REQUIRED','LOAN_CLOSE_REQUIRED'))
        self.assertIn('this payment now closes the loan',self.notice_rows('review-result:')[0]['body'])

    def auto_review(self):
        import time
        from mw_integration_agent.review_cycle import AUTO_POLICY
        self.enable_auto();self.j.db.execute("UPDATE partner_reviews SET detail=?",(AUTO_POLICY,))
        self.j.db.execute("UPDATE receipt_jobs SET created_at=?",(time.time(),));self.j.db.commit()
        return AUTO_POLICY

    def test_automatic_fresh_overpayment_or_changed_borrower_stays_stale(self):
        AUTO_POLICY=self.auto_review()
        for fresh in (dict(self.proposal,action='Overpayment review',approved_allocation_method='Lump Sum'),
                      dict(self.proposal,borrower=dict(self.b,id='other'))):
            with self.subTest(fresh=fresh['action']):
                self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',detail=?,payment_id=NULL",(AUTO_POLICY,));self.j.db.commit()
                self.plan.return_value=fresh;self.run_cycle()
                row=self.review();self.assertEqual((row['state'],row['detail']),('STALE','PROPOSAL_FACTS_CHANGED'))
        self.submit.assert_not_called()

    def test_automatic_same_outcome_keeps_policy_marker(self):
        AUTO_POLICY=self.auto_review()
        self.plan.return_value=dict(self.proposal,facts={'c':1});self.run_cycle()
        self.assertEqual(self.submit.call_count,1);self.assertTrue(self.submit.call_args.args[0]['_receipt_automatic'])
        self.assertEqual(self.review()['detail'],AUTO_POLICY+':FACTS_CHANGED_SAME_OUTCOME')

    def test_not_sent_after_facts_change_keeps_auto_marker(self):
        AUTO_POLICY=self.auto_review()
        self.plan.return_value=dict(self.proposal,facts={'c':1})
        self.submit.side_effect=receipt_api.NotSent('RECEIPT_API_NOT_SENT_401')
        self.run_cycle()
        row=self.review();self.assertEqual((row['state'],row['detail'],row['payment_id']),('APPROVED',AUTO_POLICY,None))

    def undelivered_request(self):
        self.j.db.execute("UPDATE partner_reviews SET state='PENDING',deciding_partner=NULL");self.j.db.commit()
        notices=NoticeJournal(self.root/'partner-notices.db')
        notices.db.execute("UPDATE partner_notices SET ig_status='PENDING',message_id=NULL");notices.db.commit();notices.close()
        self.facts.return_value={'c':1}

    def test_undelivered_request_sent_after_same_outcome_edit(self):
        self.undelivered_request();self.plan.return_value=dict(self.proposal,facts={'c':1})
        self.run_cycle()
        self.assertEqual(self.review()['state'],'PENDING')
        self.assertEqual([c.args[0]['event_key'] for c in self.dispatch.call_args_list],['review:'+self.key])

    def test_undelivered_request_stale_when_fresh_is_loan_close(self):
        self.undelivered_request();self.plan.return_value=dict(self.proposal,action='Loan Close',facts={'c':1})
        self.run_cycle()
        row=self.review();self.assertEqual((row['state'],row['detail']),('STALE','PROPOSAL_FACTS_CHANGED'))
        self.assertNotIn('review:'+self.key,[c.args[0]['event_key'] for c in self.dispatch.call_args_list])

    def test_archive_pending_alert_queued_once_per_reason_and_resolved_guard(self):
        import time
        self.config.update(receipt_hold_notice_cutoff='2026-01-01T00:00:00+00:00',receipt_archive_alert_seconds=3600)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,detail,created_at) VALUES ('slow','slow','123','https://cdn.invalid/x','PENDING','RECEIPT_ARCHIVE_PENDING',?)",(time.time()-7200,))
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,detail,created_at) VALUES ('fresh','fresh','123','https://cdn.invalid/y','PENDING','RECEIPT_ARCHIVE_PENDING',?)",(time.time()-60,))
        self.j.db.execute("INSERT INTO receipt_assets(receipt_id,job_id,source,archive_state,attempts,last_error_code) VALUES ('r','slow','{}','SOURCE_PENDING',9,'RECEIPT_DOWNLOAD_FAILED')")
        self.j.db.commit()
        self.run_cycle();self.run_cycle()
        rows=self.notice_rows('receipt-archive-pending:')
        self.assertEqual([r['event_key'] for r in rows],['receipt-archive-pending:slow:RECEIPT_DOWNLOAD_FAILED'])
        self.assertIn('for over 1 hour(s)',rows[0]['body']);self.assertIn('Borrower: Test',rows[0]['body'])
        from mw_integration_agent.partner_notice import display_notice
        self.assertTrue(display_notice(rows[0])[0].startswith('⌛'))
        job=self.j.db.execute("SELECT status,url FROM receipt_jobs WHERE id='slow'").fetchone()
        self.assertEqual(tuple(job),('PENDING','https://cdn.invalid/x'))
        self.assertIn(rows[0]['event_key'],[c.args[0]['event_key'] for c in self.dispatch.call_args_list])
        self.j.db.execute("UPDATE receipt_jobs SET status='VALIDATED',detail='' WHERE id='slow'");self.j.db.commit()
        self.dispatch.reset_mock();self.run_cycle()
        self.assertNotIn(rows[0]['event_key'],[c.args[0]['event_key'] for c in self.dispatch.call_args_list])
        self.assertEqual(self.notice_rows('receipt-archive-pending:')[0]['detail'],'ARCHIVE_RESOLVED_OR_REVIEWER_REMOVED')

    def test_master_lookup_failure_backs_off_one_receipt_and_next_is_processed(self):
        from mw_integration_agent.receipt_run import run
        self.config.update(receipt_activation_cutoff='2026-01-01T00:00:00+00:00',partner_review_enabled=True)
        for name,stamp in [('first',2),('second',3)]:
            self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES (?,?,?,'','PENDING',?)",(name,name,'123',stamp))
        self.j.db.commit()
        def processed(job,journal,*args,**kwargs):journal.mark(job['id'],'IGNORED','SYNTHETIC_TEST')
        with patch('mw_integration_agent.receipt_run.controls',return_value=self.config), \
             patch('mw_integration_agent.receipt_run.masters',side_effect=[RuntimeError('unavailable'),{}]), \
             patch('mw_integration_agent.receipt_run.process',side_effect=processed) as process, \
             patch('mw_integration_agent.review_cycle.cycle',side_effect=lambda c,j,i,r=None,images=None:(images and images()) or {'failures':[]}):
            run('unused','unused');run('unused','unused')
        self.assertEqual(process.call_count,1)
        self.assertEqual(process.call_args.args[0]['id'],'second')
        first=self.j.db.execute("SELECT status,attempts,retry_after FROM receipt_jobs WHERE id='first'").fetchone()
        self.assertEqual((first['status'],first['attempts']),('PENDING',0))
        self.assertGreater(first['retry_after'],0)
