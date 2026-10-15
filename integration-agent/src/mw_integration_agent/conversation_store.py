"""Private durable conversation bindings and once-only inbound turn reservations."""
import hashlib
import json
import sqlite3
from .state import connect as state_connect, enabled as state_enabled, is_postgres
import time

from .config import ConfigurationError


def binding_key(account, partner, sender):
    return hashlib.sha256(json.dumps([account, partner, sender], separators=(',', ':')).encode()).hexdigest()


class ConversationStore:
    def __init__(self, path, config=None):
        self.db = state_connect(path, config)
        if is_postgres(self.db):
            return
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS conversations (
            binding TEXT PRIMARY KEY, thread_id TEXT NOT NULL UNIQUE);
          CREATE TABLE IF NOT EXISTS turns (
            message_id TEXT PRIMARY KEY, binding TEXT NOT NULL, partner TEXT NOT NULL,
            sender_id TEXT NOT NULL, status TEXT NOT NULL, result TEXT, detail TEXT,
            created_at REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS tool_calls (
            message_id TEXT NOT NULL, call_id TEXT NOT NULL, name TEXT NOT NULL,
            arguments TEXT NOT NULL, result TEXT, PRIMARY KEY(message_id,call_id));
        ''')

    def thread(self, binding):
        row = self.db.execute('SELECT thread_id FROM conversations WHERE binding=?', (binding,)).fetchone()
        return row[0] if row else None

    def bind(self, binding, thread_id):
        with self.db:
            old = self.thread(binding)
            if old and old != thread_id:
                raise ConfigurationError('CONVERSATION_BINDING_CHANGED')
            self.db.execute('INSERT OR IGNORE INTO conversations VALUES (?,?)', (binding, thread_id))

    def reserve(self, event, binding, partner):
        with self.db:
            return bool(self.db.execute('INSERT OR IGNORE INTO turns VALUES (?,?,?,?,?,?,?,?)',
                (event['message_id'], binding, json.dumps(partner, sort_keys=True), event['sender_id'],
                 'RUNNING', None, None, time.time())).rowcount)

    def finish(self, message_id, status, result=None, detail=None):
        with self.db:
            self.db.execute('UPDATE turns SET status=?,result=?,detail=? WHERE message_id=?',
                (status, json.dumps(result, ensure_ascii=False) if result is not None else None, detail, message_id))

    def recover(self):
        # The worker holds its process lock. A previous RUNNING turn is abandoned,
        # never a request to call turn/start again or repeat an operation.
        with self.db:
            for row in self.db.execute("SELECT message_id,partner FROM turns WHERE status='RUNNING'").fetchall():
                thai = json.loads(row['partner']).get('language') == 'ไทย'
                message = ('คำขอก่อนหน้าถูกขัดจังหวะ กรุณาตรวจสอบในแอปก่อนส่งคำขอใหม่ ระบบจะไม่ทำรายการซ้ำอัตโนมัติ'
                           if thai else 'The previous request was interrupted. Check the app before requesting it again; it will not be replayed automatically.')
                self.db.execute("UPDATE turns SET status='INTERRUPTED',detail='NO_AUTOMATIC_REPLAY',result=? WHERE message_id=?",
                                (json.dumps({'status': 'INTERRUPTED', 'message': message}), row['message_id']))

    def close(self):
        self.db.close()
