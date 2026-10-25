"""Private receipt journal; transactional deduplication and fail-closed mail outbox."""
import hashlib
import json
import sqlite3
from .state import connect as state_connect, is_postgres
import time


def batch_hints(batch,sender,stamp,message_id):
    """R095 hint for the image message_id: the same sender's immediately next message in this ingest batch, when it is
    a plain text (no reply_to, no attachment) at most 60 s after the image (receipt_identity.next_hint), as a job
    result; None otherwise. Only the forwarder-DM context reads it; a later batch never adds a hint."""
    from .receipt_identity import hint_texts,next_hint
    rows=sorted(enumerate(batch),key=lambda item:(item[1][3],item[0]))
    read=[(who,ts,text,reply,bool(json.loads(raw or '[]'))) for _,(mid,who,raw,ts,text,reply) in rows]
    index=next(i for i,(_,row) in enumerate(rows) if row[0]==message_id)
    texts=hint_texts(next_hint(read,index))
    return json.dumps({'hint_texts':texts},ensure_ascii=False) if texts else None


class ReceiptJournal:
    def __init__(self,path,config=None):
        self.db=state_connect(path,config)
        if is_postgres(self.db):
            return
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS receipt_cursor (id INTEGER PRIMARY KEY CHECK(id=1),value INTEGER NOT NULL);
        INSERT OR IGNORE INTO receipt_cursor VALUES (1,0);
        CREATE TABLE IF NOT EXISTS receipt_jobs (
          id TEXT PRIMARY KEY, message_id TEXT NOT NULL, sender_id TEXT NOT NULL,
          url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0, retry_after REAL NOT NULL DEFAULT 0,
          detail TEXT NOT NULL DEFAULT '', result TEXT, image BLOB, image_hash TEXT,
          created_at REAL NOT NULL, source TEXT);
        CREATE INDEX IF NOT EXISTS receipt_jobs_due ON receipt_jobs(status,retry_after);
        CREATE TABLE IF NOT EXISTS receipt_keys (key TEXT PRIMARY KEY,job_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS receipt_emails (
          id TEXT PRIMARY KEY,job_id TEXT NOT NULL,payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,
          retry_after REAL NOT NULL DEFAULT 0,detail TEXT NOT NULL DEFAULT '');
        ''')
        if 'source' not in {r[1] for r in self.db.execute('PRAGMA table_info(receipt_jobs)')}:
            self.db.execute('ALTER TABLE receipt_jobs ADD COLUMN source TEXT')

    def ingest(self,ingress,cutoff):
        if is_postgres(self.db):
            return self._ingest_postgres(cutoff)
        cursor=self.db.execute('SELECT value FROM receipt_cursor WHERE id=1').fetchone()[0]
        from .receipt_archive import source
        rows=ingress.execute('''SELECT rowid,message_id,sender_id,attachments,event_timestamp,captured_at,text,reply_to FROM messages
            WHERE rowid>? AND event_timestamp>=? AND captured_at>=? ORDER BY rowid LIMIT 500''',(cursor,cutoff,cutoff)).fetchall()
        batch=[(r['message_id'],r['sender_id'],r['attachments'],r['event_timestamp'],r['text'],r['reply_to']) for r in rows]
        with self.db:
            for row in rows:
                attachments=json.loads(row['attachments'])
                hints=batch_hints(batch,row['sender_id'],row['event_timestamp'],row['message_id']) if attachments else None
                # One terminal marker for non-images avoids repeated work and preserves audit counts.
                for index,attachment in enumerate(attachments or [{'url':''}]):
                    key=hashlib.sha256(f"{row['message_id']}:{index}".encode()).hexdigest()
                    self.db.execute('''INSERT OR IGNORE INTO receipt_jobs
                        (id,message_id,sender_id,url,status,created_at,source,result) VALUES (?,?,?,?,?,?,?,?)''',
                        (key,row['message_id'],row['sender_id'],attachment['url'],
                         'PENDING' if attachment['url'] else 'IGNORED',time.time(),
                         source('webhook',row['message_id'],index,row['sender_id'],row['event_timestamp'],row['captured_at']),hints))
                self.db.execute('UPDATE receipt_cursor SET value=? WHERE id=1',(row['rowid'],))

    def _ingest_postgres(self, cutoff):
        from .receipt_archive import source
        with self.db:
            conn = self.db.conn
            rows = conn.execute('''SELECT m.message_id,m.sender_id,m.attachments,m.event_timestamp,m.captured_at,m.text,m.reply_to
                FROM runtime.ingress_work w JOIN runtime.ingress_messages m USING(message_id)
                WHERE w.state='PENDING' AND w.eligible_at<=clock_timestamp()
                ORDER BY w.eligible_at,w.message_id LIMIT 500 FOR UPDATE OF w SKIP LOCKED''').fetchall()
            batch=[(r[0],r[1],r[2],r[3],r[5],r[6]) for r in rows]
            for message_id,sender,raw,stamp,captured,_text,_reply in rows:
                state = 'IGNORED'
                if stamp >= cutoff and captured >= cutoff:
                    attachments=json.loads(raw)
                    hints=batch_hints(batch,sender,stamp,message_id) if attachments else None
                    for index,attachment in enumerate(attachments or [{'url':''}]):
                        key = hashlib.sha256(f'{message_id}:{index}'.encode()).hexdigest()
                        self.db.execute('''INSERT OR IGNORE INTO receipt_jobs
                            (id,message_id,sender_id,url,status,created_at,source,result) VALUES (?,?,?,?,?,?,?,?)''',
                            (key,message_id,sender,attachment['url'],'PENDING' if attachment['url'] else 'IGNORED',time.time(),
                             source('webhook',message_id,index,sender,stamp,captured),hints))
                    state = 'DONE'
                conn.execute('UPDATE runtime.ingress_work SET state=%s,updated_at=clock_timestamp() WHERE message_id=%s',(state,message_id))

    def pending(self,exclude=()):
        skip=' AND id NOT IN ('+','.join('?'*len(exclude))+')' if exclude else ''
        return [dict(r) for r in self.db.execute('''SELECT * FROM receipt_jobs
            WHERE status='PENDING' AND retry_after<=?'''+skip+' ORDER BY created_at LIMIT 10',(time.time(),*exclude))]

    def mark(self,key,status,detail):
        with self.db:
            self.db.execute('UPDATE receipt_jobs SET status=?,detail=?,image=NULL,url=\'\' WHERE id=?',
                            (status,detail,key))

    def retry(self,key,attempt,detail,terminal=True,delay=300):
        with self.db:
            self.db.execute('UPDATE receipt_jobs SET attempts=?,retry_after=?,detail=? WHERE id=?',
                            (attempt,time.time()+delay,detail,key))
        if terminal and attempt>=3:
            self.mark(key,'REVIEW',detail)

    def image(self,key,data,digest):
        with self.db:
            self.db.execute('UPDATE receipt_jobs SET image=?,image_hash=? WHERE id=?',(data,digest,key))

    def duplicate(self,digest):
        return self.db.execute('SELECT 1 FROM receipt_keys WHERE key=?',('image:'+digest,)).fetchone() is not None

    def accept(self,job,result,recipients):
        keys=['image:'+job['image_hash'],'reference:'+result['receipt']['reference']]
        try:
            with self.db:
                for key in keys:
                    self.db.execute('INSERT INTO receipt_keys VALUES (?,?)',(key,job['id']))
                # retry_after=0 ends the processing claim's 300 s hold; execution reads it as a submit wait.
                self.db.execute("UPDATE receipt_jobs SET status='VALIDATED',result=?,image=NULL,url='',retry_after=0 WHERE id=?",
                                (json.dumps(result,ensure_ascii=False),job['id']))
                for recipient in recipients:
                    key=hashlib.sha256((job['id']+':'+recipient['email']).encode()).hexdigest()
                    self.db.execute('INSERT INTO receipt_emails (id,job_id,payload) VALUES (?,?,?)',
                                    (key,job['id'],json.dumps(recipient,ensure_ascii=False)))
            return True
        except sqlite3.IntegrityError:
            self.mark(job['id'],'DUPLICATE','RECEIPT_ALREADY_PROCESSED')
            return False

    def emails(self):
        return [dict(r) for r in self.db.execute('''SELECT e.*,j.result,j.sender_id
            FROM receipt_emails e JOIN receipt_jobs j ON j.id=e.job_id
            WHERE e.status IN ('PENDING','REJECTED') AND e.attempts<3 AND e.retry_after<=?
            ORDER BY j.created_at LIMIT 20''',(time.time(),))]

    def begin_email(self,key):
        # Committed before the provider call. Crash or timeout means UNKNOWN, never automatic replay.
        with self.db:
            return bool(self.db.execute('''UPDATE receipt_emails SET status='UNKNOWN',attempts=attempts+1
                WHERE id=? AND status IN ('PENDING','REJECTED') AND attempts<3''',(key,)).rowcount)

    def finish_email(self,key,status,detail=''):
        with self.db:
            self.db.execute('UPDATE receipt_emails SET status=?,detail=?,retry_after=? WHERE id=?',
                            (status,detail,time.time()+300,key))

    def counts(self):
        return {table:[dict(r) for r in self.db.execute(f'SELECT status,count(*) count FROM {table} GROUP BY status')]
                for table in ('receipt_jobs','receipt_emails')}

    def close(self):
        self.db.close()
