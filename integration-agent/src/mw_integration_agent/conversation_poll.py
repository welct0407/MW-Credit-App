"""Official API intake only; shared receipt jobs, never signed-webhook evidence."""
import hashlib
import json
import os
import re
import time
from datetime import datetime,timedelta
from pathlib import Path

from .config import ConfigurationError, cutoff_ts, load_json
from .instagram import Instagram
from .receipt_journal import ReceiptJournal
from .receipt_rules import username
from .receipt_master import masters
from .receipt_run import controls


# R095: `message` (text) carries the forwarder's nickname hint that follows a slip in the same read.
MESSAGE_FIELDS='id,created_time,from,message,attachments'
# The first conversation-list read carries every conversation's newest FIRST_PAGE_MESSAGES, which covers the
# ~6-minute window (one-minute cadence plus the 300 s overlap); a longer window continues per conversation with
# 100-message pages (history_page). Reach per scan: 20 + 9 x 100 messages within MAX_HISTORY_PAGES.
FIRST_PAGE_MESSAGES=20
MAX_HISTORY_PAGES=10
READ_TIMEOUT=40  # seconds per socket operation for the poll's API reads; sends keep instagram.SEND_TIMEOUT


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


POLL_TABLES_SQLITE='''CREATE TABLE IF NOT EXISTS conversation_poll_state
          (conversation_id TEXT PRIMARY KEY, checked_through REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS conversation_poll_messages
          (message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, event_time REAL NOT NULL,
           captured_at REAL NOT NULL, outcome TEXT NOT NULL);'''


def enabled_usernames(master):
    """The normalised Instagram usernames of AI-enabled borrowers (the poll's eligibility set)."""
    return {username(b['username']) for b in master['borrowers'] if b['enabled'] is True and username(b['username'])}


def scan(config,api,master,journal,now=None,day=None,recheck=None):
    """recheck (R119, never with day): {'usernames': newly enabled usernames}; each group with such a participant also
    re-reads yesterday and today for that participant's slips the poll recorded as IGNORED (recheck_ignored)."""
    now=time.time() if now is None else now
    cutoff=cutoff_ts(config,'conversation_poll_cutoff')
    if day:
        from .business_time import BANGKOK
        if day!=datetime.fromtimestamp(now,BANGKOK).date().isoformat():raise ConfigurationError('BACKFILL_TODAY_ONLY')
        cutoff=datetime.fromisoformat(day+'T00:00:00+07:00').timestamp()
    db=journal.db
    from .state import ensure_group_chat_summary_state, is_postgres
    if not is_postgres(db):
        # R146: the summary marker lives beside the poll rows (created only while the summary switch is on).
        if config.get('group_chat_summary_enabled') is True:ensure_group_chat_summary_state(db)
        db.executescript(POLL_TABLES_SQLITE)
    # R146: the group chat summary marker (None while group_chat_summary_enabled is off: the poll is unchanged).
    from .group_chat_summary import poll_context
    summary=poll_context(config,master,db)
    enabled=enabled_usernames(master)
    counts={'conversations':0,'eligible_conversations':0,'new_messages':0,'image_jobs':0,
            'failed_conversations':0,'errors':[]}
    newly=set(recheck['usernames']) if recheck and not day else set()
    if newly:counts.update(recheck_jobs=0,recheck_errors=0)
    for batch in pages(api,config['instagram_account_id']+'/conversations',
                       {'platform':'instagram','fields':'id,participants,messages.limit('+str(FIRST_PAGE_MESSAGES)+'){'+MESSAGE_FIELDS+'}','limit':100}):
        for conversation in batch:
            counts['conversations']+=1
            try:
                added,images,eligible=capture_conversation(config,api,master,db,conversation,enabled,cutoff,now,day,summary)
            except Exception as exc:
                # Keep this group's cursor/jobs unchanged while other groups continue.
                counts['failed_conversations']+=1
                if len(counts['errors'])<20:
                    cid=conversation.get('id','') if isinstance(conversation,dict) else ''
                    counts['errors'].append({'conversation_key':hashlib.sha256(str(cid).encode()).hexdigest()[:16],
                                             'error':str(exc) if isinstance(exc,ConfigurationError) else 'POLL_CONVERSATION_UNAVAILABLE:'+type(exc).__name__})
                # A group the recheck could not read keeps the master snapshot where it is (retried next run).
                if newly and newly_present(config,conversation,newly):counts['recheck_errors']+=1
                continue
            counts['eligible_conversations']+=int(eligible)
            counts['new_messages']+=added;counts['image_jobs']+=images
            if newly and newly_present(config,conversation,newly):
                try:counts['recheck_jobs']+=recheck_ignored(config,api,master,db,conversation,newly,now)
                except Exception as exc:
                    counts['recheck_errors']+=1
                    if len(counts['errors'])<20:
                        counts['errors'].append({'conversation_key':hashlib.sha256(str(conversation.get('id','')).encode()).hexdigest()[:16],
                            'error':'RECHECK:'+(str(exc) if isinstance(exc,ConfigurationError) else type(exc).__name__)})
    return counts


