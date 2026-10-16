"""DB-ACCESS-07 / DB-ACCESS-03 guards for database/environments.json and Common.ps1."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
COMMON = REPO / 'scripts/database/Common.ps1'
_spec = importlib.util.spec_from_file_location('server_ca', Path(__file__).with_name('server_ca.py'))
server_ca = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(server_ca)


def synthetic_ca(directory):
    pem = Path(directory) / 'synthetic.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=synthetic-ca',
                    '-keyout', str(Path(directory) / 'key.pem'), '-out', str(pem)], check=True, capture_output=True)
    sha = subprocess.run(['openssl', 'x509', '-in', str(pem), '-noout', '-fingerprint', '-sha256'], check=True,
                         capture_output=True, text=True).stdout.split('=', 1)[1].strip().replace(':', '').lower()
    return pem, sha


class EnvironmentTests(unittest.TestCase):
    def test_both_targets_verify_the_pinned_server_ca(self):
        targets = json.loads((REPO / 'database/environments.json').read_text())
        pins = set()
        for name in ('development', 'production'):
            target = targets[name]
            self.assertEqual(target['sslmode'], 'verify-ca', name)
            self.assertRegex(target['serverCaSha256'], r'^[0-9a-f]{64}$', name)
            pins.add(target['serverCaSha256'])
        self.assertEqual(len(pins), 1, 'one instance, one server CA')

    def test_routine_linux_reads_default_to_the_read_identity(self):
        common = COMMON.read_text()
        self.assertIn("$DbReadUser = 'codex-cloud-read@clever-oasis-508610-n7.iam'", common)
        self.assertIn('function Get-DbEnvironment([string]$Name, [switch]$Admin)', common)
        self.assertIn('Get-DbEnvironment $Environment -Admin', (REPO / 'scripts/database/Invoke-Flyway.ps1').read_text())

    @unittest.skipUnless(shutil.which('pwsh') and shutil.which('openssl'), 'pwsh and openssl required')
    def test_pem_fingerprint_matches_openssl_and_rejects_non_certificates(self):
        with tempfile.TemporaryDirectory() as tmp:
            pem = Path(tmp) / 'synthetic.pem'
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=synthetic-ca',
                            '-keyout', str(Path(tmp) / 'key.pem'), '-out', str(pem)], check=True, capture_output=True)
            expected = subprocess.run(['openssl', 'x509', '-in', str(pem), '-noout', '-fingerprint', '-sha256'], check=True,
                                      capture_output=True, text=True).stdout.split('=', 1)[1].strip().replace(':', '').lower()
            script = f". '{COMMON}'; Get-PemSha256 '{pem}'"
            actual = subprocess.run(['pwsh', '-NoProfile', '-Command', script], check=True, capture_output=True, text=True).stdout.strip()
            self.assertEqual(actual, expected)
            (Path(tmp) / 'not.pem').write_text('not a certificate')
            refused = subprocess.run(['pwsh', '-NoProfile', '-Command', f". '{COMMON}'; Get-PemSha256 '{Path(tmp) / 'not.pem'}'"],
                                     capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)

    @unittest.skipUnless(shutil.which('openssl'), 'openssl required')
    def test_python_clients_accept_only_the_pinned_ca(self):
        with tempfile.TemporaryDirectory() as tmp:
            pem, sha = synthetic_ca(tmp)
            target = {'instance': 'mw-credit-pg-20261017', 'serverCaSha256': sha}
            dest = Path(tmp) / 'private' / 'cloudsql-server-ca.pem'
            self.assertEqual(server_ca.pinned_server_ca(target, dest, fetch=lambda i: pem.read_text()), dest)
            self.assertEqual(server_ca.pem_sha256(dest), sha)
            self.assertEqual(server_ca.pinned_server_ca(target, dest, fetch=lambda i: self.fail('cached CA refetched')), dest)
            dest.unlink()
            with self.assertRaisesRegex(ValueError, 'pinned fingerprint'):
                server_ca.pinned_server_ca({**target, 'serverCaSha256': '0' * 64}, dest, fetch=lambda i: pem.read_text())
            self.assertFalse(dest.exists())
        backup = (REPO / 'scripts/database/Backup-ProductionPromotion.py').read_text()
        self.assertIn("'sslmode': 'verify-ca'", backup)
        self.assertNotIn("'sslmode': 'require'", backup)


if __name__ == '__main__':
    unittest.main()
