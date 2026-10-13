"""Retired transport cannot be invoked; native probe remains available."""
import contextlib
import io
import unittest
from mw_integration_agent.cli import build_parser

class AppSheetRetirementTests(unittest.TestCase):
    def test_retired_probe_is_rejected_before_configuration_or_network(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            build_parser().parse_args(["appsheet-probe", "--config", "/missing", "--catalogue", "/missing"])
        self.assertEqual(error.exception.code, 2)

    def test_native_probe_accepts_each_scope(self):
        for scope in ("oltp", "olap"):
            parsed = build_parser().parse_args(["native-api-probe", "--config", "/config", "--catalogue", "/catalogue", "--scope", scope])
            self.assertEqual(parsed.scope, scope)
