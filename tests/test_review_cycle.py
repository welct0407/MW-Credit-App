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
        self.store=ReviewStore(self.j.db);self.key=self.store.reserve('job',self.proposal)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at) VALUES ('job','message','123','','REVIEW_REQUESTED',0)")
        self.j.db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner='p' WHERE id=?",(self.key,));self.j.db.commit()
        notices=NoticeJournal(self.root/'partner-notices.db');n=notices.reserve('review:'+self.key,self.p,'subject','body')
        notices.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='sent',recipient_id='456' WHERE id=?",(n,));notices.db.commit();notices.close()
        self.patches=[]
        for target,kwargs in [('masters',{'return_value':{'partners':[self.p],'borrowers':[self.b],'accounts':[{'id':'a','active':True}]}}),
              ('check',{}),('facts',{'return_value':{}}),('plan',{'return_value':self.proposal}),('read_query',{'return_value':['actor@example.invalid']}),
              ('add_payment',{}),('readback',{'return_value':True})]:
            p=patch('mw_integration_agent.review_cycle.'+target,**kwargs);setattr(self,target,p.start());self.addCleanup(p.stop)
        p=patch('mw_integration_agent.partner_notice.NoticeJournal.dispatch');p.start();self.addCleanup(p.stop)
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
    def test_disabled_execution_no_write(self):
        self.config['partner_review_execution_enabled']=False;self.run_cycle();self.add_payment.assert_not_called()
    def test_preexisting_ingress_schema_migrates_before_read(self):
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(self.root/'instagram-ingress.db')) as old:
            old.execute('ALTER TABLE messages DROP COLUMN reply_to')
            old.commit()
        self.run_cycle()
        with closing(sqlite3.connect(self.root/'instagram-ingress.db')) as current:
            self.assertIn('reply_to',{r[1] for r in current.execute('PRAGMA table_info(messages)')})
