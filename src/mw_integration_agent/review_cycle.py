"""Receipt -> automatic ordinary payment or correlated Partner review/manual handling."""
import json
import sqlite3
from .state import connect as state_connect, enabled as state_enabled
from datetime import datetime
from pathlib import Path
from .config import ConfigurationError
from contextlib import contextmanager
from .receipt_rules import ReceiptInvalid,BANGKOK
from .receipt_master import masters
from .payment_match import check
from .partner_notice import NoticeJournal,receipt_notice
from .partner_review import ReviewStore,request_text,review_id
from .review_proposal import facts,plan,review_posts_overpayment
from .review_execution import add_payment,readback
from .cash_statement import read_query
from .receipt_identity import receipt_borrower

AUTO_POLICY='OWNER_AUTHORIZED_AUTO_PAYMENT'


@contextmanager
def isolated(failures,stage,on_error=None):
    try:yield
    except Exception as exc:
        # Safe aggregate diagnostics; no provider bodies, receipt details or secrets.
        failures.append({'stage':stage,'exception':type(exc).__name__})
        if on_error:on_error()


def automatic_payment(config,job,proposal):
    return (config.get('receipt_auto_payment_enabled') is True and proposal['action']=='Lump Sum'
            and job['created_at']>=datetime.fromisoformat(config['receipt_auto_payment_cutoff']).timestamp())


def reviewer_partners(live):
    """Role selection is independent of notification/IG delivery preferences."""
    return [p for p in live['partners'] if p['id'] in live.get('reviewer_ids',[])]


