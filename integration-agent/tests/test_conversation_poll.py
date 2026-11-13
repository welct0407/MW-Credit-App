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
        # The exception class is kept (never its text): a None conversation fails on .get.
        self.assertEqual(result['errors'][0]['error'],'POLL_CONVERSATION_UNAVAILABLE:AttributeError')
    def test_today_backfill_preserves_cursor_and_dedupes(self):
        api=self.api([self.message()])
        scan(self.c,api,self.master,self.j,self.now)
        self.j.db.execute('UPDATE conversation_poll_state SET checked_through=?',(self.now+10000,));self.j.db.commit()
        api=self.api([self.message('earlier',time='2026-09-21T00:10:00+00:00')])
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now,day='2026-09-21')['image_jobs'],1)
        self.assertEqual(self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0],self.now+10000)
        self.assertEqual(scan(self.c,api,self.master,self.j,self.now,day='2026-09-21')['image_jobs'],0)
        with self.assertRaises(ConfigurationError):scan(self.c,api,self.master,self.j,self.now,day='2026-09-20')
    def cursor(self):
        return self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0]

    def test_idle_group_keeps_cursor_and_still_captures_later_messages(self):
        api=self.api([self.message()])
        scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual(self.cursor(),self.now)
        # Idle rescans (the same message is re-read and deduped) write nothing.
        writes=[]
        self.j.db.set_trace_callback(lambda s:writes.append(s) if 'conversation_poll_state' in s and 'INSERT' in s.upper() else None)
        for later in (60,3600,86400):
            self.assertEqual(scan(self.c,api,self.master,self.j,self.now+later)['new_messages'],0)
        self.j.db.set_trace_callback(None)
        self.assertEqual(writes,[]);self.assertEqual(self.cursor(),self.now)
        # A day later the old cursor still bounds the read and a new message is captured once, then advances it.
        late=self.now+86400
        api=self.api([self.message('next',time='2026-09-22T00:59:00+00:00'),self.message()])
        self.assertEqual(scan(self.c,api,self.master,self.j,late)['image_jobs'],1)
        self.assertEqual(self.cursor(),late)
        self.assertEqual(scan(self.c,api,self.master,self.j,late+60)['image_jobs'],0)

    def test_empty_group_records_cursor_once(self):
        scan(self.c,self.api([]),self.master,self.j,self.now)
        scan(self.c,self.api([]),self.master,self.j,self.now+600)
        self.assertEqual(self.cursor(),self.now)

    def test_full_first_page_of_known_messages_advances_cursor(self):
        # A today backfill captures messages without moving the cursor; once the known window fills the first
        # page, the next scheduled scan moves the cursor so later reads stay one page.
        scan(self.c,self.api([]),self.master,self.j,self.now-3000)
        known=[self.message(f'k{i}',time=f'2026-09-21T00:{58-i:02d}:00+00:00') for i in range(20)]
        scan(self.c,self.api(known),self.master,self.j,self.now,day='2026-09-21')
        self.assertEqual(self.cursor(),self.now-3000)
        known.append(self.message('old',time='2026-09-20T23:00:00+00:00'))
        self.assertEqual(scan(self.c,self.api(known),self.master,self.j,self.now)['new_messages'],0)
        self.assertEqual(self.cursor(),self.now)

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
        # Only the first conversation-list read is lighter; continuation pages stay at 100 messages.
        first=api.request.call_args_list[0].args[1]
        self.assertIn('messages.limit(20){',first['fields'])
        self.assertEqual(first['limit'],100)
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
                 patch('mw_integration_agent.conversation_poll.masters'),patch('mw_integration_agent.conversation_poll.Instagram') as client, \
                 patch('mw_integration_agent.conversation_poll.scan',return_value={'image_jobs':jobs}):
                self.assertEqual(run('unused','unused'),{'image_jobs':jobs})
                self.assertEqual(wake.exists(),expected)
                # The poll's reads wait 40 s per socket operation; the client never sends.
                client.assert_called_once_with(config,read_timeout=40)

    def test_first_page_holds_more_than_twenty_new_messages_by_continuing(self):
        # 20 messages all inside the window and a next link: the group continues on a 100-message page
        # before anything commits, so the lighter first read skips nothing.
        first=[self.message(f'n{i}',time=f'2026-09-21T00:59:{59-i:02d}+00:00') for i in range(20)]
        api=self.paged_api([(first,'c1='),([self.message('older',time='2026-09-21T00:58:00+00:00')],None)])
        result=scan(self.c,api,self.master,self.j,self.now)
        self.assertEqual((result['image_jobs'],result['failed_conversations']),(21,0))
        self.assertIn('messages.limit(100).after(c1=)',api.request.call_args_list[1].args[1]['fields'])

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


