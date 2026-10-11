"""Receipt-only orchestration. No AppSheet or PostgreSQL mutation clients."""
import json
import sqlite3
from .state import connect as state_connect, enabled as state_enabled
from datetime import datetime
from pathlib import Path

from .config import ConfigurationError,load_json,validate_catalogue,validate_config
from .graph_email import GraphEmail,EmailRejected,EmailUnknown
from .instagram import Instagram
from .receipt_image import download,extract
from .receipt_journal import ReceiptJournal
from .receipt_master import masters
from .receipt_identity import receipt_borrower
from .payment_match import check as check_existing_payment
from .receipt_rules import ReceiptInvalid,borrower_for,recipients,summary,validate_receipt,username


def controls(config_path,catalogue_path):
    config=load_json(config_path); validate_config(config)
    catalogue=load_json(catalogue_path); validate_catalogue(catalogue)
    if config.get('receipt_archive_enabled') and not catalogue['services'].get('receipt_evidence',{}).get('enabled'):
        raise ConfigurationError('RECEIPT_EVIDENCE_SERVICE_DISABLED')
    if config.get('partner_review_enabled') and not catalogue['services'].get('partner_receipt_review',{}).get('enabled'):
        raise ConfigurationError('PARTNER_REVIEW_SERVICE_DISABLED')
    for service in ('receipt_summary','signed_webhook_ingress','database_connectivity',
                    'partner_authentication','instagram_delivery','email_fallback'):
        if not catalogue['services'].get(service,{}).get('enabled'):
            raise ConfigurationError('RECEIPT_SERVICE_DISABLED')
    if config.get('receipt_summary_enabled') is not True:
        raise ConfigurationError('RECEIPT_SUMMARY_DISABLED')
    return config


def conversation_identity(config,sender,api=None):
    """Bind signed sender ID to the account's conversation participant; no profile consent call."""
    sender=str(sender)
    if not sender.isdigit() or sender==str(config['instagram_account_id']):
        raise ReceiptInvalid('IG_SENDER_INVALID')
    api=api or Instagram(config)
    bindings=set();seen=set();after=None
    for _ in range(100):
        query={'platform':'instagram','fields':'id,participants','limit':100}
        if after:
            query['after']=after
        page=api.request(config['instagram_account_id']+'/conversations',query)
        if not isinstance(page.get('data'),list):
            raise ConfigurationError('IG_CONVERSATION_DIRECTORY_UNAVAILABLE')
        for conversation in page['data']:
            peers=conversation.get('participants',{})
            if peers.get('paging',{}).get('next') or not isinstance(peers.get('data'),list):
                raise ConfigurationError('IG_PARTICIPANTS_INCOMPLETE')
            for peer in peers['data']:
                identifier=str(peer.get('id') or '')
                name=username(peer.get('username'))
                if identifier.isdigit() and name:
                    bindings.add((identifier,name))
        paging=page.get('paging',{})
        if not paging.get('next'):
            break
        after=paging.get('cursors',{}).get('after')
        if not after or after in seen:
            raise ConfigurationError('IG_CONVERSATION_PAGINATION_INCOMPLETE')
        seen.add(after)
    else:
        raise ConfigurationError('IG_CONVERSATION_PAGINATION_LIMIT')
    names={name for identifier,name in bindings if identifier==sender}
    if len(names)!=1:
        raise ReceiptInvalid('IG_CONVERSATION_IDENTITY_AMBIGUOUS')
    name=names.pop()
    if {identifier for identifier,n in bindings if n==name}!={sender}:
        raise ReceiptInvalid('IG_CONVERSATION_IDENTITY_AMBIGUOUS')
    return {'id':sender,'username':name}


