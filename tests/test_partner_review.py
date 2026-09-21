import json
import sqlite3
import unittest
from mw_integration_agent.partner_review import ReviewStore,request_text
from mw_integration_agent.review_proposal import plan

class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
        self.store=ReviewStore(self.db);self.key=self.store.reserve('job',{'action':'Lump Sum'},100)
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        self.notice={'ig_status':'ACCEPTED','event_key':'review:'+self.key,'message_id':'out','recipient_id':'123','partner_id':'p','partner':json.dumps(self.p)}
        self.event={'reply_to':'out','sender_id':'123','message_id':'in','event_timestamp':110,'text':'Approve'}
        self.identity={'id':'123','username':'partner'}
    def decide(self,event=None,notice=None):return self.store.decide(event or self.event,notice or self.notice,[self.p],self.identity,120,reviewer_ids=['p'])
    def test_linked_approve_and_replay(self):
        self.assertEqual(self.decide(),'APPROVED');self.assertEqual(self.decide(),'APPROVED')
        self.assertEqual(self.decide(dict(self.event,message_id='in2',text='Reject')),'ALREADY_DECIDED')
    def test_unlinked_wrong_sender_unknown_send(self):
        self.assertEqual(self.decide(dict(self.event,reply_to='')),'NOT_CORRELATED')
        self.assertEqual(self.decide(dict(self.event,sender_id='other')),'NOT_CORRELATED')
        self.assertEqual(self.decide(notice=dict(self.notice,ig_status='UNKNOWN')),'NOT_CORRELATED')
    def test_any_other_direct_reply_rejects(self):
        self.assertEqual(self.decide(dict(self.event,text='maybe approve later')),'REJECTED')
    def test_current_partner_required(self):
        self.p['enabled']=False;self.assertEqual(self.decide(),'UNAUTHORIZED')
    def test_expired_and_no_reply(self):
        self.assertEqual(self.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'PENDING')
        self.assertEqual(self.store.decide(self.event,self.notice,[self.p],self.identity,100000,reviewer_ids=['p']),'EXPIRED')
    def test_nonreviewer_cannot_approve_or_reject(self):
        for reply in ('yes','reject'):
            event=dict(self.event,text=reply)
            self.assertEqual(self.store.decide(event,self.notice,[self.p],self.identity,120,reviewer_ids=['someone-else']),'NOT_REVIEWER')
        self.assertEqual(self.db.execute('SELECT state FROM partner_reviews').fetchone()[0],'PENDING')
    def test_missing_reviewer_role_fails_closed(self):
        self.assertEqual(self.store.decide(self.event,self.notice,[self.p],self.identity,120),'NOT_REVIEWER')
    def test_reviewer_selection_keeps_notification_partners(self):
        from mw_integration_agent.review_cycle import reviewer_partners
        other=dict(self.p,id='other',enabled=False)
        live={'partners':[self.p,other],'reviewer_ids':['other']}
        self.assertEqual(reviewer_partners(live),[other])
        self.assertEqual(live['partners'],[self.p,other])
        self.assertEqual(reviewer_partners({'partners':[self.p]}),[])
    def test_thai_approval(self):
        self.assertEqual(self.decide(dict(self.event,text='อนุมัติ')),'APPROVED')
    def test_case_insensitive_yes_and_approved(self):
        from mw_integration_agent.partner_review import APPROVE
        for word in ('YES',' yes ','Approved','APPROVE','aPpRoVeD'):
            self.assertIn(word.strip().casefold(),APPROVE)
    def test_proposal_immutable(self):
        from mw_integration_agent.config import ConfigurationError
        with self.assertRaises(ConfigurationError):self.store.reserve('job',{'action':'Loan Close'})
    def test_superseded_reply_cannot_approve_replacement(self):
        self.db.execute("UPDATE partner_reviews SET state='SUPERSEDED',job_id='job:old' WHERE id=?",(self.key,));self.db.commit()
        replacement=self.store.reserve('job',{'action':'Lump Sum','corrected':True},115)
        self.assertNotEqual(replacement,self.key)
        self.assertEqual(self.decide(),'ALREADY_DECIDED')
        self.assertEqual(self.db.execute('SELECT state FROM partner_reviews WHERE id=?',(replacement,)).fetchone()[0],'PENDING')

class PlanTests(unittest.TestCase):
    def test_same_day_charges_are_combined(self):
        r={'amount':'300.00','date':'2026-09-21','time':'12:10','account_label':'Test'}
        f={'loans':[{'id':'l','loan_key':'Readable loan','status':'ยังไม่ปิดยอด','type':'other','auto':False,'principal':'5000'}],
           'charges':[{'id':'c1','loan':'l','date':'2026-09-21','principal':'0','interest':'100'},
                      {'id':'c2','loan':'l','date':'2026-09-21','principal':'0','interest':'200'}]}
        p=plan(r,{'id':'b'},f,'2026-09-21')
        self.assertEqual(p['action'],'Lump Sum')
        self.assertIn('Readable loan',request_text(p,'English')[1])
        self.assertNotIn('Partner handling required',request_text(p,'English')[1])
    def test_close_and_changed_balance(self):
        r={'amount':'1300.00','date':'2026-09-21','time':'12:10','account_label':'Test'}
        b={'id':'b','name_en':'Test'}
        f={'loans':[{'id':'l','status':'ยังไม่ปิดยอด','type':'ดอกเบี้ยรายวัน','auto':True,'principal':'1000','daily':'100','date':'2026-09-18'}],
           'charges':[{'id':'c','loan':'l','date':'2026-09-21','principal':'0','interest':'300'}]}
        p=plan(r,b,f,'2026-09-21');self.assertEqual(p['action'],'Loan Close')
        self.assertIn('loan closure',request_text(p,'English')[1])
        r['amount']='200';self.assertEqual(plan(r,b,f,'2026-09-21')['action'],'Lump Sum')
