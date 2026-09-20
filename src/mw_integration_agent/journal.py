from __future__ import annotations

import sqlite3
import json
import time
from pathlib import Path
from typing import Any


class IngressJournal:
    def __init__(self, path: str | Path):
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(target)
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

    def capture(self, payload_sha256: str, messages: list[dict[str, Any]]) -> tuple[bool, int]:
        with self.db:
            cursor = self.db.execute(
                "INSERT OR IGNORE INTO receipts VALUES (?, ?, ?)",
                (payload_sha256, time.time(), len(messages)),
            )
            inserted = 0
            for message in messages:
                inserted += self.db.execute(
                    "INSERT OR IGNORE INTO messages (message_id,sender_id,event_timestamp,text,captured_at,status,attachments) "
                    "VALUES (?, ?, ?, ?, ?, 'CAPTURED_NO_PROCESSING', ?)",
                    (message["message_id"], message["sender_id"], message["timestamp"], message["text"], time.time(),
                     json.dumps(message.get('attachments', []))),
                ).rowcount
        return bool(cursor.rowcount), inserted

    def latest(self, limit: int = 10) -> list[dict[str, Any]]:
        rows = self.db.execute(
            "SELECT message_id, sender_id, event_timestamp, text, captured_at, status "
            "FROM messages ORDER BY event_timestamp DESC, message_id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        self.db.close()
