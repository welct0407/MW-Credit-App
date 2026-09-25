"""Official API intake only; shared receipt jobs, never signed-webhook evidence."""
import hashlib
import json
import re
import time
from datetime import datetime
from pathlib import Path

from .config import ConfigurationError, load_json
from .instagram import Instagram
from .receipt_journal import ReceiptJournal
from .receipt_rules import username
from .receipt_master import masters
from .receipt_run import controls


MESSAGE_FIELDS='id,created_time,from,attachments'
MAX_HISTORY_PAGES=10


def history_page(api,config,conversation_id,cursor):
    """Group /messages URLs fail on this account; paginate the working expansion."""
    if not isinstance(cursor,str) or not re.fullmatch(r'[A-Za-z0-9_+=/-]+',cursor):
        raise ConfigurationError('POLL_HISTORY_CURSOR_INVALID')
    fields='id,messages.limit(100).after('+cursor+'){'+MESSAGE_FIELDS+'}'
    for batch in pages(api,config['instagram_account_id']+'/conversations',
                       {'platform':'instagram','fields':fields,'limit':100}):
        matches=[row for row in batch if row.get('id')==conversation_id]
        if len(matches)>1:raise ConfigurationError('POLL_CONVERSATION_AMBIGUOUS')
        # Instagram omits an empty expanded edge (including the terminal page).
        # The conversation itself must still be present in the successful reply.
        if matches:return matches[0].get('messages',{'data':[]})
    raise ConfigurationError('POLL_CONVERSATION_DISAPPEARED')


def history_since(api,config,conversation,since,now):
    """Prove the boundary or exhaustion before committing any part of a group."""
    history=conversation.get('messages',{'data':[]});found=[];previous=float('inf');seen=set()
    for _ in range(MAX_HISTORY_PAGES):
        if not isinstance(history,dict) or not isinstance(history.get('data'),list):
            raise ConfigurationError('POLL_HISTORY_MISSING')
        reached=False
        for message in history['data']:
            try:
                stamp=datetime.fromisoformat(message['created_time'])
                if not stamp.tzinfo:raise ConfigurationError('POLL_TIMEZONE_MISSING')
                ts=stamp.timestamp()
            except (KeyError,TypeError,ValueError):
                raise ConfigurationError('POLL_MESSAGE_TIME_INVALID') from None
            if ts>previous:raise ConfigurationError('POLL_MESSAGE_ORDER_CHANGED')
            previous=ts
            if ts<since:reached=True;continue
            if ts<=now:found.append((message,ts))
        paging=history.get('paging',{})
        if reached or not paging.get('next'):return found
        cursor=paging.get('cursors',{}).get('after')
        if not history['data'] or not cursor or cursor in seen:
            raise ConfigurationError('POLL_HISTORY_INCOMPLETE_PAGINATION')
        seen.add(cursor)
        if len(seen)>=MAX_HISTORY_PAGES:break
        history=history_page(api,config,conversation['id'],cursor)
    raise ConfigurationError('POLL_HISTORY_PAGE_LIMIT')


def pages(api,path,query):
    seen=set()
    for _ in range(100):
        result=api.request(path,query)
        if not isinstance(result.get('data'),list):raise ConfigurationError('POLL_INVALID_PAGE')
        yield result['data']
        paging=result.get('paging',{})
        if not paging.get('next'):return
        after=paging.get('cursors',{}).get('after')
        if not after or after in seen:raise ConfigurationError('POLL_INCOMPLETE_PAGINATION')
        seen.add(after);query={**query,'after':after}
    raise ConfigurationError('POLL_PAGE_LIMIT')


