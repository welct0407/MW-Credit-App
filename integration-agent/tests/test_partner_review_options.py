"""R112: the numbered reply grammar and the options request text (new file; Byte owns the code).
D7: no default. Nothing posts without a numbered reply; any other text asks again; a decision is final; only the exact
authorized Reviewer replying to the exact options message counts. """
import json
import sqlite3
import unittest
from mw_integration_agent.partner_review import ReviewStore,request_text

PROPOSAL={'action':'Pay forward options','receipt':{'amount':'1500','date':'2026-11-03','time':'12:10','reference':'T','account_id':'a','account_label':'Test'},
          'borrower':{'id':'b','name_en':'Manee','name_th':'มาณี'},'loan_keys':['L-0398'],'facts':{},'planned_on':'2026-11-03',
          'options':{'planSha256':'a'*64,'dueTotal':'300','remainder':'1200','forward':{'first':'2026-11-04','last':'2026-11-05','through':'2026-11-05','uncovered':'0'},
                     'principal':[{'loanId':'L1','loanKey':'L-0398','amount':'1200','dailyAfter':'66','outstandingAfter':'1133'}],'blocked':[]}}


def purpose(row):
    return json.loads(row['detail'])['purpose']   # the decision's detail is {"purpose": {forward, principal, loans}}


class OptionsReplyTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
        self.store=ReviewStore(self.db);self.key=self.store.reserve('job',PROPOSAL,100)
        self.db.executescript('''CREATE TABLE receipt_jobs(id TEXT PRIMARY KEY,status TEXT,detail TEXT,result TEXT,attempts INTEGER,retry_after REAL);
          CREATE TABLE receipt_reconsiderations(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL);
          INSERT INTO receipt_jobs VALUES ('job','REVIEW_REQUESTED','RECEIPT_PROCESSING_STARTED','{}',1,0);''')
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        self.notice={'ig_status':'ACCEPTED','event_key':'review:'+self.key,'message_id':'out','recipient_id':'123','partner_id':'p','partner':json.dumps(self.p)}
        self.event={'reply_to':'out','sender_id':'123','message_id':'in','event_timestamp':110,'text':'1'}
        self.identity={'id':'123','username':'partner'}
    def decide(self,text=None,**over):
        event=dict(self.event,text=self.event['text'] if text is None else text,**over)
        return self.store.decide(event,over.get('notice') or self.notice,[self.p],self.identity,120,reviewer_ids=['p'])
    def row(self):return self.db.execute('SELECT * FROM partner_reviews WHERE id=?',(self.key,)).fetchone()

    def test_nothing_is_decided_without_a_reply(self):
        self.assertEqual(self.row()['state'],'PENDING')
        self.assertEqual(self.store.decide(dict(self.event,text='1'),self.notice,[self.p],self.identity,100000,reviewer_ids=['p']),'EXPIRED')
        self.assertEqual(self.row()['state'],'EXPIRED')

    def test_the_numbered_replies(self):
        self.assertEqual(self.decide('1'),'APPROVED');self.assertEqual(self.row()['state'],'APPROVED')
        self.assertTrue(purpose(self.row())['forward'] is True);self.assertEqual(purpose(self.row())['principal'],[])

    def test_two_with_one_loan_is_principal(self):
        self.assertEqual(self.decide('2'),'APPROVED');p=purpose(self.row())
        self.assertEqual([x['loanId'] for x in p['principal']],['L1']);self.assertFalse(p['forward'])

    def test_three_with_an_amount_splits(self):
        self.assertEqual(self.decide('3 800'),'APPROVED');p=purpose(self.row())
        self.assertTrue(p['forward']);self.assertEqual(p['principal'][0]['amount'],'800')

    def test_unclear_replies_ask_again_and_decide_nothing(self):
        for index,text in enumerate(('maybe','Yes','approve','อนุมัติ','3','3 0','3 -5','3 abc','3 1200','3 1300','5','0','1 2','')):
            with self.subTest(text=text):
                self.assertEqual(self.decide(text,message_id=f'm{index}'),'OPTIONS_REQUIRED')
                self.assertEqual(self.row()['state'],'PENDING')

    def test_yes_is_not_an_implicit_approval_of_the_options(self):
        # The old approval words approve a plain overpayment; here they must not pick a purpose (D7).
        self.assertEqual(self.decide('Yes'),'OPTIONS_REQUIRED');self.assertEqual(self.row()['payment_id'],None)

    def test_reject_still_drops_the_slip(self):
        self.assertEqual(self.decide('Reject'),'REJECTED');self.assertEqual(self.row()['state'],'REJECTED')

    def test_four_rechecks_the_slip_from_current_charges(self):
        # Owner request, 3 November 2026: edit the charges in the app (a late fee), then reply 4 to plan the slip again.
        for text in ('4','Recheck','ตรวจใหม่'):
            with self.subTest(text=text):
                self.setUp()   # a fresh pending review per word
                self.assertEqual(self.decide(text),'RECHECK_QUEUED')
                row=self.row();self.assertEqual(row['state'],'SUPERSEDED');self.assertEqual(row['detail'],'REVIEWER_REQUESTED_RECHECK')
                self.assertEqual(row['job_id'],'job:superseded:'+self.key,'the job can be planned again under its own id')
                self.assertEqual(row['payment_id'],None)
                job=self.db.execute("SELECT status,detail,attempts FROM receipt_jobs WHERE id='job'").fetchone()
                self.assertEqual(tuple(job),('VALIDATED','REVIEWER_REQUESTED_RECHECK',0))
                prior=json.loads(self.db.execute('SELECT previous FROM receipt_reconsiderations').fetchone()[0])
                self.assertEqual(prior['status'],'REVIEW_REQUESTED')

    def test_four_is_final_and_a_later_reply_decides_nothing(self):
        self.assertEqual(self.decide('4'),'RECHECK_QUEUED')
        self.assertEqual(self.decide('1',message_id='in2'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'SUPERSEDED')
        self.assertEqual(self.db.execute('SELECT count(*) FROM receipt_reconsiderations').fetchone()[0],1)

    def test_four_after_a_decision_changes_nothing(self):
        self.assertEqual(self.decide('1'),'APPROVED')
        self.assertEqual(self.decide('4',message_id='in2'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'APPROVED')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_four_from_an_unauthorized_sender_changes_nothing(self):
        self.assertEqual(self.decide('4',sender_id='other'),'NOT_CORRELATED');self.assertEqual(self.row()['state'],'PENDING')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_four_rechecks_a_review_stale_only_because_the_charges_changed(self):
        # 3 November 2026: the late fee made the open review STALE (a "Review" resend checked it first), then 4 arrived.
        for reason in ('PROPOSAL_FACTS_CHANGED','PAY_FORWARD_PLAN_CHANGED'):
            with self.subTest(reason=reason):
                self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail=?",(reason,))
                self.assertEqual(self.decide('4'),'RECHECK_QUEUED')
                self.assertEqual(self.row()['state'],'SUPERSEDED')
                self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'VALIDATED')

    def test_other_stale_reasons_and_other_replies_stay_decided(self):
        for reason in ('PAY_FORWARD_DAY_PASSED','RECEIVING_ACCOUNT_CHANGED','RECEIPT_DATE_TOO_OLD'):
            with self.subTest(reason=reason):
                self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail=?",(reason,))
                self.assertEqual(self.decide('4'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'STALE')
                self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')
        self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED'")
        self.assertEqual(self.decide('1'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'STALE')

    def test_four_on_an_expired_stale_review_changes_nothing(self):
        self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED'")
        self.assertEqual(self.store.decide(dict(self.event,text='4'),self.notice,[self.p],self.identity,100000,reviewer_ids=['p']),'ALREADY_DECIDED')
        self.assertEqual(self.row()['state'],'STALE')

    def test_the_request_offers_the_recheck(self):
        self.assertIn('4 recheck after editing charges in the app',request_text(PROPOSAL,'English')[1])
        self.assertIn('4 ตรวจใหม่หลังแก้ยอดในแอป',request_text(PROPOSAL,'ไทย')[1])

    def test_a_decision_is_final(self):
        self.assertEqual(self.decide('1'),'APPROVED')
        self.assertEqual(self.decide('2',message_id='in2'),'ALREADY_DECIDED');self.assertEqual(purpose(self.row())['forward'],True)

    def test_unauthorized_sender_and_wrong_message_are_ignored(self):
        self.assertEqual(self.decide('1',sender_id='other'),'NOT_CORRELATED')
        self.assertEqual(self.decide('1',reply_to='elsewhere',message_id='x'),'NOT_CORRELATED')
        self.assertEqual(self.decide('1',reply_to='',message_id='y'),'NOT_CORRELATED')
        self.p['enabled']=False;self.assertEqual(self.decide('1',message_id='z'),'UNAUTHORIZED')
        self.assertEqual(self.row()['state'],'PENDING')
        self.p['enabled']=True
        self.assertEqual(self.store.decide(dict(self.event,message_id='w'),self.notice,[self.p],self.identity,120,reviewer_ids=['someone-else']),'NOT_REVIEWER')

    def test_a_reply_to_an_options_resend_decides_the_same_review(self):
        import hashlib
        resent=dict(self.notice,event_key='review:'+self.key+':options:'+hashlib.sha256(b'in').hexdigest(),message_id='out2')   # review:<id>:options:<sha256 of the unclear reply's message id>
        self.assertEqual(self.store.decide(dict(self.event,reply_to='out2'),resent,[self.p],self.identity,120,reviewer_ids=['p']),'APPROVED')

    def test_request_text_states_the_plan_and_fits_the_message_limit(self):
        for language in ('English','ไทย'):
            subject,body=request_text(PROPOSAL,language);plain=body.replace('฿','').replace(',','')
            for expected in ('1500','300','1200','L-0398','5'):self.assertIn(expected,plain)
            self.assertLessEqual(len(body),1000)
            self.assertIn('Reject' if language=='English' else 'ปฏิเสธ',body)

    def test_an_unclear_reply_gets_the_prompt_and_the_options_again(self):
        for language,prompt in (('English','Reply 1, 2, 3 and an amount, or 4.'),('ไทย','ตอบ 1, 2, 3 ตามด้วยจำนวน หรือ 4')):
            body=request_text(PROPOSAL,language,unclear=True)[1]
            self.assertTrue(body.startswith(prompt));self.assertIn('1,500' if language=='English' else '1,500',body);self.assertLessEqual(len(body),1000)

    def test_request_text_omits_a_refused_option_and_says_to_record_the_settle_in_the_app(self):
        # R113: a remainder that settles a loan is recorded in the app (Receive payment), never by this reply.
        settled=json.loads(json.dumps(PROPOSAL));settled['options']['principal']=[];settled['options']['blocked']=[{'loanId':'L1','reason':'settles','loanKey':'L-0398'}]
        body=request_text(settled,'English')[1]
        self.assertNotIn('2 repay principal',body.lower());self.assertIn('Remainder settles L-0398: record in the app.',body);self.assertNotIn('Close Loan',body)
        self.assertIn('ยอดคงเหลือปิด L-0398 ได้: กรุณาบันทึกในแอป',request_text(settled,'ไทย')[1])
        unnamed=json.loads(json.dumps(settled));unnamed['options']['blocked']=[{'loanId':'L1','reason':'settles'}]
        self.assertIn('Remainder settles L1: record in the app.',request_text(unnamed,'English')[1])


if __name__=='__main__':unittest.main()
