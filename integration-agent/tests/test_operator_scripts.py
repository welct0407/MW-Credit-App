"""Operator scripts take the private location from arguments (AGT-QUALITY-03). The reviewer DML setup script and its
tests left with the Instagram Partner conversation (R091)."""
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'


class OperatorScriptTests(unittest.TestCase):
    def test_no_workstation_paths_or_public_addresses_remain(self):
        for path in sorted(SCRIPTS.iterdir()):
            if path.suffix in ('.py', '.sh', '.ps1'):
                text = path.read_text(encoding='utf-8', errors='replace')
                with self.subTest(script=path.name):
                    self.assertNotIn('C:/Users/', text); self.assertNotIn('C:\\Users\\', text)
                    self.assertNotIn('136.85.127.134', text)

    def test_retired_conversation_scripts_are_gone(self):
        for name in ('configure-reviewer-dml.py', 'build-schema-digest.py', 'build-conversation-schema.py', 'conversation-timing.py',
                     'verify-codex-api-planning.py', 'verify-conversation-format.py', 'verify-delete-conversation.py',
                     'verify-partner-conversation.py', 'verify-reviewer-conversation.py', 'verify-postgresql-vm.py'):
            with self.subTest(script=name):
                self.assertFalse((SCRIPTS / name).exists())


if __name__ == '__main__':
    unittest.main()