class RecheckTests(unittest.TestCase):
    """R119: after a borrower is enabled the poll turns their slips it had recorded IGNORED (yesterday and today) into
    jobs; the cursor and every other outcome stay; the switch and the master snapshot gate it."""
    def setUp(self):
        from datetime import datetime
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.j=ReceiptJournal(self.tmp.name+'/receipt.db');self.addCleanup(self.j.close)
        self.c={'instagram_account_id':'999','conversation_poll_cutoff':'2026-09-21T00:00:00+00:00'}
        self.master={'borrowers':[{'id':'b-borrower','username':'borrower','enabled':True}],'accounts':[]}
        self.now=datetime.fromisoformat('2026-09-21T01:00:00+00:00').timestamp()
        self.people=[{'id':'123','username':'borrower'},{'id':'999','username':'business'},{'id':'456','username':'partner'},{'id':'777','username':'other'}]
    def message(self,key,sender,time):
        return {'id':key,'created_time':time,'from':{'id':sender},'attachments':{'data':[{'id':'att-'+key,'image_data':{'url':'https://example.invalid/'+key}}]}}
    def api(self,messages):
        return Mock(request=Mock(return_value={'data':[{'id':'group','participants':{'data':self.people},'messages':{'data':messages}}]}))
    def outcomes(self):
        return dict(self.j.db.execute('SELECT message_id,outcome FROM conversation_poll_messages').fetchall())
    def jobs(self):
        return {r['message_id']:dict(r) for r in self.j.db.execute('SELECT * FROM receipt_jobs')}
    def cursor(self):
        return self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0]
    def first_scan(self,messages):
        # The partner (456) and other (777) are not enabled yet: their slips are recorded IGNORED.
        scan(self.c,self.api(messages),self.master,self.j,self.now)
        self.assertTrue(self.outcomes());self.assertTrue(all(v=='IGNORED' for v in self.outcomes().values()))
    def enable_partner(self):
        self.master['borrowers'].append({'id':'b-partner','username':'Partner','enabled':True})
    def recheck(self,messages,later=3600):
        return scan(self.c,self.api(messages),self.master,self.j,self.now+later,recheck={'usernames':{'partner'}})

    def test_enabled_borrower_ignored_slip_becomes_a_job_and_cursor_stays(self):
        slip=self.message('m1','456','2026-09-21T00:10:00+00:00')
        self.first_scan([slip]);cursor=self.cursor()
        self.assertEqual(self.jobs(),{})
        self.enable_partner()
        result=self.recheck([slip])
        self.assertEqual((result['recheck_jobs'],result['recheck_errors'],result['image_jobs']),(1,0,0))
        job=self.jobs()['m1']
        self.assertEqual((job['status'],job['sender_id'],job['url']),('PENDING','456','https://example.invalid/m1'))
        import hashlib
        import json
        self.assertEqual(job['id'],hashlib.sha256(b'm1:0').hexdigest())
        source=json.loads(job['source'])
        self.assertEqual((source['kind'],source['conversation_id'],source['sender_id'],source['attachment_id']),('poll','group','456','att-m1'))
        self.assertEqual(self.outcomes(),{'m1':'BORROWER'})
        self.assertEqual(self.cursor(),cursor)  # the cursor is untouched
        # A second recheck adds nothing (the row is BORROWER and the job exists).
        self.assertEqual(self.recheck([slip],7200)['recheck_jobs'],0);self.assertEqual(len(self.jobs()),1)

    def test_changed_message_id_is_matched_by_time_and_the_new_id_recorded(self):
        self.first_scan([self.message('old-id','456','2026-09-21T00:10:00+00:00')])
        self.enable_partner()
        result=self.recheck([self.message('new-id','456','2026-09-21T00:10:04+00:00')])
        self.assertEqual(result['recheck_jobs'],1)
        self.assertEqual(set(self.jobs()),{'new-id'})
        self.assertEqual(self.outcomes(),{'old-id':'BORROWER','new-id':'BORROWER'})
        # 6 s apart is a different message: nothing matches, nothing is added.
        self.j.db.execute("UPDATE conversation_poll_messages SET outcome='IGNORED'");self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.commit()
        self.j.db.execute("DELETE FROM conversation_poll_messages WHERE message_id='new-id'");self.j.db.commit()
        self.assertEqual(self.recheck([self.message('newer-id','456','2026-09-21T00:10:06+00:00')])['recheck_jobs'],0)
        self.assertEqual(self.outcomes(),{'old-id':'IGNORED'})

    def test_two_ignored_rows_within_the_time_window_are_ambiguous_and_left(self):
        # Chase (R119): Meta changed the slip's id and a caption text of the same group is recorded within 5 s of it: two
        # candidates, so nothing is promoted (a wrong match would turn a text row into BORROWER and miss the slip).
        text={'id':'t1','created_time':'2026-09-21T00:10:02+00:00','from':{'id':'456'},'message':'caption'}
        self.first_scan([text,self.message('old-id','456','2026-09-21T00:10:00+00:00')])
        self.enable_partner()
        result=self.recheck([self.message('new-id','456','2026-09-21T00:10:01+00:00')])
        self.assertEqual((result['recheck_jobs'],result['recheck_errors']),(0,0))
        self.assertEqual(self.jobs(),{});self.assertEqual(self.outcomes(),{'old-id':'IGNORED','t1':'IGNORED'})
        # The same slip with its stable id still matches exactly, whatever else is near it.
        self.assertEqual(self.recheck([self.message('old-id','456','2026-09-21T00:10:00+00:00')])['recheck_jobs'],1)
        self.assertEqual(self.outcomes(),{'old-id':'BORROWER','t1':'IGNORED'})

    def test_an_existing_job_by_either_id_or_by_source_blocks_a_duplicate(self):
        import json
        from datetime import datetime
        from mw_integration_agent.receipt_archive import source
        slip=self.message('m1','456','2026-09-21T00:10:00+00:00')
        ts=datetime.fromisoformat('2026-09-21T00:10:00+00:00').timestamp()
        self.first_scan([slip]);self.enable_partner()
        for case,row in (('same id',('k1','m1',None)),('recorded id',('k2','m1',None)),
                         ('same source',('k3','webhook-id',source('webhook','webhook-id',0,'456',ts+3,self.now,'group')))):
            with self.subTest(case=case):
                self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.execute("DELETE FROM conversation_poll_messages WHERE message_id<>'m1'")
                self.j.db.execute("UPDATE conversation_poll_messages SET outcome='IGNORED'")
                self.j.db.execute('INSERT INTO receipt_jobs(id,message_id,sender_id,url,created_at,source) VALUES (?,?,?,?,?,?)',
                                  (row[0],row[1],'456','',self.now,row[2]));self.j.db.commit()
                # 'recorded id': Meta now reports another id for the slip; the job names the recorded one.
                new=self.message('changed','456','2026-09-21T00:10:01+00:00') if case=='recorded id' else slip
                self.assertEqual(self.recheck([new])['recheck_jobs'],0)
                self.assertEqual(len(self.jobs()),1);self.assertEqual(self.outcomes(),{'m1':'IGNORED'})
        # A source naming another group does not block.
        self.j.db.execute('UPDATE receipt_jobs SET source=?',(json.dumps({'conversation_id':'other','sender_id':'456','sent_at':ts}),));self.j.db.commit()
        self.assertEqual(self.recheck([slip])['recheck_jobs'],1)

    def test_other_senders_stay_ignored_and_older_slips_are_untouched(self):
        from datetime import datetime
        other=self.message('o1','777','2026-09-21T00:20:00+00:00')
        self.first_scan([other,self.message('m1','456','2026-09-21T00:10:00+00:00')])
        # A slip from before yesterday's local midnight (19 Sep 17:00 UTC), recorded IGNORED by an earlier poll.
        stale=self.message('s1','456','2026-09-19T16:59:00+00:00')
        self.j.db.execute('INSERT INTO conversation_poll_messages VALUES (?,?,?,?,?)',
                          ('s1','group',datetime.fromisoformat(stale['created_time']).timestamp(),self.now,'IGNORED'));self.j.db.commit()
        self.enable_partner()
        result=self.recheck([other,self.message('m1','456','2026-09-21T00:10:00+00:00'),stale])
        self.assertEqual(result['recheck_jobs'],1)
        self.assertEqual(self.outcomes(),{'m1':'BORROWER','o1':'IGNORED','s1':'IGNORED'})
        self.assertEqual(set(self.jobs()),{'m1'})

    def test_no_recheck_without_the_plan_or_in_a_backfill(self):
        slip=self.message('m1','456','2026-09-21T00:10:00+00:00')
        self.first_scan([slip]);self.enable_partner()
        result=scan(self.c,self.api([slip]),self.master,self.j,self.now+3600)
        self.assertNotIn('recheck_jobs',result);self.assertEqual(self.jobs(),{})
        result=scan(self.c,self.api([slip]),self.master,self.j,self.now+60,day='2026-09-21',recheck={'usernames':{'partner'}})
        self.assertNotIn('recheck_jobs',result);self.assertEqual(self.outcomes()['m1'],'IGNORED')

    def test_unreadable_group_counts_a_recheck_error(self):
        slip=self.message('m1','456','2026-09-21T00:10:00+00:00')
        self.first_scan([slip]);self.enable_partner()
        api=self.api([slip]);api.request.return_value['data'][0]['messages']['paging']={'next':'unused'}
        # The poll's own read stops at its cursor; the two-day read needs the next page and has no cursor.
        result=scan(self.c,api,self.master,self.j,self.now+3600,recheck={'usernames':{'partner'}})
        self.assertEqual((result['failed_conversations'],result['recheck_errors'],result['recheck_jobs']),(0,1,0))
        self.assertEqual(result['errors'][0]['error'],'RECHECK:POLL_HISTORY_INCOMPLETE_PAGINATION')
        self.assertEqual(self.jobs(),{});self.assertEqual(self.outcomes(),{'m1':'IGNORED'})
        # A group whose own read fails also counts, so the snapshot stays for the next run.
        api.request.return_value['data'][0]['participants']['paging']={'next':'unused'}
        result=scan(self.c,api,self.master,self.j,self.now+86400,recheck={'usernames':{'partner'}})
        self.assertEqual((result['failed_conversations'],result['recheck_errors']),(1,1))


