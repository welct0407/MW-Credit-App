import tempfile
import unittest
from unittest.mock import Mock
from mw_integration_agent.conversation_poll import scan,pages
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.config import ConfigurationError


class PollTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.j=ReceiptJournal(self.tmp.name+'/receipt.db');self.addCleanup(self.j.close)
        self.c={'instagram_account_id':'999','conversation_poll_cutoff':'2026-09-21T00:00:00+00:00'}
        self.master={'borrowers':[{'username':'borrower','enabled':True}]}
        self.now=1750000000+40000000
        from datetime import datetime
        self.now=datetime.fromisoformat('2026-09-21T01:00:00+00:00').timestamp()
    def message(self,key='m1',sender='123',time='2026-09-21T00:59:00+00:00',image=True):
        return {'id':key,'created_time':time,'from':{'id':sender},'attachments':{'data':[{'image_data':{'url':'https://example.invalid/image'}}] if image else []}}
    def api(self,messages,paging=False):
        h={'data':messages}
        if paging:h['paging']={'next':'unused'}
        return Mock(request=Mock(return_value={'data':[{'id':'group','participants':{'data':[{'id':'123','username':'borrower'},{'id':'999','username':'business'},{'id':'456','username':'partner'}]},'messages':h}]}))
    def test_new_images_ignore_other_senders_text_and_history(self):
        api=self.api([self.message(),self.message('text',image=False),self.message('partner','456'),self.message('old',time='2026-09-20T23:59:00+00:00')])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual(result['image_jobs'],1);self.assertEqual(result['new_messages'],3)
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now)['image_jobs'],0)
        self.assertEqual(len(self.j.pending()),1)
        self.assertEqual(self.j.pending()[0]['message_id'],'m1')
    def test_overflow_fails_without_advancing(self):
        with self.assertRaises(ConfigurationError):scan(self.c,self.api([self.message()],True),self.master,self.j,self.now)
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM conversation_poll_state').fetchone()[0],0)
        self.assertEqual(len(self.j.pending()),0)
    def test_webhook_shared_job_key(self):
        import hashlib
        key=hashlib.sha256(b'm1:0').hexdigest()
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,created_at) VALUES (?,?,?,?,?)",(key,'m1','123','url',self.now));self.j.db.commit()
        self.assertEqual(scan(self.c,self.api([self.message()]),self.master,self.j,self.now)['image_jobs'],0)
    def test_disabled_borrower_not_scanned(self):
        self.master['borrowers'][0]['enabled']=False
        self.assertEqual(scan(self.c,self.api([self.message()]),self.master,self.j,self.now)['eligible_conversations'],0)
    def test_today_backfill_preserves_cursor_and_dedupes(self):
        api=self.api([self.message()])
        scan(self.c,api,self.master,self.j,self.now)
        self.j.db.execute('UPDATE conversation_poll_state SET checked_through=?',(self.now+10000,));self.j.db.commit()
        api=self.api([self.message('earlier',time='2026-09-21T00:10:00+00:00')])
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now,day='2026-09-21')['image_jobs'],1)
        self.assertEqual(self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0],self.now+10000)
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now,day='2026-09-21')['image_jobs'],0)
        with self.assertRaises(ConfigurationError):scan(self.c,api,self.master,self.j,self.now,day='2026-09-20')
    def test_pagination_cycle_rejected(self):
        api=Mock(request=Mock(return_value={'data':[],'paging':{'next':'unused','cursors':{'after':'a'}}}))
        with self.assertRaises(ConfigurationError):list(pages(api,'999/conversations',{}))
    def test_incomplete_attachments_roll_back(self):
        message=self.message();message['attachments']['paging']={'next':'unused'}
        with self.assertRaises(ConfigurationError):scan(self.c,self.api([message]),self.master,self.j,self.now)
        self.assertEqual(len(self.j.pending()),0)
