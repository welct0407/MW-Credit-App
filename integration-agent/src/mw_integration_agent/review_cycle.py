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
from .partner_notice import ACKNOWLEDGEMENT,NoticeJournal,receipt_notice
from .statement_delivery import resolve_recipient
from .partner_review import (OPTIONS_REQUIRED,RECHECKED,ReviewStore,approval_action,chosen_purpose_line,close_failure_line,close_notice,
                             designated_by,named_by,request_text,review_id,slip_line,unidentified_review)
from .review_proposal import (LOAN_CLOSE_CHANGED,OPTIONS,arrears_enabled,arrears_left,chosen_plan,close_enabled,facts,options_enabled,plan,
                              review_posts_close,review_posts_overpayment,same_posting_outcome,unlabelled)
from .review_execution import readback
from . import receipt_api
from .cash_statement import read_query
from .receipt_identity import provenance,receipt_borrower

AUTO_POLICY='OWNER_AUTHORIZED_AUTO_PAYMENT'
NOT_SENT_RETRY_SECONDS=900  # AGT-SEND-03: a persistent 401/403 or token fault re-submits every 15 minutes, not every cycle
NOTICE_CAP=6  # bounded transport work per notify pass; failures keep the 300 s deferral
SAME_OUTCOME='FACTS_CHANGED_SAME_OUTCOME'
LOAN_CLOSE='LOAN_CLOSE_REQUIRED'
# R128: an approved close that does not post (switch off at execution, the server refused it, the day passed).
CLOSE_OFF='LOAN_CLOSE_EXECUTION_OFF'
CLOSE_REJECTED='LOAN_CLOSE_REJECTED'
CLOSE_DAY_PASSED='LOAN_CLOSE_DAY_PASSED'

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


def has_attachment(event):
    raw=event.get('attachments')
    try:value=json.loads(raw) if isinstance(raw,str) else raw
    except ValueError:return False
    return isinstance(value,list) and len(value)>0


