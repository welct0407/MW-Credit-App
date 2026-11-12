"""Operator migration tools without a server (AGT-TEST-03): journal backups and the central target guard."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from types import SimpleNamespace

from mw_integration_agent import state_migration
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.state import TABLES


def journals(root):
    for name in TABLES:
        with closing(sqlite3.connect(root / name)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS marker(name TEXT)')
            db.execute('INSERT INTO marker VALUES (?)', (name,))


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.source = Path(self.tmp.name) / 'state'; self.source.mkdir()
        self.target = Path(self.tmp.name) / 'backup'

    def test_manifest_hashes_match_the_copies_and_snapshots(self):
        journals(self.source)
        snapshot = self.source / 'cash-statements' / 'calendar-day' / '2026-10-01' / 'snapshot.json'
        snapshot.parent.mkdir(parents=True); snapshot.write_text('{"synthetic":true}')
        manifest = state_migration.backup_journals(self.source, self.target)
        self.assertEqual(set(manifest['files']), set(TABLES))
        for name, digest in manifest['files'].items():
            self.assertEqual(hashlib.sha256((self.target / name).read_bytes()).hexdigest(), digest)
            with closing(sqlite3.connect(self.target / name)) as copy:
                self.assertEqual(copy.execute('SELECT name FROM marker').fetchone()[0], name)
        self.assertEqual(manifest['snapshots'], {'cash-statements/calendar-day/2026-10-01/snapshot.json':
                                                 hashlib.sha256(b'{"synthetic":true}').hexdigest()})
        self.assertEqual(json.loads((self.target / 'backup-manifest.json').read_text())['files'], manifest['files'])

    def test_unexpected_or_missing_journals_fail_closed(self):
        journals(self.source)
        with closing(sqlite3.connect(self.source / 'surprise.db')) as db, db:
            db.execute('CREATE TABLE x(y)')
        with self.assertRaisesRegex(ConfigurationError, 'UNMAPPED_APPLICATION_JOURNAL'):
            state_migration.backup_journals(self.source, self.target)
        (self.source / 'surprise.db').unlink(); (self.source / 'partner-notices.db').unlink()
        with self.assertRaisesRegex(ConfigurationError, 'EXPECTED_JOURNAL_MISSING:partner-notices.db'):
            state_migration.backup_journals(self.source, self.target / 'second')


class MigrateGuardTests(unittest.TestCase):
    def test_import_ignores_the_group_chat_summary_state_table_of_a_source_journal(self):
        # R146: the summary marker table is created lazily in a SQLite journal and is not a legacy import table. A source
        # journal that has it is not refused as unmapped (and the table is not imported); any other stray table still is.
        from unittest.mock import Mock
        from mw_integration_agent.state import GROUP_CHAT_SUMMARY_STATE_SQLITE
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        self.source = Path(tmp.name) / 'state'; self.source.mkdir()
        self.target = Path(tmp.name) / 'backup'
        for name in TABLES:
            with closing(sqlite3.connect(self.source / name)) as db, db:
                if name == 'instagram-ingress.db':
                    db.execute('CREATE TABLE receipts(payload_sha256 TEXT PRIMARY KEY)')
                    db.execute('CREATE TABLE messages(message_id TEXT PRIMARY KEY)')
                elif name == 'receipt-processing.db':
                    db.executescript(GROUP_CHAT_SUMMARY_STATE_SQLITE)
                    db.execute("INSERT INTO group_chat_summary_state(conversation_id) VALUES ('synthetic-group')")
                else:
                    db.execute('CREATE TABLE marker(name TEXT)')
        state_migration.backup_journals(self.source, self.target)
        executed = []
        conn = SimpleNamespace(execute=lambda query, params=(): executed.append(str(query)) or Mock(fetchone=Mock(return_value=None), fetchall=Mock(return_value=[])))
        # Past the unmapped-table check: the first mapped table is what is missing, not the summary table.
        with self.assertRaisesRegex(ConfigurationError, '^EXPECTED_SOURCE_TABLE_MISSING:receipt_cursor$'):
            state_migration.import_journals(conn, self.target, {}, 'batch-1', 'synthetic')
        self.assertFalse(any('group_chat_summary_state' in query for query in executed))
        with closing(sqlite3.connect(self.target / 'receipt-processing.db')) as db, db:
            db.execute('CREATE TABLE stray(name TEXT)')
        manifest = json.loads((self.target / 'backup-manifest.json').read_text())
        manifest['files']['receipt-processing.db'] = hashlib.sha256((self.target / 'receipt-processing.db').read_bytes()).hexdigest()
        (self.target / 'backup-manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ConfigurationError, '^UNMAPPED_SOURCE_TABLE:receipt-processing.db$'):
            state_migration.import_journals(conn, self.target, {}, 'batch-2', 'synthetic')

    def test_only_the_central_database_can_be_migrated(self):
        conn = SimpleNamespace(info=SimpleNamespace(dbname='loan_manager_prod'),
                               transaction=lambda: (_ for _ in ()).throw(AssertionError('no transaction on a wrong target')))
        with self.assertRaisesRegex(ConfigurationError, 'WRONG_CENTRAL_MIGRATION_TARGET'):
            state_migration.migrate(conn, Path(__file__).resolve().parents[1] / 'database/migrations')


if __name__ == '__main__':
    unittest.main()
