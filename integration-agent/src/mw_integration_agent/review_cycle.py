"""Receipt -> automatic ordinary payment or correlated Partner review/manual handling."""
import json
import time
from .state import connect as state_connect, enabled as state_enabled
from datetime import timedelta
from pathlib import Path
from .business_time import today
from .config import ConfigurationError, cutoff_ts
from contextlib import contextmanager
from .receipt_rules import ReceiptInvalid
from .receipt_master import masters
from .payment_match import check
from .partner_notice import NoticeJournal,receipt_notice
from .statement_delivery import resolve_recipient
from .partner_review import ReviewStore,request_text,review_id
from .review_proposal import facts,plan,review_posts_overpayment,same_posting_outcome,unlabelled
from .review_execution import readback
from . import receipt_api
from .cash_statement import read_query
from .receipt_identity import receipt_borrower

AUTO_POLICY='OWNER_AUTHORIZED_AUTO_PAYMENT'
NOT_SENT_RETRY_SECONDS=900  # AGT-SEND-03: a persistent 401/403 or token fault re-submits every 15 minutes, not every cycle
NOTICE_CAP=6  # bounded transport work per notify pass; failures keep the 300 s deferral
SAME_OUTCOME='FACTS_CHANGED_SAME_OUTCOME'
LOAN_CLOSE='LOAN_CLOSE_REQUIRED'

# R095 (Cloud SQL log, both receipt-cycle failures): "could not determine data type of parameter $2" for a None note,
# because "? IS NULL" gives the server no type to infer. Both note parameters are cast to text (detail's type), in the
# form both state backends accept (SQLite and PostgreSQL through the adapter's ? to %s rewrite).
SETTLE_REVIEW_SQL = ("UPDATE partner_reviews SET state=?,detail=CASE WHEN CAST(? AS TEXT) IS NULL THEN detail ELSE CAST(? AS TEXT) END "
                     "WHERE id=?")


@contextmanager
def isolated(failures,stage,on_error=None):
    try:yield
    except Exception as exc:
        # Safe aggregate diagnostics; no provider bodies, receipt details or secrets.
        failures.append({'stage':stage,'exception':type(exc).__name__})
        if on_error:on_error()


def automatic_payment(config,job,proposal):
    return (config.get('receipt_auto_payment_enabled') is True and proposal['action']=='Lump Sum'
            and job['created_at']>=cutoff_ts(config,'receipt_auto_payment_cutoff'))


def reviewer_partners(live):
    """Role selection is independent of notification/IG delivery preferences."""
    return [p for p in live['partners'] if p['id'] in live.get('reviewer_ids',[])]


def cycle(config,journal,identity_reader,resolver=resolve_recipient,images=None):
    """images=None keeps the legacy order. With an image phase, approvals and their notices
    run first; a second execute/notify pass completes what the image phase produced."""
    run=Run(config,journal,identity_reader,resolver)
    try:
        run.expire()
        if images is None:
            run.propose_validated();run.decide_replies();run.execute_approved();run.notify()
        else:
            run.decide_replies();run.execute_approved();run.notify()
            images()
            run.propose_validated();run.execute_approved();run.notify()
        return run.result()
    finally:run.close()


