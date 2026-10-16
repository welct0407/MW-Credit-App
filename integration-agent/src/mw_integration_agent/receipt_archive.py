"""Capture originals before terminal receipt decisions; no payment creation authority."""
import hashlib
import io
import json
import os
import time
from datetime import datetime, UTC
from pathlib import Path

from PIL import Image

from .config import ConfigurationError, cutoff_ts
from .receipt_image import canonical_image, download_original
from .receipt_storage import GCS, BUCKET
from .state import is_postgres


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def source(kind, message, index, sender, sent, captured, conversation=None, attachment=None):
    return encoded(dict(kind=kind, message_id=message, attachment_index=index,
        sender_id=sender, sent_at=sent, captured_at=captured,
        conversation_id=conversation, attachment_id=attachment))


def required(config, job):
    return bool(config.get('receipt_archive_enabled') and job['created_at'] >= cutoff_ts(config, 'receipt_archive_cutoff'))


class Archive:
    def __init__(self, config, journal, storage=None):
        self.config, self.db = config, journal.db
        self.storage = storage or GCS(config)
        self.root = Path(config['state_directory']) / 'receipt-spool'
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not is_postgres(self.db):
            self.db.executescript('''CREATE TABLE IF NOT EXISTS receipt_assets (
              receipt_id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE,source TEXT NOT NULL,
              archive_state TEXT NOT NULL DEFAULT 'SOURCE_PENDING',attempts INTEGER NOT NULL DEFAULT 0,
              next_attempt_at REAL NOT NULL DEFAULT 0,last_error_code TEXT NOT NULL DEFAULT '',
              object_key TEXT,raw_sha256 TEXT,pixel_sha256 TEXT,mime_type TEXT,byte_size INTEGER,
              generation TEXT,crc32c TEXT,downloaded_at REAL,classification TEXT NOT NULL DEFAULT 'unknown',classified_at REAL);
              CREATE TABLE IF NOT EXISTS receipt_payment_links (
              link_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL UNIQUE,business_environment TEXT NOT NULL,
              payment_id TEXT NOT NULL,verification TEXT NOT NULL,verification_digest TEXT NOT NULL,
              projection_state TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,
              next_attempt_at REAL NOT NULL DEFAULT 0,last_error_code TEXT NOT NULL DEFAULT '',verified_at REAL NOT NULL,
              UNIQUE(business_environment,payment_id));''')

    def get(self, job_id):
        row = self.db.execute('SELECT * FROM receipt_assets WHERE job_id=?', (job_id,)).fetchone()
        return dict(row) if row else None

    def sync_directory(self):
        if os.name != 'nt':
            fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)

    def capture(self, job, fetch=download_original):
        environment = self.config['receipt_environment']
        receipt_id = hashlib.sha256(encoded(['receipt-v1', environment,
            self.config['instagram_account_id'], job['id']]).encode()).hexdigest()
        raw_source = job.get('source')
        if not raw_source:
            raise ConfigurationError('RECEIPT_SOURCE_MISSING')
        provenance = json.loads(raw_source)
        if (provenance['message_id'] != job['message_id'] or provenance['sender_id'] != job['sender_id']
            or hashlib.sha256(f"{job['message_id']}:{provenance['attachment_index']}".encode()).hexdigest() != job['id']):
            raise ConfigurationError('RECEIPT_SOURCE_CONFLICT')
        frozen_source = encoded(dict(provenance, environment=environment,
            instagram_account_id=self.config['instagram_account_id'], bucket=BUCKET))
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO receipt_assets(receipt_id,job_id,source) VALUES (?,?,?)',
                            (receipt_id, job['id'], frozen_source))
        asset = self.get(job['id'])
        if asset['source'] != frozen_source or asset['receipt_id'] != receipt_id:
            raise ConfigurationError('RECEIPT_SOURCE_CONFLICT')
        if asset['archive_state'] in ('INTEGRITY_CONFLICT','SOURCE_UNAVAILABLE'):
            raise ConfigurationError('RECEIPT_ARCHIVE_REQUIRES_OPERATOR')
        path = self.root / (receipt_id + '.raw')
        try:
            if asset['archive_state'] == 'ARCHIVED':
                raw = path.read_bytes() if path.exists() else self.storage.read(asset['object_key'], asset['generation'])
                if hashlib.sha256(raw).hexdigest() != asset['raw_sha256']:
                    raise ConfigurationError('RECEIPT_INTEGRITY_CONFLICT')
                return canonical_image(raw)
            if asset['next_attempt_at'] > time.time():
                raise ConfigurationError('RECEIPT_ARCHIVE_NOT_DUE')
            with self.db:
                self.db.execute('UPDATE receipt_assets SET attempts=attempts+1 WHERE receipt_id=?',(receipt_id,))
            if not path.exists():
                if asset['raw_sha256']:
                    # Never silently replace captured bytes after spool loss.
                    raise ConfigurationError('RECEIPT_SPOOL_MISSING')
                raw = fetch(job['url'])
                canonical_image(raw)
                size = sum(p.stat().st_size for p in self.root.iterdir() if p.is_file())
                if size + len(raw) > self.config.get('receipt_spool_limit_bytes', 536870912):
                    raise ConfigurationError('RECEIPT_SPOOL_FULL')
                temporary = path.with_suffix('.tmp')
                with temporary.open('wb') as stream:
                    os.chmod(temporary, 0o600)
                    stream.write(raw); stream.flush(); os.fsync(stream.fileno())
                os.replace(temporary, path)
                self.sync_directory()
            raw = path.read_bytes()
            normalized, pixel_hash = canonical_image(raw)
            digest = hashlib.sha256(raw).hexdigest()
            if asset['raw_sha256'] and asset['raw_sha256'] != digest:
                raise ConfigurationError('RECEIPT_INTEGRITY_CONFLICT')
            with Image.open(io.BytesIO(raw)) as image:
                suffix, mime = {'JPEG': ('jpg','image/jpeg'), 'PNG': ('png','image/png'), 'WEBP': ('webp','image/webp')}[image.format]
            day = datetime.fromtimestamp(provenance['captured_at'], UTC).strftime('%Y/%m/%d')
            key = f'receipts/{environment}/{day}/{receipt_id}/{digest}.{suffix}'
            if not asset['raw_sha256']:
                with self.db:
                    self.db.execute('''UPDATE receipt_assets SET archive_state='LOCAL_READY',object_key=?,raw_sha256=?,
                        pixel_sha256=?,mime_type=?,byte_size=?,downloaded_at=? WHERE receipt_id=?''',
                        (key,digest,pixel_hash,mime,len(raw),time.time(),receipt_id))
            with self.db:
                self.db.execute("UPDATE receipt_assets SET archive_state='UPLOADING' WHERE receipt_id=?", (receipt_id,))
            from . import audit
            with audit.activity(self.config,'receipt_evidence',action='INSERT',route='internal',effect=True,
                                plan={'receipt_id':receipt_id,'key':key,'sha256':digest}):
                generation, crc = self.storage.put(key, raw, mime)
            with self.db:
                self.db.execute("UPDATE receipt_assets SET archive_state='ARCHIVED',generation=?,crc32c=?,last_error_code='' WHERE receipt_id=?",
                                (generation,crc,receipt_id))
            path.unlink()
            self.sync_directory()
            return normalized, pixel_hash
        except Exception as exc:
            code = str(exc) if isinstance(exc, ConfigurationError) else 'RECEIPT_ARCHIVE_UNAVAILABLE'
            with self.db:
                if code == 'RECEIPT_INTEGRITY_CONFLICT' and self.get(job['id'])['archive_state'] != 'ARCHIVED':
                    self.db.execute("UPDATE receipt_assets SET archive_state='INTEGRITY_CONFLICT' WHERE receipt_id=?", (receipt_id,))
                elif not path.exists() and asset['attempts']>=11:
                    self.db.execute("UPDATE receipt_assets SET archive_state='SOURCE_UNAVAILABLE' WHERE receipt_id=?",(receipt_id,))
                self.db.execute('UPDATE receipt_assets SET next_attempt_at=?,last_error_code=? WHERE receipt_id=?',
                                (time.time()+min(21600,300*2**min(asset['attempts'],7)),code,receipt_id))
            raise ConfigurationError(code) from None

    def classify(self, job_id, value):
        with self.db:
            self.db.execute('UPDATE receipt_assets SET classification=?,classified_at=? WHERE job_id=?',
                ('receipt' if value.get('is_payment_receipt') else 'nonreceipt',time.time(),job_id))
