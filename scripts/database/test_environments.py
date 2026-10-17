"""DB-ACCESS-07 / DB-ACCESS-03 guards for database/environments.json, toolchain.json and Common.ps1."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest

REPO = Path(__file__).resolve().parents[2]
COMMON = REPO / 'scripts/database/Common.ps1'


def pwsh(script, env=None):
    return subprocess.run(['pwsh', '-NoProfile', '-Command', script], capture_output=True, text=True, env=env)


class EnvironmentTests(unittest.TestCase):
    def test_both_targets_use_the_local_proxy_route_with_the_identity_pin(self):
        targets = json.loads((REPO / 'database/environments.json').read_text())
        for name, database in (('development', 'loan_manager_dev'), ('production', 'loan_manager_prod')):
            target = targets[name]
            self.assertEqual((target['instance'], target['host'], target['port'], target['database']),
                             ('mw-credit-pg-20261017', '136.85.127.134', 5432, database), name)
            self.assertEqual(target['sslmode'], 'disable', name)
            self.assertIsInstance(target['proxyPort'], int, name)
            self.assertTrue(1024 <= target['proxyPort'] <= 65535, name)
            self.assertNotIn('serverCaSha256', target, name)

    def test_proxy_binary_is_pinned(self):
        toolchain = json.loads((REPO / 'database/toolchain.json').read_text())
        version = toolchain['cloudSqlProxyVersion']
        self.assertRegex(version, r'^\d+\.\d+\.\d+$')
        pin = toolchain['cloudSqlProxyWindows']
        self.assertEqual(pin['url'], f'https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v{version}/cloud-sql-proxy.x64.exe')
        self.assertRegex(pin['sha256'], r'^[0-9a-f]{64}$')

    def test_routine_linux_reads_default_to_the_read_identity(self):
        common = COMMON.read_text()
        self.assertIn("$DbReadUser = 'codex-cloud-read@clever-oasis-508610-n7.iam'", common)
        self.assertIn('function Get-DbEnvironment([string]$Name, [switch]$Admin)', common)
        self.assertIn('Get-DbEnvironment $Environment -Admin', (REPO / 'scripts/database/Invoke-Flyway.ps1').read_text())

    def test_direct_tls_route_is_retired(self):
        common = COMMON.read_text()
        self.assertIn("'--gcloud-auth','--address','127.0.0.1'", common)
        self.assertNotIn('Get-DbServerCa', common)
        self.assertNotIn('PGSSLROOTCERT', common)
        self.assertFalse((REPO / 'scripts/database/server_ca.py').exists())
        self.assertNotIn("'require'", (REPO / 'scripts/database/Export-Schema.ps1').read_text())
        self.assertNotIn('sslrootcert', (REPO / 'scripts/database/Invoke-Flyway.ps1').read_text())
        backup = (REPO / 'scripts/database/Backup-ProductionPromotion.py').read_text()
        self.assertIn("if os.name == 'nt': raise SystemExit", backup)
        self.assertNotIn('verify-ca', backup)
        self.assertNotIn("'136.85.127.134',5432)", backup)

    @unittest.skipUnless(shutil.which('pwsh'), 'pwsh required')
    def test_proxy_helpers_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {**__import__('os').environ, 'MW_DB_TOOL_ROOT': tmp}
            refused = pwsh(f". '{COMMON}'; Start-DbProxy ([pscustomobject]@{{instance='mw-credit-pg-20261017'; proxyPort=80}})", env)
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('Invalid proxyPort', refused.stderr + refused.stdout)
            missing = pwsh(f". '{COMMON}'; Get-CloudSqlProxyPath", env)
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn('Install-Tools.ps1', missing.stderr + missing.stdout)
            version = json.loads((REPO / 'database/toolchain.json').read_text())['cloudSqlProxyVersion']
            binary = Path(tmp) / f'cloud-sql-proxy-{version}' / 'cloud-sql-proxy.exe'
            binary.parent.mkdir()
            binary.write_bytes(b'not the pinned proxy')
            tampered = pwsh(f". '{COMMON}'; Get-CloudSqlProxyPath", env)
            self.assertNotEqual(tampered.returncode, 0)
            self.assertIn('pinned checksum', tampered.stderr + tampered.stdout)

    def test_read_role_tool_accepts_only_the_proxy_identity(self):
        fake = types.ModuleType('psycopg'); fake.sql = types.ModuleType('psycopg.sql')
        saved = {k: sys.modules.get(k) for k in ('psycopg', 'psycopg.sql')}
        sys.modules.update({'psycopg': fake, 'psycopg.sql': fake.sql})
        try:
            spec = importlib.util.spec_from_file_location('configure_dev_read_role', REPO / 'scripts/configure-dev-read-role.py')
            module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        finally:
            for k, v in saved.items():
                if v is None: sys.modules.pop(k, None)
                else: sys.modules[k] = v

        class Conn:
            def __init__(self, row): self.row = row
            def execute(self, _sql): return types.SimpleNamespace(fetchone=lambda: self.row)

        module.assert_dev_identity(Conn(('loan_manager_dev', None, 'postgres', True)))
        for row in [('loan_manager_prod', None, 'postgres', True), ('loan_manager_dev', '10.0.0.5', 'postgres', True),
                    ('loan_manager_dev', None, 'mw_app_dev', True), ('loan_manager_dev', None, 'postgres', False)]:
            with self.assertRaisesRegex(RuntimeError, 'Unexpected actual DEV database'):
                module.assert_dev_identity(Conn(row))


if __name__ == '__main__':
    unittest.main()
