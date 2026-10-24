"""Receipt-only orchestration. No AppSheet or PostgreSQL mutation clients."""
import json
from .state import connect as state_connect
from pathlib import Path

from .config import ConfigurationError,cutoff_ts,load_controls
from .graph_email import GraphEmail,EmailRejected
from .instagram import Instagram
from .receipt_image import download,extract
from .receipt_journal import ReceiptJournal
from .receipt_master import masters
from .receipt_identity import PayerHeld,provenance as job_provenance,receipt_context,resolve_payer
from .payment_match import check as check_existing_payment
from .receipt_rules import ReceiptInvalid,borrower_for,recipients,summary,validate_receipt,username
from .statement_delivery import resolve_recipient

# Extraction-class failure ladder per attempt: next run, then 60 s; attempt 3 ends REVIEW.
UNAVAILABLE_RETRY=(0,60,300)
# Archive failures no retry can fix; any other archive error keeps the 300 s deferral.
ARCHIVE_TERMINAL={'RECEIPT_ARCHIVE_REQUIRES_OPERATOR','RECEIPT_SOURCE_MISSING','RECEIPT_SOURCE_CONFLICT','RECEIPT_SPOOL_MISSING'}


def controls(config_path,catalogue_path):
    config,catalogue=load_controls(config_path,catalogue_path)
    if config.get('receipt_payment_api_enabled') and not catalogue['services'].get('shared_receipt_payment_api',{}).get('enabled'):
        raise ConfigurationError('SHARED_RECEIPT_PAYMENT_API_DISABLED')
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


class Directory:
    """One conversation-directory read per run for sender identity and notice recipients.
    Only successful pages are kept; the readers' fail-closed checks run unchanged on them."""
    def __init__(self,config,api=None):
        self.config=config;self.api=api;self.pages={}

    def request(self,path,query):
        self.api=self.api or Instagram(self.config)
        if path!=self.config['instagram_account_id']+'/conversations':
            return self.api.request(path,query)  # profile lookups stay live
        key=json.dumps(query,sort_keys=True)
        if key not in self.pages:self.pages[key]=self.api.request(path,query)
        return self.pages[key]

    def identity(self,config,sender):return conversation_identity(config,sender,self)

    def recipient(self,api,partner):return resolve_recipient(self,partner)


def archive_state(journal,job_id):
    try:row=journal.db.execute('SELECT archive_state FROM receipt_assets WHERE job_id=?',(job_id,)).fetchone()
    except Exception:return None
    return row and row['archive_state']


def images(journal,config_path,catalogue_path,directory,budget,clock=None):
    """Pending images oldest first until none is left or the budget is spent (one image may overrun).
    A job tried in this run is not picked again, even when its retry is due at once."""
    import time
    clock=clock or time.monotonic;deadline=clock()+budget;seen=[]
    while clock()<deadline:
        batch=journal.pending(seen)
        if not batch:return
        job=batch[0];seen.append(job['id'])
        config=controls(config_path,catalogue_path)
        try:
            master=masters(config)
        except Exception:
            # A dependency outage before extraction must not spend image
            # attempts or discard source evidence. Let later intake run.
            with journal.db:
                journal.db.execute('UPDATE receipt_jobs SET retry_after=?,detail=? WHERE id=?',
                    (time.time()+300,'RECEIPT_MASTER_UNAVAILABLE',job['id']))
            continue
        process(job,journal,config,master,identity_reader=directory.identity)


