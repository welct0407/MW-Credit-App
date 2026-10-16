"""App Server client against a fake stdio codex (AGT-TEST-03): tool routing, denied built-ins, bindings, timeouts."""
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent.codex_conversation import DISABLED, CodexConversation
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.conversation_store import ConversationStore

FAKE = '''#!__PYTHON__
import json, os, sys
scenario = json.loads(open("scenario.json").read()) if os.path.exists("scenario.json") else {}
open("argv.json", "w").write(json.dumps(sys.argv[1:]))
open("env.json", "w").write(json.dumps(sorted(os.environ)))
def send(message):
    sys.stdout.write(json.dumps(message) + "\\n"); sys.stdout.flush()
def recv():
    line = sys.stdin.readline()
    return json.loads(line) if line else None
while True:
    message = recv()
    if message is None:
        break
    method = message.get("method")
    if method == "initialize":
        send({"id": message["id"], "result": {}})
    elif method == "thread/start":
        open("thread-start.json", "w").write(json.dumps(message["params"]))
        send({"id": message["id"], "result": {"thread": {"id": "thread-1"}}})
    elif method == "thread/resume":
        send({"id": message["id"], "result": {"thread": {"id": scenario.get("resume_as", message["params"]["threadId"])}}})
    elif method == "turn/start":
        send({"id": message["id"], "result": {"turn": {"id": "turn-1"}}})
        kind = scenario.get("kind", "complete")
        if kind == "tool":
            send({"id": 100, "method": "item/tool/call", "params": {"threadId": "thread-1", "turnId": "turn-1",
                  "tool": "finish", "arguments": {"message": "hi"}, "callId": "c1"}})
            open("tool-reply.json", "w").write(json.dumps(recv()))
            send({"id": 101, "method": "item/tool/call", "params": {"threadId": "thread-1", "turnId": "turn-1",
                  "tool": "finish", "arguments": {}, "callId": "c2", "namespace": "mcp"}})
            open("namespaced-reply.json", "w").write(json.dumps(recv()))
        elif kind == "builtin":
            send({"method": "item/started", "params": {"threadId": "thread-1", "item": {"type": "commandExecution"}}})
            continue
        elif kind == "silence":
            continue
        send({"method": "turn/completed", "params": {"threadId": "thread-1", "turn": {"id": "turn-1", "status": "completed"}}})
'''.replace('__PYTHON__', sys.executable)


class CodexConversationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.executable = root / 'fake-codex'
        self.executable.write_text(FAKE, encoding='utf-8')
        self.executable.chmod(self.executable.stat().st_mode | stat.S_IXUSR)
        home = root / 'codex-home'; home.mkdir(); (home / 'auth.json').write_text('{}')
        self.config = {'state_directory': str(root / 'state'), 'codex_executable': str(self.executable),
                       'codex_home': str(home), 'conversation_timeout_seconds': 30}
        self.store = ConversationStore(root / 'conversations.db'); self.addCleanup(self.store.db.close)
        self.calls = []
        self.folder = Path(self.config['state_directory']) / 'partner-conversations' / 'binding-1'

    def conversation(self):
        return CodexConversation(self.config, 'binding-1', self.store, [{'name': 'finish'}],
                                 lambda name, arguments, call_id: self.calls.append((name, arguments, call_id)) or {'ok': True})

    def scenario(self, **value):
        self.folder.mkdir(parents=True, exist_ok=True)
        (self.folder / 'scenario.json').write_text(json.dumps(value))

    def test_disabled_features_filtered_env_and_host_tool_routing(self):
        self.scenario(kind='tool')
        with patch.dict(os.environ, {'PATH': os.environ.get('PATH', '/usr/bin'), 'SECRET_MARKER': 'leak', 'HOME': self.tmp.name}):
            self.conversation().run('instructions', 'request')
        argv = json.loads((self.folder / 'argv.json').read_text())
        self.assertEqual(argv[:3], ['app-server', '--listen', 'stdio://'])
        for feature in DISABLED:
            self.assertIn(feature, [argv[i + 1] for i, a in enumerate(argv) if a == '--disable'])
        env = json.loads((self.folder / 'env.json').read_text())
        self.assertNotIn('SECRET_MARKER', env)
        # LC_CTYPE is added by the interpreter's locale coercion, not passed by the agent.
        self.assertLessEqual(set(env), {'PATH', 'HOME', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'CODEX_HOME', 'LC_CTYPE'})
        self.assertEqual(self.calls, [('finish', {'message': 'hi'}, 'c1')])
        reply = json.loads((self.folder / 'tool-reply.json').read_text())
        self.assertEqual((reply['id'], reply['result']['success']), (100, True))
        self.assertEqual(json.loads(reply['result']['contentItems'][0]['text']), {'ok': True})
        denied = json.loads((self.folder / 'namespaced-reply.json').read_text())
        self.assertEqual((denied['id'], denied['error']['code']), (101, -32601))
        self.assertEqual(self.store.thread('binding-1'), 'thread-1')
        started = json.loads((self.folder / 'thread-start.json').read_text())
        self.assertEqual((started['approvalPolicy'], started['sandbox'], started['ephemeral']), ('never', 'read-only', False))
        self.assertTrue((self.folder / 'codex-home' / 'auth.json').is_symlink())

    def test_builtin_tool_use_is_refused(self):
        self.scenario(kind='builtin')
        with self.assertRaisesRegex(ConfigurationError, 'UNEXPECTED_BUILTIN_TOOL'):
            self.conversation().run('instructions', 'request')

    def test_missing_sign_in_and_foreign_config_fail_before_launch(self):
        (Path(self.config['codex_home']) / 'auth.json').unlink()
        with self.assertRaisesRegex(ConfigurationError, 'CODEX_SIGN_IN_UNAVAILABLE'):
            self.conversation().run('instructions', 'request')
        (Path(self.config['codex_home']) / 'auth.json').write_text('{}')
        (self.folder / 'codex-home').mkdir(parents=True, exist_ok=True)
        (self.folder / 'codex-home' / 'config.toml').write_text('model = "other"')
        with self.assertRaisesRegex(ConfigurationError, 'UNEXPECTED_CONVERSATION_CONFIG'):
            self.conversation().run('instructions', 'request')
        self.assertFalse((self.folder / 'argv.json').exists())

    def test_resumed_thread_must_keep_its_identity(self):
        self.store.bind('binding-1', 'thread-old')
        self.scenario(resume_as='thread-other')
        with self.assertRaisesRegex(ConfigurationError, 'CONVERSATION_THREAD_MISMATCH'):
            self.conversation().run('instructions', 'request')
        self.assertEqual(self.store.thread('binding-1'), 'thread-old')

    def test_silence_times_out_without_replay(self):
        self.scenario(kind='silence')
        clock = iter([0.0] + [100.0] * 1000)
        with patch('mw_integration_agent.codex_conversation.time.monotonic', side_effect=lambda: next(clock)):
            with self.assertRaisesRegex(ConfigurationError, 'CONVERSATION_TIMEOUT_NO_REPLAY'):
                self.conversation().run('instructions', 'request')


if __name__ == '__main__':
    unittest.main()
