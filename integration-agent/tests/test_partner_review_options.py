"""R112: the numbered reply grammar and the options request text (new file; Byte owns the code).
D7: no default. Nothing posts without a numbered reply; any other text asks again; a decision is final; only the exact
authorized Reviewer replying to the exact options message counts. """
import json
import sqlite3
import unittest
from unittest.mock import patch
from mw_integration_agent.partner_review import ReviewStore,request_text

PROPOSAL={'action':'Pay forward options','receipt':{'amount':'1500','date':'2026-11-03','time':'12:10','reference':'T','account_id':'a','account_label':'Test'},
          'borrower':{'id':'b','name_en':'Manee','name_th':'มาณี'},'loan_keys':['L-0398'],'facts':{},'planned_on':'2026-11-03',
          'options':{'planSha256':'a'*64,'dueTotal':'300','remainder':'1200','forward':{'first':'2026-11-04','last':'2026-11-05','through':'2026-11-05','uncovered':'0'},
                     'principal':[{'loanId':'L1','loanKey':'L-0398','amount':'1200','dailyAfter':'66','outstandingAfter':'1133'}],'blocked':[]}}

# R127: the owner's example (5 November 2026): ฿950 slip, ฿450 due today, remainder ฿500 = interest ฿90 + principal ฿410.
OWNER={'action':'Pay forward options','receipt':{'amount':'950','date':'2026-11-05','time':'12:10','reference':'T','account_id':'a','account_label':'Test'},
       'borrower':{'id':'b','name_en':'Manee','name_th':'มาณี'},'loan_keys':['L-0398'],'facts':{},'planned_on':'2026-11-05',
       'options':{'planSha256':'b'*64,'dueTotal':'450','remainder':'500','forward':{'first':'2026-11-06','last':'2026-11-07','through':'2026-11-07','uncovered':'0'},
                  'principal':[{'loanId':'L1','loanKey':'L-0398','amount':'410','dailyAfter':'53','outstandingAfter':'9590'}],'blocked':[]}}