def scan(config,api,master,journal,now=None,day=None):
    now=time.time() if now is None else now
    cutoff=datetime.fromisoformat(config['conversation_poll_cutoff']).timestamp()
    if day:
        from .receipt_rules import BANGKOK
        if day!=datetime.fromtimestamp(now,BANGKOK).date().isoformat():raise ConfigurationError('BACKFILL_TODAY_ONLY')
        cutoff=datetime.fromisoformat(day+'T00:00:00+07:00').timestamp()
    db=journal.db
    from .state import is_postgres
    if not is_postgres(db):
        db.executescript('''CREATE TABLE IF NOT EXISTS conversation_poll_state
          (conversation_id TEXT PRIMARY KEY, checked_through REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS conversation_poll_messages
          (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, event_time REAL NOT NULL,
           captured_at REAL NOT NULL, outcome TEXT NOT NULL);''')
    enabled={username(b['username']) for b in master['borrowers'] if b['enabled'] is True and username(b['username'])}
    counts={'conversations':0,'eligible_conversations':0,'new_messages':0,'image_jobs':0,
            'failed_conversations':0,'errors':[]}
    for batch in pages(api,config['instagram_account_id']+'/conversations',
                       {'platform':'instagram','fields':'id,participants,messages.limit(100){'+MESSAGE_FIELDS+'}','limit':100}):
        for conversation in batch:
            counts['conversations']+=1
            try:
                added,images,eligible=capture_conversation(config,api,master,db,conversation,enabled,cutoff,now,day)
            except ConfigurationError as exc:
                # Keep this group's cursor/jobs unchanged while other groups continue.
                counts['failed_conversations']+=1
                if len(counts['errors'])<20:
                    counts['errors'].append({'conversation_key':hashlib.sha256(str(conversation.get('id','')).encode()).hexdigest()[:16],
                                             'error':str(exc)})
                continue
            counts['eligible_conversations']+=int(eligible)
            counts['new_messages']+=added;counts['image_jobs']+=images
    return counts


def capture_conversation(config,api,master,db,conversation,enabled,cutoff,now,day):
    peers=conversation.get('participants',{})
    if peers.get('paging',{}).get('next'):raise ConfigurationError('POLL_PARTICIPANTS_INCOMPLETE')
    participants=peers.get('data')
    if not isinstance(participants,list):raise ConfigurationError('POLL_PARTICIPANTS_MISSING')
    if day and len(participants)<=2:return 0,0,False
    allowed={str(p['id']) for p in participants if username(p.get('username')) in enabled}
    allowed.discard(str(config['instagram_account_id']))
    if not allowed:return 0,0,False
    cid=conversation['id']
    prior=db.execute('SELECT checked_through FROM conversation_poll_state WHERE conversation_id=?',(cid,)).fetchone()
    since=cutoff if day else max(cutoff,(prior[0]-300) if prior else cutoff)
    found=history_since(api,config,conversation,since,now)
    added=images=0
    # Cursor and job reservations commit together. A failed read never advances this cursor.
    with db:
        for message,ts in reversed(found):
            sender=str(message.get('from',{}).get('id',''))
            attachments=message.get('attachments',{})
            if attachments.get('paging',{}).get('next'):raise ConfigurationError('POLL_ATTACHMENTS_INCOMPLETE')
            items=attachments.get('data',[])
            valid=sender in allowed
            forwarded=False
            forwarding_evidence=None
            if not valid and config.get('receipt_forwarding_enabled') is True:
                from .receipt_identity import forwarded_borrower
                from .receipt_rules import ReceiptInvalid
                forward_cutoff=datetime.fromisoformat(config['receipt_forwarding_cutoff']).timestamp()
                if ts>=forward_cutoff:
                    try:
                        matched=forwarded_borrower(config,master,participants,sender)
                        forwarding_evidence=json.dumps({'forwarded_borrower_id':matched['id']})
                        valid=forwarded=True
                    except ReceiptInvalid:pass
            inserted=db.execute('INSERT OR IGNORE INTO conversation_poll_messages VALUES (?,?,?,?,?)',
               (message['id'],cid,ts,now,'FORWARDED' if forwarded else ('BORROWER' if valid else 'IGNORED'))).rowcount
            if not inserted:continue
            added+=1
            if not valid:continue
            for index,item in enumerate(items):
                url=item.get('image_data',{}).get('url')
                if not url:continue
                key=hashlib.sha256(f"{message['id']}:{index}".encode()).hexdigest()
                images+=db.execute('''INSERT OR IGNORE INTO receipt_jobs
                  (id,message_id,sender_id,url,status,created_at,result) VALUES (?,?,?,?,'PENDING',?,?)''',
                  (key,message['id'],sender,url,now,forwarding_evidence)).rowcount
        if not day:db.execute('INSERT OR REPLACE INTO conversation_poll_state VALUES (?,?)',(cid,now))
    return added,images,True


def run(config_path,catalogue_path,day=None):
    import fcntl
    config=controls(config_path,catalogue_path)
    if config.get('conversation_poll_enabled') is not True or not load_json(catalogue_path)['services'].get('conversation_poll',{}).get('enabled'):
        raise ConfigurationError('CONVERSATION_POLL_DISABLED')
    root=Path(config['state_directory'])
    with (root/'conversation-poll.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'already_running'}
        journal=ReceiptJournal(root/'receipt-processing.db', config=config)
        try:return scan(config,Instagram(config),masters(config),journal,day=day)
        finally:journal.close()
