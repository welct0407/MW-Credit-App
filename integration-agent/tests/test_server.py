"""Signed receiver on a loopback port: liveness, readiness checks, ingress limits and error lines (R063)."""
import http.client
import io
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import cli, server
from mw_integration_agent.config import load_json

ROOT = Path(__file__).resolve().parents[1]
COMMIT = 'c' * 40
POSTGRES = dict(state_backend='postgres', agent_database_host='127.0.0.1', agent_database_port=5432,
                agent_database_name='mw_agent',
                state_generation='11111111-1111-4111-8111-111111111111', state_cutover_at='2026-10-01T00:00:00+07:00')


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Fixture:
    """Temporary SQLite-backend receiver configuration, catalogue and secret files."""
    def __init__(self, directory, **overrides):
        root = Path(directory)
        secrets = root / 'secrets'; secrets.mkdir()
        (secrets / 'app.txt').write_text('app-secret\n'); (secrets / 'verify.txt').write_text('verify-token\n')
        (secrets / 'token.txt').write_text('token\n'); (root / 'state').mkdir()
        self.config = load_json(ROOT / 'config.example.json')
        self.config.update(receiver_enabled=True, instagram_account_id='100', secrets_directory=str(secrets),
                           state_directory=str(root / 'state'), meta_app_secret_file=str(secrets / 'app.txt'),
                           webhook_verify_token_file=str(secrets / 'verify.txt'),
                           instagram_token_file=str(secrets / 'token.txt'), code_version=COMMIT,
                           agent_database_worker_password_file=str(secrets / 'worker.txt'),
                           agent_database_relay_password_file=str(secrets / 'relay.txt'), **overrides)
        self.catalogue = load_json(ROOT / 'service-catalogue.json')
        self.catalogue['services']['signed_webhook_ingress'] = {'enabled': True, 'implemented': True}
        self.config_path, self.catalogue_path, self.secrets = root / 'config.json', root / 'catalogue.json', secrets
        self.write()

    def write(self):
        self.config_path.write_text(json.dumps(self.config))
        self.catalogue_path.write_text(json.dumps(self.catalogue))


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.fixture = Fixture(self.directory.name)
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), server.handler(str(self.fixture.config_path), str(self.fixture.catalogue_path)))
        self.port = self.httpd.server_address[1]
        self.fixture.config['listen_port'] = self.port; self.fixture.write()
        server.record_startup(self.fixture.config)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.directory.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, response.read().decode()
        finally:
            conn.close()

    def ready(self, **headers):
        status, body = self.request('GET', '/ready', headers=headers)
        return status, json.loads(body)

    def test_health_is_unchanged_liveness(self):
        self.assertEqual(self.request('GET', '/health'), (200, 'mw-instagram-webhook'))

    def test_ready_reports_code_version_and_no_failures(self):
        status, body = self.ready()
        self.assertEqual(status, 200)
        self.assertEqual(body, {'ready': True, 'code_version': COMMIT, 'started_at': server.STARTUP['started_at'], 'failed': []})

    def test_each_failed_check_is_named_without_detail(self):
        cases = {'config': lambda f: f.config.update(receiver_enabled=False),
                 'catalogue': lambda f: f.catalogue['services'].update(signed_webhook_ingress={'enabled': False, 'implemented': True}),
                 'secrets': lambda f: (f.secrets / 'verify.txt').write_text(''),
                 'current': lambda f: f.config.update(code_version='d' * 40)}
        for name, change in cases.items():
            with self.subTest(check=name):
                self.tearDown(); self.setUp()
                change(self.fixture); self.fixture.write()
                status, body = self.ready()
                self.assertEqual(status, 503)
                self.assertFalse(body['ready'])
                self.assertIn(name, body['failed'])
                self.assertEqual(set(body), {'ready', 'code_version', 'started_at', 'failed'})
                self.assertNotIn(self.directory.name, json.dumps(body))
        self.assertEqual(self.ready()[1]['failed'], ['current'])

    def test_replaced_package_is_not_current(self):
        with patch.object(server, 'package_sha256', return_value='0' * 64):
            self.assertEqual(self.ready(), (503, {'ready': False, 'code_version': COMMIT,
                                                  'started_at': server.STARTUP['started_at'], 'failed': ['current']}))

    def test_state_check_uses_postgres_transaction_only_for_postgres(self):
        with patch('mw_integration_agent.state.transaction') as transaction:
            self.assertEqual(self.ready()[0], 200)
            transaction.assert_not_called()
        self.fixture.config.update(POSTGRES); self.fixture.write(); server.record_startup(self.fixture.config)
        with patch('mw_integration_agent.state.transaction', side_effect=RuntimeError('proxy down')) as transaction:
            status, body = self.ready()
            transaction.assert_called_once()
        self.assertEqual((status, body['failed']), (503, ['state']))
        self.assertNotIn('proxy down', json.dumps(body))
        connection = patch('mw_integration_agent.state.transaction')
        with connection as transaction:
            self.assertEqual(self.ready()[0], 200)
            transaction.return_value.__enter__.return_value.execute.assert_called_once_with('SELECT 1')

    def test_budget_exceeded_fails_unfinished_checks(self):
        self.fixture.config.update(POSTGRES); self.fixture.write(); server.record_startup(self.fixture.config)

        @contextmanager
        def slow(_config):
            time.sleep(5)
            yield None
        with patch('mw_integration_agent.state.transaction', slow):
            started = time.monotonic()
            status, body = self.ready()
            elapsed = time.monotonic() - started
        self.assertLess(elapsed, 3.5)
        self.assertEqual(status, 503)
        self.assertEqual(body['failed'], ['state', 'current'])
        self.assertIs(body['budget_exceeded'], True)

    def test_ready_is_not_served_through_the_tunnel(self):
        self.assertEqual(self.request('GET', '/ready', headers={'Cf-Ray': 'x'}), (404, 'Not found'))
        self.assertEqual(self.request('GET', '/ready', headers={'CF-Connecting-IP': '203.0.113.1'}), (404, 'Not found'))

    def test_post_limits_and_signature(self):
        self.assertEqual(self.request('POST', '/instagram', body=b'{}'), (403, 'Forbidden'))
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        conn.putrequest('POST', '/instagram'); conn.putheader('Content-Length', '2'); conn.putheader('Transfer-Encoding', 'chunked')
        conn.endheaders(); response = conn.getresponse()
        self.assertEqual((response.status, response.read()), (413, b'Invalid size')); conn.close()
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        conn.putrequest('POST', '/instagram'); conn.putheader('Content-Length', str(1024 * 1024 + 1)); conn.endheaders()
        response = conn.getresponse()
        self.assertEqual((response.status, response.read()), (413, b'Invalid size')); conn.close()

    def signed(self, raw):
        import hashlib as _hashlib
        import hmac
        return {'X-Hub-Signature-256': 'sha256=' + hmac.new(b'app-secret', raw, _hashlib.sha256).hexdigest()}

    def journal_rows(self):
        import sqlite3
        path = Path(self.fixture.config['state_directory']) / 'instagram-ingress.db'
        if not path.exists():
            return 0
        with sqlite3.connect(path) as db:
            return db.execute('SELECT count(*) FROM receipts').fetchone()[0]

    def test_malformed_requests_are_client_errors_and_switches_are_read_per_request(self):
        # AGT-WEBHOOK-05: unparsable length and non-object bodies are 400s; the catalogue switch acts without a restart.
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        conn.putrequest('POST', '/instagram'); conn.putheader('Content-Length', 'abc'); conn.endheaders()
        response = conn.getresponse()
        self.assertEqual((response.status, response.read()), (400, b'Invalid length')); conn.close()
        self.assertEqual(self.request('POST', '/instagram', body=b'[1]', headers=self.signed(b'[1]')), (400, 'Invalid body'))
        self.assertEqual(self.request('POST', '/instagram', body=b'[1]'), (403, 'Forbidden'))  # unsigned probes stay 403
        self.assertEqual(self.journal_rows(), 0)
        valid = json.dumps({'object': 'instagram', 'entry': []}).encode()
        self.assertEqual(self.request('POST', '/instagram', body=valid, headers=self.signed(valid)), (200, 'EVENT_RECEIVED'))
        self.assertEqual(self.journal_rows(), 1)
        self.fixture.catalogue['services']['signed_webhook_ingress']['enabled'] = False; self.fixture.write()
        self.assertEqual(self.request('POST', '/instagram', body=valid, headers=self.signed(valid)), (503, 'Receiver disabled'))
        self.assertEqual(self.journal_rows(), 1)

    def test_capture_wakes_receipt_cycle_only_for_new_actionable_messages(self):
        wake = Path(self.fixture.config['state_directory']) / 'receipt-wake'
        def payload(mid, text='', image=False, reply=None):
            message = {'mid': mid, 'text': text}
            if image:message['attachments'] = [{'type': 'image', 'payload': {'url': 'https://cdn.invalid/receipt'}}]
            if reply:message['reply_to'] = {'mid': reply}
            return json.dumps({'object': 'instagram', 'entry': [{'id': '100', 'messaging': [
                {'sender': {'id': '200'}, 'recipient': {'id': '100'}, 'timestamp': int(time.time() * 1000), 'message': message}]}]}).encode()
        def post(raw, signed=True):
            return self.request('POST', '/instagram', body=raw, headers=self.signed(raw) if signed else {})
        image = payload('m1', image=True)
        self.assertEqual(post(image, signed=False), (403, 'Forbidden')); self.assertFalse(wake.exists())
        self.assertEqual(post(payload('m0', text='hello')), (200, 'EVENT_RECEIVED')); self.assertFalse(wake.exists())
        self.assertEqual(post(image), (200, 'EVENT_RECEIVED')); self.assertTrue(wake.exists())
        wake.unlink(); self.assertEqual(post(image), (200, 'EVENT_RECEIVED')); self.assertFalse(wake.exists())
        for raw in (payload('m2', text='yes', reply='out'), payload('m3', text=' Review ')):
            self.assertEqual(post(raw), (200, 'EVENT_RECEIVED')); self.assertTrue(wake.exists()); wake.unlink()
        with patch('mw_integration_agent.receipt_wake.path', return_value=wake.parent / 'missing' / 'receipt-wake'):
            self.assertEqual(post(payload('m4', image=True)), (200, 'EVENT_RECEIVED'))
        self.assertFalse(wake.exists())

    def test_capture_wakes_conversation_cycle_only_for_new_conversation_messages(self):
        # R086: <state_directory>/conversation-wake starts mw-partner-conversation.service through its path unit.
        state = Path(self.fixture.config['state_directory'])
        talk, receipt = state / 'conversation-wake', state / 'receipt-wake'
        def payload(mid, text='', image=False, reply=None):
            message = {'mid': mid, 'text': text}
            if image:message['attachments'] = [{'type': 'image', 'payload': {'url': 'https://cdn.invalid/receipt'}}]
            if reply:message['reply_to'] = {'mid': reply}
            return json.dumps({'object': 'instagram', 'entry': [{'id': '100', 'messaging': [
                {'sender': {'id': '200'}, 'recipient': {'id': '100'}, 'timestamp': int(time.time() * 1000), 'message': message}]}]}).encode()
        def post(raw, signed=True):
            return self.request('POST', '/instagram', body=raw, headers=self.signed(raw) if signed else {})
        def clear():
            for path in (talk, receipt):path.unlink(missing_ok=True)
        question = payload('q1', text='how much is overdue?')
        self.assertEqual(post(question, signed=False), (403, 'Forbidden')); self.assertFalse(talk.exists())
        with patch('mw_integration_agent.server.IngressJournal.capture', side_effect=RuntimeError('database down')), \
             patch('sys.stderr', new_callable=io.StringIO):
            self.assertEqual(post(question), (503, 'Unavailable'))  # a failed capture never wakes
        self.assertFalse(talk.exists())
        self.assertEqual(post(question), (200, 'EVENT_RECEIVED')); self.assertTrue(talk.exists()); self.assertFalse(receipt.exists())
        clear(); self.assertEqual(post(question), (200, 'EVENT_RECEIVED')); self.assertFalse(talk.exists())  # redelivery
        for raw in (payload('r1', image=True), payload('r2', text='yes', reply='out'), payload('r3', text=' Review ')):
            self.assertEqual(post(raw), (200, 'EVENT_RECEIVED'))
            self.assertFalse(talk.exists()); self.assertTrue(receipt.exists()); clear()
        self.assertEqual(post(payload('b1', text='slip for Somchai', image=True)), (200, 'EVENT_RECEIVED'))
        self.assertTrue(talk.exists()); self.assertTrue(receipt.exists()); clear()  # both apply: both are touched
        with patch('mw_integration_agent.receipt_wake.path', return_value=state / 'missing' / 'conversation-wake'):
            self.assertEqual(post(payload('q2', text='and today?')), (200, 'EVENT_RECEIVED'))  # a failed touch is swallowed
        self.assertFalse(talk.exists())

    def errors(self, method, path, body=None, headers=None):
        with patch('sys.stderr', new_callable=io.StringIO) as stderr:
            result = self.request(method, path, body=body, headers=headers)
        return result, stderr.getvalue()

    def test_post_configuration_error_logs_one_line_with_code(self):
        (self.fixture.secrets / 'app.txt').unlink()
        result, text = self.errors('POST', '/instagram', body=b'{"payload-marker": 1}', headers={'X-Hub-Signature-256': 'sha256=header-marker'})
        self.assertEqual(result, (503, 'Unavailable'))
        self.assertEqual(text, '{"event":"ingress_error","method":"POST","error":"ConfigurationError",'
                               '"code":"credential unavailable: meta_app_secret_file"}\n')

    def test_get_other_exception_logs_one_line_without_text(self):
        with patch.object(server, 'load_secret', side_effect=RuntimeError('secret-marker')):
            result, text = self.errors('GET', '/instagram?hub.mode=subscribe&hub.verify_token=query-marker&hub.challenge=1')
        self.assertEqual(result, (503, 'Unavailable'))
        self.assertEqual(text, '{"event":"ingress_error","method":"GET","error":"RuntimeError","code":""}\n')

    def receiver_ready(self, *extra):
        argv = ['mw-integration-agent', 'receiver-ready', '--config', str(self.fixture.config_path), *extra]
        with patch.object(sys, 'argv', argv), patch('sys.stdout', new_callable=io.StringIO) as stdout:
            code = cli.main()
        return code, json.loads(stdout.getvalue())

    def test_receiver_ready_command_exit_codes(self):
        code, body = self.receiver_ready('--wait', '5')
        self.assertEqual((code, body['ready'], body['code_version']), (0, True, COMMIT))
        self.fixture.catalogue['services']['signed_webhook_ingress']['enabled'] = False; self.fixture.write()
        started = time.monotonic()
        code, body = self.receiver_ready('--wait', '1')
        self.assertGreaterEqual(time.monotonic() - started, 1)
        self.assertEqual((code, body['failed']), (1, ['catalogue']))
        self.fixture.config['listen_port'] = free_port(); self.fixture.write()
        self.assertEqual(self.receiver_ready()[0], 1)


