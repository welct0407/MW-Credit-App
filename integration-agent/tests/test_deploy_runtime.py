"""Code-only runtime deployment derivative: only code_version changes; receiver-gated engine; old updater retired."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPTS = Path(__file__).parents[1] / 'scripts'
spec = importlib.util.spec_from_file_location('deploy_runtime', SCRIPTS / 'deploy-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
base = runtime.base
COMMIT = 'a' * 40


class RuntimeDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.config = {'state_backend': 'postgres', 'code_version': 'b' * 40, 'receipt_payment_api_enabled': True,
                       'partner_review_cutoff': '2026-10-01T00:00:00+07:00', 'conversation_poll_enabled': False}
        services = {'signed_webhook_ingress': {'enabled': True, 'implemented': True},
                    'partner_oltp_gui': {'enabled': False, 'implemented': False}}
        self.catalogue = {'revision': 27, 'default_policy': 'deny', 'services': services}
        self.candidate = json.loads(json.dumps(self.catalogue))
        self.candidate['services']['signed_webhook_ingress']['enabled'] = False  # switches are the live host's

    def prepared(self, **overrides):
        args = dict(config=self.config, catalogue=self.catalogue, candidate=self.candidate, commit=COMMIT,
                    origin=None, audience=None, cutoff=None)
        args.update(overrides)
        return runtime.prepare(**args)

    def test_only_code_version_changes_and_inputs_are_not_mutated(self):
        before = json.dumps([self.config, self.catalogue], sort_keys=True)
        config, catalogue = self.prepared()
        self.assertEqual(config, dict(self.config, code_version=COMMIT))
        self.assertEqual(catalogue, self.catalogue)
        self.assertEqual(json.dumps([self.config, self.catalogue], sort_keys=True), before)
        self.assertEqual(self.prepared(config={k: v for k, v in self.config.items() if k != 'code_version'})[0]['code_version'], COMMIT)

    def test_drift_or_wrong_target_is_refused(self):
        drifted = json.loads(json.dumps(self.candidate))
        drifted['services']['partner_oltp_gui']['implemented'] = True
        for change in [{'candidate': dict(self.candidate, revision=28)},
                       {'candidate': dict(self.candidate, services={'signed_webhook_ingress': {'enabled': True, 'implemented': True}})},
                       {'candidate': drifted}, {'config': dict(self.config, state_backend='sqlite')}, {'commit': 'HEAD'}]:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                self.prepared(**change)

    def test_pointer_prefix_and_receipt_status_probe(self):
        self.assertEqual(base.POINTER, Path('/var/lib/mw-integration-agent/rollback/runtime-current'))
        self.assertEqual(base.PREFIX, 'runtime-')
        self.assertIs(base.prepare, runtime.prepare)
        self.assertFalse(hasattr(runtime, 'native'))  # AGT-QUALITY-05: no import of the deleted R053 script
        self.assertFalse(hasattr(runtime, 'probe'))  # R091: the engine's receipt-status GET is the only probe
        self.assertFalse((SCRIPTS / 'deploy-native-conversations.py').exists())
        self.assertNotIn('mw_integration_agent.conversation_api', (SCRIPTS / 'deploy-runtime.py').read_text(encoding='utf-8'))
        with self.assertRaisesRegex(RuntimeError, 'Explicit unused status probe UUID required'):
            base.probe({}, {}, None)

    def test_probe_is_the_read_only_receipt_status_get_and_failure_blocks_activation(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with patch.object(base.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='read-only-status-ok\n')) as run:
            base.probe({}, {}, '11111111-1111-4111-8111-111111111111')
            argv = run.call_args.args[0]
            self.assertEqual(argv[:3], ['sudo', '-u', 'mwagent'])
            self.assertIn("'GET'", argv[-1])
            self.assertNotIn('conversation', argv[-1])
            self.assertNotIn("'commands'", argv[-1])
            run.return_value = SimpleNamespace(returncode=1, stdout='')
            with self.assertRaises(RuntimeError):
                base.probe({}, {}, '11111111-1111-4111-8111-111111111111')

    def test_runtime_deploy_pauses_and_installs_the_receipt_wake_path_only(self):
        # R082 B1: the code-only route shares the engine's unit and trigger lists; R091 retired the conversation wake.
        self.assertIn('mw-receipt-wake.path', base.UNIT_FILES)
        self.assertIn('mw-receipt-wake.path', base.TRIGGERS)
        for name in ('mw-conversation-wake.path', 'mw-partner-conversation.timer', 'mw-partner-conversation.service'):
            with self.subTest(unit=name):
                self.assertNotIn(name, base.UNIT_FILES)
                self.assertNotIn(name, base.TRIGGERS)
                self.assertIn(name, base.RETIRED_UNIT_FILES)

    def test_shipped_migrations_match_the_migration_runner(self):
        # The preflight compares with deployment.schema_history as state_migration.migrate writes it.
        import hashlib
        from unittest.mock import patch
        migrations = SCRIPTS.parent / 'database/migrations'
        with patch.object(base, 'CHECKOUT', SCRIPTS.parents[1]):
            shipped = base.shipped_migrations()
        expected = {int(p.name.split('__')[0][1:]): [p.name, hashlib.sha256(p.read_text(encoding='utf-8').encode()).hexdigest()]
                    for p in migrations.glob('V*__*.sql')}
        self.assertEqual(shipped, expected)
        self.assertGreaterEqual(max(shipped), 7)  # V7 partner_notices.accepted_at ships with this package

    def test_runtime_deploy_refuses_a_package_ahead_of_the_agent_schema(self):
        # deploy-runtime.py overrides only prepare/probe: the engine's schema preflight stays in force.
        self.assertIs(runtime.base.schema_preflight, base.schema_preflight)
        self.assertEqual(base.schema_preflight({'state_backend': 'sqlite'}, None), 'not applicable (sqlite state)')
        with self.assertRaisesRegex(RuntimeError, '--state-connection-file required'):
            base.schema_preflight({'state_backend': 'postgres'}, None)
        from unittest.mock import patch
        with patch.object(base, 'shipped_migrations', return_value={6: ['V6__a.sql', 'a'], 7: ['V7__b.sql', 'b']}), \
                patch.object(base, 'applied_migrations', return_value={6: ['V6__a.sql', 'a']}):
            with self.assertRaisesRegex(RuntimeError, 'missing V7'):
                base.schema_preflight({'state_backend': 'postgres'}, '/private/conn.json')
        with patch.object(base, 'shipped_migrations', return_value={7: ['V7__b.sql', 'b']}), \
                patch.object(base, 'applied_migrations', return_value={7: ['V7__b.sql', 'b']}):
            self.assertEqual(base.schema_preflight({'state_backend': 'postgres'}, '/private/conn.json'), 'applied through V7')

    def r091(self):
        services = {name: {'enabled': True, 'implemented': True} for name in sorted(runtime.R091_SERVICES)}
        services.update(self.catalogue['services'])
        live = {'revision': 31, 'default_policy': 'deny', 'services': services}
        candidate = {'revision': 32, 'default_policy': 'deny', 'services': json.loads(json.dumps(self.catalogue['services']))}
        config = dict(self.config, partner_conversations_enabled=False, conversation_api_enabled=True, conversation_provider='gemini',
                      reviewer_dml_enabled=False, claude_model='claude-opus-5-5', gemini_conversation_model='gemini-4-argon',
                      database_dml_user='mw_reviewer_dml', gemini_project='clever-oasis-508610-n7', codex_home='/var/lib/x')
        return config, live, candidate

    def test_r091_drops_exactly_the_retired_services_and_keys(self):
        config, live, candidate = self.r091()
        before = json.dumps([config, live, candidate], sort_keys=True)
        cleaned, catalogue = self.prepared(config=config, catalogue=live, candidate=candidate)
        self.assertEqual(cleaned, dict(self.config, gemini_project='clever-oasis-508610-n7', codex_home='/var/lib/x', code_version=COMMIT))
        self.assertEqual(catalogue, dict(self.catalogue, revision=32))
        self.assertEqual(json.dumps([config, live, candidate], sort_keys=True), before)  # inputs untouched
        # The cleaned configuration passes the package validator's retired-key rule.
        sys.path.insert(0, str(SCRIPTS.parent / 'src'))
        from mw_integration_agent import config as package
        self.assertEqual(package.retired_keys(cleaned), [])
        self.assertEqual((package.RETIRED_SERVICES, package.RETIRED_KEYS, package.RETIRED_PREFIXES),
                         (runtime.R091_SERVICES, runtime.R091_KEYS, runtime.R091_PREFIXES))
        self.assertEqual(json.loads((SCRIPTS.parent / 'service-catalogue.json').read_text(encoding='utf-8'))['revision'], runtime.R142_REVISIONS[1])

    def test_r102_adds_exactly_the_disabled_chat_relay(self):
        live = dict(self.catalogue, revision=32)
        candidate = json.loads(json.dumps(live)); candidate['revision'] = 33
        candidate['services']['chat_messages_relay'] = {'enabled': False, 'implemented': True}
        before = json.dumps([live, candidate], sort_keys=True)
        config, catalogue = self.prepared(catalogue=live, candidate=candidate)
        self.assertEqual(catalogue['revision'], 33)
        self.assertEqual(catalogue['services']['chat_messages_relay'], {'enabled': False, 'implemented': True})
        self.assertEqual(catalogue['services']['signed_webhook_ingress'], {'enabled': True, 'implemented': True})  # live switches kept
        self.assertEqual(json.dumps([live, candidate], sort_keys=True), before)
        enabled = json.loads(json.dumps(candidate)); enabled['services']['chat_messages_relay']['enabled'] = True
        other = json.loads(json.dumps(candidate)); other['services']['extra_service'] = {'enabled': False, 'implemented': True}
        dropped = json.loads(json.dumps(candidate)); del dropped['services']['partner_oltp_gui']
        for change, pattern in ((enabled, 'arrive disabled'), (other, 'add exactly'), (dropped, 'add exactly')):
            with self.subTest(change=sorted(change['services'])), self.assertRaisesRegex(RuntimeError, pattern):
                self.prepared(catalogue=live, candidate=change)

    def r112(self):
        """The repository revision 34 catalogue as candidate; a live revision 33 shaped like PROD's, with the shared
        receipt API, the recognizer and the chat relay enabled (the repository template has them off)."""
        candidate = json.loads((SCRIPTS.parent / 'service-catalogue.json').read_text(encoding='utf-8')); candidate['revision'] = 34
        live = json.loads(json.dumps(candidate)); live['revision'] = 33
        for name in ('shared_receipt_payment_api', 'receipt_recognition_api', 'chat_messages_relay'):
            self.assertFalse(candidate['services'][name]['enabled'])
            live['services'][name]['enabled'] = True
        return live, candidate

    def test_r112_keeps_the_live_switches_of_a_host_with_enabled_services(self):
        # R112 PROD deploy incident: the live switches were compared with the repository defaults and refused.
        live, candidate = self.r112()
        before = json.dumps([self.config, live, candidate], sort_keys=True)
        config, catalogue = self.prepared(catalogue=live, candidate=candidate)
        self.assertEqual(catalogue, dict(live, revision=34))  # live switches untouched, only the revision moves
        self.assertEqual(config, dict(self.config, code_version=COMMIT))
        self.assertEqual(json.dumps([self.config, live, candidate], sort_keys=True), before)
        self.assertEqual(runtime.services_sha256(candidate['services']), runtime.R112_TEMPLATE_SHA256)

    def test_r112_refuses_a_revision_that_changes_a_service_or_switch(self):
        live, candidate = self.r112()
        switched = json.loads(json.dumps(candidate)); switched['services']['partner_receipt_review']['enabled'] = not candidate['services']['partner_receipt_review']['enabled']
        capability = json.loads(json.dumps(candidate)); capability['services']['chat_messages_relay']['implemented'] = False
        added = json.loads(json.dumps(candidate)); added['services']['extra_service'] = {'enabled': False, 'implemented': True}
        dropped = json.loads(json.dumps(candidate)); del dropped['services']['chat_messages_relay']
        for change in (switched, capability, added, dropped):
            with self.subTest(change=sorted(change['services'])), self.assertRaisesRegex(RuntimeError, 'R112 candidate must keep'):
                self.prepared(catalogue=live, candidate=change)
        # A live host missing a service (or carrying an extra one) is refused too.
        short = json.loads(json.dumps(live)); del short['services']['chat_messages_relay']
        with self.assertRaisesRegex(RuntimeError, 'keep every service'):
            self.prepared(catalogue=short, candidate=candidate)
        drift = json.loads(json.dumps(live)); drift['services']['chat_messages_relay']['implemented'] = False
        with self.assertRaisesRegex(RuntimeError, 'Capability drift'):
            self.prepared(catalogue=drift, candidate=candidate)

    def r119(self):
        """R119: the repository revision 35 catalogue as candidate; a live revision 34 shaped like PROD's (services the
        repository template has off are on there), with the recheck switch already set on the host."""
        # The repository's revision 36 services are revision 35's (R128 changes no service): the revision 35 candidate.
        candidate = dict(json.loads((SCRIPTS.parent / 'service-catalogue.json').read_text(encoding='utf-8')), revision=35)
        live = json.loads(json.dumps(candidate)); live['revision'] = 34
        for name in ('shared_receipt_payment_api', 'receipt_recognition_api', 'chat_messages_relay'):
            live['services'][name]['enabled'] = True
        return live, candidate

    def test_r119_moves_the_revision_and_keeps_services_switches_and_config(self):
        live, candidate = self.r119()
        config = dict(self.config, conversation_poll_recheck_enabled=True)
        before = json.dumps([config, live, candidate], sort_keys=True)
        cleaned, catalogue = self.prepared(config=config, catalogue=live, candidate=candidate)
        self.assertEqual(catalogue, dict(live, revision=35))  # only the revision moves; the live switches stay
        self.assertEqual(cleaned, dict(config, code_version=COMMIT))  # the recheck switch is kept as it is
        self.assertEqual(json.dumps([config, live, candidate], sort_keys=True), before)
        self.assertEqual(runtime.services_sha256(candidate['services']), runtime.R119_TEMPLATE_SHA256)
        # Absent on the host, the new key stays absent (off).
        cleaned, _ = self.prepared(catalogue=live, candidate=candidate)
        self.assertNotIn('conversation_poll_recheck_enabled', cleaned)

    def test_r119_refuses_other_drift(self):
        live, candidate = self.r119()
        switched = json.loads(json.dumps(candidate)); switched['services']['conversation_poll']['enabled'] = not candidate['services']['conversation_poll']['enabled']
        added = json.loads(json.dumps(candidate)); added['services']['extra_service'] = {'enabled': False, 'implemented': True}
        dropped = json.loads(json.dumps(candidate)); del dropped['services']['chat_messages_relay']
        for change in (switched, added, dropped):
            with self.subTest(change=sorted(change['services'])), self.assertRaisesRegex(RuntimeError, 'R119 candidate must keep'):
                self.prepared(catalogue=live, candidate=change)
        short = json.loads(json.dumps(live)); del short['services']['chat_messages_relay']
        with self.assertRaisesRegex(RuntimeError, 'R119 catalogue must keep every service'):
            self.prepared(catalogue=short, candidate=candidate)
        drift = json.loads(json.dumps(live)); drift['services']['conversation_poll']['implemented'] = False
        with self.assertRaisesRegex(RuntimeError, 'Capability drift'):
            self.prepared(catalogue=drift, candidate=candidate)
        # Skipping a revision (33 -> 35) or going back (35 -> 34) is ordinary revision drift.
        for old, new in ((33, 35), (35, 34)):
            with self.subTest(live=old, candidate=new), self.assertRaisesRegex(RuntimeError, 'revision drift'):
                self.prepared(catalogue=dict(live, revision=old), candidate=dict(candidate, revision=new))

    def r128(self):
        """R128: the repository revision 36 catalogue as candidate; a live revision 35 shaped like PROD's."""
        # The repository's revision 37 services are revision 36's (R142 changes no service): the revision 36 candidate.
        candidate = dict(json.loads((SCRIPTS.parent / 'service-catalogue.json').read_text(encoding='utf-8')), revision=36)
        live = json.loads(json.dumps(candidate)); live['revision'] = 35
        for name in ('shared_receipt_payment_api', 'receipt_recognition_api', 'chat_messages_relay'):
            live['services'][name]['enabled'] = True
        return live, candidate

    def test_r128_moves_the_revision_and_keeps_services_switches_and_the_close_switch(self):
        live, candidate = self.r128()
        config = dict(self.config, loan_close_execution_enabled=True)
        before = json.dumps([config, live, candidate], sort_keys=True)
        cleaned, catalogue = self.prepared(config=config, catalogue=live, candidate=candidate)
        self.assertEqual(catalogue, dict(live, revision=36))  # only the revision moves; the live switches stay
        self.assertEqual(cleaned, dict(config, code_version=COMMIT))  # the close switch is kept as it is
        self.assertEqual(json.dumps([config, live, candidate], sort_keys=True), before)
        self.assertEqual(runtime.services_sha256(candidate['services']), runtime.R128_TEMPLATE_SHA256)
        cleaned, _ = self.prepared(catalogue=live, candidate=candidate)
        self.assertNotIn('loan_close_execution_enabled', cleaned)  # absent on the host: stays absent (off)

    def test_r128_refuses_other_drift(self):
        live, candidate = self.r128()
        switched = json.loads(json.dumps(candidate)); switched['services']['conversation_poll']['enabled'] = not candidate['services']['conversation_poll']['enabled']
        added = json.loads(json.dumps(candidate)); added['services']['extra_service'] = {'enabled': False, 'implemented': True}
        for change in (switched, added):
            with self.subTest(change=sorted(change['services'])), self.assertRaisesRegex(RuntimeError, 'R128 candidate must keep'):
                self.prepared(catalogue=live, candidate=change)
        short = json.loads(json.dumps(live)); del short['services']['chat_messages_relay']
        with self.assertRaisesRegex(RuntimeError, 'R128 catalogue must keep every service'):
            self.prepared(catalogue=short, candidate=candidate)
        for old, new in ((34, 36), (36, 35)):
            with self.subTest(live=old, candidate=new), self.assertRaisesRegex(RuntimeError, 'revision drift'):
                self.prepared(catalogue=dict(live, revision=old), candidate=dict(candidate, revision=new))

    def r142(self):
        """R142: the repository revision 37 catalogue as candidate; a live revision 36 shaped like PROD's."""
        candidate = json.loads((SCRIPTS.parent / 'service-catalogue.json').read_text(encoding='utf-8'))
        self.assertEqual(candidate['revision'], 37)
        live = json.loads(json.dumps(candidate)); live['revision'] = 36
        for name in ('shared_receipt_payment_api', 'receipt_recognition_api', 'chat_messages_relay'):
            live['services'][name]['enabled'] = True
        return live, candidate

    def test_r142_moves_the_revision_and_keeps_services_switches_and_the_receipt_routes(self):
        live, candidate = self.r142()
        callers = [{'email': 'mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '1' * 21,
                    'provider': 'claude', 'fallback': 'gemini', 'qr_reference': True}]
        config = dict(self.config, receipt_claude_model='claude-opus-5-5', receipt_claude_effort='low',
                      receipt_recognition_callers=callers, receipt_cycle_fallback=None, receipt_cycle_qr_reference=False)
        before = json.dumps([config, live, candidate], sort_keys=True)
        cleaned, catalogue = self.prepared(config=config, catalogue=live, candidate=candidate)
        self.assertEqual(catalogue, dict(live, revision=37))  # only the revision moves; the live switches stay
        self.assertEqual(cleaned, dict(config, code_version=COMMIT))  # receipt_claude_* is not the retired claude_ prefix
        self.assertEqual(json.dumps([config, live, candidate], sort_keys=True), before)
        self.assertEqual(runtime.services_sha256(candidate['services']), runtime.R142_TEMPLATE_SHA256)
        cleaned, _ = self.prepared(catalogue=live, candidate=candidate)
        self.assertNotIn('receipt_claude_model', cleaned)  # absent on the host: stays absent (today's behaviour)

    def test_r142_refuses_other_drift(self):
        live, candidate = self.r142()
        switched = json.loads(json.dumps(candidate)); switched['services']['receipt_recognition_api']['enabled'] = True
        added = json.loads(json.dumps(candidate)); added['services']['extra_service'] = {'enabled': False, 'implemented': True}
        for change in (switched, added):
            with self.subTest(change=sorted(change['services'])), self.assertRaisesRegex(RuntimeError, 'R142 candidate must keep'):
                self.prepared(catalogue=live, candidate=change)
        short = json.loads(json.dumps(live)); del short['services']['chat_messages_relay']
        with self.assertRaisesRegex(RuntimeError, 'R142 catalogue must keep every service'):
            self.prepared(catalogue=short, candidate=candidate)
        drift = json.loads(json.dumps(live)); drift['services']['receipt_recognition_api']['implemented'] = False
        with self.assertRaisesRegex(RuntimeError, 'Capability drift'):
            self.prepared(catalogue=drift, candidate=candidate)
        for old, new in ((35, 37), (37, 36)):
            with self.subTest(live=old, candidate=new), self.assertRaisesRegex(RuntimeError, 'revision drift'):
                self.prepared(catalogue=dict(live, revision=old), candidate=dict(candidate, revision=new))

    def test_r091_refuses_any_other_catalogue_change_and_leftover_keys(self):
        config, live, candidate = self.r091()
        less = json.loads(json.dumps(live)); del less['services']['reviewer_database_dml']
        more = json.loads(json.dumps(candidate)); more['services']['operational_data_read'] = {'enabled': True, 'implemented': True}
        other = json.loads(json.dumps(candidate)); del other['services']['partner_oltp_gui']
        drift = json.loads(json.dumps(candidate)); drift['services']['partner_oltp_gui']['implemented'] = True
        for change, pattern in (({'catalogue': less}, 'drop exactly'), ({'candidate': more}, 'drop exactly'), ({'candidate': other}, 'drop exactly'),
                                ({'candidate': drift}, 'Capability drift'), ({'candidate': dict(candidate, revision=33)}, 'revision drift'),
                                ({'catalogue': dict(live, revision=30)}, 'revision drift')):
            with self.subTest(change=list(change)), self.assertRaisesRegex(RuntimeError, pattern):
                self.prepared(config=config, **{'catalogue': live, 'candidate': candidate, **change})

    def test_retired_keys_are_dropped_outside_the_r091_change(self):
        # R094: the three inert keys R091 left on the VM (and any other retired key) leave the configuration on an
        # ordinary code-only deploy (catalogue unchanged); every other key and the catalogue stay as they are.
        dead = {'conversation_schema_file': '/etc/mw-integration-agent/conversation-schema.json', 'conversation_schema_sha256': 'c' * 64,
                'partner_conversation_backup': '/var/lib/mw-integration-agent/backup', 'conversation_provider': 'codex'}
        config = dict(self.config, **dead)
        before = json.dumps(config, sort_keys=True)
        cleaned, catalogue = self.prepared(config=config)
        self.assertEqual(cleaned, dict(self.config, code_version=COMMIT))
        self.assertEqual(catalogue, self.catalogue)
        self.assertEqual(json.dumps(config, sort_keys=True), before)  # input untouched
        self.assertTrue({'conversation_schema_file', 'conversation_schema_sha256', 'partner_conversation_backup'} <= runtime.R091_KEYS)
        sys.path.insert(0, str(SCRIPTS.parent / 'src'))
        from mw_integration_agent import config as package
        self.assertEqual(package.retired_keys(config), sorted(dead))
        self.assertEqual(package.retired_keys(cleaned), [])

    def test_one_off_activation_scripts_are_deleted(self):
        # AGT-QUALITY-05: deploy-runtime.py (with its engine) is the one deploy helper.
        for name in ('activate-conversation-poll.sh', 'activate-partner-conversations.sh', 'activate-partner-review.sh',
                     'activate-receipt-automation.py', 'activate-receipt-summary.py', 'activate-reviewer-dml.sh',
                     'deploy-cash-statement.sh', 'deploy-receipt-summary.sh', 'install-cash-statement-schedule.sh',
                     'install-postgresql-config.py', 'freeze-postgresql-cutover.py', 'deploy-appsheet-retirement.py',
                     'deploy-operator-audit.py', 'deploy-receipt-audit-repair.py', 'deploy-receipt-evidence.py',
                     'verify-receipt-evidence.py', 'provision-agent-database.py', 'verify-reviewer-dml-restored.ps1',
                     'test-reviewer-dml.ps1', 'verify-dml-restored.py'):
            with self.subTest(script=name):
                self.assertFalse((SCRIPTS / name).exists())

    def test_reviewed_runtime_shell_updater_is_retired(self):
        self.assertFalse((SCRIPTS / 'update-reviewed-runtime.sh').exists())

    def test_dry_run_entry_point_reports_without_root(self):
        result = subprocess.run([sys.executable, '-I', str(SCRIPTS / 'deploy-runtime.py'), 'dry-run', '--commit', COMMIT],
                                capture_output=True, text=True, timeout=120, env={'PATH': '/usr/bin:/bin'}, cwd='/')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report['phase'], report['pointer']['path']), ('dry-run', str(base.POINTER)))


if __name__ == '__main__':
    unittest.main()