def automatic_payment(config,job,proposal):
    # R151: a slip whose sender is no known borrower (the payer name chose the borrower) always needs a Reviewer.
    # R179: a borrower a Reviewer named by replying to the hold is an identified sender (the owner: "can be processed will
    # be processed automatically"); the configured automatic actor posts it, as any automatic payment.
    evidence=provenance(job)
    return (config.get('receipt_auto_payment_enabled') is True and proposal['action']=='Lump Sum'
            and job['created_at']>=cutoff_ts(config,'receipt_auto_payment_cutoff')
            and (evidence.get('unidentified_sender') is not True or bool(evidence.get('designated_borrower_id'))))


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
                    proposal=plan(result['receipt'],b,facts(config,b['id']),config=config,arrears=arrears_enabled(config))
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
                    # R152: every recipient's request is built (prefix and length check included) before the review is
                    # reserved, so a request that cannot be built leaves no PENDING review and the job is a plain hold.
                    # R175 (Archie E-X-01): the corrected line is the builder's, counted with the icon; the unclear re-ask
                    # is built here too, so a re-ask that could not be sent later never leaves a request behind.
                    texts=[]
                    corrected=job['detail'] in ('OWNER_REQUESTED_RECONSIDERATION','REVIEWER_REQUESTED_RECHECK')
                    unidentified=provenance(job).get('unidentified_sender') is True
                    # R179 (Echo UX-R179-05): a borrower a Reviewer named by replying to the hold says so in the request.
                    namer=provenance(job).get('designated_by') if provenance(job).get('designated_borrower_id') else None
                    for p in recipients:
                        try:
                            named=named_by(namer,live,p['language']=='ไทย')
                            subject,body=request_text(proposal,p['language'],unidentified=unidentified,corrected=corrected,named=named)
                            request_text(proposal,p['language'],unclear=True,unidentified=unidentified,named=named)
                        except ConfigurationError as exc:
                            # The hold names the reason (receipt_hold REASONS) instead of RECEIPT_PROPOSAL_UNAVAILABLE.
                            if str(exc)=='REVIEW_REQUEST_TOO_LONG':raise ReceiptInvalid('REVIEW_REQUEST_TOO_LONG') from None
                            raise
                        texts.append((p,subject,body))
                    key=reviews.reserve(job['id'],proposal)
                    for p,subject,body in texts:
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
                # R095: the partner DM is also the forwarding channel. A message without text that carries an attachment
                # is receipt intake (its own receipt job), never a review decision or a hold-reply acknowledgement.
                if not str(event.get('text') or '').strip() and has_attachment(event):continue
                from .review_resend import is_command,queue
                if is_command(event):
                    if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
                    if not config.get('review_resend_cutoff'):continue
                    command_cutoff=cutoff_ts(config,'review_resend_cutoff')
                    if min(event['captured_at'],event['event_timestamp'])<command_cutoff or not 0<=time.time()-event['event_timestamp']<86340:continue
                    live=masters(config)
                    def borrower(job,live=live):
                        # A resent hold names the borrower as the first alert does; an outage leaves it unavailable.
                        try:return receipt_borrower(config,job,self.journal,live,identity_reader)
                        except Exception:return None
                    queue(db,notices,config,event,live,identity_reader(config,event['sender_id']),borrower=borrower)
                    continue
                if not event.get('reply_to'):
                    # R175 (Archie E-X-02b): a reviewer's bare answer without Reply gets one "Use Reply" acknowledgement.
                    bare_answer(db,notices,config,event,identity_reader)
                    continue
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
                    outcome=decide(db,config,event,dict(notice),live['partners'],identity,live.get('reviewer_ids',[]),master=live)
                    queue_result(notices,event,dict(notice),live['partners'],outcome,db=db,config=config,master=live)
                    continue
                if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
                live=masters(config)
                try:identity=identity_reader(config,event['sender_id'])
                except ConfigurationError:continue
                outcome=self.reviews.decide(event,dict(notice),live['partners'],identity,reviewer_ids=live.get('reviewer_ids',[]))
                if outcome in ('ALREADY_DECIDED','EXPIRED'):
                    # R175 (Archie E-X-02a): a reply to a closed request says so once, to that Reviewer.
                    closed_answer(db,notices,event,dict(notice),live)
                if outcome==RECHECKED:
                    # Owner request, 3 November 2026: acknowledge the recheck ("3" since R127; legacy "4"); the new plan follows as its own message
                    # (or the automatic-payment result) once the receipt is planned again from the current charges.
                    row=db.execute('SELECT proposal FROM partner_reviews WHERE id=?',(review_id(notice['event_key']),)).fetchone()
                    partner=next((p for p in live['partners'] if p['id']==notice['partner_id']),None)
                    if row and partner:
                        proposal=json.loads(row['proposal']);thai=partner['language']=='ไทย'
                        slip=slip_line(proposal['receipt'],proposal['borrower'],thai)
                        subject='ตรวจสลิปใหม่' if thai else 'Rechecking slip'
                        # R175 (Echo E-RCK-01): shown with 🔄.
                        body=(f"กำลังตรวจใหม่ {slip}\nกำลังคำนวณใหม่จากยอดปัจจุบันในแอป ข้อความถัดไปจะแจ้งผล ยังไม่ได้บันทึกรายการ" if thai
                              else f"Rechecking {slip}\nPlanning again from the current charges in the app; the next message has the result. Nothing recorded yet.")
                        notices.reserve('review-result:'+review_id(notice['event_key'])+':RECHECK',partner,subject,body)
                if outcome==OPTIONS_REQUIRED:
                    # R112 (Echo AG-2): an unclear reply to the options gets the prompt and the options again, to the
                    # same Reviewer, as its own notice (one per unclear reply); nothing was decided. R175 (Archie E-APR-01):
                    # the same for a plain or close request (REASK), under its own unclear line.
                    import hashlib
                    row=db.execute('SELECT proposal,job_id FROM partner_reviews WHERE id=?',(review_id(notice['event_key']),)).fetchone()
                    partner=next((p for p in live['partners'] if p['id']==notice['partner_id']),None)
                    if row and partner:
                        key='review:'+review_id(notice['event_key'])+':options:'+hashlib.sha256(event['message_id'].encode()).hexdigest()
                        subject,body=request_text(json.loads(row['proposal']),partner['language'],unclear=True,
                                                  unidentified=unidentified_review(db,row['job_id']),
                                                  named=named_by(designated_by(db,row['job_id']),live,partner['language']=='ไทย'))
                        notices.reserve(key,partner,subject,body)

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
                    if review_posts_close(proposal):
                        # R128: the close is reconciled by its own status route, never resent.
                        api_result=receipt_api.close_status(config,key) if key.startswith('pwa:') else None
                        if api_result and api_result.get('originalOutcome',{}).get('status')=='rejected':
                            with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED',detail=? WHERE id=?",(close_rejection(api_result),review['id']))
                        elif api_result and receipt_api.close_posted(api_result,key,proposal['loan_id']) and readback(config,key,proposal):
                            with db:db.execute("UPDATE partner_reviews SET state='POSTED',payment_id=?,detail=? WHERE id=?",(key,close_detail(api_result),review['id']))
                        continue
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
                # R112: approved options post only while the switch is on (fail closed: off means manual).
                options_review=proposal['action']==OPTIONS
                # R128: an approved close posts only while loan_close_execution_enabled is on (off: manual, "close it in the app").
                close_review=review_posts_close(proposal)
                if proposal['action']!='Lump Sum' and not (not automatic and (review_posts_overpayment(proposal) or (options_review and options_enabled(config))
                                                                              or (close_review and close_enabled(config)))):
                    if close_review:
                        with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED',detail=? WHERE id=?",(CLOSE_OFF,review['id']))
                    else:
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
                        sent=notices.db.execute("SELECT partner,message_id FROM partner_notices WHERE (event_key=? OR event_key LIKE ? OR event_key LIKE ?) AND partner_id=? AND ig_status='ACCEPTED'",('review:'+review['id'],'review:'+review['id']+':resend:%','review:'+review['id']+':options:%',review['deciding_partner'])).fetchall()
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
                    # R128: a close posts on the slip's day only (the server's Loan Close is today's).
                    if close_review and proposal['receipt']['date']!=day.isoformat():raise ReceiptInvalid(CLOSE_DAY_PASSED)
                    check(config,proposal['receipt'],b)
                    # R177: the arrears switch reaches the re-plan too (config=None here only keeps the options and close reads off).
                    fresh=plan(proposal['receipt'],b,facts(config,b['id']),config=config if options_review or close_review else None,strict=close_review,
                               arrears=arrears_enabled(config))
                    # Owner rule (20 Oct 2026): a charge edit keeps the approval while the
                    # consequence is still "post the full amount as Lump Sum".
                    marker=(AUTO_POLICY+':' if automatic else '')
                    if fresh['action']=='Loan Close' and not close_review:
                        with db:db.execute("UPDATE partner_reviews SET state='MANUAL_REQUIRED',detail=? WHERE id=?",(marker+LOAN_CLOSE,review['id']))
                        continue
                    chosen=None
                    if close_review:
                        # R128: re-planned and re-quoted now: the same loan, plan hash, version and rebate the Reviewer approved.
                        if not same_posting_outcome(proposal,fresh,automatic) or any(
                                fresh['close'].get(k)!=proposal['close'].get(k) for k in ('sourceVersion','rebatePath','rebateAmount')):
                            raise ReceiptInvalid(close_changed(config,proposal))
                        outcome=None
                    elif options_review:
                        # R112: the server's plans must be the ones the Reviewer chose from (same planSha256, same
                        # business day); the chosen purpose's plan is read now and becomes the v9 command's lines.
                        if proposal['receipt']['date']!=day.isoformat():raise ReceiptInvalid('PAY_FORWARD_DAY_PASSED')
                        if not same_posting_outcome(proposal,fresh,automatic):raise ReceiptInvalid('PAY_FORWARD_PLAN_CHANGED')
                        purpose=json.loads(review['detail'] or '{}').get('purpose')
                        if not isinstance(purpose,dict):raise ReceiptInvalid('PAY_FORWARD_PURPOSE_MISSING')
                        chosen=dict(chosen_plan(config,proposal,purpose),purpose=purpose)
                        outcome=None
                    else:
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
                if close_review:
                    api_payload=receipt_api.close_payload(config,review,proposal)
                else:
                    api_payload=receipt_api.payload(config,review,proposal,asset,automatic,**({'plan':chosen} if chosen else {}))
                key='pwa:'+api_payload['command']['requestId']
                with db:
                    claimed=db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",(key,review['id'])).rowcount
                if not claimed:continue
                posting_config=dict(config,_receipt_automatic=True) if automatic else dict(config,_receipt_reviewer_approved=True)
                if outcome:posting_config['_receipt_facts_outcome']=outcome
                api_result=None
                try:
                    api_result=(receipt_api.submit_close if close_review else receipt_api.submit)(posting_config,api_payload)
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
                    if close_review:
                        if api_result is None:api_result=receipt_api.close_status(config,key)
                        verified=receipt_api.close_posted(api_result,key,proposal['loan_id']) and readback(config,key,proposal)
                    else:
                        if api_result is None:api_result=receipt_api.status(config,key,review['id'])
                        verified=receipt_api.posted(api_result,key) and readback(config,key,proposal)
                except Exception as exc:failures.append({'stage':'readback','exception':type(exc).__name__})
                state='POSTED' if verified else 'MANUAL_REQUIRED' if api_result and api_result.get('originalOutcome',{}).get('status')=='rejected' else 'UNKNOWN'
                if close_review:
                    # R128: the recorded rebate (posted) or the refusal code (rejected) is the result's detail.
                    note=close_detail(api_result) if state=='POSTED' else close_rejection(api_result) if state=='MANUAL_REQUIRED' else None
                    with db:db.execute(SETTLE_REVIEW_SQL,(state,note,note,review['id']))
                    continue
                # The row can no longer return to APPROVED, so the facts note may join the policy marker.
                note=outcome and marker+outcome
                with db:db.execute(SETTLE_REVIEW_SQL,(state,note,note,review['id']))

    def notify(self):
        changed={i for i,s in ((r['id'],r['state']) for r in self.db.execute('SELECT id,state FROM partner_reviews')) if self.states.get(i)!=s}
        with isolated(self.notification_failures,'notification-cycle'):
            notify(self.config,self.journal,self.notices,self.identity_reader,self.notification_failures,self.resolver,changed)


