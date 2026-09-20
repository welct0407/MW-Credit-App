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

    def test_enabled_unimplemented_service_fails_closed(self):
        catalogue = load_json(ROOT / "service-catalogue.json")
        catalogue["services"]["signed_webhook_ingress"]["enabled"] = True
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


if __name__ == "__main__":
    unittest.main()