class RecheckRunTests(unittest.TestCase):
    """R119 run(): the switch, the first-run snapshot, the worker lock and the snapshot advance."""
    def setUp(self):
        from pathlib import Path
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.config={'instagram_account_id':'999','conversation_poll_cutoff':'2026-09-21T00:00:00+00:00','conversation_poll_enabled':True,
                     'state_directory':self.tmp.name}
        self.master={'borrowers':[{'id':'b1','username':'borrower','enabled':True}],'accounts':[{'id':'a','number':'1234567890','active':True}]}
    def run_poll(self,scan_result=None,held=None,day=None):
        from mw_integration_agent.conversation_poll import run
        scanned=Mock(return_value=dict(scan_result or {'image_jobs':0}))
        recheck=Mock(return_value=held or {'held_requeued':0,'held_skipped':0,'held_skipped_no_archive':0})
        with patch('mw_integration_agent.conversation_poll.controls',return_value=self.config), \
             patch('mw_integration_agent.conversation_poll.load_json',return_value={'services':{'conversation_poll':{'enabled':True}}}), \
             patch('mw_integration_agent.conversation_poll.masters',return_value=self.master),patch('mw_integration_agent.conversation_poll.Instagram'), \
             patch('mw_integration_agent.conversation_poll.scan',scanned),patch('mw_integration_agent.receipt_recheck.recheck_held',recheck):
            return run('unused','unused',day=day),scanned,recheck
    def snapshot(self):
        import json
        path=self.root/'conversation-poll-master.json'
        return json.loads(path.read_text()) if path.exists() else None

    def test_switch_off_writes_nothing_and_rechecks_nothing(self):
        result,scanned,recheck=self.run_poll()
        self.assertNotIn('recheck',result);self.assertIsNone(self.snapshot())
        self.assertIsNone(scanned.call_args.kwargs['recheck']);recheck.assert_not_called()

    def test_first_run_writes_the_snapshot_and_rechecks_nothing(self):
        import os
        import stat
        self.config['conversation_poll_recheck_enabled']=True
        result,scanned,recheck=self.run_poll()
        self.assertEqual(result['recheck'],'snapshot_written');self.assertIsNone(scanned.call_args.kwargs['recheck']);recheck.assert_not_called()
        saved=self.snapshot();self.assertEqual(saved['enabled'],['borrower']);self.assertEqual(len(saved['accounts_sha256']),64)
        self.assertEqual(stat.S_IMODE(os.stat(self.root/'conversation-poll-master.json').st_mode),0o600)
        # Unchanged master: nothing rechecked, the snapshot is not rewritten.
        result,scanned,recheck=self.run_poll()
        self.assertEqual(result['recheck'],'unchanged');recheck.assert_not_called();self.assertEqual(self.snapshot(),saved)
        # A backfill never rechecks or writes, even with a change.
        self.master['borrowers'].append({'id':'b2','username':'new','enabled':True})
        result,scanned,recheck=self.run_poll(day='2026-09-21')
        self.assertNotIn('recheck',result);self.assertEqual(self.snapshot(),saved)
        # An unreadable snapshot is written again without a recheck.
        (self.root/'conversation-poll-master.json').write_text('{')
        result,scanned,recheck=self.run_poll()
        self.assertEqual(result['recheck'],'snapshot_written');recheck.assert_not_called()

    def test_change_rechecks_both_passes_and_advances_the_snapshot(self):
        from mw_integration_agent.conversation_poll import write_snapshot,master_fingerprint
        self.config['conversation_poll_recheck_enabled']=True
        write_snapshot(self.root,master_fingerprint(self.master),now=100.0)
        self.master['borrowers'].append({'id':'b2','username':'@New','enabled':True})
        self.master['accounts'].append({'id':'b','number':'2222222222','active':True})
        result,scanned,recheck=self.run_poll({'image_jobs':0,'recheck_jobs':1,'recheck_errors':0},{'held_requeued':2,'held_skipped':0,'held_skipped_no_archive':1})
        self.assertEqual(scanned.call_args.kwargs['recheck'],{'usernames':{'new'}})
        self.assertEqual(recheck.call_args.args[2:],(True,True,100.0))
        self.assertEqual((result['recheck'],result['held_requeued'],result['held_skipped_no_archive']),('rechecked',2,1))
        self.assertEqual(self.snapshot()['enabled'],['borrower','new']);self.assertGreater(self.snapshot()['written_at'],100.0)
        self.assertTrue((self.root/'receipt-wake').exists())

    def test_only_the_account_change_rechecks_held_recipient_jobs(self):
        from mw_integration_agent.conversation_poll import write_snapshot,master_fingerprint
        self.config['conversation_poll_recheck_enabled']=True
        write_snapshot(self.root,master_fingerprint(self.master),now=100.0)
        self.master['accounts'][0]['alternative']='9999999999'
        result,scanned,recheck=self.run_poll()
        self.assertEqual(scanned.call_args.kwargs['recheck'],{'usernames':set()})
        self.assertEqual(recheck.call_args.args[2:],(False,True,100.0));self.assertEqual(result['recheck'],'rechecked')

    def test_a_scan_that_raises_keeps_the_snapshot_and_skips_the_held_pass(self):
        # Chase (R119): the snapshot advances only after a complete scan and held pass; an exception in the scan leaves it.
        from mw_integration_agent.conversation_poll import write_snapshot,master_fingerprint,run
        self.config['conversation_poll_recheck_enabled']=True
        saved=write_snapshot(self.root,master_fingerprint(self.master),now=100.0)
        self.master['borrowers'].append({'id':'b2','username':'new','enabled':True})
        recheck=Mock()
        with patch('mw_integration_agent.conversation_poll.controls',return_value=self.config), \
             patch('mw_integration_agent.conversation_poll.load_json',return_value={'services':{'conversation_poll':{'enabled':True}}}), \
             patch('mw_integration_agent.conversation_poll.masters',return_value=self.master),patch('mw_integration_agent.conversation_poll.Instagram'), \
             patch('mw_integration_agent.conversation_poll.scan',Mock(side_effect=RuntimeError('boom'))),patch('mw_integration_agent.receipt_recheck.recheck_held',recheck):
            with self.assertRaises(RuntimeError):run('unused','unused')
        recheck.assert_not_called();self.assertEqual(self.snapshot(),saved)
        import fcntl
        with (self.root/'receipt-worker.lock').open('a') as lock:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)  # released on the error

    def test_busy_worker_or_a_failed_group_keeps_the_snapshot(self):
        import fcntl
        from mw_integration_agent.conversation_poll import write_snapshot,master_fingerprint
        self.config['conversation_poll_recheck_enabled']=True
        saved=write_snapshot(self.root,master_fingerprint(self.master),now=100.0)
        self.master['borrowers'].append({'id':'b2','username':'new','enabled':True})
        with (self.root/'receipt-worker.lock').open('a') as held:
            fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
            result,scanned,recheck=self.run_poll()
        self.assertEqual(result['recheck'],'worker_busy');self.assertIsNone(scanned.call_args.kwargs['recheck'])
        recheck.assert_not_called();self.assertEqual(self.snapshot(),saved)
        result,scanned,recheck=self.run_poll({'image_jobs':0,'recheck_jobs':0,'recheck_errors':1})
        self.assertEqual(result['recheck'],'recheck_incomplete');self.assertEqual(self.snapshot(),saved)
        # The poll released the worker lock.
        with (self.root/'receipt-worker.lock').open('a') as lock:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)


