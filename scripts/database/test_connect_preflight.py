"""Unit tests for the read-only production CONNECT preflight collector (synthetic facts only)."""
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('connect_preflight', Path(__file__).with_name('connect_preflight.py'))
cp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cp)
REPO = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 19, 3, 0, 0, tzinfo=timezone.utc)
RETAINED = sorted(cp.CONFIGURED_CONSUMERS)
DEV = ['mw-credit-app-command-dev@clever-oasis-508610-n7.iam', 'mw_app_dev', 'mw_app_dev_journal_owner']


def facts(**overrides):
    value = {'database': 'loan_manager_prod', 'sessionUser': cp.READ_USER, 'systemIdentifier': cp.CLUSTER_SYSTEM_IDENTIFIER, 'readOnly': 'on',
             'latestVersion': 95, 'datacl': '{=T/cloudsqlsuperuser,cloudsqlsuperuser=CTc/cloudsqlsuperuser,"\\"mw-credit-app-read-prod@clever-oasis-508610-n7.iam\\"=c/cloudsqlsuperuser"}',
             'roles': sorted(RETAINED + DEV + ['cloudsqladmin', 'cloudsqlsuperuser']), 'connectHolders': RETAINED + ['cloudsqladmin', 'cloudsqlsuperuser'],
             'devConnect': {r: False for r in DEV}, 'sessions': {'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam': 1, 'metabase_borrower_reader': 2}}
    value.update(overrides)
    return value


