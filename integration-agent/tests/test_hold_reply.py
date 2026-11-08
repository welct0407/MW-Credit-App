import hashlib
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from mw_integration_agent.hold_reply import decide,queue_result,result_key
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.receipt_hold import event_key
from mw_integration_agent.receipt_health import assess


class HoldReplyTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);self.root=Path(temp.name)
        self.j=ReceiptJournal(self.root/'receipt-processing.db');self.addCleanup(self.j.close)
        self.reviews=ReviewStore(self.j.db)
        self.n=NoticeJournal(self.root/'partner-notices.db');self.addCleanup(self.n.close)
        self.p={'id':'p','username':'partner','enabled':True,'language':'English','email':'test@example.invalid'}
        self.config={'state_directory':str(self.root),'receipt_hold_reply_cutoff':'1970-01-01T00:01:40+00:00','partner_review_cutoff':'1970-01-01T00:00:00+00:00'}
        self.j.db.execute("INSERT INTO receipt_jobs(id,message_id,sender_id,url,status,created_at,detail) VALUES ('j','image','borrower','','REVIEW',1,'AMOUNT_UNREADABLE')")
        self.j.db.execute("INSERT INTO receipt_keys VALUES ('image:test','j')");self.j.db.commit()
        self.key=event_key(self.job())
        notice_id=self.n.reserve(self.key,self.p,'subject','body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out',recipient_id='123' WHERE id=?",(notice_id,))
        self.notice=dict(self.n.db.execute('SELECT * FROM partner_notices').fetchone())
        self.event={'message_id':'in','reply_to':'out','sender_id':'123','text':' ReJeCt ','event_timestamp':110,'captured_at':111}
        self.identity={'id':'123','username':'partner'}
    def job(self):return dict(self.j.db.execute("SELECT * FROM receipt_jobs WHERE id='j'").fetchone())
    def decide(self,**kwargs):
        return decide(self.j.db,self.config,kwargs.get('event',self.event),kwargs.get('notice',self.notice),[self.p],kwargs.get('identity',self.identity),kwargs.get('reviewers',['p']),now=200)
    def test_reject_removes_hold_preserves_history_and_dedup(self):
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual((self.job()['status'],self.job()['detail']),('REJECTED','AMOUNT_UNREADABLE'))
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM receipt_keys').fetchone()[0],1)
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM partner_reviews').fetchone()[0],0)
        self.assertEqual(assess([self.job()],[],[],200)['held_receipts'],0)
    def test_restart_and_repeated_reply_are_idempotent(self):
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual(self.decide(event=dict(self.event,message_id='again')),'HOLD_NOT_ACTIVE')
    def test_reject_and_no_are_case_insensitive(self):
        for i,text in enumerate(('reject','REJECT','Reject','no','NO',' No ')):
            with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET status='REVIEW'")
            self.assertEqual(self.decide(event=dict(self.event,text=text,message_id='word'+str(i))),'HOLD_REJECTED')
    def test_authorization_and_correlation_fail_closed(self):
        for kwargs,expected in [({'reviewers':[]},'NOT_REVIEWER'),({'identity':{'id':'other','username':'partner'}},'UNAUTHORIZED'),
          ({'event':dict(self.event,reply_to='wrong')},'NOT_CORRELATED'),({'event':dict(self.event,sender_id='other')},'NOT_CORRELATED'),
          ({'notice':dict(self.notice,ig_status='UNKNOWN')},'NOT_CORRELATED')]:
            self.assertEqual(self.decide(**kwargs),expected)
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_approval_or_ambiguous_words_never_dismiss_or_post(self):
        for i,text in enumerate(('ok','yes','approved','why?','please do not reject')):
            self.assertEqual(self.decide(event=dict(self.event,text=text,message_id=str(i))),'HOLD_REJECT_REQUIRED')
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_old_replies_and_future_events_do_not_decide(self):
        for event in (dict(self.event,event_timestamp=90),dict(self.event,captured_at=90)):
            self.assertEqual(self.decide(event=event),'BEFORE_HOLD_REPLY_CUTOFF')
        self.assertEqual(self.decide(event=dict(self.event,event_timestamp=201)),'INVALID_TIME')
    def test_old_reason_or_existing_posting_cannot_be_cleared(self):
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='DATE_UNREADABLE'")
        self.assertEqual(self.decide(),'HOLD_NOT_ACTIVE')
        for i,state in enumerate(('PENDING','APPROVED','POSTING','POSTED','UNKNOWN')):
            with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='AMOUNT_UNREADABLE'")
            self.reviews.reserve('j',{},1)
            with self.j.db:self.j.db.execute('UPDATE partner_reviews SET state=?',(state,))
            self.assertEqual(self.decide(event=dict(self.event,message_id='protected'+str(i))),'HOLD_HAS_REVIEW')
            self.assertEqual(self.job()['status'],'REVIEW')
    def test_ack_recovery_is_durable_and_failures_visible(self):
        self.decide()  # crash before acknowledgement reserve
        replies=[dict(r) for r in self.j.db.execute('SELECT * FROM partner_review_replies')]
        self.assertEqual(assess([self.job()],[],[],1000,replies)['failed_notifications'],1)
        queue_result(self.n,self.event,self.notice,[self.p],self.decide())
        queue_result(self.n,self.event,self.notice,[self.p],self.decide())
        self.assertEqual(len(self.n.due()),1)
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED' WHERE event_key=?",(result_key('in'),))
        notices=[dict(r) for r in self.n.db.execute('SELECT * FROM partner_notices')]
        self.assertEqual(assess([self.job()],[],notices,1000,replies)['status'],1)
    def test_cycle_routes_hold_reply_without_payment_and_retries_ack(self):
        from mw_integration_agent.review_cycle import cycle
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.capture('batch',[{'message_id':'in','sender_id':'123','timestamp':time.time()-1,'text':'reject','reply_to':'out'}]);ingress.close()
        live={'partners':[self.p],'reviewer_ids':['p'],'borrowers':[],'accounts':[]}
        with patch('mw_integration_agent.review_cycle.masters',return_value=live),patch.object(NoticeJournal,'dispatch'), \
             patch('mw_integration_agent.review_cycle.add_payment',create=True) as add,patch('mw_integration_agent.hold_reply.queue_result',side_effect=RuntimeError('crash')):
            self.assertTrue(cycle(self.config,self.j,lambda *_:self.identity)['failures'])
            self.assertEqual(self.job()['status'],'REJECTED');add.assert_not_called()
        with patch('mw_integration_agent.review_cycle.masters',return_value=live),patch.object(NoticeJournal,'dispatch') as dispatch, \
             patch('mw_integration_agent.review_cycle.add_payment',create=True) as add:
            self.assertFalse(cycle(self.config,self.j,lambda *_:self.identity)['failures'])
            self.assertEqual(len(self.n.due()),1);self.assertEqual(dispatch.call_count,1);add.assert_not_called()

    def test_reject_on_archive_unavailable_hold_rejects_and_text_renders_blank_fields(self):
        from mw_integration_agent.receipt_hold import held_text
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='RECEIPT_ARCHIVE_UNAVAILABLE'")
        key=event_key(self.job())
        notice_id=self.n.reserve(key,self.p,'subject','body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='out2',recipient_id='123' WHERE id=?",(notice_id,))
        notice=dict(self.n.db.execute('SELECT * FROM partner_notices WHERE id=?',(notice_id,)).fetchone())
        self.assertEqual(self.decide(event=dict(self.event,reply_to='out2'),notice=notice),'HOLD_REJECTED')
        english=held_text(self.job(),None,'English',[])[1];thai=held_text(self.job(),None,'ไทย',[])[1]
        self.assertIn('could not be kept as evidence',english);self.assertIn('unavailable baht',english)
        self.assertIn('ระบบจัดเก็บภาพสลิปเป็นหลักฐานไม่ได้',thai);self.assertIn('ไม่ทราบ บาท',thai)
        self.assertIn('send Reject',english)

    def test_reply_to_archive_pending_alert_is_ignored(self):
        from mw_integration_agent.review_cycle import cycle
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET status='PENDING',detail='RECEIPT_ARCHIVE_PENDING'")
        notice_id=self.n.reserve('receipt-archive-pending:j:RECEIPT_DOWNLOAD_FAILED',self.p,'subject','body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id='late',recipient_id='123' WHERE id=?",(notice_id,))
        ingress=IngressJournal(self.root/'instagram-ingress.db')
        ingress.capture('batch',[{'message_id':'in','sender_id':'123','timestamp':time.time()-1,'text':'reject','reply_to':'late'}]);ingress.close()
        live={'partners':[self.p],'reviewer_ids':['p'],'borrowers':[],'accounts':[]}
        with patch('mw_integration_agent.review_cycle.masters',return_value=live),patch.object(NoticeJournal,'dispatch'):
            self.assertFalse(cycle(self.config,self.j,lambda *_:self.identity)['failures'])
        self.assertEqual((self.job()['status'],self.job()['detail']),('PENDING','RECEIPT_ARCHIVE_PENDING'))
        self.assertEqual(self.j.db.execute('SELECT count(*) FROM partner_review_replies').fetchone()[0],0)

    # R135: the `review` command resends active holds as `<event_key>:resend:<sha256 of the command>` copies.
    def resent_notice(self,message_id='copy',key=None):
        key=key or self.key+':resend:'+hashlib.sha256(b'command').hexdigest()
        notice_id=self.n.reserve(key,self.p,'subject','copy body')
        with self.n.db:self.n.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED',message_id=?,recipient_id='123' WHERE id=?",(message_id,notice_id))
        return dict(self.n.db.execute('SELECT * FROM partner_notices WHERE id=?',(notice_id,)).fetchone())
    def test_reject_on_resent_copy_then_original_is_not_active(self):
        copy=self.resent_notice()
        self.assertEqual(self.decide(event=dict(self.event,reply_to='copy',message_id='on-copy'),notice=copy),'HOLD_REJECTED')
        self.assertEqual((self.job()['status'],self.job()['detail']),('REJECTED','AMOUNT_UNREADABLE'))
        self.assertEqual(self.decide(event=dict(self.event,message_id='on-original')),'HOLD_NOT_ACTIVE')
        replies=dict(self.j.db.execute('SELECT message_id,review_id FROM partner_review_replies').fetchall())
        self.assertEqual(replies,{'on-copy':copy['event_key'],'on-original':self.key})
    def test_reject_on_original_then_resent_copy_is_not_active(self):
        copy=self.resent_notice()
        self.assertEqual(self.decide(),'HOLD_REJECTED')
        self.assertEqual(self.decide(event=dict(self.event,reply_to='copy',message_id='on-copy'),notice=copy),'HOLD_NOT_ACTIVE')
    def test_resent_copy_keeps_every_guard(self):
        copy=self.resent_notice();event=dict(self.event,reply_to='copy')
        for i,text in enumerate(('approve','yes','อนุมัติ')):
            self.assertEqual(self.decide(event=dict(event,text=text,message_id='a'+str(i)),notice=copy),'HOLD_REJECT_REQUIRED')
        for kwargs,expected in [({'reviewers':[]},'NOT_REVIEWER'),({'event':dict(event,sender_id='other')},'NOT_CORRELATED'),
                                ({'event':dict(event,reply_to='out')},'NOT_CORRELATED'),({'event':dict(event,captured_at=90)},'BEFORE_HOLD_REPLY_CUTOFF')]:
            self.assertEqual(self.decide(**{'notice':copy,'event':event,**kwargs}),expected)
        self.assertEqual(self.job()['status'],'REVIEW')
        self.reviews.reserve('j',{},1)
        self.assertEqual(self.decide(event=dict(event,message_id='has-review'),notice=copy),'HOLD_HAS_REVIEW')
        with self.j.db:self.j.db.execute('DELETE FROM partner_reviews')
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='DATE_UNREADABLE'")
        self.assertEqual(self.decide(event=dict(event,message_id='changed'),notice=copy),'HOLD_NOT_ACTIVE')
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='AMOUNT_UNREADABLE',status='DUPLICATE'")
        self.assertEqual(self.decide(event=dict(event,message_id='resolved'),notice=copy),'HOLD_NOT_ACTIVE')
    def test_malformed_resend_suffix_fails_closed(self):
        for i,suffix in enumerate((':resend:short',':resend:'+'A'*64,':options:'+'a'*64)):
            copy=self.resent_notice('bad'+str(i),self.key+suffix)
            self.assertEqual(self.decide(event=dict(self.event,reply_to='bad'+str(i),message_id='bad'+str(i)),notice=copy),'HOLD_NOT_ACTIVE')
        self.assertEqual(self.job()['status'],'REVIEW')
    def test_result_copy(self):
        for outcome,english,thai in (
          ('HOLD_REJECTED','Removed from the review list. The agent recorded or changed no payment. Receipt history is kept.',
           'นำออกจากรายการรอตรวจสอบแล้ว ระบบไม่ได้บันทึกหรือเปลี่ยนแปลงรายการชำระเงิน ยังเก็บประวัติสลิปไว้'),
          ('HOLD_REJECT_REQUIRED','Held receipts cannot be approved. Use Reply on the hold message and send Reject. If the payment is genuine, record it in the app first.',
           'สลิปที่พักไว้อนุมัติไม่ได้ ใช้ Reply ตอบข้อความแจ้งพักสลิปว่า Reject หรือ ปฏิเสธ หากเป็นการชำระจริง กรุณาบันทึกในแอปก่อน')):
            for language,words in (('English',english),('ไทย',thai)):
                partner=dict(self.p,language=language);event=dict(self.event,message_id=outcome+language)
                queue_result(self.n,event,self.notice,[partner],outcome)
                body=self.n.db.execute('SELECT body FROM partner_notices WHERE event_key=?',(result_key(event['message_id']),)).fetchone()[0]
                self.assertEqual(body.split('\n')[1],words)
    def test_hold_text_closing_block_and_fallback(self):
        from mw_integration_agent.receipt_hold import FALLBACK,held_text
        with self.j.db:self.j.db.execute("UPDATE receipt_jobs SET detail='SOMETHING_NEW'")
        english=held_text(self.job(),None,'English',[])[1];thai=held_text(self.job(),None,'ไทย',[])[1]
        self.assertIn('Reason: Receipt validation could not be completed. Check the slip against the app.\n',english)
        self.assertIn('สาเหตุ: ตรวจสอบสลิปไม่สำเร็จ กรุณาตรวจสอบสลิปกับรายการในแอป\n',thai)
        self.assertEqual(FALLBACK[0],'Receipt validation could not be completed. Check the slip against the app.')
        self.assertTrue(english.endswith('\nNo payment posted. Check the receipt against the app records.\nThis cannot be approved here. If the payment is genuine, '
                                         'record it in the app yourself. Then use Reply on this message and send Reject to clear it from the list.'))
        self.assertTrue(thai.endswith('\nอนุมัติผ่านข้อความนี้ไม่ได้ หากเป็นการชำระจริง กรุณาบันทึกในแอปเอง แล้วใช้ Reply ตอบข้อความนี้ว่า Reject หรือ ปฏิเสธ เพื่อนำออกจากรายการ'))
        self.assertNotIn('Replying approve',english);self.assertNotIn('queue',english);self.assertEqual(english.count('Reject'),1)
        self.assertNotIn('การตอบอนุมัติ',thai);self.assertNotIn('คิว',thai)


# Codes raised as ReceiptInvalid that never become a receipt-job hold: execution-time review outcomes (partner_reviews
# STALE/MANUAL_REQUIRED/UNKNOWN), the retired direct-email path, and IGNORED/DUPLICATE outcomes.
NOT_HOLD_CODES={'APPROVING_PARTNER_CHANGED','AUTO_ACTOR_CHANGED','AUTO_ACTOR_UNMAPPED','BORROWER_MAPPING_CHANGED','BORROWER_NOT_UNIQUELY_ENABLED',
                'CASH_ACCOUNT_CHANGED','NOT_PAYMENT_RECEIPT','NO_PARTNER_EMAIL','PARTNER_DELIVERY_CHANGED',
                'PARTNER_LANGUAGE_UNSUPPORTED','PARTNER_LOGIN_UNMAPPED','PAY_FORWARD_DAY_PASSED','PAY_FORWARD_PLAN_CHANGED',
                'PAY_FORWARD_PURPOSE_MISSING','PROPOSAL_FACTS_CHANGED','RECEIPT_DATE_TOO_OLD','RECEIPT_MISSING','RECEIVING_ACCOUNT_CHANGED'}
R135_CODES=('IG_CONVERSATION_IDENTITY_AMBIGUOUS','IG_SENDER_INVALID','EXPLICIT_NON_THB_CURRENCY','FORWARDER_UNMAPPED','FORWARDED_GROUP_NOT_ELIGIBLE',
            'FORWARDED_GROUP_AMBIGUOUS','FORWARDED_GROUP_MISSING','FORWARDED_BORROWER_CHANGED','BORROWER_CHANGED','LOAN_KEY_UNAVAILABLE',
            'PAY_FORWARD_PLAN_UNAVAILABLE','WHOLE_BAHT_REQUIRED','MULTIPLE_TODAY_CHARGES','REVIEW_REQUEST_TOO_LONG')


class HoldReasonCoverageTests(unittest.TestCase):
    def test_every_hold_raising_code_has_its_own_reason(self):
        import re
        from mw_integration_agent import receipt_hold
        from mw_integration_agent.receipt_hold import REASONS
        source=Path(receipt_hold.__file__).parent
        raised=set();marked=set()
        for path in source.glob('*.py'):
            text=path.read_text(encoding='utf-8')
            raised|=set(re.findall(r"(?:ReceiptInvalid|PayerHeld)\('([A-Z_]+)'",text))
            marked|=set(re.findall(r"mark\([^)]*'REVIEW',\s*'([A-Z_]+)'\)",text))
            marked|=set(re.findall(r"retry\([^)]*'([A-Z_]+)'[,)]",text))-{'RECEIPT_PROCESSING_STARTED'}
        self.assertTrue({'AMOUNT_UNREADABLE','PAYER_UNRESOLVED'}<=raised and {'RECEIPT_RETRY_LIMIT','RECEIPT_PROPOSAL_UNAVAILABLE','RECEIPT_PROCESSING_UNAVAILABLE'}<=marked)
        self.assertEqual(NOT_HOLD_CODES-raised,set(),'a listed non-hold code is no longer raised')
        holds=(raised-NOT_HOLD_CODES)|marked|{'POSSIBLE_EXISTING_PAYMENT_REVIEW'}
        self.assertEqual(sorted(holds-set(REASONS)),[],'a hold code needs a REASONS entry (or, if it never holds, NOT_HOLD_CODES)')
        self.assertTrue(set(R135_CODES)<=holds)
    def test_reasons_are_bilingual_and_fit(self):
        from mw_integration_agent.receipt_hold import REASONS
        for code,(english,thai) in REASONS.items():
            self.assertTrue(english.isascii() and english.endswith('.'),code)
            self.assertFalse(thai.isascii(),code)
            self.assertLessEqual(max(len(english),len(thai)),200,code)
