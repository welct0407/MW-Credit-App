"""Explicit operator reconsideration; preserve prior decisions and never replay writes."""
import json
import hashlib
import time
from pathlib import Path
from .receipt_run import controls
from .receipt_journal import ReceiptJournal
from .partner_review import ReviewStore
from .instagram import Instagram
from .conversation_poll import pages
from .config import ConfigurationError


def requeue(db,job,detail,review,url='',fresh_extraction=True):
    """Queue a held job again (R119: shared by receipt-reconsider and the poll's master recheck).

    Lock-free body: the caller holds receipt-worker.lock. One transaction keeps the prior status, detail and result in
    receipt_reconsiderations, supersedes a pending review (it keeps its decision under a renamed job_id) and requeues
    the job: VALIDATED with a saved receipt, else PENDING. fresh_extraction drops a saved extraction without a receipt
    so the worker reads the image again (the operator's reconsider); the master recheck keeps it (no new OCR)."""
    from .state import is_postgres
    if not is_postgres(db):
        db.execute('''CREATE TABLE IF NOT EXISTS receipt_reconsiderations
           (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)''')
    result=json.loads(job['result']) if job['result'] else {}
    with db:
        previous={k:job[k] for k in ('status','detail','result')}
        db.execute('INSERT INTO receipt_reconsiderations(job_id,created_at,previous) VALUES (?,?,?)',(job['id'],time.time(),json.dumps(previous)))
        if review:
            db.execute("UPDATE partner_reviews SET state='SUPERSEDED',job_id=? WHERE id=?",(job['id']+':superseded:'+review['id'],review['id']))
        if 'receipt' not in result and fresh_extraction:
            result.pop('extraction',None)
            db.execute('UPDATE receipt_jobs SET result=? WHERE id=?',(json.dumps(result),job['id']))
        db.execute('''UPDATE receipt_jobs SET status=?,url=?,attempts=0,retry_after=0,
            detail=? WHERE id=?''',('VALIDATED' if 'receipt' in result else 'PENDING',url or '',detail,job['id']))
    return 'VALIDATED' if 'receipt' in result else 'PENDING'


def operator_selected(job):
    """R119: a PREPARED job from receipt-prepare (source kind operator-selected) may be reconsidered."""
    try:return json.loads(job['source'] or '{}').get('kind')=='operator-selected'
    except (TypeError,ValueError,AttributeError):return False


def run(config_path,catalogue_path,job_id):
    import fcntl
    config=controls(config_path,catalogue_path);root=Path(config['state_directory'])
    with (root/'receipt-worker.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        journal=ReceiptJournal(root/'receipt-processing.db', config=config);db=journal.db
        try:
            ReviewStore(db)
            job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(job_id,)).fetchone()
            if not job or not (job['status'] in ('REVIEW','REVIEW_REQUESTED','VALIDATED') or job['status']=='PREPARED' and operator_selected(job)):
                raise ConfigurationError('RECONSIDERATION_NOT_ELIGIBLE')
            review=db.execute('SELECT * FROM partner_reviews WHERE job_id=?',(job_id,)).fetchone()
            if review and review['state'] not in ('PENDING','STALE','EXPIRED'):
                raise ConfigurationError('DECIDED_REVIEW_CANNOT_BE_REOPENED')
            result=json.loads(job['result']) if job['result'] else {}
            url=None
            archived=False
            if config.get('receipt_archive_enabled'):
                from .receipt_archive import Archive
                asset=Archive(config,journal).get(job_id)
                archived=bool(asset and asset['archive_state']=='ARCHIVED')
            if 'receipt' not in result and not archived:
                for batch in pages(Instagram(config),config['instagram_account_id']+'/conversations',
                     {'platform':'instagram','fields':'id,messages.limit(100){id,attachments}','limit':100}):
                    for conv in batch:
                        for msg in conv.get('messages',{}).get('data',[]):
                            if msg['id']!=job['message_id']:continue
                            for index,att in enumerate(msg.get('attachments',{}).get('data',[])):
                                if hashlib.sha256(f"{msg['id']}:{index}".encode()).hexdigest()==job_id:
                                    url=att.get('image_data',{}).get('url')
                if not url:raise ConfigurationError('ORIGINAL_IMAGE_UNAVAILABLE')
            requeue(db,job,'OWNER_REQUESTED_RECONSIDERATION',review,url)
            return {'status':'RECONSIDERATION_QUEUED','prior_review_superseded':bool(review)}
        finally:journal.close()
