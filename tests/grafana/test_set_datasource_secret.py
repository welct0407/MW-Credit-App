import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/grafana'))
import set_datasource_secret as s

FAKE = 'synthetic-Value_0123456789'  # synthetic, never a real secret

def pg():
    return {'uid': 'mw-agent-receipts', 'name': 'MW receipts', 'type': 'grafana-postgresql-datasource', 'access': 'proxy',
            'url': '127.0.0.1:5432', 'user': 'mw_grafana_reader', 'database': '', 'basicAuth': False, 'isDefault': False,
            'jsonData': {'database': 'mw_agent', 'enableSecureSocksProxy': True}, 'version': 3, 'secureJsonFields': {}}

class Pairs(unittest.TestCase):
    def test_receipts_pair(self):
        self.assertEqual(s.PAIRS['mw-agent-receipts'][:2], ('password', 'mw-grafana-agent-reader-password'))

    def test_pair_matches_terraform(self):
        owned = json.loads((ROOT / 'infrastructure/grafana/owned-services.tf.json').read_text())['resource']['grafana_data_source']
        by_uid = {v['uid']: v for v in owned.values()}
        for uid in s.PAIRS: self.assertIn(uid, by_uid)
        ds = by_uid['mw-agent-receipts']
        self.assertEqual((ds['type'], ds['username']), ('grafana-postgresql-datasource', 'mw_grafana_reader'))
        self.assertEqual(json.loads(ds['json_data_encoded'])['database'], 'mw_agent')
        self.assertIn('secure_json_data_encoded', ds['lifecycle']['ignore_changes'])
        self.assertNotIn('secure_json_data_encoded', ds)

class Values(unittest.TestCase):
    def test_password_format(self):
        pattern = s.PAIRS['mw-agent-receipts'][2]
        s.check_value(FAKE, pattern)
        for bad in ('short', FAKE + '\n', FAKE + ' x', ''):
            with self.assertRaises(ValueError): s.check_value(bad, pattern)

class Body(unittest.TestCase):
    def test_keeps_login_and_sets_only_field(self):
        body = s.update_body(pg(), 'mw-agent-receipts', 'password', FAKE)
        self.assertEqual(body['user'], 'mw_grafana_reader')
        self.assertEqual(body['jsonData']['database'], 'mw_agent')
        self.assertEqual(body['secureJsonData'], {'password': FAKE})
        self.assertEqual(body['version'], 3)
        self.assertNotIn('secureJsonFields', body)

    def test_uid_mismatch(self):
        with self.assertRaises(ValueError): s.update_body(pg(), 'mw-agent-questions', 'password', FAKE)

    def test_after_checks(self):
        before = pg()
        after = dict(pg(), version=4, secureJsonFields={'password': True})
        s.check_after(before, after, 'password')
        with self.assertRaises(ValueError): s.check_after(before, dict(after, secureJsonFields={}), 'password')
        with self.assertRaises(ValueError): s.check_after(before, dict(after, user=''), 'password')
        with self.assertRaises(ValueError): s.check_after(before, dict(after, jsonData={}), 'password')

if __name__ == '__main__': unittest.main()
