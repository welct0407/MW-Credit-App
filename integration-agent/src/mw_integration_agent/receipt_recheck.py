"""R119: requeue held receipt jobs once a borrower-master change can fix their cause; never reopens a decision.

The conversation poll calls recheck_held under receipt-worker.lock (taken without waiting) when its master snapshot
changed: today's and yesterday's REVIEW jobs held PAYER_UNRESOLVED when the enabled-borrower set grew, and
RECIPIENT_UNKNOWN_OR_AMBIGUOUS when the active cash-account fingerprint changed. Each goes through
receipt_reconsider.requeue with detail AUTO_RECHECK_MASTER_CHANGED and keeps its saved extraction (no new OCR); the
worker then applies the payer, duplicate, archive and idempotency guards as for any job. Skipped: a job whose partner
review was decided (as receipt-reconsider), a job whose image the worker could not read again (no archived original),
and a job already requeued from the same hold after the snapshot was written (the loop guard: one recheck per change).
"""
import json

from .partner_review import ReviewStore
from .receipt_reconsider import requeue

DETAIL='AUTO_RECHECK_MASTER_CHANGED'
PAYER='PAYER_UNRESOLVED'
RECIPIENT='RECIPIENT_UNKNOWN_OR_AMBIGUOUS'


def image_available(config,journal,job):
    """The worker reads a requeued job's image from the archive (its source URL was cleared with the hold)."""
    from .receipt_archive import required
    from .receipt_run import archive_state
    return required(config,job) and archive_state(journal,job['id'])=='ARCHIVED'


def already_rechecked(db,job,written_at):
    for row in db.execute('SELECT previous FROM receipt_reconsiderations WHERE job_id=? AND created_at>?',(job['id'],written_at)).fetchall():
        try:previous=json.loads(row[0])
        except (TypeError,ValueError):continue
        if isinstance(previous,dict) and previous.get('detail')==job['detail']:return True
    return False


def recheck_held(config,journal,enabled_grew,accounts_changed,written_at,now=None):
    """Requeue the held jobs the change can fix. The caller holds receipt-worker.lock. Returns the counts."""
    from .conversation_poll import recheck_since
    import time
    now=time.time() if now is None else now
    codes=[code for code,on in ((PAYER,enabled_grew),(RECIPIENT,accounts_changed)) if on]
    counts={'held_requeued':0,'held_skipped':0}
    if not codes:return counts
    db=journal.db
    ReviewStore(db)
    from .state import is_postgres
    if not is_postgres(db):
        db.execute('''CREATE TABLE IF NOT EXISTS receipt_reconsiderations
           (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)''')
    jobs=db.execute("SELECT * FROM receipt_jobs WHERE status='REVIEW' AND created_at>=? AND detail IN ("+','.join('?'*len(codes))+') ORDER BY created_at',
                    (recheck_since(now),*codes)).fetchall()
    for job in jobs:
        review=db.execute('SELECT * FROM partner_reviews WHERE job_id=?',(job['id'],)).fetchone()
        if (review and review['state'] not in ('PENDING','STALE','EXPIRED')) or already_rechecked(db,job,written_at) \
                or not image_available(config,journal,job):
            counts['held_skipped']+=1;continue
        requeue(db,job,DETAIL,review,fresh_extraction=False)
        counts['held_requeued']+=1
    return counts