class Run:
    """One receipt run's review phases; execute_approved touches each review at most once per run."""
    def __init__(self,config,journal,identity_reader,resolver=resolve_recipient):
        self.config=config;self.journal=journal;self.db=journal.db;self.reviews=ReviewStore(self.db)
        self.identity_reader=identity_reader;self.resolver=resolver
        self.root=Path(config['state_directory'])
        self.notices=NoticeJournal(self.root/'partner-notices.db', config=config)
        self.cutoff=cutoff_ts(config,'partner_review_cutoff')
        self.failures=[];self.notification_failures=[];self.executed=set()
        self.states={r['id']:r['state'] for r in self.db.execute('SELECT id,state FROM partner_reviews')}

    def close(self):self.notices.close()

    def result(self):
        return {'failures':self.failures,'notification_failures':self.notification_failures,
                'reviews':[dict(r) for r in self.db.execute('SELECT state,count(*) count FROM partner_reviews GROUP BY state')]}

    def expire(self):
        with self.db:self.db.execute("UPDATE partner_reviews SET state='EXPIRED' WHERE state='PENDING' AND expires_at<?",(time.time(),))

    def propose_validated(self):
        config,journal,db,reviews,failures=self.config,self.journal,self.db,self.reviews,self.failures
        for job in db.execute("SELECT * FROM receipt_jobs WHERE status='VALIDATED' AND created_at>=?",(self.cutoff,)).fetchall():
            with isolated(failures,'proposal',lambda job=job:journal.mark(job['id'],'REVIEW','RECEIPT_PROPOSAL_UNAVAILABLE')):
                result=json.loads(job['result']);live=masters(config)
                try:
                    b=receipt_borrower(config,job,journal,live,self.identity_reader)
                    if b['id']!=result['borrower']['id']:raise ReceiptInvalid('BORROWER_CHANGED')
                    check(config,result['receipt'],b)
                    proposal=plan(result['receipt'],b,facts(config,b['id']))
                    prior=db.execute('SELECT id,proposal FROM partner_reviews WHERE job_id=?',(job['id'],)).fetchone()
                    if prior and json.loads(prior['proposal'])!=proposal:
                        with db:
                            db.execute("UPDATE partner_reviews SET state='STALE',detail='PROPOSAL_FACTS_CHANGED' WHERE id=? AND state='PENDING'",(prior['id'],))
                            db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED' WHERE id=?",(job['id'],))
                        continue
                    if automatic_payment(config,job,proposal):
                        key=reviews.reserve(job['id'],proposal)
                        with db:
                            db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner=?,detail=? WHERE id=? AND state='PENDING'",
                                       (config['receipt_auto_actor_partner_id'],AUTO_POLICY,key))
                            db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED' WHERE id=?",(job['id'],))
                        continue
                    recipients=reviewer_partners(live)
                    if not recipients:
                        journal.mark(job['id'],'VALIDATED','NO_AI_REVIEWER')
                        continue
                    key=reviews.reserve(job['id'],proposal)
                    for p in recipients:
                        subject,body=request_text(proposal,p['language'])
                        if job['detail']=='OWNER_REQUESTED_RECONSIDERATION':
                            body=('คำขอแก้ไข — ใช้แทนคำขอเดิม\n' if p['language']=='ไทย' else 'Corrected request — replaces the earlier request\n')+body
                            if len(body)>1000:raise ReceiptInvalid('REVIEW_REQUEST_TOO_LONG')
                        self.notices.reserve('review:'+key,p,subject,body)
                    with db:db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED' WHERE id=?",(job['id'],))
                except ReceiptInvalid as exc:journal.mark(job['id'],'REVIEW',str(exc))

    def decide_replies(self):
        config,db,notices,root,identity_reader=self.config,self.db,self.notices,self.root,self.identity_reader
        # Signed direct-message replies only. API-polled borrower content cannot authorize.
        # Apply the additive local schema before the first new webhook arrives.
        from .journal import IngressJournal
        migrated=IngressJournal(root/'instagram-ingress.db', config=config);migrated.close()
        ingress=state_connect(root/'instagram-ingress.db',config,readonly=True)
        try:
            events=ingress.execute("SELECT * FROM messages WHERE captured_at>=? AND (reply_to<>'' OR event_timestamp>=?) " + ("AND message_id NOT IN (SELECT message_id FROM ingress_work WHERE state='REVIEW') " if state_enabled(config) else "") + "ORDER BY event_timestamp,message_id",(self.cutoff,time.time()-86340)).fetchall()
        finally:ingress.close()
        for event in events:
            with isolated(self.failures,'reply'):
                event=dict(event)
                from .review_resend import is_command,queue
                if is_command(event):
                    if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
                    if not config.get('review_resend_cutoff'):continue
                    command_cutoff=cutoff_ts(config,'review_resend_cutoff')
                    if min(event['captured_at'],event['event_timestamp'])<command_cutoff or not 0<=time.time()-event['event_timestamp']<86340:continue
                    queue(db,notices,config,event,masters(config),identity_reader(config,event['sender_id']))
                    continue
                if not event.get('reply_to'):continue
                notice=notices.db.execute("SELECT * FROM partner_notices WHERE message_id=? AND (event_key LIKE 'review:%' OR event_key LIKE 'receipt-held:%')",(event['reply_to'],)).fetchone()
                if not notice:continue
                if notice['event_key'].startswith('receipt-held:'):
                    from .hold_reply import decide,queue_result,result_key
                    if not config.get('receipt_hold_reply_cutoff'):continue
                    hold_cutoff=cutoff_ts(config,'receipt_hold_reply_cutoff')
                    if event['event_timestamp']<hold_cutoff or event['captured_at']<hold_cutoff:continue
                    # Retry interrupted acknowledgement preparation independently
                    # of the already committed, idempotent dismissal.
                    if notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=?',(result_key(event['message_id']),)).fetchone():continue
                    live=masters(config)
                    identity=identity_reader(config,event['sender_id'])
                    outcome=decide(db,config,event,dict(notice),live['partners'],identity,live.get('reviewer_ids',[]))
                    queue_result(notices,event,dict(notice),live['partners'],outcome)
                    continue
                if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
                live=masters(config)
                try:identity=identity_reader(config,event['sender_id'])
                except ConfigurationError:continue
                self.reviews.decide(event,dict(notice),live['partners'],identity,reviewer_ids=live.get('reviewer_ids',[]))

    def execute_approved(self):
        config,journal,db,notices,root,failures=self.config,self.journal,self.db,self.notices,self.root,self.failures
        for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('APPROVED','POSTING','UNKNOWN')").fetchall():
            # A second pass in the same run only sees reviews the image phase produced;
            # an UNKNOWN/POSTING row is reconciled (one status GET) at most once per run.
            if review['id'] in self.executed:continue
            self.executed.add(review['id'])
            with isolated(failures,'execution'):
                proposal=json.loads(review['proposal']);key=review['payment_id'] if review['payment_id'] is not None else 'igr:'+review['id'][:48]
                if not isinstance(key,str) or not key.startswith(('pwa:','igr:')) or not key.removeprefix('pwa:').removeprefix('igr:'):
                    raise ConfigurationError('INVALID_SAVED_PAYMENT_IDENTITY')
                if review['state'] in ('POSTING','UNKNOWN'):
                    if review['state']=='POSTING':
                        with db:db.execute("UPDATE partner_reviews SET state='UNKNOWN' WHERE id=?",(review['id'],))
                    api_result=receipt_api.status(config,key,review['id']) if key.startswith('pwa:') else None
                    if api_result and api_result.get('originalOutcome',{}).get('status')=='rejected':
                        with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED',detail='RECEIPT_API_REJECTED' WHERE id=?",(review['id'],))
                        continue
                    verified_api=api_result is None or receipt_api.posted(api_result,key)
                    if verified_api and readback(config,key,proposal):
                        with db:db.execute("UPDATE partner_reviews SET state='POSTED',payment_id=? WHERE id=?",(key,review['id']))
                    continue
                # A saved dispatch identity is never reassigned, even if a stale state
                # was manually reset. Reconcile its existing attempt on the next cycle.
                if review['payment_id'] is not None:
                    with db:db.execute("UPDATE partner_reviews SET state='UNKNOWN' WHERE id=?",(review['id'],))
                    continue
                live=masters(config)
                automatic=review['detail']==AUTO_POLICY
                if not automatic and review['deciding_partner'] not in live.get('reviewer_ids',[]):
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail='APPROVING_REVIEWER_REMOVED' WHERE id=?",(review['id'],))
                    continue
                if proposal['action']!='Lump Sum' and not (not automatic and review_posts_overpayment(proposal)):
                    with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED' WHERE id=?",(review['id'],))
                    continue
                if config.get('partner_review_execution_enabled') is not True:continue
                if config.get('receipt_payment_api_enabled') is not True:continue
                live=masters(config)
                try:
                    job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(review['job_id'],)).fetchone()
                    # A review whose last submit was NotSent waits out the linked job's retry_after
                    # (bounded retry without a new column; the job is past PENDING, so nothing else reads it).
                    if job and job['retry_after']>time.time():continue
                    from .receipt_archive import required
                    if required(config,job) and not db.execute(
                        "SELECT 1 FROM receipt_assets WHERE job_id=? AND archive_state='ARCHIVED'",(job['id'],)).fetchone():
                        continue
                    if automatic:
                        if not automatic_payment(config,job,proposal):continue
                        if review['deciding_partner']!=config.get('receipt_auto_actor_partner_id'):
                            raise ReceiptInvalid('AUTO_ACTOR_CHANGED')
                        matches=[p for p in live['partners'] if p['id']==review['deciding_partner']]
                        if len(matches)!=1:raise ReceiptInvalid('AUTO_ACTOR_UNMAPPED')
                    else:
                        matches=[p for p in reviewer_partners(live) if p['id']==review['deciding_partner'] and p['enabled'] is True]
                        if len(matches)!=1:raise ReceiptInvalid('APPROVING_PARTNER_CHANGED')
                        sent=notices.db.execute("SELECT partner,message_id FROM partner_notices WHERE (event_key=? OR event_key LIKE ?) AND partner_id=? AND ig_status='ACCEPTED'",('review:'+review['id'],'review:'+review['id']+':resend:%',review['deciding_partner'])).fetchall()
                        if review['decision_message']:
                            source=state_connect(root/'instagram-ingress.db',config,readonly=True)
                            try:decision=source.execute('SELECT reply_to FROM messages WHERE message_id=?',(review['decision_message'],)).fetchone()
                            finally:source.close()
                            sent=[n for n in sent if decision and n['message_id']==decision['reply_to']]
                        if not any(json.loads(n[0])==matches[0] for n in sent):raise ReceiptInvalid('APPROVING_PARTNER_CHANGED')
                    b=receipt_borrower(config,job,journal,live,self.identity_reader)
                    if b['id']!=proposal['borrower']['id']:raise ReceiptInvalid('BORROWER_CHANGED')
                    day=today()
                    if proposal['receipt']['date'] not in (day.isoformat(),(day-timedelta(days=1)).isoformat()):
                        raise ReceiptInvalid('RECEIPT_DATE_TOO_OLD')
                    check(config,proposal['receipt'],b)
                    fresh=plan(proposal['receipt'],b,facts(config,b['id']))
                    # Owner rule (20 Oct 2026): a charge edit keeps the approval while the
                    # consequence is still "post the full amount as Lump Sum".
                    marker=(AUTO_POLICY+':' if automatic else '')
                    if fresh['action']=='Loan Close':
                        with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED',detail=? WHERE id=?",(marker+LOAN_CLOSE,review['id']))
                        continue
                    if not same_posting_outcome(proposal,fresh,automatic):raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                    outcome=SAME_OUTCOME if unlabelled(fresh['facts'])!=unlabelled(proposal['facts']) else None
                    if not any(a['id']==proposal['receipt']['account_id'] and a['active'] is True for a in live['accounts']):
                        raise ReceiptInvalid('RECEIVING_ACCOUNT_CHANGED')
                    actors=read_query(config,'SELECT coalesce(json_agg("Login Email"),\'[]\'::json) FROM public."Partners" WHERE "Row ID"=:\'pid\';',
                                      {'pid':review['deciding_partner']})
                    if len(actors)!=1 or not actors[0]:raise ReceiptInvalid('PARTNER_LOGIN_UNMAPPED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),review['id']))
                    continue
                # Only never-attempted approved reviews reach this branch. All current
                # authorization, duplicate, archive and immutable facts checks ran above.
                # The original cutoff remains deployment history, not a legacy fallback.
                # The payload keeps the hash of the approved proposal (what the reviewer saw).
                asset=db.execute('SELECT * FROM receipt_assets WHERE job_id=?',(review['job_id'],)).fetchone()
                api_payload=receipt_api.payload(config,review,proposal,asset,automatic)
                key='pwa:'+api_payload['command']['requestId']
                with db:
                    claimed=db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",(key,review['id'])).rowcount
                if not claimed:continue
                posting_config=dict(config,_receipt_automatic=True) if automatic else dict(config,_receipt_reviewer_approved=True)
                if outcome:posting_config['_receipt_facts_outcome']=outcome
                api_result=None
                try:
                    api_result=receipt_api.submit(posting_config,api_payload)
                except receipt_api.NotSent as exc:
                    # Nothing reached the API's business path: release the claim so the next cycle
                    # re-submits under the same deterministic requestId (AGT-SEND-03). `detail` is
                    # left alone because it carries the automatic-payment policy marker.
                    with db:
                        db.execute("UPDATE partner_reviews SET state='APPROVED',payment_id=NULL WHERE id=? AND state='POSTING'",(review['id'],))
                        db.execute('UPDATE receipt_jobs SET retry_after=?,detail=? WHERE id=?',(time.time()+NOT_SENT_RETRY_SECONDS,str(exc),review['job_id']))
                    failures.append({'stage':'submit','exception':str(exc)})
                    continue
                except Exception as exc:
                    # The POST may have left the host: reconcile by status only, never resend.
                    failures.append({'stage':'submit','exception':type(exc).__name__})
                verified=False
                try:
                    if api_result is None:api_result=receipt_api.status(config,key,review['id'])
                    verified=receipt_api.posted(api_result,key) and readback(config,key,proposal)
                except Exception as exc:failures.append({'stage':'readback','exception':type(exc).__name__})
                state='POSTED' if verified else 'MANUAL_REQUIRED' if api_result and api_result.get('originalOutcome',{}).get('status')=='rejected' else 'UNKNOWN'
                # The row can no longer return to APPROVED, so the facts note may join the policy marker.
                note=outcome and marker+outcome
                with db:db.execute(SETTLE_REVIEW_SQL,(state,note,note,review['id']))

    def notify(self):
        changed={i for i,s in ((r['id'],r['state']) for r in self.db.execute('SELECT id,state FROM partner_reviews')) if self.states.get(i)!=s}
        with isolated(self.notification_failures,'notification-cycle'):
            notify(self.config,self.journal,self.notices,self.identity_reader,self.notification_failures,self.resolver,changed)


def notice_rank(notice,changed=()):
    """Results reached in this run, other results, reply/command acknowledgements, review requests,
    hold alerts, archive-delay alerts; due() order (retry_after,id) is kept within each group."""
    event=notice['event_key']
    if event.startswith('review-result:'):return 0 if event.split(':')[1] in changed else 1
    for rank,prefix in enumerate((('hold-reply-result:','review-command-result:'),'review:','receipt-held:','receipt-archive-pending:'),2):
        if event.startswith(prefix):return rank
    return 6


def notify(config,journal,notices,identity_reader,failures,resolver=resolve_recipient,changed=()):
    """Optional delivery phase; payment/reviewer state is committed first."""
    db=journal.db
    result_master=masters(config)
    for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('POSTED','REJECTED','MANUAL_REQUIRED','STALE','EXPIRED','UNKNOWN')").fetchall():
        with isolated(failures,'result'):
            # No catch-up (owner, 22 October 2026): a result is reserved in the run that reaches it, or
            # later only while no Partner has it yet (crash recovery). A Partner opted in later does
            # not receive results decided while they were opted out.
            event='review-result:'+review['id']+':'+review['state']
            if review['id'] not in changed and notices.db.execute(
                    'SELECT 1 FROM partner_notices WHERE event_key=? LIMIT 1',(event,)).fetchone():continue
            proposal=json.loads(review['proposal']);live=result_master
            for p in live['partners']:
                with isolated(failures,'result-recipient'):
                    # Opted-out partners get no result of any state (R089: non-POSTED results were
                    # reserved, then held as IG_PREFLIGHT_FAILED and counted as failed deliveries).
                    if p['enabled'] is not True:continue
                    if review['state']=='POSTED':subject,body=receipt_notice(proposal['receipt'],proposal['borrower'],p['language'],review['payment_id'],review['detail'].endswith(SAME_OUTCOME))
                    else:
                        thai=p['language']=='ไทย'
                        words={'REJECTED':('Rejected; no payment recorded.','ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ'),
                          'MANUAL_REQUIRED':('Partner must record this manually. Agent has not posted it.','หุ้นส่วนต้องบันทึกรายการเอง ระบบยังไม่ได้บันทึก'),
                          'STALE':('Facts changed or payment already exists. Check manually; no agent posting.','ข้อมูลเปลี่ยนหรือมีรายการแล้ว กรุณาตรวจสอบ ระบบยังไม่ได้บันทึก'),
                          'EXPIRED':('Review expired; no payment recorded.','คำขอหมดอายุ ยังไม่ได้บันทึกรายการ'),
                          'UNKNOWN':('Posting outcome unconfirmed. Reconciliation only; do not submit again.','ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจสอบ ห้ามบันทึกซ้ำ')}
                        subject='ผลการตรวจสอบ' if thai else 'Receipt review result'
                        body=subject+'\n'+(proposal['borrower'].get('name_th' if thai else 'name_en') or proposal['borrower']['id'])+'\n'+proposal['receipt']['amount']+' THB\n'+words[review['state']][int(thai)]
                        if review['state']=='MANUAL_REQUIRED' and review['detail'].endswith(LOAN_CLOSE):
                            body+='\n'+('ข้อมูลสัญญาเปลี่ยนหลังอนุมัติ: รายการนี้เป็นการปิดสัญญา' if thai else 'Loan details changed after approval: this payment now closes the loan.')
                    notices.reserve(event,p,subject,body)
    from .receipt_hold import queue_holds,event_key
    if config.get('receipt_hold_notice_cutoff'):
        queue_holds(config,journal,notices,masters(config),identity_reader,failures)
    eligible=sorted((n for n in notices.due() if n['event_key'].startswith(
        ('review:','review-result:','receipt-held:','receipt-archive-pending:','hold-reply-result:','review-command-result:'))),
        key=lambda n:notice_rank(n,changed))
    # Bound optional transport work so a backlog cannot monopolize the receipt lock.
    # Retry timestamps also let untouched notices progress after a provider outage.
    for notice in eligible[:NOTICE_CAP]:
        with isolated(failures,'delivery',lambda notice=notice: notices.defer(notice['id'])):
            live=masters(config)
            if notice['event_key'].startswith(('hold-reply-result:','review-command-result:')) and not any(
                p['id']==notice['partner_id'] and p['enabled'] is True and p['id'] in live.get('reviewer_ids',[]) for p in live['partners']):
                with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_DISABLED' WHERE id=?",(notice['id'],))
                continue
            if notice['event_key'].startswith('receipt-held:'):
                held=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
                if (notice['partner_id'] not in live.get('reviewer_ids',[]) or not held or
                    held['status']!='REVIEW' or event_key(held)!=notice['event_key']):
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='HOLD_RESOLVED_OR_REVIEWER_REMOVED' WHERE id=?",(notice['id'],))
                    continue
            if notice['event_key'].startswith('receipt-archive-pending:'):
                waiting=db.execute('SELECT status,detail FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
                if (notice['partner_id'] not in live.get('reviewer_ids',[]) or not waiting or
                    (waiting['status'],waiting['detail'])!=('PENDING','RECEIPT_ARCHIVE_PENDING')):
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='ARCHIVE_RESOLVED_OR_REVIEWER_REMOVED' WHERE id=?",(notice['id'],))
                    continue
            if notice['event_key'].startswith('review-result:'):
                if not any(p['id']==notice['partner_id'] and p['enabled'] is True for p in live['partners']):
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_DISABLED' WHERE id=?",(notice['id'],))
                    continue
            if notice['event_key'].startswith('review:'):
                if notice['partner_id'] not in live.get('reviewer_ids',[]):
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='NOT_AI_REVIEWER' WHERE id=?",(notice['id'],))
                    continue
                row=db.execute('SELECT * FROM partner_reviews WHERE id=?',(review_id(notice['event_key']),)).fetchone()
                if not row or row['state']!='PENDING':
                    with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW' WHERE id=?",(notice['id'],))
                    continue
                proposal=json.loads(row['proposal'])
                try:
                    check(config,proposal['receipt'],proposal['borrower'])
                    current=facts(config,proposal['borrower']['id'])
                    if current!=proposal['facts']:
                        # A request still goes out after a charge edit when approving it would post the same way.
                        fresh=plan(proposal['receipt'],proposal['borrower'],current)
                        if fresh['action']=='Loan Close' or not same_posting_outcome(proposal,fresh,False):raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),row['id']))
                    continue
            notices.dispatch(notice,config,live['partners'],resolver=resolver)