def group_context(config,master,participants):
    """R095 C4': from payer_name_cutoff a group with two or more enabled borrowers carries them as evidence, so the
    payer name decides who paid (receipt_identity). Returns (payer cutoff or None, sorted borrower ids or None)."""
    payer_cutoff=cutoff_ts(config,'payer_name_cutoff') if config.get('payer_name_cutoff') else None
    group_ids=None
    if payer_cutoff is not None:
        from .receipt_identity import group_borrowers
        members=group_borrowers(master,[p for p in participants if str(p.get('id',''))!=str(config['instagram_account_id'])])
        if len(members)>=2:group_ids=sorted(b['id'] for b in members)
    return payer_cutoff,group_ids


def group_evidence(payer_cutoff,group_ids,ts):
    """C4': a borrower sends in a multi-borrower group; compared with the sender's name, never filled. Message time
    gates it, like the forwarding cutoff."""
    return json.dumps({'candidate_borrower_ids':group_ids}) if payer_cutoff is not None and ts>=payer_cutoff and group_ids else None


# R119: the recheck window starts at yesterday's local midnight; a slip and a job (or poll row) are the same message
# when Meta's id matches or, because Meta's ids are not stable, the same group's time is within MATCH_SECONDS.
MATCH_SECONDS=5


def recheck_since(now):
    from .business_time import BANGKOK
    today=datetime.fromtimestamp(now,BANGKOK).date()
    return datetime.combine(today-timedelta(days=1),datetime.min.time(),BANGKOK).timestamp()


def newly_present(config,conversation,newly):
    try:
        return any(username(p.get('username')) in newly and str(p.get('id',''))!=str(config['instagram_account_id'])
                   for p in conversation['participants']['data'])
    except (KeyError,TypeError,AttributeError):return False


def recheck_ignored(config,api,master,db,conversation,newly,now):
    """R119: slips a newly enabled participant sent yesterday or today, recorded as IGNORED while they were not enabled,
    become jobs. Each slip needs an IGNORED row of this group (same message id, or time within MATCH_SECONDS) and no
    job yet (by either message id, or a job since the window start whose source names this group, sender and time
    within MATCH_SECONDS). One transaction turns the row into BORROWER (plus a BORROWER row for a changed id) and inserts
    the jobs with the poll's source and the C4' group evidence. The cursor and every other outcome stay; the payer,
    duplicate, archive and idempotency guards all apply when the job runs. Returns the number of jobs added."""
    participants=conversation['participants']['data'];cid=conversation['id']
    senders={str(p['id']) for p in participants if username(p.get('username')) in newly}
    senders.discard(str(config['instagram_account_id']))
    if not senders:return 0
    since=recheck_since(now)
    slips=[(m,ts) for m,ts in reversed(history_since(api,config,conversation,since,now))
           if str(m.get('from',{}).get('id','')) in senders and m.get('attachments',{}).get('data')]
    if not slips:return 0
    payer_cutoff,group_ids=group_context(config,master,participants)
    return promote(db,cid,[(m,ts,'BORROWER',group_evidence(payer_cutoff,group_ids,ts)) for m,ts in slips],now,since)['jobs']