def process(job,journal,config,master,fetch=download,extractor=extract,identity_reader=conversation_identity):
    from .receipt_archive import Archive,required
    archive=None
    if required(config,job):
        try:
            archive=Archive(config,journal)
            data,digest=archive.capture(job)
            journal.image(job['id'],data,digest)
            job.update(image=data,image_hash=digest)
        except Exception:
            # Archive outages never spend extraction attempts or clear source URLs.
            import time
            with journal.db:
                journal.db.execute('UPDATE receipt_jobs SET retry_after=?,detail=? WHERE id=?',
                    (time.time()+300,'RECEIPT_ARCHIVE_PENDING',job['id']))
            return
    # Persist the attempt before external work so repeated crashes cannot retry forever.
    attempt=job['attempts']+1
    if attempt>3:
        journal.mark(job['id'],'REVIEW','RECEIPT_RETRY_LIMIT');return
    journal.retry(job['id'],attempt,'RECEIPT_PROCESSING_STARTED',terminal=False)
    try:
        borrower=receipt_borrower(config,job,journal,master,identity_reader)
        if job['image'] is None:
            data,digest=fetch(job['url'])
            journal.image(job['id'],data,digest)
            job.update(image=data,image_hash=digest)
        if journal.duplicate(job['image_hash']):
            journal.mark(job['id'],'DUPLICATE','RECEIPT_ALREADY_PROCESSED'); return
        saved=json.loads(job.get('result') or '{}')
        value=saved.get('extraction') or extractor(config,job['image'])
        if archive:archive.classify(job['id'],value)
        provenance={k:v for k,v in json.loads(job.get('result') or '{}').items() if k=='forwarded_borrower_id'}
        with journal.db:
            journal.db.execute('UPDATE receipt_jobs SET result=? WHERE id=?',(json.dumps({'extraction':value,'borrower':borrower,**provenance}),job['id']))
        receipt=validate_receipt(value,master['accounts'])
        # The fresh reference check distinguishes posted matches from conflicting/error rows.
        check_existing_payment(config,receipt,borrower)
        journal.accept(job,{'receipt':receipt,'borrower':borrower,**provenance},[])
    except ReceiptInvalid as exc:
        if str(exc)=='PAYMENT_ALREADY_RECORDED':
            journal.mark(job['id'],'DUPLICATE',str(exc));return
        ignored=str(exc) in ('NOT_PAYMENT_RECEIPT','BORROWER_NOT_UNIQUELY_ENABLED')
        journal.mark(job['id'],'IGNORED' if ignored else 'REVIEW',str(exc))
    except Exception:
        # Fixed safe error codes only; do not persist provider responses or signed URLs in detail.
        journal.retry(job['id'],attempt,'RECEIPT_PROCESSING_UNAVAILABLE')


def dispatch(email,journal,config,master,sender=None,identity_reader=conversation_identity):
    try:
        result=json.loads(email['result']); destination=json.loads(email['payload'])
        borrower=borrower_for(identity_reader(config,email['sender_id']),master['borrowers'])
        if borrower['id']!=result['borrower']['id']:
            raise ReceiptInvalid('BORROWER_MAPPING_CHANGED')
        current={p['email']:p for p in recipients(master['partners'])}.get(destination['email'])
        if current!=destination:
            raise ReceiptInvalid('PARTNER_DELIVERY_CHANGED')
        if not any(a['id']==result['receipt']['account_id'] and a['active'] is True for a in master['accounts']):
            raise ReceiptInvalid('CASH_ACCOUNT_CHANGED')
        subject,body=summary(result['receipt'],borrower,destination['languages'])
    except ReceiptInvalid as exc:
        journal.finish_email(email['id'],'REVIEW',str(exc)); return
    if not journal.begin_email(email['id']):
        return
    try:
        (sender or GraphEmail(config)).send(destination['email'],subject,body,[],email['id'])
    except EmailRejected:
        journal.finish_email(email['id'],'REJECTED','EMAIL_DEFINITELY_NOT_ACCEPTED')
    except Exception:
        journal.finish_email(email['id'],'UNKNOWN','EMAIL_ACCEPTANCE_UNCERTAIN')
    else:
        journal.finish_email(email['id'],'SENT')


