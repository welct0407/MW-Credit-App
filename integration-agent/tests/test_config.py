import tempfile
import unittest
from pathlib import Path

from mw_integration_agent.config import ConfigurationError, load_json, validate_catalogue, validate_config


ROOT = Path(__file__).resolve().parents[1]


class ConfigurationTests(unittest.TestCase):
    def test_example_is_disabled_and_valid(self):
        validate_config(load_json(ROOT / "config.example.json"))
        validate_catalogue(load_json(ROOT / "service-catalogue.json"))

    def test_native_conversations_start_without_appsheet_keys_ids_or_schema_file(self):
        config=load_json(ROOT/'config.example.json')
        config={k:v for k,v in config.items() if not k.startswith('appsheet_')}
        origin='https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
        config.update(appsheet_enabled=False,partner_conversations_enabled=True,receiver_enabled=True,database_enabled=True,
            instagram_account_id='100',partner_conversation_cutoff='2026-10-12T00:00:00+07:00',
            conversation_api_enabled=True,conversation_api_environment='prod',conversation_api_origin=origin,
            conversation_api_audience=origin,conversation_api_manifest_sha256='a'*64)
        validate_config(config)
        config['conversation_api_enabled']=False
        with self.assertRaisesRegex(ConfigurationError,'native API'):validate_config(config)

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

    def test_reviewer_delete_is_retired(self):
        # Owner decision, 16 October 2026: a configured reviewer_delete_enabled=true fails closed.
        config = load_json(ROOT / 'config.example.json')
        self.assertNotIn('reviewer_delete_enabled', config)
        validate_config(dict(config, reviewer_delete_enabled=False))
        with self.assertRaisesRegex(ConfigurationError, 'retired'):
            validate_config(dict(config, reviewer_delete_enabled=True))
        for value in ('false', 1):
            with self.subTest(value=value), self.assertRaisesRegex(ConfigurationError, 'must be boolean'):
                validate_config(dict(config, reviewer_delete_enabled=value))
        # The native command-API Delete keeps its own switch with the gate the shared switch had.
        with self.assertRaisesRegex(ConfigurationError, 'native Delete requires'):
            validate_config(dict(config, native_delete_enabled=True))
        with self.assertRaisesRegex(ConfigurationError, 'must be boolean'):
            validate_config(dict(config, native_delete_enabled='true'))

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

    def test_database_name_and_roles_must_match_environment(self):
        # ALL-ARCH-02: DEV is a configurable target; its reviewer role is mw_reviewer_dml_dev.
        validate_config(self.business(database_name='loan_manager_dev'))
        with self.assertRaisesRegex(ConfigurationError, 'approved business database'):
            validate_config(self.business(database_name='loan_manager_other'))
        origin = 'https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app'
        reviewer = dict(database_name='loan_manager_dev', partner_conversations_enabled=True, receiver_enabled=True,
                        instagram_account_id='100', partner_conversation_cutoff='2026-10-12T00:00:00+07:00',
                        conversation_api_enabled=True, conversation_api_environment='dev', conversation_api_origin=origin,
                        conversation_api_audience=origin, conversation_api_manifest_sha256='a' * 64,
                        reviewer_dml_enabled=True, reviewer_dml_cutoff='2026-10-12T00:00:00+07:00')
        with self.assertRaisesRegex(ConfigurationError, 'dedicated role'):
            validate_config(self.business(**reviewer))  # example still names the PROD role
        validate_config(self.business(**reviewer, database_dml_user='mw_reviewer_dml_dev'))
        with self.assertRaisesRegex(ConfigurationError, 'dedicated role'):
            validate_config(self.business(**dict(reviewer, database_name='loan_manager_prod', conversation_api_environment='prod',
                                                 conversation_api_origin=origin.replace('-dev-', '-prod-'),
                                                 conversation_api_audience=origin.replace('-dev-', '-prod-')),
                                          database_dml_user='mw_reviewer_dml_dev'))

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

    def test_dml_and_projector_auth_keys_are_separate_from_database_auth(self):
        # ALL-ARCH-03 part 2b: own keys, default 'password'; database_auth='iam' does not move them before V95.
        from mw_integration_agent.config import auth_mode
        origin = 'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
        reviewer = dict(partner_conversations_enabled=True, receiver_enabled=True, instagram_account_id='100',
                        partner_conversation_cutoff='2026-10-12T00:00:00+07:00', conversation_api_enabled=True,
                        conversation_api_environment='prod', conversation_api_origin=origin, conversation_api_audience=origin,
                        conversation_api_manifest_sha256='a' * 64, reviewer_dml_enabled=True,
                        reviewer_dml_cutoff='2026-10-12T00:00:00+07:00', database_auth='iam',
                        database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam')
        config = self.business(**reviewer)
        validate_config(config)
        self.assertEqual((auth_mode(config, 'database_dml_'), auth_mode(config, 'receipt_projector_')), ('password', 'password'))
        with self.assertRaisesRegex(ConfigurationError, 'database_dml_password_file'):
            validate_config(dict(config, database_dml_password_file=None))
        iam = dict(config, database_dml_auth='iam', receipt_projector_auth='iam')
        del iam['database_dml_password_file'], iam['receipt_projector_password_file']
        validate_config(iam)  # no password file under iam
        with self.assertRaisesRegex(ConfigurationError, 'dedicated role'):
            validate_config(dict(iam, database_dml_user='mw_reviewer_dml_dev'))
        for key in ('database_dml_auth', 'receipt_projector_auth'):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ConfigurationError, '^' + key + ' must be password or iam$'):
                    validate_config(dict(config, **{key: 'token'}))
                with self.assertRaisesRegex(ConfigurationError, '^' + key + ' must be password or iam$'):
                    validate_config(dict(config, **{key: True}))
                # 'iam' needs the IAM user and the fixed IAM listener, even with the database_auth path on passwords.
                alone = dict(self.business(), **{key: 'iam'})
                with self.assertRaisesRegex(ConfigurationError, 'database_iam_user'):
                    validate_config(alone)
                for change in ({'database_iam_user': 'someone@example.com'}, {'iam_database_port': 5432}):
                    with self.assertRaises(ConfigurationError):
                        validate_config(dict(iam, **change))
                validate_config(dict(alone, database_iam_user=reviewer['database_iam_user']))

    def test_password_roles_still_connect_on_5432_with_iam_enabled(self):
        # Orchestrator correction: reviewer DML and the receipt projector keep password files until W4.
        from unittest.mock import patch
        from mw_integration_agent import conversation_dml, receipt_projection
        config = self.business(database_auth='iam', agent_database_auth='iam',
                               database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam',
                               receipt_environment='prod', database_dml_user='mw_reviewer_dml')
        with tempfile.TemporaryDirectory() as secrets:
            config['secrets_directory'] = secrets
            config['database_dml_password_file'] = str(Path(secrets) / 'dml.txt')
            Path(secrets, 'dml.txt').write_text('synthetic')
            class Conn:
                def __enter__(self): return self
                def __exit__(self, *_): return False
                def execute(self, *_): return self
                def rollback(self): return None
            with patch('psycopg.connect', return_value=Conn()) as connect:
                with conversation_dml.connect(config):
                    pass
            self.assertEqual((connect.call_args.kwargs['port'], connect.call_args.kwargs['user'], connect.call_args.kwargs['dbname']),
                             (5432, 'mw_reviewer_dml', 'loan_manager_prod'))
            with patch('mw_integration_agent.receipt_projection.receipt_audit.plan', side_effect=RuntimeError('guard passed')):
                with self.assertRaisesRegex(RuntimeError, 'guard passed'):
                    receipt_projection.project(config, {}, {})


if __name__ == "__main__":
    unittest.main()