class SenderBase(unittest.TestCase):
    def setUp(self):
        from datetime import datetime
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.j=ReceiptJournal(self.tmp.name+'/receipt.db');self.addCleanup(self.j.close)
        from mw_integration_agent.conversation_poll import POLL_TABLES_SQLITE
        self.j.db.executescript(POLL_TABLES_SQLITE)
        self.c={'instagram_account_id':'999','conversation_poll_cutoff':'2026-09-21T00:00:00+00:00','payer_name_cutoff':'2026-09-21T00:00:00+00:00'}
        self.master={'borrowers':[{'id':'b-fahsai','username':'Fahsai','enabled':True},{'id':'b-noey','username':'noey','enabled':True},
                                  {'id':'b-off','username':'off','enabled':False}]}
        self.now=datetime.fromisoformat('2026-09-21T01:00:00+00:00').timestamp()
        # Fahsai (555) is missing from participants.
        self.people=[{'id':'123','username':'noey'},{'id':'999','username':'business'},{'id':'456','username':'partner'}]
    def message(self,key,sender,name=None,time='2026-09-21T00:59:00+00:00',image=True,text=None):
        body={'id':key,'created_time':time,'from':{'id':sender,**({'username':name} if name else {})},
              'attachments':{'data':[{'image_data':{'url':'https://example.invalid/'+key}}] if image else []}}
        if text is not None:body['message']=text
        return body
    def api(self,messages,people=None):
        return Mock(request=Mock(return_value={'data':[{'id':'group','participants':{'data':self.people if people is None else people},'messages':{'data':messages}}]}))
    def outcomes(self):
        return dict(self.j.db.execute('SELECT message_id,outcome FROM conversation_poll_messages').fetchall())
    def jobs(self):
        import json
        return {r['message_id']:json.loads(r['result']) if r['result'] else None for r in self.j.db.execute('SELECT * FROM receipt_jobs')}


