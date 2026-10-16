"""Immutable statement snapshots (AGT-TEST-03): disabled backend, idempotent freeze, content pin, verified load."""
import hashlib
import json
import os
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import psycopg
from mw_integration_agent import state, statement_snapshot
from mw_integration_agent.config import ConfigurationError

TEXT = json.dumps({'start': '2026-10-01T00:00:00+07:00', 'end': '2026-10-02T00:00:00+07:00',
                   'basis': 'ledger-posting-time', 'accounts': []})


class DisabledBackendTests(unittest.TestCase):
    def test_load_and_save_are_inert_without_postgres_state(self):
        with patch('mw_integration_agent.statement_snapshot.transaction', side_effect=AssertionError('no connection')):
            self.assertIsNone(statement_snapshot.load({'state_backend': 'sqlite'}, 'calendar-day/2026-10-01'))
            self.assertIsNone(statement_snapshot.save({}, 'calendar-day/2026-10-01', TEXT, 'snapshot.json'))


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated PostgreSQL 18 lab required')
class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if cls.lab['host'] != '127.0.0.1' or cls.lab['port'] == 5432 or 'agent-state-lab-' not in cls.lab['root']:
            raise RuntimeError('Refusing a non-laboratory target')
        cls.admin = dict(host=cls.lab['host'], port=cls.lab['port'], dbname='mw_agent', user='postgres')
        cls.generation = str(uuid.uuid4())
        cls.config = {'state_backend': 'postgres', 'state_generation': cls.generation, 'audit_environment': 'test',
                      'code_version': 'synthetic-tests', 'agent_database_host': '127.0.0.1',
                      'agent_database_port': 5432, 'agent_database_name': 'mw_agent'}
        with psycopg.connect(**cls.admin) as c:
            c.execute('''INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled)
                VALUES ('agent','postgres',%s,true) ON CONFLICT(service_name) DO UPDATE SET active_generation=EXCLUDED.active_generation,processing_enabled=true''', (cls.generation,))
        cls.patch = patch.object(state, 'parameters', side_effect=lambda config, role='worker': dict(cls.admin, user='mw_agent_' + role, autocommit=True))
        cls.patch.start()

    @classmethod
    def tearDownClass(cls):
        cls.patch.stop()

    def test_save_is_idempotent_pins_content_and_load_verifies_the_digest(self):
        key = 'calendar-day/test-' + uuid.uuid4().hex
        statement_snapshot.save(self.config, key, TEXT, 'snapshot.json')
        statement_snapshot.save(self.config, key, TEXT, 'snapshot.json')
        with self.assertRaisesRegex(ConfigurationError, 'STATEMENT_SNAPSHOT_CONTENT_CHANGED'):
            statement_snapshot.save(self.config, key, TEXT.replace('[]', '[ ]'), 'snapshot.json')
        self.assertEqual(statement_snapshot.load(self.config, key), TEXT)
        self.assertIsNone(statement_snapshot.load(self.config, key + '-absent'))
        with psycopg.connect(**self.admin) as c:
            row = c.execute('SELECT payload_sha256,count(*) OVER () FROM runtime.statement_snapshots WHERE snapshot_key=%s', (key,)).fetchone()
            self.assertEqual(row, (hashlib.sha256(TEXT.encode()).hexdigest(), 1))
            with self.assertRaises(psycopg.Error):
                c.execute('UPDATE runtime.statement_snapshots SET payload_text=%s WHERE snapshot_key=%s', ('{}', key))


if __name__ == '__main__':
    unittest.main()
