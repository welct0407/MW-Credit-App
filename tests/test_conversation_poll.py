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

    def forwarding(self):
        self.master['borrowers'][0]['id']='borrower-row'
        self.c.update(receipt_forwarding_enabled=True,receipt_forwarder_partner_id='p',
                      receipt_group_account_username='business',receipt_forwarding_cutoff='2026-09-21T00:00:00+00:00')
        self.master['partners']=[{'id':'p','username':'partner'}]

    def test_forwarded_receipt_preserves_sender_and_group_evidence(self):
        self.forwarding();api=self.api([self.message('forwarded','456')])
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now)['image_jobs'],1)
        self.assertEqual(self.j.pending()[0]['sender_id'],'456')
        row=self.j.db.execute('SELECT conversation_id,outcome FROM conversation_poll_messages').fetchone()
        self.assertEqual(tuple(row),('group','FORWARDED'))
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now)['image_jobs'],0)
        from mw_integration_agent.receipt_identity import receipt_borrower
        self.assertEqual(receipt_borrower(self.c,self.j.pending()[0],self.j,self.master,Mock(side_effect=AssertionError()),api=api),
                         self.master['borrowers'][0])

    def test_forwarding_requires_exact_membership(self):
        self.forwarding()
        from mw_integration_agent.receipt_identity import forwarded_borrower
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        peers=self.api([]).request.return_value['data'][0]['participants']['data']
        for people,sender in [(peers+[{'id':'5','username':'unknown'}],'456'),(peers[:2],'456'),
                              (peers,'999'),(peers,'123'),(peers,'unknown')]:
            with self.subTest(people=people,sender=sender),self.assertRaises(ReceiptInvalid):
                forwarded_borrower(self.c,self.master,people,sender)
        self.master['borrowers'][0]['enabled']=False
        with self.assertRaises(ReceiptInvalid):forwarded_borrower(self.c,self.master,peers,'456')

    def test_forwarded_earlier_message_not_replayed(self):
        self.forwarding();self.c['receipt_forwarding_cutoff']='2026-09-21T01:00:00+00:00'
        self.assertEqual(scan(self.c,self.api([self.message('forwarded','456')]),self.master,self.j,self.now)['image_jobs'],0)

    def test_forwarded_membership_changed_before_processing_blocks(self):
        self.forwarding();api=self.api([self.message('forwarded','456')])
        scan(self.c,api,self.master,self.j,self.now)
        api.request.return_value['data'][0]['participants']['data'][0]['username']='someone_else'
        from mw_integration_agent.receipt_identity import receipt_borrower
        from mw_integration_agent.receipt_rules import ReceiptInvalid
        with self.assertRaises(ReceiptInvalid):receipt_borrower(self.c,self.j.pending()[0],self.j,self.master,Mock(),api=api)
        self.master['borrowers'].append({'id':'different-borrower','username':'someone_else','enabled':True})
        with self.assertRaisesRegex(ReceiptInvalid,'FORWARDED_BORROWER_CHANGED'):
            receipt_borrower(self.c,self.j.pending()[0],self.j,self.master,Mock(),api=api)