LOAN_B={'loanId':'L2','loanKey':'L-0400','amount':'300','dailyAfter':'20','outstandingAfter':'4700'}


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

    def test_two_with_the_loan_number_is_principal(self):
        self.assertEqual(self.decide('2 1'),'APPROVED');self.assertEqual([x['loanId'] for x in purpose(self.row())['principal']],['L1'])

    def test_the_withdrawn_split_and_other_numbers_ask_again(self):
        # R127 (owner, 5 November 2026): three options; "3 <amount>" no longer splits and "4 <n>" is not a recheck.
        for index,text in enumerate(('3 800','3 0','3 abc','4 1','5','Yes')):
            with self.subTest(text=text):
                self.assertEqual(self.decide(text,message_id=f's{index}'),'OPTIONS_REQUIRED')
                row=self.row();self.assertEqual(row['state'],'PENDING');self.assertEqual(row['detail'],'')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_unclear_replies_ask_again_and_decide_nothing(self):
        for index,text in enumerate(('maybe','Yes','approve','อนุมัติ','3 0','3 -5','3 abc','3 1200','3 1300','5','0','1 2','2 0','2 2','')):
            with self.subTest(text=text):
                self.assertEqual(self.decide(text,message_id=f'm{index}'),'OPTIONS_REQUIRED')
                self.assertEqual(self.row()['state'],'PENDING')

    def test_yes_is_not_an_implicit_approval_of_the_options(self):
        # The old approval words approve a plain overpayment; here they must not pick a purpose (D7).
        self.assertEqual(self.decide('Yes'),'OPTIONS_REQUIRED');self.assertEqual(self.row()['payment_id'],None)

    def test_reject_still_drops_the_slip(self):
        self.assertEqual(self.decide('Reject'),'REJECTED');self.assertEqual(self.row()['state'],'REJECTED')

    def test_r174_no_is_reject(self):
        # R174 (owner, 18 November 2026): "No" on the options request drops the slip like "Reject"; nothing is paid.
        for index,text in enumerate(('No','no',' NO ')):
            with self.subTest(text=text):
                if index:self.db.execute("UPDATE partner_reviews SET state='PENDING',deciding_partner=NULL,decision_message=NULL,detail=''")
                self.assertEqual(self.decide(text,message_id=f'no{index}'),'REJECTED')
                row=self.row();self.assertEqual((row['state'],row['detail'],row['payment_id']),('REJECTED','',None))
                self.assertEqual(row['decision_message'],f'no{index}')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')
        # "Not" or "No thanks" is not a reject word: it asks again.
        self.db.execute("UPDATE partner_reviews SET state='PENDING',deciding_partner=NULL,decision_message=NULL,detail=''")
        for index,text in enumerate(('Not','No thanks')):
            with self.subTest(text=text):
                self.assertEqual(self.decide(text,message_id=f'nx{index}'),'OPTIONS_REQUIRED');self.assertEqual(self.row()['state'],'PENDING')

    def test_three_rechecks_the_slip_from_current_charges(self):
        # Owner request, 3 November 2026: edit the charges in the app (a late fee), then reply 3 (R127; 4 before) to plan
        # the slip again. R181: the legacy 4 is withdrawn (4 is the close choice; without one it asks again).
        for text in ('3',' 3 ','Recheck','ตรวจใหม่'):
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

    def test_r173_the_same_plan_after_a_recheck_gets_a_new_review(self):
        # R173: replanning an unchanged slip must not derive the superseded review's id (the insert was silently ignored).
        import hashlib
        same=json.dumps(PROPOSAL,sort_keys=True,ensure_ascii=False)
        self.assertEqual(self.key,hashlib.sha256(('review:job:'+same).encode()).hexdigest(),'a first review keeps its id')
        self.assertEqual(self.store.reserve('job',PROPOSAL,101),self.key,'reserving again is idempotent')
        keys=[self.key]
        for n in (1,2):
            self.assertEqual(self.decide('3',message_id=f'r{n}',notice=dict(self.notice,event_key='review:'+keys[-1])),'RECHECK_QUEUED')
            self.db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED'")
            key=self.store.reserve('job',PROPOSAL,100+2*n)
            self.assertNotIn(key,keys);self.assertEqual(self.store.reserve('job',PROPOSAL,101+2*n),key)
            row=self.db.execute('SELECT job_id,state FROM partner_reviews WHERE id=?',(key,)).fetchone()
            self.assertEqual(tuple(row),('job','PENDING'))
            self.key=key;keys.append(key)
        self.assertEqual(self.db.execute("SELECT count(*) FROM partner_reviews WHERE state='SUPERSEDED'").fetchone()[0],2)

    def test_r173_a_reservation_that_is_not_the_jobs_review_raises(self):
        # Defence in depth: never hand back a key whose row belongs to another job (the caller then marks a visible hold).
        from mw_integration_agent.config import ConfigurationError
        self.db.execute("UPDATE partner_reviews SET job_id='other'")
        with patch('mw_integration_agent.partner_review.ReviewStore.next_key',side_effect=lambda job_id,value,key,n:key):
            with self.assertRaisesRegex(ConfigurationError,'REVIEW_RESERVATION_FAILED'):self.store.reserve('job',PROPOSAL,130)

    def test_a_recheck_is_final_and_a_later_reply_decides_nothing(self):
        self.assertEqual(self.decide('3'),'RECHECK_QUEUED')
        self.assertEqual(self.decide('1',message_id='in2'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'SUPERSEDED')
        self.assertEqual(self.db.execute('SELECT count(*) FROM receipt_reconsiderations').fetchone()[0],1)

    def test_a_recheck_after_a_decision_changes_nothing(self):
        self.assertEqual(self.decide('1'),'APPROVED')
        self.assertEqual(self.decide('3',message_id='in2'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'APPROVED')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_a_recheck_from_an_unauthorized_sender_changes_nothing(self):
        self.assertEqual(self.decide('3',sender_id='other'),'NOT_CORRELATED');self.assertEqual(self.row()['state'],'PENDING')
        self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_a_recheck_of_a_review_stale_only_because_the_charges_changed(self):
        # 3 November 2026: the late fee made the open review STALE (a "Review" resend checked it first), then the recheck arrived.
        for reason in ('PROPOSAL_FACTS_CHANGED','PAY_FORWARD_PLAN_CHANGED'):
            with self.subTest(reason=reason):
                self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail=?",(reason,))
                self.assertEqual(self.decide('3'),'RECHECK_QUEUED')
                self.assertEqual(self.row()['state'],'SUPERSEDED')
                self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'VALIDATED')

    def test_other_stale_reasons_and_other_replies_stay_decided(self):
        for reason in ('PAY_FORWARD_DAY_PASSED','RECEIVING_ACCOUNT_CHANGED','RECEIPT_DATE_TOO_OLD'):
            with self.subTest(reason=reason):
                self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail=?",(reason,))
                self.assertEqual(self.decide('3'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'STALE')
                self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')
        self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED'")
        self.assertEqual(self.decide('1'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'STALE')

    def test_r181_a_stale_close_choice_keeps_its_recheck_and_a_legacy_four_changes_nothing(self):
        # R181: a close choice that went STALE records `<code>:CLOSE:<n>` (for its result's wording); the recheck still reads the
        # code before the colon. The withdrawn legacy 4 on a request without close choices decides nothing and queues nothing.
        self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PAY_FORWARD_PLAN_CHANGED:CLOSE:2'")
        self.assertEqual(self.decide('3'),'RECHECK_QUEUED');self.assertEqual(self.row()['state'],'SUPERSEDED')
        self.setUp();self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PAY_FORWARD_DAY_PASSED:CLOSE:1'")
        self.assertEqual(self.decide('3'),'ALREADY_DECIDED');self.assertEqual(self.row()['state'],'STALE')
        for text in ('4','4 1','4 2'):
            with self.subTest(text=text):
                self.setUp()
                self.assertEqual(self.decide(text),'OPTIONS_REQUIRED');self.assertEqual(self.row()['state'],'PENDING')
                self.assertEqual(self.db.execute("SELECT status FROM receipt_jobs").fetchone()[0],'REVIEW_REQUESTED')

    def test_a_recheck_on_an_expired_stale_review_changes_nothing(self):
        self.db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED'")
        self.assertEqual(self.store.decide(dict(self.event,text='3'),self.notice,[self.p],self.identity,100000,reviewer_ids=['p']),'ALREADY_DECIDED')
        self.assertEqual(self.row()['state'],'STALE')

    def test_the_request_offers_the_recheck_as_three(self):
        english,thai=request_text(PROPOSAL,'English')[1],request_text(PROPOSAL,'ไทย')[1]
        self.assertIn('\n3 = recheck (edit the charges in the app first, then reply 3)\nReject (or No) = record nothing for this slip\n',english)
        self.assertIn('\n3 = ตรวจใหม่ (แก้ยอดในแอปก่อน แล้วตอบ 3)\nปฏิเสธ = ไม่บันทึกสลิปนี้\n',thai)
        for body in (english,thai):
            for withdrawn in ('3 + amount','3 + จำนวน','\n4 ','split','แบ่งชำระ'):self.assertNotIn(withdrawn,body)

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
        from mw_integration_agent.partner_notice import BODY_LIMIT
        for language in ('English','ไทย'):
            subject,body=request_text(PROPOSAL,language);plain=body.replace('฿','').replace(',','')
            for expected in ('1500','300','1200','L-0398','5'):self.assertIn(expected,plain)
            self.assertLessEqual(len(body),BODY_LIMIT)
            self.assertIn('Reject' if language=='English' else 'ปฏิเสธ',body)

    def test_an_unclear_reply_gets_the_prompt_and_the_options_again(self):
        # R175 (Echo A): one prompt line above the request as sent, whatever codes it offers.
        for language,prompt in (('English','Reply not understood; nothing was done. Reply with a code below.\n'),
                                ('ไทย','ไม่เข้าใจคำตอบ ยังไม่ได้ดำเนินการ กรุณาตอบด้วยรหัสด้านล่าง\n')):
            body=request_text(PROPOSAL,language,unclear=True)[1]
            self.assertEqual(body,prompt+request_text(PROPOSAL,language)[1]);self.assertIn('1,500',body)
            several=json.loads(json.dumps(OWNER));several['options']['principal'].append(dict(LOAN_B))
            self.assertEqual(request_text(several,language,unclear=True)[1],prompt+request_text(several,language)[1])
            no_forward=json.loads(json.dumps(OWNER));no_forward['options']['forward']=None
            body=request_text(no_forward,language,unclear=True)[1]
            self.assertTrue(body.startswith(prompt));self.assertNotIn('\n1 = ',body)

    def test_option_two_shows_the_interest_and_principal_split(self):
        # R127 (Echo AG-7, AG-8), the owner's example: remainder 500, principal 410, so the loan's interest is 90.
        self.assertIn('\n2 = pay interest ฿90 + principal ฿410 → new interest ฿53/day\n',request_text(OWNER,'English')[1])
        self.assertIn('\n2 = ชำระดอกเบี้ย ฿90 + เงินต้น ฿410 → ดอกเบี้ยใหม่ ฿53/วัน\n',request_text(OWNER,'ไทย')[1])

    def test_the_due_part_with_a_late_charge_is_paid_first(self):
        late=json.loads(json.dumps(OWNER));late['options'].update(dueInterest='400',dueLate='50',duePrincipal='0')
        self.assertIn('\nDue today ฿450 (interest ฿400 + late charge ฿50) is paid first.\n',request_text(late,'English')[1])
        self.assertIn('\nหักยอดครบกำหนดวันนี้ ฿450 (ดอกเบี้ย ฿400 + ค่าปรับล่าช้า ฿50) ก่อน\n',request_text(late,'ไทย')[1])

    def test_nothing_due_has_no_due_line(self):
        # R175 (Echo A rules): the "Due today" line is left out when nothing is due.
        nothing=json.loads(json.dumps(OWNER));nothing['options']['dueTotal']='0'
        self.assertNotIn('Due today',request_text(nothing,'English')[1])
        self.assertNotIn('ครบกำหนดวันนี้',request_text(nothing,'ไทย')[1])

    def test_no_accrued_interest_shows_the_principal_only(self):
        # R127 (Echo AG-9): the existing fixture's whole remainder (1,200) goes to principal.
        self.assertIn('\n2 = pay principal ฿1,200 → new interest ฿66/day\n',request_text(PROPOSAL,'English')[1])
        self.assertIn('\n2 = ชำระเงินต้น ฿1,200 → ดอกเบี้ยใหม่ ฿66/วัน\n',request_text(PROPOSAL,'ไทย')[1])

    def test_several_loans_put_each_principal_choice_on_its_own_line(self):
        # R127 (Echo AG-10), R175: "2 <n> = loan <label>: ..." per line; numbers stay fixed when one is refused. Keys that
        # do not parse (L-0398) are printed in full.
        several=json.loads(json.dumps(OWNER));several['options']['principal'].append(dict(LOAN_B))
        lines=request_text(several,'English')[1].split('\n')
        self.assertEqual(lines[lines.index('Reply with one code:')+1:][:5],['1 = pay forward: 6–7 Nov',
            '2 1 = loan L-0398: pay interest ฿90 + principal ฿410 → new interest ฿53/day',
            '2 2 = loan L-0400: pay interest ฿200 + principal ฿300 → new interest ฿20/day',
            '3 = recheck (edit the charges in the app first, then reply 3)','Reject (or No) = record nothing for this slip'])
        self.assertNotIn('Loan L-0398',request_text(several,'English')[1])  # named on its own line, not again
        lines=request_text(several,'ไทย')[1].split('\n')
        self.assertEqual(lines[lines.index('ตอบด้วยรหัสเดียว:')+1:][:3],['1 = ชำระล่วงหน้า: 6–7 พ.ย.',
            '2 1 = สัญญา L-0398: ชำระดอกเบี้ย ฿90 + เงินต้น ฿410 → ดอกเบี้ยใหม่ ฿53/วัน',
            '2 2 = สัญญา L-0400: ชำระดอกเบี้ย ฿200 + เงินต้น ฿300 → ดอกเบี้ยใหม่ ฿20/วัน'])
        several['options']['forward']=None
        lines=request_text(several,'English')[1].split('\n')
        self.assertTrue(lines[lines.index('Reply with one code:')+1].startswith('2 1 = loan L-0398: '))

    def test_several_loans_two_with_a_number_chooses_that_loan(self):
        several=json.loads(json.dumps(PROPOSAL));several['options']['principal'].append(dict(LOAN_B))
        self.key=self.store.reserve('job2',several,100);self.notice=dict(self.notice,event_key='review:'+self.key)
        self.assertEqual(self.decide('2',message_id='a'),'OPTIONS_REQUIRED','with several loans the number is needed')
        self.assertEqual(self.decide('2 3',message_id='b'),'OPTIONS_REQUIRED')
        self.assertEqual(self.decide('2 2',message_id='c'),'APPROVED')
        self.assertEqual(purpose(self.row())['principal'],[{'loanId':'L2','amount':'300'}]);self.assertFalse(purpose(self.row())['forward'])

    def test_five_loans_with_realistic_keys_fit_the_message_limit(self):
        # Five principal choices (MAX_PRINCIPAL_OPTIONS) with display keys of one borrower about 50 characters long, the
        # late charge breakdown and the unclear prompt. R175: each loan is named once, by its short label on its own
        # "2 <n>" line (distinct dates, so the labels differ); the request falls back to the short form when needed.
        from mw_integration_agent.partner_notice import BODY_LIMIT
        from mw_integration_agent.review_proposal import loan_display_key
        for language,name,descriptions in (('English','Wilaiwan Phongphanit',('Fruit','Curry','Online','Repair','Capital')),
                                           ('ไทย','วิไลวรรณ พงษ์พานิช',('ร้านผลไม้','ร้านข้าวแกง','ขายของออนไลน์','ซ่อมรถ','ทุนหมุนเวียน'))):
            keys=[loan_display_key(name,d,'150000',f'2026-03-1{n}','1.5') for n,d in enumerate(descriptions)]
            five=json.loads(json.dumps(OWNER));five['loan_keys']=keys;five['borrower']=dict(five['borrower'],name_en=name,name_th=name)
            five['receipt'].update(amount='25000',account_label='KBank 123-4-56789-0')
            five['options'].update(dueTotal='1450',dueInterest='1200',dueLate='250',duePrincipal='0',remainder='23550')
            five['options']['forward'].update(last='2026-12-31',through='2026-12-31')
            five['options']['principal']=[{'loanId':f'L{n}','loanKey':k,'amount':str(23550-300*n),'dailyAfter':'1875','outstandingAfter':'1'} for n,k in enumerate(keys,1)]
            for unclear in (False,True):
                with self.subTest(language=language,unclear=unclear):
                    body=request_text(five,language,unclear=unclear)[1]
                    self.assertLessEqual(len(body),BODY_LIMIT);self.assertEqual(body.count('\n2 '),5)
                    for n in range(5):self.assertEqual(body.count(f'(1{n} '),1)
                    for key in keys:self.assertNotIn(key,body)

    def test_request_text_omits_a_refused_option_and_says_to_record_the_settle_in_the_app(self):
        # R113: a remainder that settles a loan is recorded in the app (Receive payment), never by this reply.
        settled=json.loads(json.dumps(PROPOSAL));settled['options']['principal']=[];settled['options']['blocked']=[{'loanId':'L1','reason':'settles','loanKey':'L-0398'}]
        body=request_text(settled,'English')[1]
        self.assertNotIn('2 repay principal',body.lower());self.assertIn('Remainder settles L-0398: record in the app.',body);self.assertNotIn('Close Loan',body)
        self.assertIn('ยอดคงเหลือปิด L-0398 ได้: กรุณาบันทึกในแอป',request_text(settled,'ไทย')[1])
        unnamed=json.loads(json.dumps(settled));unnamed['options']['blocked']=[{'loanId':'L1','reason':'settles'}]
        self.assertIn('Remainder settles L1: record in the app.',request_text(unnamed,'English')[1])


if __name__=='__main__':unittest.main()