def promote(db,cid,items,now,since,by_time=True):
    """The R119 core (recheck_ignored, R151 reprocess_ignored): each (message, ts, outcome, evidence) needs exactly one
    IGNORED row of this group (same message id, or time within MATCH_SECONDS) and no job yet (by either message id, or a
    job since `since` whose source names this group, sender and time within MATCH_SECONDS). One transaction turns each
    row into `outcome` (plus a row for a changed id) and inserts its jobs by the poll's deterministic key and source.
    by_time=False (R151 reprocess by message id suffix) matches the row by message id only.
    Returns counts: jobs added, rows promoted, slips skipped for an existing job, and slips without exactly one row."""
    sources=[]
    for row in db.execute('SELECT source FROM receipt_jobs WHERE created_at>=? AND source IS NOT NULL',(since,)).fetchall():
        try:sources.append(json.loads(row[0]))
        except (TypeError,ValueError):continue
    from .receipt_archive import source
    counts={'jobs':0,'promoted':0,'skipped_existing':0,'unmatched':0}
    with db:
        for message,ts,outcome,evidence in items:
            sender=str(message['from']['id'])
            attachments=message['attachments']
            if attachments.get('paging',{}).get('next'):raise ConfigurationError('POLL_ATTACHMENTS_INCOMPLETE')
            rows=db.execute("SELECT message_id FROM conversation_poll_messages WHERE conversation_id=? AND outcome='IGNORED' AND message_id=?",
                            (cid,message['id'])).fetchall()
            if not rows and by_time:
                rows=db.execute("SELECT message_id FROM conversation_poll_messages WHERE conversation_id=? AND outcome='IGNORED' AND abs(event_time-?)<=?",
                                (cid,ts,MATCH_SECONDS)).fetchall()
            if len(rows)!=1:counts['unmatched']+=1;continue  # never recorded as ignored, or two candidates: left as they are
            recorded=rows[0][0]
            if db.execute('SELECT 1 FROM receipt_jobs WHERE message_id=? OR message_id=?',(recorded,message['id'])).fetchone() or any(
                    isinstance(x,dict) and x.get('conversation_id')==cid and str(x.get('sender_id'))==sender
                    and isinstance(x.get('sent_at'),(int,float)) and abs(x['sent_at']-ts)<=MATCH_SECONDS for x in sources):
                counts['skipped_existing']+=1;continue
            db.execute("UPDATE conversation_poll_messages SET outcome=? WHERE message_id=? AND outcome='IGNORED'",(outcome,recorded))
            if recorded!=message['id']:
                db.execute('INSERT OR IGNORE INTO conversation_poll_messages VALUES (?,?,?,?,?)',(message['id'],cid,ts,now,outcome))
            counts['promoted']+=1
            for index,item in enumerate(attachments.get('data',[])):
                url=item.get('image_data',{}).get('url')
                if not url:continue
                key=hashlib.sha256(f"{message['id']}:{index}".encode()).hexdigest()
                counts['jobs']+=db.execute('''INSERT OR IGNORE INTO receipt_jobs
                  (id,message_id,sender_id,url,status,created_at,result,source) VALUES (?,?,?,?,'PENDING',?,?,?)''',
                  (key,message['id'],sender,url,now,evidence,
                   source('poll',message['id'],index,sender,ts,now,cid,item.get('id')))).rowcount
    return counts


# R151: outcomes whose image attachments become receipt jobs (every other outcome records the message only).
JOB_OUTCOMES=('BORROWER','FORWARDED','CANDIDATES','SENDER','UNIDENTIFIED')


def scope(config,master,participants,enabled):
    """Per-conversation inputs of classify: allowed sender ids, the C4' group evidence and, from payer_name_cutoff,
    the group's enabled borrower ids (R151 UNIDENTIFIED narrowing)."""
    business=str(config['instagram_account_id'])
    allowed={str(p['id']) for p in participants if username(p.get('username')) in enabled}
    allowed.discard(business)
    payer_cutoff,group_ids=group_context(config,master,participants)
    members=None
    if payer_cutoff is not None:
        from .receipt_identity import group_borrowers
        members=sorted(b['id'] for b in group_borrowers(master,[p for p in participants if str(p.get('id',''))!=business]))
    return {'allowed':allowed,'enabled':enabled,'payer_cutoff':payer_cutoff,'group_ids':group_ids,'members':members}


def has_image(message):
    return any(isinstance(item,dict) and item.get('image_data',{}).get('url') for item in message.get('attachments',{}).get('data',[]))


