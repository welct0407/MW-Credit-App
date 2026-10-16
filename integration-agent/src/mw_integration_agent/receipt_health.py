"""Read-only queue health for the existing independent Grafana collector.

No financial actions, queue repair, notifications or model calls. Numeric counts
only leave the VM. A delivered review is not itself a stuck payment.
"""
from pathlib import Path
from contextlib import ExitStack
import time
from .state import connect
from .receipt_hold import event_key


def assess(jobs,reviews,notices,now,hold_replies=()):
    jobs={r['id']:r for r in jobs};reviews={r['id']:r for r in reviews}
    by_job={r['job_id']:r for r in reviews.values()}
    by_event={}
    from .partner_review import review_id
    for n in notices:
        rid=review_id(n['event_key'])
        key='review:'+rid if rid else n['event_key']
        by_event.setdefault(key,[]).append(n)
    def delivered(event):
        return any(n['ig_status']=='ACCEPTED' or n['email_status']=='SENT' for n in by_event.get(event,[]))
    counts=dict(stalled_jobs=0,unnotified_holds=0,unconfirmed_postings=0,
                undelivered_reviews=0,overdue_reviews=0,failed_notifications=0)
    for job in jobs.values():
        age=now-job['created_at'];review=by_job.get(job['id'])
        if job['status'] in ('PENDING','VALIDATED') and age>600:counts['stalled_jobs']+=1
        if job['status']=='REVIEW_REQUESTED' and not review and age>300:counts['stalled_jobs']+=1
        if job['status']=='REVIEW' and age>300 and not delivered(event_key(job)):counts['unnotified_holds']+=1
    for review in reviews.values():
        age=now-review['created_at'];state=review['state']
        if state in ('POSTING','UNKNOWN'):counts['unconfirmed_postings']+=1
        if state=='APPROVED' and age>600:counts['stalled_jobs']+=1
        if state=='PENDING':
            if age>300 and not delivered('review:'+review['id']):counts['undelivered_reviews']+=1
            if age>7200:counts['overdue_reviews']+=1
        if state in ('POSTED','REJECTED','MANUAL_REQUIRED','STALE','EXPIRED','UNKNOWN'):
            event='review-result:'+review['id']+':'+state
            if age>300 and not by_event.get(event):counts['failed_notifications']+=1
    # Account for individual failed Partner results even when another Partner received one.
    from .hold_reply import result_key
    for reply in hold_replies:
        job=jobs.get(reply['review_id'].split(':')[1])
        if not job or now-job['created_at']<=300:continue
        items=by_event.get(result_key(reply['message_id']),[])
        counts['failed_notifications']+=1 if not items else sum(
            n['ig_status']!='ACCEPTED' and n['email_status']!='SENT' and n.get('detail')!='PARTNER_DISABLED' for n in items)
    for event,items in by_event.items():
        if not event.startswith('review-result:'):continue
        _,rid,state=event.split(':',2);review=reviews.get(rid)
        if not review or review['state']!=state or now-review['created_at']<=300:continue
        counts['failed_notifications']+=sum(n['ig_status']!='ACCEPTED' and n['email_status']!='SENT' and
               n.get('detail')!='PARTNER_DISABLED' for n in items)
    # Optional result delivery remains visible without declaring intake/posting
    # broken. Required review/hold attention and uncertain money stay degraded.
    status=2 if any(v for k,v in counts.items() if k!='failed_notifications') else 1
    waiting=[j for j in jobs.values() if j['status'] in ('PENDING','VALIDATED')]
    return {'status':status,'notification_status':2 if counts['failed_notifications'] else 1,**counts,
            'pending_images':sum(j['status']=='PENDING' for j in jobs.values()),
            'validated_receipts':sum(j['status']=='VALIDATED' for j in jobs.values()),
            'held_receipts':sum(j['status']=='REVIEW' for j in jobs.values()),
            'pending_reviews':sum(r['state']=='PENDING' for r in reviews.values()),
            'approved_payments':sum(r['state']=='APPROVED' for r in reviews.values()),
            'completed_payments':sum(r['state']=='POSTED' for r in reviews.values()),
            'oldest_pending_seconds':int(max([max(0,now-j['created_at']) for j in waiting],default=0))}


def ingress_review_open(ingress,config):
    """Inbound messages held as ingress_work REVIEW since the PostgreSQL cutover (late,
    future, changed-content retries). Read-only count over existing tables; the SQLite
    journal has no work table, so it reports 0 there. Owner decision (16 October 2026):
    visible to the owner, not alerting."""
    from .state import is_postgres
    if not is_postgres(ingress):
        return 0
    from datetime import datetime
    cutover=datetime.fromisoformat(config['state_cutover_at']).timestamp()
    row=ingress.execute("SELECT count(*) FROM ingress_work w JOIN messages m USING(message_id) "
                        "WHERE w.state='REVIEW' AND m.event_timestamp>=?",(cutover,)).fetchone()
    return int(row[0])


def inspect(config,now=None):
    now=time.time() if now is None else now
    root=Path(config['state_directory'])
    with ExitStack() as resources:
        db=connect(root/'receipt-processing.db',config,readonly=True);resources.callback(db.close)
        notices=connect(root/'partner-notices.db',config,readonly=True);resources.callback(notices.close)
        ingress=connect(root/'instagram-ingress.db',config,readonly=True);resources.callback(ingress.close)
        review_open=ingress_review_open(ingress,config)
        jobs=[dict(r) for r in db.execute("SELECT id,status,detail,created_at FROM receipt_jobs WHERE status IN ('PENDING','VALIDATED','REVIEW','REVIEW_REQUESTED','REJECTED')")]
        reviews=[dict(r) for r in db.execute("SELECT id,job_id,state,created_at FROM partner_reviews WHERE state<>'SUPERSEDED'")]
        replies=[dict(r) for r in db.execute("SELECT message_id,review_id,outcome FROM partner_review_replies WHERE review_id LIKE 'receipt-held:%' AND outcome IN ('HOLD_REJECTED','HOLD_NOT_ACTIVE','HOLD_REJECT_REQUIRED','HOLD_HAS_REVIEW')")]
        sent=[dict(r) for r in notices.execute("SELECT event_key,ig_status,email_status,detail FROM partner_notices WHERE (event_key LIKE 'review:%' OR event_key LIKE 'review-result:%' OR event_key LIKE 'receipt-held:%' OR event_key LIKE 'hold-reply-result:%')")]
        return {**assess(jobs,reviews,sent,now,replies),'ingress_review_open':review_open}