def close_detail(result):
    """R128: a posted close's review detail: the referral rebate as recorded (path, amount, offset and payable parts)."""
    outcome=(result or {}).get('originalOutcome') if isinstance(result,dict) else None
    applied=outcome.get('result') if isinstance(outcome,dict) else None
    rebate=applied.get('rebate') if isinstance(applied,dict) else None
    kept={k:rebate.get(k) for k in ('path','amount','offsetAmount','payable')} if isinstance(rebate,dict) else None
    return json.dumps({'closeRebate':kept},sort_keys=True,separators=(',',':'))


def close_rejection(result):
    """R128: a refused close's review detail, with the server's rejection code when it is a plain code."""
    import re
    outcome=(result or {}).get('originalOutcome') if isinstance(result,dict) else None
    code=outcome.get('code') if isinstance(outcome,dict) else None
    return CLOSE_REJECTED+(':'+code if isinstance(code,str) and re.fullmatch('[a-z_]{1,64}',code) else '')


def close_changed(config,proposal):
    """R128: the STALE detail of a close whose quote changed, with the current closing amount when it differs from the slip
    (Echo AG-20); best effort, a quote that cannot be read gives the plain detail."""
    from decimal import Decimal
    try:amount=receipt_api.close_quote(config,proposal['loan_id'])['amount']
    except receipt_api.QuoteRefused as exc:return str(exc) if str(exc)=='LOAN_CLOSE_QUOTE_UNAVAILABLE' else LOAN_CLOSE_CHANGED
    except Exception:return LOAN_CLOSE_CHANGED
    return LOAN_CLOSE_CHANGED+(':'+amount if Decimal(amount)!=Decimal(proposal['receipt']['amount']) else '')