def process(job,journal,config,master,fetch=download,extractor=extract,identity_reader=conversation_identity):
    from .receipt_archive import Archive,required
    archive=None
    if required(config,job):
        try:
            archive=Archive(config,journal)
            data,digest=archive.capture(job)
            journal.image(job['id'],data,digest)
            job.update(image=data,image_hash=digest)
        except Exception as exc:
            if isinstance(exc,ConfigurationError) and str(exc) in ARCHIVE_TERMINAL or archive_state(journal,job['id']) in (
                    'SOURCE_UNAVAILABLE','INTEGRITY_CONFLICT'):
                journal.mark(job['id'],'REVIEW','RECEIPT_ARCHIVE_UNAVAILABLE');return
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
        # R095: the sender context is resolved before extraction; C4/C5 have no borrower until the payer name.
        context=receipt_context(config,job,journal,master,identity_reader)
        borrower=context['borrower']
        if job['image'] is None:
            data,digest=fetch(job['url'])
            journal.image(job['id'],data,digest)
            job.update(image=data,image_hash=digest)
        if journal.duplicate(job['image_hash']):
            journal.mark(job['id'],'DUPLICATE','RECEIPT_ALREADY_PROCESSED'); return
        saved=json.loads(job.get('result') or '{}')
        value=saved.get('extraction') or extractor(config,job['image'])
        if archive:archive.classify(job['id'],value)
        provenance=job_provenance(job)
        def save(**extra):
            with journal.db:
                journal.db.execute('UPDATE receipt_jobs SET result=? WHERE id=?',(json.dumps({'extraction':value,'borrower':borrower,**provenance,**extra}),job['id']))
        save()
        receipt=validate_receipt(value,master['accounts'])
        try:
            from .review_proposal import facts as proposal_facts
            borrower,payer_lines,step=resolve_payer(context,value,receipt,master,facts=lambda borrower_id:proposal_facts(config,borrower_id),
                                                    hints=provenance.get('hint_texts'))
        except PayerHeld as held:
            # Weak context only: the hold names the candidates the reviewer can choose from in the app.
            save(payer_candidates=held.candidates);raise
        if context['borrower'] is None:
            provenance.update(payer_borrower_id=borrower['id'],payer_step=step);save()
        # The payer-lines change the posting command carries (guarded by the value read here), or None.
        receipt['payer_lines']=payer_lines
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
        journal.retry(job['id'],attempt,'RECEIPT_PROCESSING_UNAVAILABLE',delay=UNAVAILABLE_RETRY[attempt-1])


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
        directory=Directory(config)
        try:
            ingress=state_connect(root/'instagram-ingress.db',config,readonly=True)
            pass  # row format supplied by state adapter
            try:
                journal.ingest(ingress,cutoff_ts(config,'receipt_activation_cutoff'))
            finally:
                ingress.close()
            budget=config.get('receipt_cycle_image_budget_seconds',60)
            def image_phase():images(journal,config_path,catalogue_path,directory,budget)
            from .partner_notice import NoticeJournal,receipt_notice
            if config.get('partner_review_enabled'):
                from .review_cycle import cycle
                # Approvals and their notices first; images after, under the time budget.
                result=cycle(config,journal,directory.identity,directory.recipient,images=image_phase)
                if config.get('receipt_archive_enabled'):
                    from .receipt_projection import reconcile
                    result['receipt_evidence']=reconcile(config,journal)
                return result
            image_phase()
            # Supersede definitely unsent legacy direct-email work. SENT/UNKNOWN history stays intact.
            with journal.db:
                journal.db.execute("UPDATE receipt_emails SET status='SUPERSEDED' WHERE status IN ('PENDING','REJECTED')")
            notices=NoticeJournal(root/'partner-notices.db', config=config)
            try:
                config=controls(config_path,catalogue_path)
                if not config.get('partner_notice_cutoff'):raise ConfigurationError('PARTNER_NOTICE_CUTOFF_REQUIRED')
                jobs=journal.db.execute("SELECT * FROM receipt_jobs WHERE status='VALIDATED' AND created_at>=?",
                    (cutoff_ts(config,'partner_notice_cutoff'),)).fetchall()
                for job in jobs:
                    result=json.loads(job['result']);live=masters(config)
                    borrower=borrower_for(directory.identity(config,job['sender_id']),live['borrowers'])
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
                        borrower=borrower_for(directory.identity(config,job['sender_id']),live['borrowers'])
                        check_existing_payment(config,result['receipt'],borrower)
                        if borrower['id']!=result['borrower']['id']:raise ReceiptInvalid('BORROWER_MAPPING_CHANGED')
                        if not any(a['id']==result['receipt']['account_id'] and a['active'] is True for a in live['accounts']):
                            raise ReceiptInvalid('CASH_ACCOUNT_CHANGED')
                    except ReceiptInvalid:
                        with notices.db:notices.db.execute("UPDATE partner_notices SET ig_status='REVIEW',detail='RECEIPT_MASTER_CHANGED' WHERE id=?",(notice['id'],))
                        continue
                    notices.dispatch(notice,config,live['partners'],resolver=directory.recipient)
            finally:notices.close()
            return journal.counts()
        finally:
            journal.close()