class SenderFallbackTests(SenderBase):
    """R151: a borrower Instagram dropped from participants is named by the sender username (SENDER); any other
    non-business sender's image gets a payer-name job (UNIDENTIFIED) from payer_name_cutoff; texts and the business
    account stay IGNORED."""

    def test_a_dropped_borrower_is_identified_by_the_sender_username(self):
        result=scan(self.c,self.api([self.message('text','555','fahsai',image=False,text='hi',time='2026-09-21T00:59:30+00:00'),
                                     self.message('slip','555','@Fahsai')]),self.master,self.j,self.now)
        self.assertEqual(result['image_jobs'],1)
        self.assertEqual(self.outcomes(),{'slip':'SENDER','text':'SENDER'})
        self.assertEqual(self.jobs(),{'slip':{'sender_borrower_id':'b-fahsai','sender_username':'fahsai'}})
        self.assertEqual(self.j.pending()[0]['sender_id'],'555')

    def test_a_group_without_an_enabled_participant_is_scanned_only_for_a_named_first_page_sender(self):
        people=[{'id':'999','username':'business'},{'id':'456','username':'partner'}]
        result=scan(self.c,self.api([self.message('other','456','partner')],people),self.master,self.j,self.now)
        self.assertEqual((result['eligible_conversations'],self.outcomes()),(0,{}))
        result=scan(self.c,self.api([self.message('slip','555','fahsai'),self.message('other','456','partner',time='2026-09-21T00:58:00+00:00')],people),
                    self.master,self.j,self.now)
        self.assertEqual((result['eligible_conversations'],result['image_jobs']),(1,2))
        self.assertEqual(self.outcomes(),{'slip':'SENDER','other':'UNIDENTIFIED'})
        self.assertEqual(self.jobs()['other'],{'unidentified_sender':True,'group_borrower_ids':[]})
        # The business account naming an enabled borrower never makes a group eligible.
        self.j.db.execute('DELETE FROM conversation_poll_messages');self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.commit()
        result=scan(self.c,self.api([self.message('own','999','fahsai')],people),self.master,self.j,self.now+600)
        self.assertEqual((result['eligible_conversations'],self.outcomes()),(0,{}))

    def test_business_texts_and_disabled_names_never_become_sender_jobs(self):
        messages=[self.message('biz','999','fahsai'),self.message('chat','456','partner',image=False,text='ok'),
                  self.message('pimg','456','partner'),self.message('stranger','777','stranger'),self.message('off','778','off'),
                  self.message('stext','777','stranger',image=False,text='slip?')]
        scan(self.c,self.api(messages),self.master,self.j,self.now)
        self.assertEqual(self.outcomes(),{'biz':'IGNORED','chat':'IGNORED','pimg':'UNIDENTIFIED','stranger':'UNIDENTIFIED',
                                          'off':'UNIDENTIFIED','stext':'IGNORED'})
        self.assertEqual(set(self.jobs()),{'pimg','stranger','off'})
        self.assertEqual(self.jobs()['stranger'],{'unidentified_sender':True,'group_borrower_ids':['b-noey']})

    def test_unidentified_images_need_the_payer_name_cutoff(self):
        for config in (dict(self.c,payer_name_cutoff='2026-09-21T00:59:30+00:00'),{k:v for k,v in self.c.items() if k!='payer_name_cutoff'}):
            with self.subTest(config=config.get('payer_name_cutoff')):
                self.j.db.execute('DELETE FROM conversation_poll_messages');self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.commit()
                scan(config,self.api([self.message('pimg','456','partner'),self.message('slip','555','fahsai',time='2026-09-21T00:58:00+00:00')]),
                     self.master,self.j,self.now)
                self.assertEqual(self.outcomes(),{'pimg':'IGNORED','slip':'SENDER'})

    def test_borrower_and_forwarding_outcomes_are_unchanged(self):
        self.master['partners']=[{'id':'p','username':'partner'}]
        self.c.update(receipt_forwarding_enabled=True,receipt_forwarder_partner_id='p',receipt_group_account_username='business',
                      receipt_forwarding_cutoff='2026-09-21T00:00:00+00:00')
        scan(self.c,self.api([self.message('own','123','noey'),self.message('fw','456','partner',time='2026-09-21T00:58:00+00:00')]),self.master,self.j,self.now)
        self.assertEqual(self.outcomes(),{'own':'BORROWER','fw':'FORWARDED'})
        self.assertEqual(self.jobs(),{'own':None,'fw':{'forwarded_borrower_id':'b-noey'}})


