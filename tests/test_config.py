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

    def test_enabled_unimplemented_service_fails_closed(self):
        catalogue = load_json(ROOT / "service-catalogue.json")
        catalogue["services"]["partner_oltp_gui"]["enabled"] = True
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


if __name__ == "__main__":
    unittest.main()
