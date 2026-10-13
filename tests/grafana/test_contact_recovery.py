import copy
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'scripts/grafana'))
import contact_recovery as recovery

class ContactRecoveryTests(unittest.TestCase):
    def fixture(self):
        return [
            {'uid':'efz3im8pyaewwa','name':'MW Performance IRM','type':'oncall','settings':{'url':'https://oncall-prod-us-central-0.grafana.net/synthetic'}},
            {'uid':'fg03yg7dpxjwgb','name':'MW Performance IRM','type':'webhook','settings':{'url':'https://alerts.mw-credit.com/grafana','hmacConfig':{'secret':{'secretManagerReference':copy.deepcopy(recovery.HMAC)}}}},
        ]
    def test_exact_reference(self):
        recovery.validate(self.fixture())
    def test_wrong_identity(self):
        x=self.fixture(); x[0]['uid']='other'
        with self.assertRaises(ValueError): recovery.validate(x)
    def test_wrong_route(self):
        x=self.fixture(); x[0]['name']='other'
        with self.assertRaises(ValueError): recovery.validate(x)
    def test_wrong_endpoint(self):
        x=self.fixture(); x[1]['settings']['url']='https://example.com/grafana'
        with self.assertRaises(ValueError): recovery.validate(x)
    def test_masked_or_new_hmac_refused(self):
        for value in ['********', {'secretManagerReference':{'secret':'new','version':'1','arrayIndex':0}}]:
            x=self.fixture(); x[1]['settings']['hmacConfig']['secret']=value
            with self.assertRaises(ValueError): recovery.validate(x)

if __name__=='__main__': unittest.main()