class ReprocessTests(SenderBase):
    """R151 poll-reprocess: one group's IGNORED slips since yesterday 00:00 Bangkok that the poll now gives a job."""
    def ignored(self,*messages):
        # Before R151 the dropped sender's slip was recorded IGNORED (simulated: no username, no payer cutoff).
        config={k:v for k,v in self.c.items() if k!='payer_name_cutoff'}
        scan(config,self.api([dict(m,**{'from':{'id':m['from']['id']}}) for m in messages]),self.master,self.j,self.now)
        self.assertEqual(set(self.outcomes().values()),{'IGNORED'})
    def reprocess(self,messages,suffix=None,later=3600):
        from mw_integration_agent.conversation_poll import reprocess_ignored
        return reprocess_ignored(self.c,self.api(messages),self.master,self.j.db,'group',suffix,self.now+later)

    def test_ignored_slip_becomes_a_sender_job_once(self):
        import json
        slip=self.message('slip','555','fahsai',time='2026-09-21T00:10:00+00:00')
        self.ignored(slip);cursor=self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0]
        fresh=dict(slip,attachments={'data':[{'id':'att','image_data':{'url':'https://example.invalid/fresh'}}]})
        result=self.reprocess([fresh])
        self.assertEqual(result,{'status':'ok','messages':1,'reclassified':1,'jobs':1,'skipped_existing':0,'unmatched':0,'still_ignored':0})
        self.assertEqual(self.outcomes(),{'slip':'SENDER'})
        job=self.j.pending()[0]
        self.assertEqual((job['url'],job['sender_id'],json.loads(job['source'])['kind']),('https://example.invalid/fresh','555','poll'))
        self.assertEqual(self.jobs(),{'slip':{'sender_borrower_id':'b-fahsai','sender_username':'fahsai'}})
        self.assertEqual(self.j.db.execute('SELECT checked_through FROM conversation_poll_state').fetchone()[0],cursor)
        # Idempotent: the row is no longer IGNORED.
        self.assertEqual(self.reprocess([fresh],later=7200)['jobs'],0);self.assertEqual(len(self.jobs()),1)
        # Counts only: no text, username, URL or message id.
        printed=json.dumps(result)
        for secret in ('fahsai','example.invalid','slip','555','group'):self.assertNotIn(secret,printed)

    def test_existing_job_ambiguous_rows_and_still_ignored_slips_are_left(self):
        slip=self.message('slip','555','fahsai',time='2026-09-21T00:10:00+00:00')
        self.ignored(slip)
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,created_at) VALUES ('k','slip','555','',?)",(self.now,));self.j.db.commit()
        result=self.reprocess([slip])
        self.assertEqual((result['skipped_existing'],result['jobs'],self.outcomes()),(1,0,{'slip':'IGNORED'}))
        self.j.db.execute('DELETE FROM receipt_jobs');self.j.db.commit()
        # A changed id within 5 s of two IGNORED rows is ambiguous.
        self.j.db.execute("INSERT INTO conversation_poll_messages VALUES ('near','group',?,?,'IGNORED')",(self.now-3000+2,self.now));self.j.db.commit()
        changed=self.message('new-id','555','fahsai',time='2026-09-21T00:10:01+00:00')
        result=self.reprocess([changed])
        self.assertEqual((result['unmatched'],result['jobs']),(1,0))
        # A business image is still IGNORED.
        result=self.reprocess([self.message('biz','999','fahsai',time='2026-09-21T00:20:00+00:00')])
        self.assertEqual((result['still_ignored'],result['jobs']),(1,0))

    def test_suffix_selects_exactly_one_recorded_row(self):
        first=self.message('aaaa-1111','555','fahsai',time='2026-09-21T00:10:00+00:00')
        second=self.message('bbbb-1111','555','fahsai',time='2026-09-21T00:20:00+00:00')
        self.ignored(second,first)
        self.assertEqual(self.reprocess([second,first],'9999')['status'],'message_not_found')
        self.assertEqual(self.reprocess([second,first],'1111')['status'],'message_ambiguous')
        result=self.reprocess([second,first],'a-1111')
        self.assertEqual((result['status'],result['messages'],result['jobs']),('ok',1,1))
        self.assertEqual(self.outcomes(),{'aaaa-1111':'SENDER','bbbb-1111':'IGNORED'})

    def test_missing_conversation_and_unreadable_history(self):
        from mw_integration_agent.conversation_poll import reprocess_ignored
        api=Mock(request=Mock(return_value={'data':[]}))
        self.assertEqual(reprocess_ignored(self.c,api,self.master,self.j.db,'group',None,self.now)['status'],'conversation_not_found')
        api=self.api([self.message('slip','555','fahsai')]);api.request.return_value['data'][0]['messages']['paging']={'next':'unused'}
        with self.assertRaises(ConfigurationError):reprocess_ignored(self.c,api,self.master,self.j.db,'group',None,self.now)

    def test_run_takes_the_poll_lock_without_waiting_and_wakes_on_jobs(self):
        import fcntl
        from pathlib import Path
        from mw_integration_agent.conversation_poll import reprocess
        root=Path(self.tmp.name);config=dict(self.c,conversation_poll_enabled=True,state_directory=self.tmp.name)
        def run(result):
            with patch('mw_integration_agent.conversation_poll.controls',return_value=config), \
                 patch('mw_integration_agent.conversation_poll.load_json',return_value={'services':{'conversation_poll':{'enabled':True}}}), \
                 patch('mw_integration_agent.conversation_poll.masters'),patch('mw_integration_agent.conversation_poll.Instagram') as client, \
                 patch('mw_integration_agent.conversation_poll.reprocess_ignored',return_value=result) as core:
                value=reprocess('unused','unused','group','a-1111')
                return value,client,core
        with (root/'conversation-poll.lock').open('a') as held:
            fcntl.flock(held,fcntl.LOCK_EX|fcntl.LOCK_NB)
            value,client,core=run({'status':'ok','jobs':1})
            self.assertEqual(value,{'status':'already_running'});core.assert_not_called()
        self.assertFalse((root/'receipt-wake').exists())
        value,client,core=run({'status':'ok','jobs':0})
        self.assertEqual(core.call_args.args[4:],('group','a-1111'));client.assert_called_once_with(config,read_timeout=40)
        self.assertFalse((root/'receipt-wake').exists())
        run({'status':'ok','jobs':1});self.assertTrue((root/'receipt-wake').exists())
        for bad in (('group',"x'"),('a b',None)):
            with self.subTest(bad=bad),self.assertRaises(ConfigurationError):reprocess('unused','unused',*bad)
