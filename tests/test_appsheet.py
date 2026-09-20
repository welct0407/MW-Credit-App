import json
import unittest
from unittest.mock import patch

from mw_integration_agent.appsheet import AppSheet
from mw_integration_agent.config import ConfigurationError


class _Response:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class AppSheetTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "appsheet_app_id": "93844270-6aa5-420b-a960-bcdf08abd357",
            "appsheet_api_base": "https://www.appsheet.com",
        }

    @patch("mw_integration_agent.appsheet.load_secret", return_value="secret")
    @patch("mw_integration_agent.appsheet.urllib.request.urlopen")
    def test_probe_is_bounded_and_omits_rows(self, urlopen, _secret):
        response = _Response()
        response.read = lambda: json.dumps([{"Partner Row ID": "private"}]).encode()
        urlopen.return_value = response
        result = AppSheet(self.config).probe()
        self.assertEqual(result["row_count"], 1)
        self.assertNotIn("rows", result)
        request = urlopen.call_args.args[0]
        body = json.loads(request.data)
        self.assertTrue(body["Properties"]["Selector"].startswith("Top("))

    def test_unbounded_selector_is_rejected(self):
        with self.assertRaises(ConfigurationError):
            AppSheet(self.config).find("Partners", "Filter(Partners, true)")


if __name__ == "__main__":
    unittest.main()