# R175 (Echo section 3): the stale result's sentence, keyed on the detail's code; the recheck variant only when a "3" on the
# request would still recheck it (partner_review.decide: options request, a RECHECK_STALE reason, not expired).
STALE_SENTENCES={
    'PAY_FORWARD_DAY_PASSED':("The choice arrived after the slip's day ended, so the plan no longer applies. Record it in the app.",
                              'ได้รับคำตอบหลังสิ้นวันของสลิป แผนเดิมใช้ไม่ได้แล้ว กรุณาบันทึกในแอป'),
    'PLAN_CHANGED':('The charges changed after the request was sent. Check them and record it in the app.',
                    'ยอดในแอปเปลี่ยนหลังส่งคำขอ กรุณาตรวจสอบแล้วบันทึกในแอป'),
    'PLAN_CHANGED_RECHECK':('The charges changed after the request was sent. Reply 3 on the request to recheck, or record it in the app.',
                            'ยอดในแอปเปลี่ยนหลังส่งคำขอ ตอบ 3 ที่ข้อความคำขอเพื่อตรวจใหม่ หรือบันทึกในแอป'),
    'RECEIVING_ACCOUNT_CHANGED':('The receiving account {account} is no longer active in the app. Check the account, then record it in the app.',
                                 'บัญชีรับ {account} ไม่ได้ใช้งานในแอปแล้ว กรุณาตรวจสอบบัญชีแล้วบันทึกในแอป'),
    'APPROVING_PARTNER_CHANGED':("The approver's details changed in the app after approving, so it was not recorded automatically. Record it in the app.",
                                 'ข้อมูลผู้อนุมัติในแอปเปลี่ยนหลังอนุมัติ ระบบจึงไม่ได้บันทึกให้ กรุณาบันทึกในแอป'),
    'BORROWER_CHANGED':('The borrower for this slip changed in the app after the request. Check the borrower, then record it in the app.',
                        'ข้อมูลผู้กู้ของสลิปนี้ในแอปเปลี่ยนหลังส่งคำขอ กรุณาตรวจสอบผู้กู้แล้วบันทึกในแอป'),
    'PAYMENT_ALREADY_RECORDED':("A payment with this bank reference is already recorded. Don't record it again.",
                                'มีรายการชำระที่ใช้เลขอ้างอิงนี้บันทึกแล้ว ห้ามบันทึกซ้ำ'),
    'POSSIBLE_EXISTING_PAYMENT_REVIEW':('A payment with the same bank reference exists but its details differ. Check it in the app before recording anything.',
                                        'พบรายการที่ใช้เลขอ้างอิงเดียวกันแต่ข้อมูลไม่ตรงกัน กรุณาตรวจสอบในแอปก่อนบันทึก'),
    'REFERENCE_UNREADABLE':('The bank reference could not be checked for duplicates. Check the slip, then record it in the app.',
                            'ตรวจเลขอ้างอิงธนาคารเพื่อกันรายการซ้ำไม่ได้ กรุณาตรวจสอบสลิปแล้วบันทึกในแอป'),
    'RECEIPT_DATE_TOO_OLD':("The slip is no longer from today or yesterday, so it can't be recorded automatically. Record it in the app.",
                            'สลิปไม่ใช่ของวันนี้หรือเมื่อวานแล้ว ระบบจึงบันทึกให้ไม่ได้ กรุณาบันทึกในแอป'),
}
STALE_FALLBACK=('Something changed after the request, so it was not recorded automatically. Check and record it in the app.',
                'ข้อมูลเปลี่ยนหลังส่งคำขอ ระบบจึงไม่ได้บันทึกให้ กรุณาตรวจสอบแล้วบันทึกในแอป')
