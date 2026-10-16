"""Repository unit files: worker ordering against the Cloud SQL proxy and credential write paths."""
import unittest
from pathlib import Path

UNITS = Path(__file__).resolve().parents[1] / 'systemd'
PROXY = 'cloud-sql-auth-proxy.service'
OAUTH = '/etc/mw-integration-agent/secrets/outlook-email-oauth.json'
WORKERS = {'mw-receipt-summary', 'mw-audit-relay', 'mw-cash-statement', 'mw-cash-statement-email-retry',
           'mw-partner-conversation', 'mw-conversation-poll'}


def parse(path):
    sections, current = {}, None
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith(('#', ';')):
            continue
        if line.startswith('[') and line.endswith(']'):
            current = sections.setdefault(line[1:-1], {})
            continue
        key, _, value = line.partition('=')
        current.setdefault(key.strip(), []).append(value.strip())
    return sections


def words(section, key):
    return [w for v in section.get(key, []) for w in v.split()]


class UnitFileTests(unittest.TestCase):
    def setUp(self):
        self.units = {p.stem: parse(p) for p in sorted(UNITS.glob('*.service'))}
        self.workers = {name for name, unit in self.units.items() if PROXY in words(unit['Unit'], 'After')}

    def test_expected_worker_units_order_after_the_proxy(self):
        self.assertEqual(self.workers, WORKERS)

    def test_workers_want_but_do_not_require_the_proxy(self):
        # AGT-HOST-04: Requires= propagates a proxy restart as a stop of the running worker,
        # which can kill it between "claimed" and "sent". Wants= + After= keeps the ordering only.
        for name in sorted(self.workers):
            unit = self.units[name]['Unit']
            with self.subTest(unit=name):
                self.assertNotIn(PROXY, words(unit, 'Requires'))
                self.assertNotIn(PROXY, words(unit, 'BindsTo'))
                self.assertIn(PROXY, words(unit, 'After'))
                self.assertIn(PROXY, words(unit, 'Wants'))

    def test_credential_rotating_units_can_write_the_backup_copy(self):
        # AGT-SEND-04: graph_email writes <file>.bak next to the OAuth file before rewriting it.
        rotating = {name for name, unit in self.units.items() if OAUTH in words(unit['Service'], 'ReadWritePaths')}
        self.assertEqual(rotating, {'mw-receipt-summary', 'mw-cash-statement', 'mw-cash-statement-email-retry',
                                    'mw-partner-conversation'})
        for name in sorted(rotating):
            with self.subTest(unit=name):
                self.assertIn('-' + OAUTH + '.bak', words(self.units[name]['Service'], 'ReadWritePaths'))


if __name__ == '__main__':
    unittest.main()