def classify(config,master,participants,context,message,ts,read=(),position=0):
    """(outcome, job evidence JSON or None) for one group message; shared by capture_conversation and the R151
    reprocess. read: this read's messages in time order, each (sender, ts, text, reply_to, has_attachment), for the
    C4 nickname hint. Order: an enabled participant (BORROWER, C4' evidence); the forwarder (FORWARDED C3, CANDIDATES
    C4); R151 SENDER, a non-participant whose sender username is one enabled borrower; R151 UNIDENTIFIED, any other
    non-business sender's image from payer_name_cutoff; else IGNORED."""
    sender=str(message.get('from',{}).get('id',''))
    payer_cutoff=context['payer_cutoff']
    payer_time=payer_cutoff is not None and ts>=payer_cutoff
    if sender in context['allowed']:
        return 'BORROWER',group_evidence(payer_cutoff,context['group_ids'],ts)
    if config.get('receipt_forwarding_enabled') is True:
        from .receipt_identity import forwarded_borrower,forwarded_candidates
        from .receipt_rules import ReceiptInvalid
        forward_cutoff=cutoff_ts(config,'receipt_forwarding_cutoff')
        if ts>=forward_cutoff:
            try:
                matched=forwarded_borrower(config,master,participants,sender)
                return 'FORWARDED',json.dumps({'forwarded_borrower_id':matched['id']})
            except ReceiptInvalid:
                # C4: the forwarder in a group (4+ persons) with two or more enabled borrowers.
                if payer_time:
                    try:
                        found=forwarded_candidates(config,master,participants,sender)
                        evidence={'candidate_borrower_ids':sorted(b['id'] for b in found)}
                        # R095 hint: the forwarder's immediately next message of this same read, a text within 60 s.
                        from .receipt_identity import hint_texts,next_hint
                        texts=hint_texts(next_hint(list(read),position)) if read else []
                        if texts:return 'CANDIDATES',json.dumps({**evidence,'hint_texts':texts},ensure_ascii=False)
                        return 'CANDIDATES',json.dumps(evidence)
                    except ReceiptInvalid:pass
    if not sender or sender==str(config['instagram_account_id']):return 'IGNORED',None
    name=username((message.get('from') or {}).get('username'))
    if name and name in context['enabled']:
        from .receipt_rules import ReceiptInvalid,borrower_for
        try:
            borrower=borrower_for({'username':name},master['borrowers'])
            return 'SENDER',json.dumps({'sender_borrower_id':borrower['id'],'sender_username':name})
        except ReceiptInvalid:pass
    if payer_time and has_image(message):
        return 'UNIDENTIFIED',json.dumps({'unidentified_sender':True,'group_borrower_ids':context['members'] or []})
    return 'IGNORED',None


def named_sender(config,conversation,enabled):
    """R151 eligibility without an extra read: a first-page message whose sender username is an enabled borrower."""
    history=conversation.get('messages')
    data=history.get('data') if isinstance(history,dict) else None
    if not isinstance(data,list):return False
    business=str(config['instagram_account_id'])
    return any(isinstance(m,dict) and isinstance(m.get('from'),dict) and str(m['from'].get('id',''))!=business
               and username(m['from'].get('username')) in enabled for m in data)


def read_rows(ordered):
    return [(str(m.get('from',{}).get('id','')),t,m.get('message'),m.get('reply_to'),bool(m.get('attachments',{}).get('data')))
            for m,t in ordered]


