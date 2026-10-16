"""Repository unit files: worker ordering against the Cloud SQL proxy and credential write paths."""
import unittest
from pathlib import Path

UNITS = Path(__file__).resolve().parents[1] / 'systemd'
PROXY = 'cloud-sql-auth-proxy.service'
OAUTH = '/etc/mw-integration-agent/secrets/outlook-email-oauth.json'
RECEIVER = 'mw-instagram-webhook'
WORKERS = {'mw-receipt-summary', 'mw-audit-relay', 'mw-cash-statement', 'mw-cash-statement-email-retry',
           'mw-partner-conversation', 'mw-conversation-poll', RECEIVER}


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

    def test_receiver_waits_for_proxy_and_readiness_without_requiring_them(self):
        # AGT-R063-03: ordered after the proxy, private umask/HOME, and a non-fatal readiness gate on start.
        unit, service = self.units[RECEIVER]['Unit'], self.units[RECEIVER]['Service']
        self.assertEqual(words(unit, 'After'), ['network-online.target', PROXY])
        self.assertEqual(words(unit, 'Wants'), ['network-online.target', PROXY])
        self.assertNotIn(PROXY, words(unit, 'Requires') + words(unit, 'BindsTo'))
        self.assertEqual(unit.get('StartLimitIntervalSec'), ['300'])
        self.assertEqual(unit.get('StartLimitBurst'), ['5'])
        self.assertEqual(service.get('UMask'), ['0077'])
        self.assertEqual(service.get('Environment'), ['HOME=/var/lib/mw-integration-agent'])
        self.assertEqual(service.get('ExecStartPost'), ['-/opt/mw-integration-agent/.venv/bin/mw-integration-agent receiver-ready '
                                                        '--config /etc/mw-integration-agent/config.json --wait 30'])
        self.assertEqual(service.get('TimeoutStartSec'), ['45s'])
        self.assertEqual(service.get('Restart'), ['on-failure'])
        self.assertEqual(service.get('RestartSec'), ['5s'])

    def test_no_duplicate_keys_and_cloudflared_restricts_address_families(self):
        # AGT-HOST-03: the parser keeps lists, so a repeated single-valued key shows as len > 1.
        for name, unit in self.units.items():
            for keys in unit.values():
                for key, values in keys.items():
                    if key not in ('ExecStart', 'Environment', 'ReadWritePaths', 'After', 'Wants', 'ExecStartPost'):
                        with self.subTest(unit=name, key=key):
                            self.assertEqual(len(values), 1)
        self.assertEqual(words(self.units['mw-cloudflared-instagram']['Service'], 'RestrictAddressFamilies'),
                         ['AF_UNIX', 'AF_INET', 'AF_INET6', 'AF_NETLINK'])

    def test_iam_listener_runs_in_its_own_proxy_process(self):
        # ALL-ARCH-03 read-route fix: one proxy process shares one certificate per instance, and any
        # auto-iam-authn listener makes it an IAM certificate for all of them (token sign-in on 5432 failed).
        # So 5432 keeps the base unit's ExecStart and 5433 is a separate unit pulled in by the drop-in.
        dropin = parse(UNITS / 'cloud-sql-auth-proxy.service.d' / 'iam-listener.conf')
        self.assertNotIn('Service', dropin)
        self.assertEqual(dropin['Unit'], {'Wants': ['cloud-sql-auth-proxy-iam.service'],
                                          'After': ['cloud-sql-auth-proxy-iam.service']})
        base = self.units['cloud-sql-auth-proxy']['Service']['ExecStart']
        self.assertEqual(len(base), 1)
        self.assertIn('--port 5432', base[0])
        self.assertNotIn('iam', base[0])
        iam = self.units['cloud-sql-auth-proxy-iam']
        self.assertEqual(len(iam['Service']['ExecStart']), 1)
        self.assertTrue(iam['Service']['ExecStart'][0].endswith('?port=5433&auto-iam-authn=true"'))
        self.assertNotIn('5432', iam['Service']['ExecStart'][0])
        self.assertEqual(words(iam['Unit'], 'PartOf'), [PROXY])
        self.assertNotIn(PROXY, words(iam['Unit'], 'After'))  # the base unit orders itself after this one
        for key in ('User', 'Group', 'NoNewPrivileges', 'ProtectSystem', 'ProtectHome', 'RestrictAddressFamilies'):
            with self.subTest(key=key):
                self.assertEqual(iam['Service'][key], self.units['cloud-sql-auth-proxy']['Service'][key])


if __name__ == '__main__':
    unittest.main()