class ServeTests(unittest.TestCase):
    SCRIPT = '''import json,sys
from http.server import ThreadingHTTPServer
ThreadingHTTPServer.serve_forever=lambda self,*a,**k:None
from mw_integration_agent import server
names=('audit','conversation_api','receipt_api','receipt_storage','state')
before=[n for n in names if 'mw_integration_agent.'+n in sys.modules]
server.serve(sys.argv[1],sys.argv[2])
print(json.dumps({'before':before,'after':[n for n in names if 'mw_integration_agent.'+n in sys.modules],
 'psycopg':'psycopg' in sys.modules,'startup':server.STARTUP,'hash':server.package_sha256()}))
'''

    def serve(self, **overrides):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Fixture(directory, listen_port=free_port(), **overrides)
            result = subprocess.run([sys.executable, '-c', self.SCRIPT, str(fixture.config_path), str(fixture.catalogue_path)],
                                    capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_serve_loads_request_modules_eagerly_and_records_startup(self):
        value = self.serve()
        self.assertEqual(value['after'], ['audit', 'conversation_api', 'receipt_api', 'receipt_storage', 'state'])
        self.assertLess(len(value['before']), 5)
        self.assertEqual((value['startup']['code_version'], value['startup']['package_sha256']), (COMMIT, value['hash']))
        self.assertFalse(value['psycopg'])
        self.assertTrue(self.serve(**POSTGRES)['psycopg'])


if __name__ == '__main__':
    unittest.main()