class Evaluate(unittest.TestCase):
    def test_complete_containment_is_pinned_from_observed_facts(self):
        p = cp.evaluate(facts(), REPO, NOW, 95)
        self.assertEqual(p['retainedConsumerRoles'], RETAINED)
        self.assertEqual(p['evidence']['platformRoles'], ['cloudsqladmin', 'cloudsqlsuperuser'])
        self.assertEqual(p['devPrincipalRoles'], sorted(DEV))
        self.assertEqual((p['devSessionCount'], p['observedAt'], p['host'], p['baselineVersion']), (0, '2026-10-19T03:00:00Z', '136.85.127.134', 95))
        self.assertEqual(p['evidence']['observedConsumerSessions'], ['metabase_borrower_reader', 'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam'])
        self.assertTrue(all(p[k] is True for k in ('publicConnectRevoked', 'configuredConsumersVerified', 'consumerReconnectVerified', 'devInheritedConnectDenied')))
        self.assertRegex(p['identityInventorySha256'], '^[a-f0-9]{64}$')
        for role in RETAINED:
            self.assertTrue((REPO / p['evidence']['configuredSources'][role]).is_file(), role)

    def test_each_unestablished_fact_refuses(self):
        cases = [
            (dict(datacl=None), 'PUBLIC CONNECT'), (dict(datacl='{=Tc/cloudsqlsuperuser}'), 'PUBLIC CONNECT'),
            (dict(connectHolders=RETAINED + ['unknown_reader']), 'unknown_reader'),
            (dict(devConnect={**{r: False for r in DEV}, 'mw_app_dev': True}), 'mw_app_dev'),
            (dict(devConnect={r: False for r in DEV[1:]}), 'DEV principals hold CONNECT'),
            (dict(roles=RETAINED), 'No DEV principals'),
            (dict(sessions={'metabase_borrower_reader': 2}), 'not observed connected'),
            (dict(latestVersion=96), 'baseline'), (dict(database='loan_manager_dev'), 'identity'),
            (dict(systemIdentifier=1), 'identity'), (dict(readOnly='off'), 'read-only'),
        ]
        for override, message in cases:
            with self.subTest(override=override), self.assertRaisesRegex(ValueError, message):
                cp.evaluate(facts(**override), REPO, NOW, 95)

    def test_dev_sessions_are_counted_not_hidden(self):
        p = cp.evaluate(facts(sessions={'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam': 1, 'mw_app_dev': 2}), REPO, NOW, 95)
        self.assertEqual(p['devSessionCount'], 2)

    def test_configured_sources_and_templates(self):
        self.assertTrue(cp.configured(REPO, 'mw-credit-app-jobs-prod@clever-oasis-508610-n7.iam'))
        self.assertFalse(cp.configured(REPO, 'mw-credit-app-other-prod@clever-oasis-508610-n7.iam'))
        self.assertFalse(cp.configured(REPO, 'mw-credit-app-read-dev@clever-oasis-508610-n7.iam'))
        # R090: the chat IAM database user is derived from the chat service account in chat-service.tf.
        self.assertEqual(cp.CONFIGURED_CONSUMERS['mw-credit-app-chat-prod@clever-oasis-508610-n7.iam'], 'infrastructure/production/chat-service.tf')
        self.assertTrue(cp.configured(REPO, 'mw-credit-app-chat-prod@clever-oasis-508610-n7.iam'))
        self.assertFalse(cp.configured(REPO, 'mw-credit-app-chat-dev@clever-oasis-508610-n7.iam'))
        self.assertTrue(cp.DEV_NAME.search('mw-credit-app-chat-dev@clever-oasis-508610-n7.iam'))

    def test_grafana_roles_are_configured_but_not_expected_connected(self):
        # R091: the Grafana roles hold CONNECT on loan_manager_prod; their sources name them literally.
        grafana = {'mw_agent_dashboard': 'database/migrations/V104__pwa_chat.sql', 'mw_grafana_reader': 'infrastructure/grafana/owned-services.tf.json'}
        for role, source in grafana.items():
            with self.subTest(role=role):
                self.assertEqual(cp.CONFIGURED_CONSUMERS[role], source)
                self.assertIn(role, (REPO / source).read_text(encoding='utf-8'))
                self.assertTrue(cp.configured(REPO, role))
                self.assertNotIn(role, cp.EXPECTED_CONNECTED)
        # Holding CONNECT with no live session passes (Grafana connects on demand); a session is recorded when seen.
        p = cp.evaluate(facts(sessions={'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam': 1}), REPO, NOW, 95)
        self.assertTrue(set(grafana) <= set(p['retainedConsumerRoles']))
        self.assertEqual(p['evidence']['observedConsumerSessions'], ['mw-credit-app-notify-prod@clever-oasis-508610-n7.iam'])
        p = cp.evaluate(facts(sessions={'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam': 1, 'mw_grafana_reader': 1}), REPO, NOW, 95)
        self.assertIn('mw_grafana_reader', p['evidence']['observedConsumerSessions'])
        # A source that no longer names the role refuses.
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            for role, source in grafana.items():
                path = Path(root) / source
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('-- no role here\n', encoding='utf-8')
                self.assertFalse(cp.configured(Path(root), role), role)

    def test_derived_source_needs_the_account_and_the_derivation(self):
        import tempfile
        role = 'mw-credit-app-chat-prod@clever-oasis-508610-n7.iam'
        good = 'resource "google_service_account" "chat" {\n  account_id   = "mw-credit-app-chat-prod"\n}\nname = trimsuffix(google_service_account.chat[0].email, ".gserviceaccount.com")\n'
        for text, expected in [(good, True), (good.replace('mw-credit-app-chat-prod', 'mw-credit-app-chat-dev'), False),
                               (good.replace('trimsuffix(', 'lower('), False), (good.replace('account_id', 'display_name'), False)]:
            with tempfile.TemporaryDirectory() as root:
                path = Path(root) / 'infrastructure/production/chat-service.tf'
                path.parent.mkdir(parents=True)
                path.write_text(text, encoding='utf-8')
                self.assertIs(cp.configured(Path(root), role), expected, text)
        self.assertTrue(cp.DEV_NAME.search('mw-credit-app-read-dev@x') and cp.DEV_NAME.search('mw_ledger_owner_dev'))
        self.assertFalse(cp.DEV_NAME.search('mw_app_prod') or cp.DEV_NAME.search('codex-cloud-read@x') or cp.DEV_NAME.search('mw_devices'))

    def test_public_connect_parsing(self):
        self.assertTrue(cp.public_connect(None))
        self.assertTrue(cp.public_connect('{=Tc/owner}'))
        self.assertFalse(cp.public_connect('{=T/owner,"\\"a=c\\"=c/owner"}'))
        self.assertFalse(cp.public_connect('{}'))


