"""Central migration history on the disposable lab (AGT-TEST-03): idempotent, checksum-pinned, in order."""
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import psycopg
from mw_integration_agent import state_migration
from mw_integration_agent.config import ConfigurationError

MIGRATIONS = Path(__file__).resolve().parents[1] / 'database/migrations'


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated PostgreSQL 18 lab required')
class CentralMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if cls.lab['host'] != '127.0.0.1' or cls.lab['port'] == 5432 or 'agent-state-lab-' not in cls.lab['root']:
            raise RuntimeError('Refusing a non-laboratory target')
        cls.admin = dict(host=cls.lab['host'], port=cls.lab['port'], dbname='mw_agent', user='postgres', autocommit=True)

    def history(self, conn):
        return conn.execute('SELECT version,name,sha256 FROM deployment.schema_history ORDER BY version').fetchall()

    def test_second_run_applies_nothing_and_keeps_history(self):
        with psycopg.connect(**self.admin) as conn:
            before = self.history(conn)
            result = state_migration.migrate(conn, MIGRATIONS)
            self.assertEqual(result['applied'], [])
            self.assertEqual(result['versions'], len(list(MIGRATIONS.glob('V*__*.sql'))))
            self.assertEqual(self.history(conn), before)
            self.assertEqual(len(before), result['versions'])

    def test_changed_applied_file_is_refused_without_touching_history(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'migrations'
            shutil.copytree(MIGRATIONS, copy)
            first = sorted(copy.glob('V1__*.sql'))[0]
            first.write_text(first.read_text(encoding='utf-8') + ' ', encoding='utf-8')
            with psycopg.connect(**self.admin) as conn:
                before = self.history(conn)
                with self.assertRaisesRegex(ConfigurationError, 'CENTRAL_MIGRATION_CHECKSUM_MISMATCH'):
                    state_migration.migrate(conn, copy)
                self.assertEqual(self.history(conn), before)


if __name__ == '__main__':
    unittest.main()
