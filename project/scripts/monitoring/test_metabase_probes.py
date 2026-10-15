import unittest
from unittest.mock import patch
import metabase_probes as m


class ProbeTests(unittest.TestCase):
    def test_slow_success_and_denied_probe(self):
        self.assertEqual(m.classify(True, 6, 200), 2)
        self.assertEqual(m.classify(False, 1, 403), 4)
        self.assertEqual(m.classify(False, 1, 503), 0)

    @patch('metabase_probes.request', return_value=(202, '{"status":"completed","data":{"rows":[[1]]}}'))
    @patch('metabase_probes.Path.read_text', return_value='synthetic')
    def test_metabase_completed_202(self, *_):
        self.assertEqual(m.probe('metabase_reporting')['status'], 1)

    @patch('metabase_probes.request', return_value=(202, '{"status":"failed","data":{"rows":[]}}'))
    @patch('metabase_probes.Path.read_text', return_value='synthetic')
    def test_failed_query_never_green(self, *_):
        self.assertEqual(m.probe('metabase_reporting')['status'], 0)

    @patch('metabase_probes.request', side_effect=[(200, '<title>Borrower portfolio · custom matrix</title>'), (200, '{}')])
    def test_chart_api_must_remain_protected(self, *_):
        self.assertEqual(m.probe('metabase_charts')['status'], 0)

    @patch('metabase_probes.request', side_effect=TimeoutError)
    def test_timeout_is_down(self, *_):
        self.assertEqual(m.probe('metabase_platform')['status'], 0)


if __name__ == '__main__':
    unittest.main()