class PinRelease(unittest.TestCase):
    def release(self):
        return {'environment': 'development', 'commit': 'a' * 40, 'validationReference': 'synthetic',
                'migrations': [{'name': f'V{n}__x.sql', 'sha256': 'b' * 64} for n in range(1, 97)]}

    def test_block_pins_the_preflight_bytes(self):
        pinned = cp.pin_release(self.release(), b'{"x":1}', 95, 96)
        self.assertEqual(pinned['productionTransaction'], {'baselineVersion': 95, 'targetVersion': 96, 'group': True, 'mixed': False,
                         'executeInTransaction': True, 'callbacks': [], 'connectPreflightSha256': hashlib.sha256(b'{"x":1}').hexdigest()})
        self.assertEqual({k: v for k, v in pinned.items() if k != 'productionTransaction'}, self.release())
        again = cp.pin_release(pinned, b'{"x":2}', 95, 96)
        self.assertEqual(again['productionTransaction']['connectPreflightSha256'], hashlib.sha256(b'{"x":2}').hexdigest())

    def test_refuses_untested_or_partial_release(self):
        for release, baseline, target in [({**self.release(), 'environment': 'production'}, 95, 96), ({**self.release(), 'validationReference': ''}, 95, 96),
                                          (self.release(), 95, 95), (self.release(), 94, 97), (self.release(), 95, 94)]:
            with self.subTest(baseline=baseline, target=target), self.assertRaises(ValueError):
                cp.pin_release(release, b'{}', baseline, target)


class FakeConnection:
    def __init__(self, samples):
        self.samples, self.statements = list(samples), []

    def execute(self, query, params=None):
        self.statements.append(query)
        rows = []
        if 'pg_control_system' in query:
            rows = [('loan_manager_prod', cp.READ_USER, cp.CLUSTER_SYSTEM_IDENTIFIER, 'on')]
        elif 'flyway_schema_history' in query:
            rows = [(95,)]
        elif 'datacl' in query:
            rows = [('{=T/cloudsqlsuperuser}',)]
        elif 'has_database_privilege' in query and 'rolname, has' in query:
            rows = [('mw_app_dev', False), ('mw_app_prod', True)]
        elif 'has_database_privilege' in query:
            rows = [('mw_app_prod',)]
        elif 'pg_roles' in query:
            rows = [('mw_app_dev',), ('mw_app_prod',)]
        elif 'pg_stat_activity' in query:
            rows = self.samples.pop(0) if self.samples else []
        return FakeCursor(rows)


class FakeCursor(list):
    def fetchone(self):
        return self[0]

    def fetchall(self):
        return list(self)


class Collect(unittest.TestCase):
    def test_samples_until_expected_consumers_appear_and_ignores_its_own_session(self):
        notify = 'mw-credit-app-notify-prod@clever-oasis-508610-n7.iam'
        c = FakeConnection([[(cp.READ_USER, 1)], [(cp.READ_USER, 1), ('metabase_borrower_reader', 2)], [(notify, 1)]])
        sleeps, ticks = [], iter(range(0, 1000, 10))
        f = cp.collect(c, 150, sleep=sleeps.append, clock=lambda: next(ticks))
        self.assertEqual(f['sessions'], {'metabase_borrower_reader': 2, notify: 1})
        self.assertEqual(len(sleeps), 2)
        self.assertEqual(f['devConnect'], {'mw_app_dev': False})
        self.assertTrue(all(s.startswith(('BEGIN READ ONLY', 'COMMIT', 'SELECT')) for s in c.statements))

    def test_window_ends_without_the_expected_consumer(self):
        c = FakeConnection([[] for _ in range(50)])
        ticks = iter(range(0, 10000, 10))
        f = cp.collect(c, 30, sleep=lambda _s: None, clock=lambda: next(ticks))
        self.assertEqual(f['sessions'], {})
        with self.assertRaisesRegex(ValueError, 'not observed connected'):
            cp.evaluate({**facts(), 'sessions': f['sessions']}, REPO, NOW, 95)


if __name__ == '__main__':
    unittest.main()