PLAN_CODES=('PAY_FORWARD_PLAN_CHANGED','PROPOSAL_FACTS_CHANGED')


def stale_sentence(review,proposal,thai,now):
    from .partner_review import RECHECK_STALE
    code=(review['detail'] or '').split(':',1)[0]
    if code in PLAN_CODES:
        recheck=proposal.get('action')==OPTIONS and review['state']=='STALE' and code in RECHECK_STALE and now<=review['expires_at']
        code='PLAN_CHANGED_RECHECK' if recheck else 'PLAN_CHANGED'
    return STALE_SENTENCES.get(code,STALE_FALLBACK)[int(thai)].replace('{account}',str(proposal['receipt'].get('account_label') or ''))


def reviewer_name(partner_id,live,thai):
    """R175 (Echo section 5, Archie ruling): the Partner Name (partner_names), else @username, else a generic phrase."""
    name=' '.join(str((live.get('partner_names') or {}).get(partner_id) or '').split())
    if name:return name
    partner=next((p for p in live.get('partners',[]) if p['id']==partner_id),None)
    handle=str((partner or {}).get('username') or '').strip().lstrip('@')
    if handle:return '@'+handle
    return 'ผู้ตรวจสอบ' if thai else 'a Reviewer'


def result_text(review,proposal,partner,live,now=None):
    """R175 (Echo E-RES-02..05, sections 3 and 5): a result that recorded nothing, first line the slip."""
    now=time.time() if now is None else now
    review=dict(review);thai=partner['language']=='ไทย';state=review['state'];detail=review['detail'] or ''
    slip=slip_line(proposal['receipt'],proposal['borrower'],thai)
    subject='ผลสลิป' if thai else 'Slip result'
    if state=='REJECTED':
        name=reviewer_name(review['deciding_partner'],live,thai)
        lines=[f'{slip} {name} ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ' if thai else f'{slip} rejected by {name}. Nothing recorded.']
    elif state=='EXPIRED':
        lines=[f'{slip} คำขอหมดอายุ ยังไม่ได้บันทึกรายการ' if thai else f'{slip} expired. Nothing recorded.']
    elif state=='UNKNOWN':
        lines=[slip,'ไม่แน่ใจว่าบันทึกแล้วหรือไม่ กรุณาตรวจสอบในแอปก่อน ห้ามบันทึกซ้ำ' if thai else "Not sure it was recorded. Check the app first; don't record it twice."]
    elif state=='STALE':
        lines=[f'{slip} ยังไม่ได้บันทึก' if thai else f'{slip} not recorded',stale_sentence(review,proposal,thai,now)]
    else:
        lines=[f'{slip} ยังไม่ได้บันทึก' if thai else f'{slip} not recorded','กรุณาบันทึกในแอป' if thai else 'Record it in the app.']
        # R175 (Echo E-RES-04, E-R2-02): who approved what, for every partner the result goes to; gone when the execution's
        # reason replaced the decision detail, and for an automatic payment (no Reviewer reply: no decision message).
        choice=chosen_purpose_line(proposal,detail,thai) if proposal.get('action')==OPTIONS else approval_action(proposal,thai,recorded_only=True)
        if choice and review.get('decision_message'):
            name=reviewer_name(review['deciding_partner'],live,thai)
            lines.append(f'{name} อนุมัติ: {choice}' if thai else f'Approved by {name}: {choice}')
        if detail.endswith(LOAN_CLOSE):
            # R128 (Echo AG-21): the manual close is done in the app.
            lines.append('ข้อมูลสัญญาเปลี่ยนหลังอนุมัติ: รายการนี้เป็นการปิดสัญญา กรุณาปิดในแอป' if thai else 'Loan details changed after approval: this payment now closes the loan. Close it in the app.')
    if review_posts_close(proposal):
        line=close_failure_line(state,detail,proposal,thai)
        # R175 (Archie 4): a close's own line replaces the generic stale or manual sentence.
        if line and state in ('STALE','MANUAL_REQUIRED'):lines[1]=line
        elif line:lines.append(line)
    return subject,'\n'.join(lines)


