from __future__ import annotations

import sqlite3
from .state import connect as state_connect, enabled as state_enabled, is_postgres
import json
import time
from pathlib import Path
from typing import Any


class IngressJournal:
    def __init__(self, path: str | Path, config=None):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        self.db = state_connect(target, config)
        if is_postgres(self.db):
            return
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS receipts (
                payload_sha256 TEXT PRIMARY KEY,
                received_at REAL NOT NULL,
                event_count INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                sender_id TEXT NOT NULL,
                event_timestamp REAL NOT NULL,
                text TEXT NOT NULL,
                captured_at REAL NOT NULL,
                status TEXT NOT NULL CHECK(status = 'CAPTURED_NO_PROCESSING')
            );
        """)
        if 'attachments' not in {r[1] for r in self.db.execute('PRAGMA table_info(messages)')}:
            self.db.execute("ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
            self.db.commit()
        if 'reply_to' not in {r[1] for r in self.db.execute('PRAGMA table_info(messages)')}:
            self.db.execute("ALTER TABLE messages ADD COLUMN reply_to TEXT NOT NULL DEFAULT ''")
            self.db.commit()

    def capture(self, payload_sha256: str, messages: list[dict[str, Any]]) -> tuple[bool, int]:
        if is_postgres(self.db):
            return self._capture_postgres(payload_sha256, messages)
        with self.db:
            cursor = self.db.execute(
                "INSERT OR IGNORE INTO receipts VALUES (?, ?, ?)",
                (payload_sha256, time.time(), len(messages)),
            )
            inserted = 0
            for message in messages:
                inserted += self.db.execute(
                    "INSERT OR IGNORE INTO messages (message_id,sender_id,event_timestamp,text,captured_at,status,attachments,reply_to) "
                    "VALUES (?, ?, ?, ?, ?, 'CAPTURED_NO_PROCESSING', ?, ?)",
                    (message["message_id"], message["sender_id"], message["timestamp"], message["text"], time.time(),
                     json.dumps(message.get('attachments', [])),message.get('reply_to','')),
                ).rowcount
        return bool(cursor.rowcount), inserted

    def _capture_postgres(self, payload_sha256, messages):
        from datetime import datetime, timezone
        from .audit import begin, event
        from .config import ConfigurationError
        config = self.db.config
        cutoff = datetime.fromisoformat(config['state_cutover_at']).timestamp()
        with self.db:
            conn = self.db.conn
            receipt = conn.execute('INSERT INTO runtime.ingress_receipts VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',
                                   (payload_sha256,time.time(),len(messages))).rowcount
            inserted = 0
            for message in messages:
                values = (message['message_id'], message['sender_id'], message['timestamp'], message['text'],
                          json.dumps(message.get('attachments',[])), message.get('reply_to',''))
                n = conn.execute('''INSERT INTO runtime.ingress_messages
                    (message_id,sender_id,event_timestamp,text,attachments,reply_to,captured_at,status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,'CAPTURED_NO_PROCESSING') ON CONFLICT DO NOTHING''', (*values,time.time())).rowcount
                if not n:
                    old = conn.execute('''SELECT message_id,sender_id,event_timestamp,text,attachments,reply_to
                        FROM runtime.ingress_messages WHERE message_id=%s''',(values[0],)).fetchone()
                    # Attachment URLs can legitimately be refreshed by Meta. Identity,
                    # text, timestamp and reply correlation may never change on retry.
                    if not old or tuple(old[:4])+tuple(old[5:]) != values[:4]+values[5:]:
                        raise ConfigurationError('INGRESS_DUPLICATE_CONTENT_MISMATCH')
                else:
                    conn.execute('INSERT INTO runtime.ingress_work(message_id,state,eligible_at) VALUES (%s,%s,%s)',
                        (values[0], 'REVIEW' if values[2] < cutoff else 'PENDING',datetime.now(timezone.utc)))
                inserted += n
            op = begin(conn,config,'ingress',payload_sha256,plan={'payload_sha256':payload_sha256,'message_count':len(messages)})
            event(conn,op,'ingress_accepted' if receipt else 'ingress_duplicate',{'inserted':inserted},state='COMPLETED')
        return bool(receipt), inserted

    def latest(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT message_id, sender_id, event_timestamp, text, captured_at, status "
            "FROM messages ORDER BY event_timestamp DESC, message_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        self.db.close()
