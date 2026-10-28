import json
import tempfile
import unittest
from pathlib import Path

from mw_integration_agent.config import ConfigurationError, load_json, validate_catalogue, validate_config


ROOT = Path(__file__).resolve().parents[1]


class ConfigurationTests(unittest.TestCase):
    def test_example_is_disabled_and_valid(self):
        validate_config(load_json(ROOT / "config.example.json"))
        validate_catalogue(load_json(ROOT / "service-catalogue.json"))

    def test_retired_conversation_keys_are_refused(self):
        # R091: a configuration that still carries a key of the retired Instagram Partner conversation fails closed.
        from mw_integration_agent.config import RETIRED_KEYS, retired_keys
        config = load_json(ROOT / 'config.example.json')
        self.assertEqual(retired_keys(config), [])
        validate_config(config)
        retired = sorted(RETIRED_KEYS) + ['gemini_conversation_model', 'claude_model', 'database_dml_user', 'database_dml_auth',
                                          'database_dml_password_file']
        for key in retired:
            for value in (False, None, 'x'):
                with self.subTest(key=key, value=value), self.assertRaisesRegex(ConfigurationError, 'retired conversation configuration keys present: ' + key):
                    validate_config(dict(config, **{key: value}))
        # The receipt providers keep their settings, and the conversation poll keeps every key.
        for key in ('codex_executable', 'codex_home', 'gemini_project', 'gemini_location', 'conversation_poll_enabled'):
            self.assertNotIn(key, retired_keys({key: 1}))

    def test_retired_appsheet_configuration_cannot_be_enabled(self):
        config = load_json(ROOT / "config.example.json")
        self.assertFalse(any(key.startswith("appsheet_") for key in config))
        validate_config(config)
        config["appsheet_enabled"] = False
        validate_config(config)
        for value in (True, "false", None, 0):
            config["appsheet_enabled"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ConfigurationError, "retired"):
                validate_config(config)

    def test_enabled_unimplemented_service_fails_closed(self):
        catalogue = load_json(ROOT / "service-catalogue.json")
        catalogue["services"]["partner_oltp_gui"]["enabled"] = True
        with self.assertRaises(ConfigurationError):
            validate_catalogue(catalogue)

    def test_audit_relay_entry_is_accepted_and_still_fails_closed(self):
        catalogue = load_json(ROOT / "service-catalogue.json")
        catalogue["services"]["audit_relay"] = {"enabled": True, "implemented": True}
        validate_catalogue(catalogue)
        catalogue["services"]["audit_relay"]["implemented"] = False
        with self.assertRaises(ConfigurationError):
            validate_catalogue(catalogue)

    def test_non_loopback_listener_is_rejected(self):
        config = load_json(ROOT / "config.example.json")
        config["listen_host"] = "0.0.0.0"
        with self.assertRaises(ConfigurationError):
            validate_config(config)

    def test_invalid_json_has_safe_error(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text("{", encoding="utf-8")
            with self.assertRaises(ConfigurationError):
                load_json(path)

    def test_receipt_automation_requires_explicit_policy_configuration(self):
        for flag in ('receipt_auto_payment_enabled','receipt_forwarding_enabled'):
            config=load_json(ROOT/'config.example.json');config[flag]=True
            with self.subTest(flag=flag),self.assertRaises(ConfigurationError):validate_config(config)

    def test_hold_notice_cutoff_requires_timezone(self):
        for field in ('receipt_hold_notice_cutoff','receipt_hold_reply_cutoff'):
            for value in ('2026-09-25T12:00:00','invalid'):
                config=load_json(ROOT/'config.example.json');config[field]=value
                with self.assertRaises(ConfigurationError):validate_config(config)

    def test_python_floor_matches_runtime(self):
        # AGT-QUALITY-02: Debian 13, CI and AGENTS.md all run 3.13; the floor and the ruff target say so.
        import tomllib
        project = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))
        self.assertEqual(project['project']['requires-python'], '>=3.13')
        self.assertEqual(project['tool']['ruff']['target-version'], 'py313')
        self.assertEqual(project['tool']['ruff']['lint']['select'], ['E4', 'E9', 'F', 'B', 'UP'])
        self.assertTrue((ROOT / 'requirements.lock').is_file())

    def test_cutoff_helper_keeps_each_sites_message(self):
        from mw_integration_agent.config import aware_cutoff, cutoff_ts
        self.assertEqual(cutoff_ts({'k': '2026-01-01T00:00:00+07:00'}, 'k'), 1767200400.0)
        self.assertEqual(aware_cutoff({'k': '2026-01-01T00:00:00+07:00'}, 'k').utcoffset().total_seconds(), 25200)
        for value in ('2026-01-01T00:00:00', None, 5, 'invalid'):
            with self.subTest(value=value), self.assertRaisesRegex(ConfigurationError, '^k must include timezone$'):
                aware_cutoff({'k': value}, 'k')
        with self.assertRaisesRegex(ConfigurationError, '^k must include timezone$'):
            cutoff_ts({}, 'k')
        cases = {'partner_review_cutoff': ({'partner_review_enabled': True}, 'partner_review_cutoff required'),
                 'receipt_archive_cutoff': ({'receipt_archive_enabled': True, 'receipt_environment': 'prod'}, 'receipt_archive_cutoff required'),
                 'conversation_poll_cutoff': ({'conversation_poll_enabled': True}, 'conversation_poll_cutoff must include timezone'),
                 'review_resend_cutoff': ({}, 'review_resend_cutoff must include timezone')}
        for key, (flags, message) in cases.items():
            config = load_json(ROOT / 'config.example.json'); config.update(flags); config[key] = '2026-01-01T00:00:00'
            with self.subTest(key=key), self.assertRaisesRegex(ConfigurationError, '^' + message + '$'):
                validate_config(config)

    def business(self, **overrides):
        config = load_json(ROOT / 'config.example.json')
        config.update(database_enabled=True, **overrides)
        return config

    def test_database_name_must_match_an_environment(self):
        # ALL-ARCH-02: DEV is a configurable target.
        validate_config(self.business(database_name='loan_manager_dev'))
        with self.assertRaisesRegex(ConfigurationError, 'approved business database'):
            validate_config(self.business(database_name='loan_manager_other'))

    def test_iam_auth_needs_no_password_files_and_keeps_the_password_ports(self):
        # ALL-ARCH-03: the IAM roles use the second proxy listener; database_port stays 5432 for the password roles.
        iam = dict(database_auth='iam', database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam')
        config = self.business(**iam); del config['database_password_file']
        validate_config(config)
        self.assertEqual(config['database_port'], 5432)
        for change in ({'database_port': 5433}, {'iam_database_port': 5434}, {'database_iam_user': 'someone@example.com'},
                       {'database_iam_user': 'mw-integration-agent@other-project.iam'}, {'database_auth': 'token'}):
            with self.subTest(change=change), self.assertRaises(ConfigurationError):
                validate_config(dict(config, **change))
        validate_config(dict(config, iam_database_port=5433))
        with self.assertRaisesRegex(ConfigurationError, 'database_password_file'):
            validate_config(dict(config, database_auth='password'))
        agent = self.business(state_backend='postgres', agent_database_host='127.0.0.1', agent_database_port=5432,
                              agent_database_name='mw_agent', agent_database_auth='iam',
                              database_iam_user=iam['database_iam_user'],
                              state_generation='11111111-1111-4111-8111-111111111111', state_cutover_at='2026-10-01T00:00:00+07:00')
        validate_config(agent)
        with self.assertRaisesRegex(ConfigurationError, 'unapproved agent database'):
            validate_config(dict(agent, agent_database_port=5433))
        with self.assertRaisesRegex(ConfigurationError, 'agent_database_worker_password_file'):
            validate_config(dict(agent, agent_database_auth='password'))

    def test_projector_auth_key_is_separate_from_database_auth(self):
        # ALL-ARCH-03 part 2b: its own key, default 'password'; database_auth='iam' does not move it.
        from mw_integration_agent.config import auth_mode
        iam_user = 'mw-integration-agent@clever-oasis-508610-n7.iam'
        config = self.business(database_auth='iam', database_iam_user=iam_user)
        validate_config(config)
        self.assertEqual(auth_mode(config, 'receipt_projector_'), 'password')
        iam = dict(config, receipt_projector_auth='iam')
        del iam['receipt_projector_password_file']
        validate_config(iam)  # no password file under iam
        for value in ('token', True):
            with self.subTest(value=value), self.assertRaisesRegex(ConfigurationError, '^receipt_projector_auth must be password or iam$'):
                validate_config(dict(config, receipt_projector_auth=value))
        alone = dict(self.business(), receipt_projector_auth='iam')
        with self.assertRaisesRegex(ConfigurationError, 'database_iam_user'):
            validate_config(alone)
        for change in ({'database_iam_user': 'someone@example.com'}, {'iam_database_port': 5432}):
            with self.assertRaises(ConfigurationError):
                validate_config(dict(iam, **change))
        validate_config(dict(alone, database_iam_user=iam_user))

    def test_password_projector_still_connects_on_5432_with_iam_enabled(self):
        from unittest.mock import patch
        from mw_integration_agent import receipt_projection
        config = self.business(database_auth='iam', agent_database_auth='iam',
                               database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam', receipt_environment='prod')
        with patch('mw_integration_agent.receipt_projection.receipt_audit.plan', side_effect=RuntimeError('guard passed')):
            with self.assertRaisesRegex(RuntimeError, 'guard passed'):
                receipt_projection.project(config, {}, {})


class RetiredConversationTests(unittest.TestCase):
    """R091: the conversation providers and services are gone; the receipt providers keep the Codex paths."""

    def example(self, **changes):
        config = load_json(ROOT / "config.example.json")
        config.update(changes)
        return config

    def test_codex_paths_are_required_only_where_codex_runs(self):
        bare = {k: v for k, v in self.example().items() if k not in ("codex_executable", "codex_home")}
        with self.assertRaisesRegex(ConfigurationError, "codex_executable"):
            validate_config(bare)  # codex receipt extraction by default
        validate_config(dict(bare, receipt_extraction_provider="gemini"))
        with self.assertRaisesRegex(ConfigurationError, "codex_home"):
            validate_config(dict(bare, receipt_extraction_provider="gemini", codex_home="relative/path"))

    def test_catalogue_refuses_the_retired_services(self):
        from mw_integration_agent.config import RETIRED_SERVICES
        catalogue = load_json(ROOT / "service-catalogue.json")
        self.assertEqual(catalogue["revision"], 33)  # R102 added chat_messages_relay after R091's revision 32
        self.assertEqual(RETIRED_SERVICES & set(catalogue["services"]), set())
        validate_catalogue(catalogue)
        for name in sorted(RETIRED_SERVICES):
            for enabled in (False, True):
                broken = json.loads(json.dumps(catalogue))
                broken["services"][name] = {"enabled": enabled, "implemented": True}
                with self.subTest(service=name, enabled=enabled), self.assertRaisesRegex(ConfigurationError, "retired service: " + name):
                    validate_catalogue(broken)