ACK_WINDOW=86340  # replies older than this get no acknowledgement (the Instagram reply window)


def acknowledgement_key(message_id):
    import hashlib
    return ACKNOWLEDGEMENT+hashlib.sha256(message_id.encode()).hexdigest()


def closed_answer(db,notices,event,notice,live,now=None):
    """R175 (Archie E-X-02a, Echo 4a/4b): the Reviewer's reply to a request that is already decided, replaced or expired."""
    now=time.time() if now is None else now
    if not 0<=now-event['event_timestamp']<ACK_WINDOW:return
    partner=next((p for p in live['partners'] if p['id']==notice['partner_id']),None)
    row=db.execute('SELECT state,proposal FROM partner_reviews WHERE id=?',(review_id(notice['event_key']),)).fetchone()
    if not partner or not row:return
    thai=partner['language']=='ไทย';proposal=json.loads(row['proposal'])
    slip=slip_line(proposal['receipt'],proposal['borrower'],thai)
    if row['state']=='SUPERSEDED':
        subject,text=(('คำขอถูกแทนแล้ว','คำขอนี้ถูกแทนด้วยคำขอแก้ไขแล้ว ยังไม่ได้ดำเนินการ กรุณาตอบที่คำขอแก้ไข') if thai else
                      ('Request replaced','That request was replaced by an updated request; nothing was done. Reply on the updated request.'))
    else:
        subject,text=(('คำขอปิดแล้ว','คำขอนี้ปิดแล้ว (ตัดสินแล้วหรือหมดอายุ) ยังไม่ได้ดำเนินการใดๆ') if thai else
                      ('Request already closed','That request is already closed (decided or expired); nothing was done.'))
    notices.reserve(acknowledgement_key(event['message_id']),partner,subject,slip+'\n'+text)