def capture_conversation(config,api,master,db,conversation,enabled,cutoff,now,day,summary=None):
    peers=conversation.get('participants',{})
    if peers.get('paging',{}).get('next'):raise ConfigurationError('POLL_PARTICIPANTS_INCOMPLETE')
    participants=peers.get('data')
    if not isinstance(participants,list):raise ConfigurationError('POLL_PARTICIPANTS_MISSING')
    if day and len(participants)<=2:return 0,0,False
    allowed={str(p['id']) for p in participants if username(p.get('username')) in enabled}
    allowed.discard(str(config['instagram_account_id']))
    # R151: a group is also scanned when Instagram dropped its borrower from participants but a first-page message
    # names an enabled borrower as its sender.
    if not allowed and not named_sender(config,conversation,enabled):
        # R146: a group whose last subject was disabled is no longer scanned; a group with a state row still gets the
        # marker when its subjects changed, so its summary rows are pruned.
        if summary is not None and conversation.get('id') in summary['known']:
            from .group_chat_summary import subject_change
            with db:subject_change(config,master,db,summary,conversation,participants,now)
        return 0,0,False
    cid=conversation['id']
    # R095: the C4' group evidence (group_context; R119 shares it with recheck_ignored); R151 classify.
    context=scope(config,master,participants,enabled)
    prior=db.execute('SELECT checked_through FROM conversation_poll_state WHERE conversation_id=?',(cid,)).fetchone()
    since=cutoff if day else max(cutoff,(prior[0]-300) if prior else cutoff)
    found=history_since(api,config,conversation,since,now)
    added=images=0
    # Cursor and job reservations commit together. A failed read never advances this cursor.
    with db:
        resolution=newest_text=None
        if summary is not None:
            # R146: subjects, referrers and speaker roles of this group; a changed subject set marks a known group.
            from .group_chat_summary import mark_text,poll_substantive,subject_change
            # R152: the senders of the first page and of this scan's messages are members too (a borrower Instagram no
            # longer lists among the participants); the digest compared stays participants-only (group_chat_summary.resolve).
            first=conversation.get('messages')
            seen=(first.get('data') if isinstance(first,dict) and isinstance(first.get('data'),list) else [])+[m for m,_ in found]
            resolution=subject_change(config,master,db,summary,conversation,participants,now,seen)
        ordered=list(reversed(found))
        read=read_rows(ordered)
        for position,(message,ts) in enumerate(ordered):
            sender=str(message.get('from',{}).get('id',''))
            attachments=message.get('attachments',{})
            if attachments.get('paging',{}).get('next'):raise ConfigurationError('POLL_ATTACHMENTS_INCOMPLETE')
            items=attachments.get('data',[])
            outcome,evidence=classify(config,master,participants,context,message,ts,read,position)
            inserted=db.execute('INSERT OR IGNORE INTO conversation_poll_messages VALUES (?,?,?,?,?)',
               (message['id'],cid,ts,now,outcome)).rowcount
            if not inserted:continue
            added+=1
            # R146: a newly recorded substantive text (never a routine message) sets the summary marker below.
            if resolution is not None and poll_substantive(config,summary,resolution,message,ts):
                newest_text=ts if newest_text is None else max(newest_text,ts)
            if outcome not in JOB_OUTCOMES:continue
            for index,item in enumerate(items):
                url=item.get('image_data',{}).get('url')
                if not url:continue
                key=hashlib.sha256(f"{message['id']}:{index}".encode()).hexdigest()
                from .receipt_archive import source
                images+=db.execute('''INSERT OR IGNORE INTO receipt_jobs
                  (id,message_id,sender_id,url,status,created_at,result,source) VALUES (?,?,?,?,'PENDING',?,?,?)''',
                  (key,message['id'],sender,url,now,evidence,
                   source('poll',message['id'],index,sender,ts,now,cid,item.get('id')))).rowcount
        # R146: commits with the message rows above, so a marker is never ahead of or behind what the poll recorded.
        if newest_text is not None:mark_text(db,summary,conversation,resolution,newest_text,now)
        # Every cursor write is a journal PROCESS audit row and makes the run effectful (no lazy heartbeat), so an
        # idle group keeps its cursor: everything newer than it was captured by the run that wrote it, and the
        # re-read overlap is deduped by message id. Advance on a new message, a first sight, or a window that no
        # longer fits the first page (for example after a today backfill, which never moves the cursor).
        if not day and (added or prior is None or len(found)>=FIRST_PAGE_MESSAGES):
            db.execute('INSERT OR REPLACE INTO conversation_poll_state VALUES (?,?)',(cid,now))
    return added,images,True


