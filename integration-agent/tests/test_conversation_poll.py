import tempfile
import unittest
from unittest.mock import Mock,patch
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
        result=scan(self.c,self.api([self.message()],True),self.master,self.j,self.now)
        self.assertEqual(result['failed_conversations'],1)
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
    def test_malformed_conversation_does_not_block_other_group(self):
        api=self.api([self.message()]);api.request.return_value['data'].insert(0,None)
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['failed_conversations'],result['image_jobs']),(1,1))
        self.assertEqual(result['errors'][0]['error'],'POLL_CONVERSATION_UNAVAILABLE')
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
        result=scan(self.c,self.api([self.message('valid'),message]),self.master,self.j,self.now)
        self.assertEqual(result['failed_conversations'],1)
        self.assertEqual(len(self.j.pending()),0)
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM conversation_poll_messages').fetchone()[0],0)

    def paged_api(self,histories):
        group=self.api([]).request.return_value['data'][0]
        replies=[]
        for messages,cursor in histories:
            h={'data':messages}
            if cursor:h['paging']={'next':'https://example.invalid/unsupported/messages','cursors':{'after':cursor}}
            replies.append({'data':[{**group,'messages':h}]})
        return Mock(request=Mock(side_effect=replies))

    def test_new_group_terminal_link_is_followed_to_empty_page(self):
        api=self.paged_api([([self.message()],'abc='),([],None)])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['image_jobs'],result['failed_conversations']),(1,0))
        self.assertEqual(self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0],self.now)
        path,query=api.request.call_args_list[1].args
        self.assertEqual(path,'999/conversations')
        self.assertIn('messages.limit(100).after(abc=)',query['fields'])
        # Restart/next scheduled scan cannot duplicate the first receipt.
        self.assertEqual(scan(self.c,self.api([self.message()]),self.master,self.j,self.now+300)['image_jobs'],0)

    def test_instagram_omitted_empty_expansion_finishes_new_group(self):
        api=self.paged_api([([self.message()],'next')])
        first=next(api.request.side_effect)
        api.request.side_effect=[first,{'data':[{'id':'group'}]}]
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['image_jobs'],result['failed_conversations']),(1,0))

    def test_initial_empty_group_is_discovered_before_first_message(self):
        api=self.api([])
        api.request.return_value['data'][0].pop('messages')
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now)['failed_conversations'],0)
        self.assertEqual(scan(self.c,self.api([self.message(time='2026-09-21T01:01:00+00:00')]),self.master,self.j,self.now+300)['image_jobs'],1)

    def test_history_lookup_follows_outer_pages_without_mixing_groups(self):
        api=self.paged_api([([self.message()],'inner')])
        first=next(api.request.side_effect)
        api.request.side_effect=[first,{'data':[{'id':'other','messages':{'data':[self.message('wrong')]}}],
                                      'paging':{'next':'unused','cursors':{'after':'outer'}}},
                                {'data':[{'id':'group','messages':{'data':[]}}]}]
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['image_jobs'],result['failed_conversations']),(1,0))
        self.assertEqual(api.request.call_args_list[2].args[1]['after'],'outer')
        self.assertIn('.after(inner)',api.request.call_args_list[2].args[1]['fields'])

    def test_multi_page_history_and_boundary(self):
        api=self.paged_api([([self.message('new')],'one'),
            ([self.message('earlier',time='2026-09-21T00:30:00+00:00')],'two'),
            ([self.message('old',time='2026-09-20T23:59:00+00:00')],'unused')])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['image_jobs'],result['failed_conversations']),(2,0))
        self.assertEqual(api.request.call_count,3)
        self.assertEqual({j['message_id'] for j in self.j.pending()},{'new','earlier'})

    def test_boundary_already_reached_does_not_fetch_next(self):
        api=self.api([self.message(),self.message('old',time='2026-09-20T23:59:00+00:00')],True)
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now)['image_jobs'],1)
        self.assertEqual(api.request.call_count,1)

    def test_failed_group_does_not_block_healthy_group_and_retries_safely(self):
        bad=self.api([self.message('held')],True).request.return_value['data'][0]
        good={**self.api([self.message('good')]).request.return_value['data'][0],'id':'healthy'}
        api=Mock(request=Mock(return_value={'data':[bad,good]}))
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['failed_conversations'],result['image_jobs']),(1,1))
        self.assertEqual([r[0] for r in self.j.db.execute('SELECT conversation_id FROM conversation_poll_state')],['healthy'])
        # A later complete history catches up the held group without replaying good.
        bad['messages'].pop('paging')
        result=scan(self.c,api,self.master,self.j,self.now+300)
        self.assertEqual((result['failed_conversations'],result['image_jobs']),(0,1))
        self.assertEqual({j['message_id'] for j in self.j.pending()},{'held','good'})

    def test_existing_watermark_survives_api_failure(self):
        scan(self.c,self.api([]),self.master,self.j,self.now)
        api=self.paged_api([([self.message(time='2026-09-21T01:10:00+00:00')],'next')])
        api.request.side_effect=[api.request.side_effect.__next__(),ConfigurationError('Instagram API request failed')]
        result=scan(self.c,api,self.master,self.j,self.now+1200)
        self.assertEqual(result['failed_conversations'],1)
        self.assertEqual(self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0],self.now)
        self.assertEqual(len(self.j.pending()),0)

    def test_repeated_cursor_and_page_limit_do_not_skip_history(self):
        for cursors in [('same','same'),('one','two')]:
            with self.subTest(cursors=cursors),patch('mw_integration_agent.conversation_poll.MAX_HISTORY_PAGES',2):
                api=self.paged_api([([self.message()],cursors[0]),([self.message()],cursors[1])])
                result=scan(self.c,api,self.master,self.j,self.now)
                self.assertEqual(result['failed_conversations'],1)
                self.assertLessEqual(api.request.call_count,2)
        self.assertEqual(len(self.j.pending()),0)

    def test_out_of_order_continuation_is_held(self):
        api=self.paged_api([([self.message(time='2026-09-21T00:30:00+00:00')],'next'),([self.message()],None)])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual(result['errors'][0]['error'],'POLL_MESSAGE_ORDER_CHANGED')
        self.assertEqual(len(self.j.pending()),0)

    def test_invalid_cursor_cannot_change_api_field_selection(self):
        api=self.paged_api([([self.message()],'cursor){untrusted')])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual(result['errors'][0]['error'],'POLL_HISTORY_CURSOR_INVALID')
        self.assertEqual(api.request.call_count,1)

    def test_missing_group_in_continuation_is_held(self):
        api=self.paged_api([([self.message()],'next')])
        first=next(api.request.side_effect)
        api.request.side_effect=[first,{'data':[]}]
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual(result['errors'][0]['error'],'POLL_CONVERSATION_DISAPPEARED')
        self.assertEqual(len(self.j.pending()),0)

    def test_cli_reports_partial_failure_after_printing_counts(self):
        from mw_integration_agent.cli import build_parser,execute
        args=build_parser().parse_args(['conversation-poll','--config','unused','--catalogue','unused'])
        with patch('mw_integration_agent.conversation_poll.run',return_value={'image_jobs':1,'failed_conversations':1}),patch('builtins.print'):
            self.assertEqual(execute(args),2)

    def test_run_wakes_receipt_cycle_only_when_images_were_queued(self):
        from pathlib import Path
        from mw_integration_agent.conversation_poll import run
        config=dict(self.c,conversation_poll_enabled=True,state_directory=self.tmp.name)
        wake=Path(self.tmp.name)/'receipt-wake'
        for jobs,expected in ((0,False),(2,True)):
            with self.subTest(jobs=jobs),patch('mw_integration_agent.conversation_poll.controls',return_value=config), \
                 patch('mw_integration_agent.conversation_poll.load_json',return_value={'services':{'conversation_poll':{'enabled':True}}}), \
                 patch('mw_integration_agent.conversation_poll.masters'),patch('mw_integration_agent.conversation_poll.Instagram'), \
                 patch('mw_integration_agent.conversation_poll.scan',return_value={'image_jobs':jobs}):
                self.assertEqual(run('unused','unused'),{'image_jobs':jobs})
                self.assertEqual(wake.exists(),expected)

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