def bare_answer(db,notices,config,event,identity_reader,now=None):
    """R175 (Archie E-X-02b, Echo 4c): an answer word or code sent without Reply by a Reviewer who has a delivered request
    still waiting gets one "Use Reply" acknowledgement; anything else stays silent."""
    from .partner_review import APPROVE,REJECT,RECHECK,options_choice
    from .review_resend import reviewer_sender
    now=time.time() if now is None else now
    text=(event.get('text') or '').strip().casefold()
    if not (text in APPROVE|REJECT|RECHECK or options_choice(text)):return
    if not 0<=now-event['event_timestamp']<ACK_WINDOW:return
    if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():return
    # Only a sender a waiting request was delivered to is looked up, so a borrower's "yes" or "1" costs no identity read.
    waiting={}
    for row in db.execute("SELECT id,proposal FROM partner_reviews WHERE state='PENDING' AND expires_at>? ORDER BY created_at,id",(now,)).fetchall():
        for sent in notices.db.execute("SELECT partner_id FROM partner_notices WHERE recipient_id=? AND ig_status='ACCEPTED' AND (event_key=? OR event_key LIKE ?)",
                                       (event['sender_id'],'review:'+row['id'],'review:'+row['id']+':%')).fetchall():
            waiting.setdefault(sent['partner_id'],{})[row['id']]=json.loads(row['proposal'])
    if not waiting:return
    live=masters(config)
    try:identity=identity_reader(config,event['sender_id'])
    except ConfigurationError:return
    partner=reviewer_sender(event,live,identity)
    if not partner or partner['id'] not in waiting:return
    waiting=list(waiting[partner['id']].values())
    key=acknowledgement_key(event['message_id'])
    if not notices.db.execute('SELECT 1 FROM partner_notices WHERE event_key=?',(key,)).fetchone():
        thai=partner['language']=='ไทย'
        if thai:
            subject,lines='กรุณาใช้ Reply',['ยังไม่ได้ดำเนินการ: คำตอบต้องใช้ Reply ที่ข้อความคำขอ ปัดขวาที่ข้อความคำขอ (หรือกดค้างแล้วเลือก Reply) แล้วส่งคำตอบอีกครั้ง']
        else:
            subject,lines='Use Reply',['Nothing was done: answers count only as a Reply on the request message. Swipe right on the request (or press and hold, then Reply) and send your answer again.']
        if len(waiting)==1:
            lines.append(('รอคำตอบ: ' if thai else 'Waiting: ')+slip_line(waiting[0]['receipt'],waiting[0]['borrower'],thai))
        notices.reserve(key,partner,subject,'\n'.join(lines))
    with db:
        db.execute('INSERT OR IGNORE INTO partner_review_replies VALUES (?,?,?)',(event['message_id'],'reply-ack:'+key[len(ACKNOWLEDGEMENT):],'REPLY_REQUIRED'))


