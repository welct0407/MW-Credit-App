import unittest
from unittest.mock import patch
from mw_integration_agent.appsheet import AppSheet
from mw_integration_agent.config import ConfigurationError


class AppConnectionTests(unittest.TestCase):
    def test_separate_keys_and_default_oltp(self):
        config={'appsheet_app_id':'oltp','appsheet_key_file':'/secrets/oltp',
                'appsheet_olap_app_id':'olap','appsheet_olap_key_file':'/secrets/olap'}
        self.assertEqual(AppSheet(config).config['appsheet_key_file'],'/secrets/oltp')
        client=AppSheet(config,'olap')
        self.assertEqual(client.config['appsheet_app_id'],'olap')
        self.assertEqual(client.config['appsheet_key_file'],'/secrets/olap')
        self.assertEqual(config['appsheet_app_id'],'oltp')
        with patch.object(client,'find',return_value=[{}]):
            self.assertEqual(client.probe()['app'],'olap')

    def test_missing_or_unknown_app_denied(self):
        with self.assertRaises(ConfigurationError): AppSheet({},'other')
        with self.assertRaises(ConfigurationError): AppSheet({},'olap')