def cycle(config,journal,identity_reader):
    root=Path(config['state_directory']);db=journal.db;reviews=ReviewStore(db)
    notices=NoticeJournal(root/'partner-notices.db', config=config)
    cutoff=datetime.fromisoformat(config['partner_review_cutoff']).timestamp()
    failures=[];notification_failures=[]
    try:
        import time
        with db:db.execute("UPDATE partner_reviews SET state='EXPIRED' WHERE state='PENDING' AND expires_at<?",(time.time(),))
        for job in db.execute("SELECT * FROM receipt_jobs WHERE status='VALIDATED' AND created_at>=?",(cutoff,)).fetchall():
            with isolated(failures,'proposal',lambda:journal.mark(job['id'],'REVIEW','RECEIPT_PROPOSAL_UNAVAILABLE')):
                result=json.loads(job['result']);live=masters(config)
                try:
                    b=receipt_borrower(config,job,journal,live,identity_reader)
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
                        notices.reserve('review:'+key,p,subject,body)
                    with db:db.execute("UPDATE receipt_jobs SET status='REVIEW_REQUESTED' WHERE id=?",(job['id'],))
                except ReceiptInvalid as exc:journal.mark(job['id'],'REVIEW',str(exc))
        # Signed direct-message replies only. API-polled borrower content cannot authorize.
        # Apply the additive local schema before the first new webhook arrives.
        from .journal import IngressJournal
        migrated=IngressJournal(root/'instagram-ingress.db', config=config);migrated.close()
        ingress=state_connect(root/'instagram-ingress.db',config,readonly=True)
        pass  # row format supplied by state adapter
        try:
            events=ingress.execute("SELECT * FROM messages WHERE captured_at>=? AND (reply_to<>'' OR event_timestamp>=?) " + ("AND message_id NOT IN (SELECT message_id FROM ingress_work WHERE state='REVIEW') " if state_enabled(config) else "") + "ORDER BY event_timestamp,message_id",(cutoff,time.time()-86340)).fetchall()
        finally:ingress.close()
        for event in events:
            with isolated(failures,'reply'):
                event=dict(event)
                from .review_resend import is_command,queue
                if is_command(event):
                    if db.execute('SELECT 1 FROM partner_review_replies WHERE message_id=?',(event['message_id'],)).fetchone():continue
                    if not config.get('review_resend_cutoff'):continue
                    command_cutoff=datetime.fromisoformat(config['review_resend_cutoff']).timestamp()
                    if min(event['captured_at'],event['event_timestamp'])<command_cutoff or not 0<=time.time()-event['event_timestamp']<86340:continue
                    queue(db,notices,config,event,masters(config),identity_reader(config,event['sender_id']))
                    continue
                if not event.get('reply_to'):continue
                notice=notices.db.execute("SELECT * FROM partner_notices WHERE message_id=? AND (event_key LIKE 'review:%' OR event_key LIKE 'receipt-held:%')",(event['reply_to'],)).fetchone()
                if not notice:continue
                if notice['event_key'].startswith('receipt-held:'):
                    from .hold_reply import decide,queue_result,result_key
                    hold_cutoff=config.get('receipt_hold_reply_cutoff')
                    if not hold_cutoff:continue
                    hold_cutoff=datetime.fromisoformat(hold_cutoff).timestamp()
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
                reviews.decide(event,dict(notice),live['partners'],identity,reviewer_ids=live.get('reviewer_ids',[]))
        for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('APPROVED','POSTING','UNKNOWN')").fetchall():
            with isolated(failures,'execution'):
                proposal=json.loads(review['proposal']);key='igr:'+review['id'][:48]
                if review['state'] in ('POSTING','UNKNOWN'):
                    if review['state']=='POSTING':
                        with db:db.execute("UPDATE partner_reviews SET state='UNKNOWN' WHERE id=?",(review['id'],))
                    if readback(config,key,proposal):
                        with db:db.execute("UPDATE partner_reviews SET state='POSTED',payment_id=? WHERE id=?",(key,review['id']))
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
                live=masters(config)
                try:
                    job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(review['job_id'],)).fetchone()
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
                    b=receipt_borrower(config,job,journal,live,identity_reader)
                    if b['id']!=proposal['borrower']['id']:raise ReceiptInvalid('BORROWER_CHANGED')
                    from datetime import timedelta
                    today=datetime.now(BANGKOK).date()
                    if proposal['receipt']['date'] not in (today.isoformat(),(today-timedelta(days=1)).isoformat()):
                        raise ReceiptInvalid('RECEIPT_DATE_TOO_OLD')
                    check(config,proposal['receipt'],b)
                    fresh=plan(proposal['receipt'],b,facts(config,b['id']))
                    if fresh!=proposal:raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                    if not any(a['id']==proposal['receipt']['account_id'] and a['active'] is True for a in live['accounts']):
                        raise ReceiptInvalid('RECEIVING_ACCOUNT_CHANGED')
                    pid="'"+review['deciding_partner'].replace("'","''")+"'"
                    actors=read_query(config,'SELECT coalesce(json_agg("Login Email"),\'[]\'::json) FROM public."Partners" WHERE "Row ID"='+pid+';')
                    if len(actors)!=1 or not actors[0]:raise ReceiptInvalid('PARTNER_LOGIN_UNMAPPED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),review['id']))
                    continue
                with db:
                    claimed=db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",(key,review['id'])).rowcount
                if not claimed:continue
                posting_config=dict(config,_receipt_automatic=True) if automatic else dict(config,_receipt_reviewer_approved=True)
                try:add_payment(posting_config,key,proposal,actors[0])
                except Exception:pass
                verified=False
                try:verified=readback(config,key,proposal)
                except Exception as exc:failures.append({'stage':'readback','exception':type(exc).__name__})
                with db:db.execute("UPDATE partner_reviews SET state=? WHERE id=?",('POSTED' if verified else 'UNKNOWN',review['id']))
        with isolated(notification_failures,'notification-cycle'):
            notify(config,journal,notices,identity_reader,notification_failures)
        return {'failures':failures,'notification_failures':notification_failures,'reviews':[dict(r) for r in db.execute('SELECT state,count(*) count FROM partner_reviews GROUP BY state')]}
    finally:notices.close()


def notify(config,journal,notices,identity_reader,failures):
    """Optional delivery phase; payment/reviewer state is committed first."""
    db=journal.db
    result_master=masters(config)
    for review in db.execute("SELECT * FROM partner_reviews WHERE state IN ('POSTED','REJECTED','MANUAL_REQUIRED','STALE','EXPIRED','UNKNOWN')").fetchall():
        with isolated(failures,'result'):
            proposal=json.loads(review['proposal']);live=result_master
            for p in live['partners']:
                with isolated(failures,'result-recipient'):
                    if review['state']=='POSTED' and p['enabled'] is not True:continue
                    if review['state']=='POSTED':subject,body=receipt_notice(proposal['receipt'],proposal['borrower'],p['language'],review['payment_id'])
                    else:
                        thai=p['language']=='ไทย'
                        words={'REJECTED':('Rejected; no payment recorded.','ปฏิเสธแล้ว ยังไม่ได้บันทึกรายการ'),
                          'MANUAL_REQUIRED':('Partner must record this manually. Agent has not posted it.','หุ้นส่วนต้องบันทึกรายการเอง ระบบยังไม่ได้บันทึก'),
                          'STALE':('Facts changed or payment already exists. Check manually; no agent posting.','ข้อมูลเปลี่ยนหรือมีรายการแล้ว กรุณาตรวจสอบ ระบบยังไม่ได้บันทึก'),
                          'EXPIRED':('Review expired; no payment recorded.','คำขอหมดอายุ ยังไม่ได้บันทึกรายการ'),
                          'UNKNOWN':('Posting outcome unconfirmed. Reconciliation only; do not submit again.','ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจสอบ ห้ามบันทึกซ้ำ')}
                        subject='ผลการตรวจสอบ' if thai else 'Receipt review result'
                        body=subject+'\n'+(proposal['borrower'].get('name_th' if thai else 'name_en') or proposal['borrower']['id'])+'\n'+proposal['receipt']['amount']+' THB\n'+words[review['state']][int(thai)]
                    notices.reserve('review-result:'+review['id']+':'+review['state'],p,subject,body)
    from .receipt_hold import queue_holds,event_key
    if config.get('receipt_hold_notice_cutoff'):
        queue_holds(config,journal,notices,masters(config),identity_reader,failures)
    eligible=[n for n in notices.due() if n['event_key'].startswith(
        ('review:','review-result:','receipt-held:','hold-reply-result:','review-command-result:'))]
    # Bound optional transport work so a backlog cannot monopolize the receipt lock.
    # Retry timestamps also let untouched notices progress after a provider outage.
    for notice in eligible[:2]:
        with isolated(failures,'delivery',lambda: notices.defer(notice['id'])):
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
            if notice['event_key'].startswith('review-result:') and notice['event_key'].endswith(':POSTED'):
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
                    if facts(config,proposal['borrower']['id'])!=proposal['facts']:raise ReceiptInvalid('PROPOSAL_FACTS_CHANGED')
                except ReceiptInvalid as exc:
                    with db:db.execute("UPDATE partner_reviews SET state='STALE',detail=? WHERE id=?",(str(exc),row['id']))
                    continue
            notices.dispatch(notice,config,live['partners'])