def reprocess_ignored(config,api,master,db,conversation_id,suffix=None,now=None):
    """R151 owner-requested reprocess of one group's IGNORED slips since yesterday 00:00 Bangkok: the history is read
    again (fresh image URLs), each image message is classified as the poll does now, and one that now gets a job is
    promoted through the R119 core (exactly one IGNORED row, no job yet). suffix narrows it to the one IGNORED row whose
    recorded message id ends with it, matched by that id only (the time fallback is R119's). A conversation the poll
    would not scan (no enabled participant and no enabled named sender on the first page, for example a DM with a
    non-borrower) is refused. Idempotent: a promoted row is no longer IGNORED. Counts only."""
    now=time.time() if now is None else now
    since=recheck_since(now)
    result={'status':'ok','messages':0,'reclassified':0,'jobs':0,'skipped_existing':0,'unmatched':0,'still_ignored':0}
    conversation=None
    for batch in pages(api,config['instagram_account_id']+'/conversations',
                       {'platform':'instagram','fields':'id,participants,messages.limit('+str(FIRST_PAGE_MESSAGES)+'){'+MESSAGE_FIELDS+'}','limit':100}):
        matches=[c for c in batch if isinstance(c,dict) and c.get('id')==conversation_id]
        if len(matches)>1:raise ConfigurationError('POLL_CONVERSATION_AMBIGUOUS')
        if matches:conversation=matches[0];break
    if conversation is None:return {**result,'status':'conversation_not_found'}
    peers=conversation.get('participants',{})
    if peers.get('paging',{}).get('next'):raise ConfigurationError('POLL_PARTICIPANTS_INCOMPLETE')
    participants=peers.get('data')
    if not isinstance(participants,list):raise ConfigurationError('POLL_PARTICIPANTS_MISSING')
    # The poll's own eligibility gate (capture_conversation).
    enabled=enabled_usernames(master);context=scope(config,master,participants,enabled)
    if not context['allowed'] and not named_sender(config,conversation,enabled):return {**result,'status':'not_eligible'}
    target=None
    if suffix is not None:
        rows=[r for r in db.execute("SELECT message_id,event_time FROM conversation_poll_messages WHERE conversation_id=? AND outcome='IGNORED' AND event_time>=?",
                                    (conversation_id,since)).fetchall() if str(r[0]).endswith(suffix)]
        if len(rows)!=1:return {**result,'status':'message_not_found' if not rows else 'message_ambiguous'}
        target=rows[0][0]
    ordered=list(reversed(history_since(api,config,conversation,since,now)))
    read=read_rows(ordered)
    items=[]
    for position,(message,ts) in enumerate(ordered):
        if not has_image(message):continue
        if target is not None and message.get('id')!=target:continue
        result['messages']+=1
        outcome,evidence=classify(config,master,participants,context,message,ts,read,position)
        if outcome not in JOB_OUTCOMES:result['still_ignored']+=1;continue
        items.append((message,ts,outcome,evidence))
    if target is not None and not items and not result['still_ignored']:return {**result,'status':'message_not_in_history'}
    counts=promote(db,conversation_id,items,now,since,by_time=target is None) if items else {'jobs':0,'promoted':0,'skipped_existing':0,'unmatched':0}
    result.update(reclassified=counts['promoted'],jobs=counts['jobs'],skipped_existing=counts['skipped_existing'],unmatched=counts['unmatched'])
    return result


