"""Offline mocks only; never invoke real gcloud or UserInfo."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location('identity', Path(__file__).with_name('cloud-shell-google-identity.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
TOKEN = 'synthetic-token-never-real'
GOOD = {'sub': 'synthetic-sub', 'email': m.OWNER, 'email_verified': True, 'other': 'must-not-output'}


class Tests(unittest.TestCase):
    def identity(self, active=m.OWNER, impersonation='(unset)', payload=GOOD):
        obj = m.Identity()
        calls = []
        def command(*args):
            calls.append(args)
            if args[:2] == ('auth', 'list'):
                self.assertFalse(any(a.startswith('--account') for a in args))
                return json.dumps([{'account': active, 'status': 'ACTIVE'}]).encode()
            if args[0] == 'config':
                return impersonation.encode()
            self.assertEqual(args, ('auth', 'print-access-token', '--account='+m.OWNER))
            return TOKEN.encode()
        obj.command = command
        obj.userinfo = lambda token: (self.assertEqual(token, TOKEN) or payload)
        return obj, calls

    def test_success_only_public_identity_fields(self):
        obj, calls = self.identity()
        with patch.dict(m.os.environ, {}, clear=True), patch.object(m.shutil, 'which', return_value='/synthetic/gcloud'):
            result = obj.verify()
        self.assertEqual(result, {k: GOOD[k] for k in ('sub', 'email', 'email_verified')})
        self.assertNotIn(TOKEN, json.dumps(result)+repr(calls))

    def test_wrong_active_or_impersonation_stops_before_token(self):
        for active, imp in [('other@example.com', '(unset)'), (m.OWNER, 'service@example.com')]:
            obj, calls = self.identity(active, imp)
            with patch.dict(m.os.environ, {}, clear=True), patch.object(m.shutil, 'which', return_value='gcloud'):
                with self.assertRaises(m.Stop): obj.verify()
            self.assertFalse(any('print-access-token' in c for c in calls))

    def test_credential_overrides_stop(self):
        for name in ['CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_ACCESS_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS']:
            obj, calls = self.identity()
            with patch.dict(m.os.environ, {name: 'synthetic'}, clear=True):
                with self.assertRaises(m.Stop): obj.verify()
            self.assertEqual(calls, [])

    def test_invalid_owner_claims_stop(self):
        for payload in [{**GOOD, 'sub': ''}, {**GOOD, 'sub': 'unsafe\n'}, {**GOOD, 'email': 'other@example.com'}, {**GOOD, 'email_verified': False}, {**GOOD, 'email_verified': 'true'}, []]:
            obj, _ = self.identity(payload=payload)
            with patch.dict(m.os.environ, {}, clear=True), patch.object(m.shutil, 'which', return_value='gcloud'):
                with self.assertRaises(m.Stop): obj.verify()

    def test_command_captures_and_never_replays_sdk_token(self):
        obj = m.Identity();obj.gcloud = '/synthetic/gcloud'
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, TOKEN.encode(), TOKEN.encode())) as run:
            with self.assertRaises(m.Stop) as error: obj.command('auth', 'print-access-token')
        self.assertNotIn(TOKEN, str(error.exception))
        args, kwargs = run.call_args
        self.assertNotIn(TOKEN, repr(args));self.assertEqual(kwargs['stdout'], subprocess.PIPE)
        self.assertEqual(kwargs['stderr'], subprocess.PIPE)
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_DISABLE_FILE_LOGGING'], 'true')
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')

    def test_userinfo_uses_exact_https_header_and_verifies_tls(self):
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def geturl(self): return m.USERINFO
            def read(self, size): self.limit = size;return json.dumps(GOOD).encode()
        response = Response()
        with patch.object(m.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value = response
            result = m.Identity().userinfo(TOKEN)
        handlers = build.call_args.args
        self.assertIsInstance(handlers[0], m.NoRedirect)
        self.assertTrue(handlers[1]._context.check_hostname)
        self.assertEqual(handlers[1]._context.verify_mode, m.ssl.CERT_REQUIRED)
        request = build.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, m.USERINFO)
        self.assertEqual(request.get_method(), 'GET');self.assertEqual(request.data, None)
        self.assertEqual(request.get_header('Authorization'), 'Bearer '+TOKEN)
        self.assertEqual(response.limit, m.LIMIT+1);self.assertEqual(result, GOOD)

    def test_scope_failure_no_fallback_and_no_diagnostics(self):
        with patch.object(m.urllib.request, 'build_opener') as build:
            build.return_value.open.side_effect = urllib.error.HTTPError(m.USERINFO, 403, TOKEN, {}, None)
            with self.assertRaises(m.Stop) as error: m.Identity().userinfo(TOKEN)
        self.assertNotIn(TOKEN, str(error.exception));self.assertIn('scope', str(error.exception))
        self.assertEqual(build.return_value.open.call_count, 1)

    def test_redirect_never_forwards_bearer(self):
        with self.assertRaises(m.Stop): m.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example')

    def test_main_needs_human_terminal_and_outputs_no_token_on_exception(self):
        for terminal in [False, True]:
            out, err = io.StringIO(), io.StringIO()
            with patch.object(m.sys, 'argv', ['helper']), patch.object(m.sys.stdin, 'isatty', return_value=terminal), patch.object(m.sys.stdout, 'isatty', return_value=terminal), patch.object(m.Identity, 'verify', side_effect=RuntimeError(TOKEN)) as verify, contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                # StringIO replacements have their own isatty, so patch those too.
                with patch.object(out, 'isatty', return_value=terminal): self.assertEqual(m.main(), 1)
            self.assertNotIn(TOKEN, out.getvalue()+err.getvalue())
            self.assertEqual(verify.call_count, int(terminal))


if __name__ == '__main__': unittest.main()