def notice_rank(notice,changed=()):
    """Results reached in this run, other results, reply/command acknowledgements, review requests (with the copies the
    `review` command resends, R135), hold alerts, archive-delay alerts; due() order (retry_after,id) is kept within each group."""
    event=notice['event_key']
    if event.startswith('review-result:'):return 0 if event.split(':')[1] in changed else 1
    if event.startswith('receipt-held:') and ':resend:' in event:return 3
    for rank,prefix in enumerate((('hold-reply-result:','review-command-result:',ACKNOWLEDGEMENT),'review:','receipt-held:','receipt-archive-pending:'),2):
        if event.startswith(prefix):return rank
    return 6


def resend_position(notice):
    """R135: copies resent by a `review` command go out in their 'i/N · ' counter order (oldest first) across both kinds."""
    if ':resend:' not in notice['event_key']:return 0
    import re
    found=re.match(r'(\d+)/\d+ · ',notice.get('body') or '')
    return int(found.group(1)) if found else 0


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
                    if review['state']=='POSTED' and review_posts_close(proposal):
                        # R128 (Echo AG-19): the close's own notice, with the loan and the rebate as recorded.
                        subject,body=close_notice(proposal,p['language'],review['payment_id'],review['detail'])
                    elif review['state']=='POSTED':
                        # R175 (Echo E-RES-01): '✅ Recorded ฿400 from Kathy · pay forward: 19 Nov', then the transfer.
                        purpose=chosen_purpose_line(proposal,review['detail'],p['language']=='ไทย') if proposal.get('action')==OPTIONS else ''
                        changed_facts=review['detail'].endswith(SAME_OUTCOME)
                        # R177 (Echo UX-R177-07): with the arrears switch on, a Lump Sum that leaves older charges unpaid says
                        # so, from the proposal's facts; not after a facts change (those facts are no longer the posted ones).
                        unpaid=arrears_left(proposal) if arrears_enabled(config) and not changed_facts else None
                        # R179 (Echo UX-R179-05): the borrower a Reviewer named stays visible in the recorded notice.
                        named=named_by(designated_by(db,review['job_id']),live,p['language']=='ไทย')
                        subject,body=receipt_notice(proposal['receipt'],proposal['borrower'],p['language'],review['payment_id'],
                                                    changed_facts,purpose,unpaid=unpaid,named=named)
                    else:
                        subject,body=result_text(review,proposal,p,live)
                    notices.reserve(event,p,subject,body)
    from .receipt_hold import base_key,queue_holds,event_key
    if config.get('receipt_hold_notice_cutoff'):
        queue_holds(config,journal,notices,masters(config),identity_reader,failures)
    eligible=sorted((n for n in notices.due() if n['event_key'].startswith(
        ('review:','review-result:','receipt-held:','receipt-archive-pending:','hold-reply-result:','review-command-result:',ACKNOWLEDGEMENT))),
        key=lambda n:(notice_rank(n,changed),resend_position(n)))
    # Bound optional transport work so a backlog cannot monopolize the receipt lock.
    # Retry timestamps also let untouched notices progress after a provider outage.
    for notice in eligible[:NOTICE_CAP]:
        with isolated(failures,'delivery',lambda notice=notice: notices.defer(notice['id'])):
            live=masters(config)
            if notice['event_key'].startswith(('hold-reply-result:','review-command-result:',ACKNOWLEDGEMENT)) and not any(
                p['id']==notice['partner_id'] and p['enabled'] is True and p['id'] in live.get('reviewer_ids',[]) for p in live['partners']):
                with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='PARTNER_DISABLED' WHERE id=?",(notice['id'],))
                continue
            if notice['event_key'].startswith('receipt-held:'):
                held=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].split(':')[1],)).fetchone()
                if (notice['partner_id'] not in live.get('reviewer_ids',[]) or not held or
                    held['status']!='REVIEW' or event_key(held)!=base_key(notice['event_key'])):
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
                        close=review_posts_close(proposal)
                        fresh=plan(proposal['receipt'],proposal['borrower'],current,config=config if proposal.get('action')==OPTIONS or close else None,strict=close,
                                   arrears=arrears_enabled(config))
                        # R128: a close request still goes out while the server's close plan is the one it shows.
                        if (fresh['action']=='Loan Close' and not close) or not same_posting_outcome(proposal,fresh,False):raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),row['id']))
                    continue
            notices.dispatch(notice,config,live['partners'],resolver=resolver)
