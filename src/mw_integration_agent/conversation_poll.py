"""Official API intake only; shared receipt jobs, never signed-webhook evidence."""
import hashlib
import json
import time
from datetime import datetime
from pathlib import Path

from .config import ConfigurationError, load_json
from .instagram import Instagram
from .receipt_journal import ReceiptJournal
from .receipt_rules import username
from .receipt_master import masters
from .receipt_run import controls


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


def scan(config,api,master,journal,now=None):
    now=time.time() if now is None else now
    cutoff=datetime.fromisoformat(config['conversation_poll_cutoff']).timestamp()
    db=journal.db
    db.executescript('''CREATE TABLE IF NOT EXISTS conversation_poll_state
      (conversation_id TEXT PRIMARY KEY, checked_through REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS conversation_poll_messages
      (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, event_time REAL NOT NULL,
       captured_at REAL NOT NULL, outcome TEXT NOT NULL);''')
    enabled={username(b['username']) for b in master['borrowers'] if b['enabled'] is True and username(b['username'])}
    counts={'conversations':0,'eligible_conversations':0,'new_messages':0,'image_jobs':0}
    for batch in pages(api,config['instagram_account_id']+'/conversations',
                       {'platform':'instagram','fields':'id,participants,messages.limit(100){id,created_time,from,attachments}','limit':100}):
        for conversation in batch:
            counts['conversations']+=1
            peers=conversation.get('participants',{})
            if peers.get('paging',{}).get('next'):raise ConfigurationError('POLL_PARTICIPANTS_INCOMPLETE')
            participants=peers.get('data')
            if not isinstance(participants,list):raise ConfigurationError('POLL_PARTICIPANTS_MISSING')
            allowed={str(p['id']) for p in participants if username(p.get('username')) in enabled}
            allowed.discard(str(config['instagram_account_id']))
            if not allowed:continue
            counts['eligible_conversations']+=1
            cid=conversation['id']
            prior=db.execute('SELECT checked_through FROM conversation_poll_state WHERE conversation_id=?',(cid,)).fetchone()
            since=max(cutoff,(prior[0]-300) if prior else cutoff)
            found=[]; previous=float('inf')
            # Read newest-first history through the overlap boundary, not just its last message.
            history=conversation.get('messages',{'data':[]})
            for messages in [history['data']]:
                reached=False
                for message in messages:
                    stamp=datetime.fromisoformat(message['created_time'])
                    if stamp.tzinfo is None:raise ConfigurationError('POLL_TIMEZONE_MISSING')
                    ts=stamp.timestamp()
                    if ts>previous:raise ConfigurationError('POLL_MESSAGE_ORDER_CHANGED')
                    previous=ts
                    if ts<since:reached=True;continue
                    if ts>now:continue
                    found.append((message,ts))
                if not reached and history.get('paging',{}).get('next'):
                    raise ConfigurationError('POLL_HISTORY_GAP_NO_CURSOR_ADVANCE')
            added=images=0
            # Cursor and job reservations commit together. A failed read never advances this cursor.
            with db:
                for message,ts in reversed(found):
                    sender=str(message.get('from',{}).get('id',''))
                    attachments=message.get('attachments',{})
                    if attachments.get('paging',{}).get('next'):raise ConfigurationError('POLL_ATTACHMENTS_INCOMPLETE')
                    items=attachments.get('data',[])
                    valid=sender in allowed
                    inserted=db.execute('INSERT OR IGNORE INTO conversation_poll_messages VALUES (?,?,?,?,?)',
                       (message['id'],cid,ts,now,'BORROWER' if valid else 'IGNORED')).rowcount
                    if not inserted:continue
                    added+=1
                    if not valid:continue
                    for index,item in enumerate(items):
                        url=item.get('image_data',{}).get('url')
                        if not url:continue
                        key=hashlib.sha256(f"{message['id']}:{index}".encode()).hexdigest()
                        images+=db.execute('''INSERT OR IGNORE INTO receipt_jobs
                          (id,message_id,sender_id,url,status,created_at) VALUES (?,?,?,?,'PENDING',?)''',
                          (key,message['id'],sender,url,now)).rowcount
                db.execute('INSERT OR REPLACE INTO conversation_poll_state VALUES (?,?)',(cid,now))
            counts['new_messages']+=added;counts['image_jobs']+=images
    return counts


def run(config_path,catalogue_path):
    import fcntl
    config=controls(config_path,catalogue_path)
    if config.get('conversation_poll_enabled') is not True or not load_json(catalogue_path)['services'].get('conversation_poll',{}).get('enabled'):
        raise ConfigurationError('CONVERSATION_POLL_DISABLED')
    root=Path(config['state_directory'])
    with (root/'conversation-poll.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'already_running'}
        journal=ReceiptJournal(root/'receipt-processing.db')
        try:return scan(config,Instagram(config),masters(config),journal)
        finally:journal.close()