def reprocess(config_path,catalogue_path,conversation_id,suffix=None):
    """R151 CLI poll-reprocess: under conversation-poll.lock (taken without waiting), then wake the receipt cycle."""
    import fcntl
    if not isinstance(conversation_id,str) or not re.fullmatch(r'[A-Za-z0-9_:=+/-]{1,200}',conversation_id):
        raise ConfigurationError('REPROCESS_CONVERSATION_ID_INVALID')
    if suffix is not None and not re.fullmatch(r'[A-Za-z0-9_:=+/-]{4,200}',suffix):
        raise ConfigurationError('REPROCESS_MESSAGE_SUFFIX_INVALID')
    config=controls(config_path,catalogue_path)
    if config.get('conversation_poll_enabled') is not True or not load_json(catalogue_path)['services'].get('conversation_poll',{}).get('enabled'):
        raise ConfigurationError('CONVERSATION_POLL_DISABLED')
    root=Path(config['state_directory'])
    with (root/'conversation-poll.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return {'status':'already_running'}
        journal=ReceiptJournal(root/'receipt-processing.db', config=config)
        try:
            from .state import is_postgres
            if not is_postgres(journal.db):
                journal.db.executescript(POLL_TABLES_SQLITE)
            result=reprocess_ignored(config,Instagram(config,read_timeout=READ_TIMEOUT),masters(config),journal.db,conversation_id,suffix)
        finally:
            journal.close()
    if result.get('jobs'):
        from .receipt_wake import wake
        wake(config)
    return result


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
        worker=None
        try:
            master=masters(config)
            plan=recheck_plan(config,root,master,day)
            if plan.get('recheck'):
                # The held pass requeues worker jobs: it runs under receipt-worker.lock, taken without waiting. A busy
                # worker skips the whole recheck and keeps the snapshot, so the next run tries again.
                worker=(root/'receipt-worker.lock').open('a')
                try:fcntl.flock(worker,fcntl.LOCK_EX|fcntl.LOCK_NB)
                except BlockingIOError:
                    worker.close();worker=None;plan={'status':'worker_busy'}
            result=scan(config,Instagram(config,read_timeout=READ_TIMEOUT),master,journal,day=day,recheck=plan.get('recheck'))
            if plan.get('recheck'):
                from .receipt_recheck import recheck_held
                result.update(recheck_held(config,journal,plan['grew'],plan['accounts_changed'],plan['snapshot']['written_at']))
                if result.get('recheck_errors'):plan['status']='recheck_incomplete'
                else:write_snapshot(root,plan['current']);plan['status']='rechecked'
            if plan.get('status'):result['recheck']=plan['status']
        finally:
            if worker:worker.close()
            journal.close()
        if result.get('image_jobs') or result.get('recheck_jobs') or result.get('held_requeued'):
            from .receipt_wake import wake
            wake(config)
        return result


# R119: the borrower-master snapshot the recheck compares against, next to the poll lock (0600, written atomically).
SNAPSHOT='conversation-poll-master.json'


def master_fingerprint(master):
    """The enabled usernames (sorted) and a digest of the active cash accounts' numbers and alternative numbers."""
    accounts=sorted([str(a.get('id')),str(a.get('number') or ''),str(a.get('alternative') or '')]
                    for a in master['accounts'] if a.get('active') is True)
    return {'enabled':sorted(enabled_usernames(master)),
            'accounts_sha256':hashlib.sha256(json.dumps(accounts,separators=(',',':')).encode()).hexdigest()}


def read_snapshot(root):
    """The saved snapshot, or None when missing or unreadable."""
    try:value=json.loads((Path(root)/SNAPSHOT).read_text())
    except (OSError,ValueError):return None
    if not (isinstance(value,dict) and isinstance(value.get('enabled'),list) and all(isinstance(x,str) for x in value['enabled'])
            and isinstance(value.get('accounts_sha256'),str) and isinstance(value.get('written_at'),(int,float))):return None
    return value


def write_snapshot(root,current,now=None):
    path=Path(root)/SNAPSHOT;temporary=path.with_name(SNAPSHOT+'.tmp')
    value={**current,'written_at':time.time() if now is None else now}
    descriptor=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(descriptor,'w') as stream:
        json.dump(value,stream,sort_keys=True);stream.flush();os.fsync(stream.fileno())
    os.chmod(temporary,0o600);os.replace(temporary,path)
    return value


def recheck_plan(config,root,master,day):
    """What this run rechecks (R119, conversation_poll_recheck_enabled, never in a --date backfill). The first run or
    an unreadable snapshot only writes the snapshot. A grown enabled set rechecks ignored slips of the new usernames
    and PAYER_UNRESOLVED holds; a changed account fingerprint rechecks RECIPIENT_UNKNOWN_OR_AMBIGUOUS holds."""
    if config.get('conversation_poll_recheck_enabled') is not True or day:return {}
    snapshot=read_snapshot(root);current=master_fingerprint(master)
    if snapshot is None:
        write_snapshot(root,current);return {'status':'snapshot_written'}
    grew=set(current['enabled'])-set(snapshot['enabled'])
    changed=current['accounts_sha256']!=snapshot['accounts_sha256']
    if not grew and not changed:
        # A borrower disabled since: record it, so enabling them again is a change.
        if current['enabled']!=snapshot['enabled']:write_snapshot(root,current)
        return {'status':'unchanged'}
    return {'recheck':{'usernames':grew},'grew':bool(grew),'accounts_changed':changed,'snapshot':snapshot,'current':current}
