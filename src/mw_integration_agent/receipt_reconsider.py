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


def run(config_path,catalogue_path,job_id):
    import fcntl
    config=controls(config_path,catalogue_path);root=Path(config['state_directory'])
    with (root/'receipt-worker.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        journal=ReceiptJournal(root/'receipt-processing.db');db=journal.db
        try:
            ReviewStore(db)
            job=db.execute('SELECT * FROM receipt_jobs WHERE id=?',(job_id,)).fetchone()
            if not job or job['status'] not in ('REVIEW','REVIEW_REQUESTED','VALIDATED'):
                raise ConfigurationError('RECONSIDERATION_NOT_ELIGIBLE')
            review=db.execute('SELECT * FROM partner_reviews WHERE job_id=?',(job_id,)).fetchone()
            if review and review['state'] not in ('PENDING','STALE','EXPIRED'):
                raise ConfigurationError('DECIDED_REVIEW_CANNOT_BE_REOPENED')
            result=json.loads(job['result']) if job['result'] else {}
            url=None
            if 'receipt' not in result:
                for batch in pages(Instagram(config),config['instagram_account_id']+'/conversations',
                     {'platform':'instagram','fields':'id,messages.limit(100){id,attachments}','limit':100}):
                    for conv in batch:
                        for msg in conv.get('messages',{}).get('data',[]):
                            if msg['id']!=job['message_id']:continue
                            for index,att in enumerate(msg.get('attachments',{}).get('data',[])):
                                if hashlib.sha256(f"{msg['id']}:{index}".encode()).hexdigest()==job_id:
                                    url=att.get('image_data',{}).get('url')
                if not url:raise ConfigurationError('ORIGINAL_IMAGE_UNAVAILABLE')
            db.execute('''CREATE TABLE IF NOT EXISTS receipt_reconsiderations
               (id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,created_at REAL NOT NULL,previous TEXT NOT NULL)''')
            with db:
                previous={k:job[k] for k in ('status','detail','result')}
                db.execute('INSERT INTO receipt_reconsiderations(job_id,created_at,previous) VALUES (?,?,?)',(job_id,time.time(),json.dumps(previous)))
                if review:
                    db.execute("UPDATE partner_reviews SET state='SUPERSEDED',job_id=? WHERE id=?",(job_id+':superseded:'+review['id'],review['id']))
                db.execute('''UPDATE receipt_jobs SET status=?,url=?,attempts=0,retry_after=0,
                    detail='OWNER_REQUESTED_RECONSIDERATION' WHERE id=?''',('VALIDATED' if 'receipt' in result else 'PENDING',url or '',job_id))
            return {'status':'RECONSIDERATION_QUEUED','prior_review_superseded':bool(review)}
        finally:journal.close()