def run(config_path,catalogue_path):
    import fcntl
    config=controls(config_path,catalogue_path)
    root=Path(config['state_directory']); root.mkdir(parents=True,exist_ok=True)
    with (root/'receipt-worker.lock').open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status':'already_running'}
        journal=ReceiptJournal(root/'receipt-processing.db', config=config)
        try:
            ingress=state_connect(root/'instagram-ingress.db',config,readonly=True)
            pass  # row format supplied by state adapter
            try:
                journal.ingest(ingress,datetime.fromisoformat(config['receipt_activation_cutoff']).timestamp())
            finally:
                ingress.close()
            # A slow image must not delay approvals/notices behind ten model calls.
            for job in journal.pending()[:1]:
                config=controls(config_path,catalogue_path)
                try:
                    master=masters(config)
                except Exception:
                    # A dependency outage before extraction must not spend image
                    # attempts or discard source evidence. Let later intake run.
                    import time
                    with journal.db:
                        journal.db.execute('UPDATE receipt_jobs SET retry_after=?,detail=? WHERE id=?',
                            (time.time()+300,'RECEIPT_MASTER_UNAVAILABLE',job['id']))
                    continue
                process(job,journal,config,master)
            from .partner_notice import NoticeJournal,receipt_notice
            if config.get('partner_review_enabled'):
                from .review_cycle import cycle
                result=cycle(config,journal,conversation_identity)
                if config.get('receipt_archive_enabled'):
                    from .receipt_projection import reconcile
                    result['receipt_evidence']=reconcile(config,journal)
                return result
            # Supersede definitely unsent legacy direct-email work. SENT/UNKNOWN history stays intact.
            with journal.db:
                journal.db.execute("UPDATE receipt_emails SET status='SUPERSEDED' WHERE status IN ('PENDING','REJECTED')")
            notices=NoticeJournal(root/'partner-notices.db', config=config)
            try:
                config=controls(config_path,catalogue_path)
                cutoff=config.get('partner_notice_cutoff')
                if not cutoff:raise ConfigurationError('PARTNER_NOTICE_CUTOFF_REQUIRED')
                jobs=journal.db.execute("SELECT * FROM receipt_jobs WHERE status='VALIDATED' AND created_at>=?",
                    (datetime.fromisoformat(cutoff).timestamp(),)).fetchall()
                for job in jobs:
                    result=json.loads(job['result']);live=masters(config)
                    borrower=borrower_for(conversation_identity(config,job['sender_id']),live['borrowers'])
                    try:check_existing_payment(config,result['receipt'],borrower)
                    except ReceiptInvalid as exc:
                        journal.mark(job['id'],'DUPLICATE' if str(exc)=='PAYMENT_ALREADY_RECORDED' else 'REVIEW',str(exc));continue
                    if borrower['id']!=result['borrower']['id']:continue
                    if not any(a['id']==result['receipt']['account_id'] and a['active'] is True for a in live['accounts']):continue
                    for partner in live['partners']:
                        subject,body=receipt_notice(result['receipt'],borrower,partner['language'])
                        notices.reserve('receipt:'+job['id'],partner,subject,body)
                    with journal.db:
                        journal.db.execute("UPDATE receipt_jobs SET status='NOTICE_QUEUED' WHERE id=? AND status='VALIDATED'",(job['id'],))
                for notice in notices.due():
                    config=controls(config_path,catalogue_path)
                    live=masters(config)
                    job=journal.db.execute('SELECT * FROM receipt_jobs WHERE id=?',(notice['event_key'].removeprefix('receipt:'),)).fetchone()
                    try:
                        if not job:raise ReceiptInvalid('RECEIPT_MISSING')
                        result=json.loads(job['result'])
                        borrower=borrower_for(conversation_identity(config,job['sender_id']),live['borrowers'])
                        check_existing_payment(config,result['receipt'],borrower)
                        if borrower['id']!=result['borrower']['id']:raise ReceiptInvalid('BORROWER_MAPPING_CHANGED')
                        if not any(a['id']==result['receipt']['account_id'] and a['active'] is True for a in live['accounts']):
                            raise ReceiptInvalid('CASH_ACCOUNT_CHANGED')
                    except ReceiptInvalid:
                        with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='RECEIPT_MASTER_CHANGED' WHERE id=?",(notice['id'],))
                        continue
                    notices.dispatch(notice,config,live['partners'])
            finally:notices.close()
            return journal.counts()
        finally:
            journal.close()
