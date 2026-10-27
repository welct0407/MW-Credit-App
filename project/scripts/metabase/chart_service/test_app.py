import hashlib
import unittest
from app import ChartApp


class AppTests(unittest.TestCase):
    def setUp(self):
        self.calls = 0
        def load():
            self.calls += 1
            return [{"borrower_id":"demo", "name":"Demo", "category":"Star", "plot_x":20,"plot_y":80}]
        self.app = ChartApp({"secret_sha256":hashlib.sha256(b"test-key").hexdigest()}, load)

    def call(self, key="test-key", path="/api/matrix", method="GET", query=""):
        result = {}
        def start(status, headers):
            result.update(status=status, headers=dict(headers))
        body = b"".join(self.app({"PATH_INFO":path,"QUERY_STRING":query,"REQUEST_METHOD":method,
                                  "HTTP_AUTHORIZATION":"Bearer "+key},start))
        return result, body

    def test_missing_wrong_key_never_queries_database(self):
        for key in ("", "wrong", "x"*300):
            self.assertTrue(self.call(key=key)[0]["status"].startswith("401"))
        self.assertEqual(self.calls,0)

    def test_valid_request_returns_data(self):
        result,body=self.call()
        self.assertEqual(result['status'],'200 OK')
        self.assertIn(b'Demo',body)

    def test_cache_and_concurrency_budget(self):
        self.call();self.call()
        self.assertEqual(self.calls,1)
        self.app.rate_count=120
        self.assertTrue(self.call()[0]['status'].startswith('429'))

    def test_query_and_method_rejected(self):
        self.assertTrue(self.call(query='sql=anything')[0]['status'].startswith('400'))
        self.assertTrue(self.call(method='POST')[0]['status'].startswith('405'))
        self.assertEqual(self.calls,0)

    def test_static_shell_contains_no_private_data(self):
        result,body=self.call(key='',path='/')
        self.assertEqual(result['status'],'200 OK')
        self.assertNotIn(b'test-key',body)
        self.assertNotIn(b'Demo',body)
        self.assertEqual(self.calls,0)

    def test_headers(self):
        result,_=self.call()
        self.assertEqual(result['headers']['Cache-Control'],'no-store')
        self.assertIn('frame-ancestors https://reports.mw-credit.com',result['headers']['Content-Security-Policy'])
        self.assertNotIn('Access-Control-Allow-Origin',result['headers'])

    def test_fail_closed_source_failure(self):
        def fail(): raise RuntimeError('private-password-and-sql')
        self.app.loader=fail
        result,body=self.call()
        self.assertTrue(result['status'].startswith('503'))
        self.assertNotIn(b'private-password',body)

    def test_client_keeps_fragment_values_in_memory(self):
        _,script=self.call(key='',path='/chart.js')
        for banned in (b'localStorage',b'sessionStorage',b'document.cookie',b'import('):
            self.assertNotIn(banned,script)
        self.assertIn(b"history.replaceState(null, '', location.pathname)",script)
        self.assertIn(b"Authorization:'Bearer '+secret",script)
        # detail is whitelisted to digits only (dashboard:tab) and defaults to dashboard 3 tab 105
        self.assertIn(rb"/^(\d{1,9}):(\d{1,9})$/",script)
        self.assertIn(b"[null, '3', '105']",script)
        _,shell=self.call(key='',path='/')
        self.assertNotIn(b'<script src="http',shell)
        self.assertEqual(self.calls,0)

    def test_unknown_path(self):
        self.assertTrue(self.call(path='/../config.json')[0]['status'].startswith('404'))

    def test_rotation(self):
        self.app.digest=hashlib.sha256(b'replacement').digest()
        self.assertTrue(self.call()[0]['status'].startswith('401'))
        self.assertEqual(self.call(key='replacement')[0]['status'],'200 OK')


if __name__=='__main__': unittest.main(verbosity=2)
