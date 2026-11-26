"""Muse secret broker: bearer-key authorization, read-only routes, token impersonation and caching, upstream error
mapping, rate limit and an audit log that never carries a value or the key. Synthetic secrets and tokens only; a fake
opener stands in for the metadata server, IAM Credentials and Secret Manager, so nothing reaches Google."""
import base64
import hashlib
import http.client
import importlib.util
import io
import json
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path

SCRIPT = Path(__file__).parents[1] / 'muse-broker' / 'muse_broker.py'
spec = importlib.util.spec_from_file_location('muse_broker', SCRIPT)
broker_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker_module)

KEY = 'synthetic-muse-key-' + 'k' * 40
VALUE = 'SYNTHETIC-SECRET-VALUE-do-not-log'
SM = broker_module.SECRET_MANAGER + '/projects/' + broker_module.PROJECT


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class FakeGoogle:
    """Answers by URL; records calls. `secrets` maps id -> {version: (state, value)}."""

    def __init__(self):
        self.secrets = {'alpha': {1: ('ENABLED', 'old'), 2: ('ENABLED', VALUE), 3: ('DISABLED', 'off')},
                        'beta': {1: ('ENABLED', 'b')}, 'binary': {1: ('ENABLED', b'\xff\x00')}}
        self.calls, self.mints, self.fail = [], 0, {}
        self.expire = '2099-01-01T00:00:00Z'
        self.page_size = 250

    def error(self, url, code):
        return urllib.error.HTTPError(url, code, 'synthetic', {}, io.BytesIO(b'{"error":{"message":"internal detail"}}'))

    def __call__(self, request, timeout=None):
        url = request.full_url
        self.calls.append((request.get_method(), url, dict(request.header_items())))
        for prefix, code in self.fail.items():
            if url.startswith(prefix):
                raise self.error(url, code)
        if url == broker_module.METADATA_TOKEN_URL:
            return Response(json.dumps({'access_token': 'vm-token', 'expires_in': 3599}).encode())
        if url.startswith('https://iamcredentials.googleapis.com/'):
            self.mints += 1
            return Response(json.dumps({'accessToken': f'muse-token-{self.mints}', 'expireTime': self.expire}).encode())
        path, _, query = url.partition('?')
        params = dict(p.split('=', 1) for p in query.split('&') if p)
        if path == SM + '/secrets':
            names = sorted(self.secrets)
            start = int(params.get('pageToken', '0'))
            page = names[start:start + self.page_size]
            body = {'secrets': [{'name': f'projects/737787224638/secrets/{n}', 'createTime': '2026-11-26T00:00:00Z'} for n in page]}
            if start + self.page_size < len(names):
                body['nextPageToken'] = str(start + self.page_size)
            return Response(json.dumps(body).encode())
        for secret_id, versions in self.secrets.items():
            base = f'{SM}/secrets/{secret_id}/versions'
            if path == base:
                enabled = [n for n, (state, _) in versions.items() if state == 'ENABLED']
                return Response(json.dumps({'versions': [{'name': f'{base}/{n}', 'state': 'ENABLED'} for n in sorted(enabled, reverse=True)]}).encode())
            if path.startswith(base + '/') and path.endswith(':access'):
                number = int(path[len(base) + 1:-len(':access')])
                if number not in versions:
                    raise self.error(url, 404)
                state, value = versions[number]
                if state != 'ENABLED':
                    raise self.error(url, 400)
                raw = value if isinstance(value, bytes) else value.encode()
                return Response(json.dumps({'payload': {'data': base64.b64encode(raw).decode()}}).encode())
        raise self.error(url, 404)


class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hash_file = Path(self.tmp.name) / 'muse-broker-api-key.sha256'
        self.hash_file.write_text(hashlib.sha256(KEY.encode()).hexdigest() + '\n')
        self.google = FakeGoogle()
        self.lines = []
        tokens = broker_module.TokenProvider(self.google)
        self.broker = broker_module.Broker(broker_module.SecretManager(tokens, self.google), hash_file=str(self.hash_file), log=self.lines.append)
        self.server = broker_module.build_server(self.broker, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def request(self, path, key=KEY, method='GET', headers=None, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_address[1], timeout=5)
        sent = dict(headers or {})
        if key is not None:
            sent['Authorization'] = 'Bearer ' + key
        conn.request(method, path, body=body, headers=sent)
        response = conn.getresponse()
        raw = response.read()
        conn.close()
        return response.status, (json.loads(raw) if raw else None), response

    def audit(self):
        return [json.loads(line) for line in self.lines]

    def test_binds_loopback_only(self):
        self.assertEqual(broker_module.HOST, '127.0.0.1')
        self.assertEqual(self.server.server_address[0], '127.0.0.1')

    def test_health_needs_no_key_and_returns_no_data(self):
        status, body, _ = self.request('/health', key=None)
        self.assertEqual((status, body), (200, {'ok': True}))
        self.assertEqual(self.google.calls, [])
        self.assertEqual(self.lines, [])

    def test_missing_wrong_and_malformed_keys_are_401_and_reach_no_upstream(self):
        cases = [('/v1/secrets', None), ('/v1/secrets', 'wrong'), ('/v1/secrets/alpha', KEY + 'x'), ('/v1/secrets', ''), ('/v1/secrets', 'k' * 300)]
        for path, key in cases:
            with self.subTest(path=path, key=key and key[:8]):
                status, body, response = self.request(path, key=key)
                self.assertEqual((status, body), (401, {'error': 'unauthorized'}))
                self.assertEqual(response.getheader('WWW-Authenticate'), 'Bearer')
        status, _, _ = self.request('/v1/secrets', key=None, headers={'Authorization': 'Basic ' + KEY})
        self.assertEqual(status, 401)
        self.assertEqual(self.google.calls, [])
        self.assertTrue(all(row['auth'] == 'fail' and row['status'] == 401 for row in self.audit()))

    def test_missing_or_malformed_hash_file_fails_closed(self):
        self.hash_file.write_text('not-a-hash\n')
        self.assertEqual(self.request('/v1/secrets')[0], 401)
        self.hash_file.unlink()
        self.assertEqual(self.request('/v1/secrets')[0], 401)

    def test_key_rotation_takes_effect_without_restart(self):
        self.hash_file.write_text(hashlib.sha256(b'new-key-' + b'n' * 40).hexdigest())
        self.assertEqual(self.request('/v1/secrets')[0], 401)
        self.assertEqual(self.request('/v1/secrets', key='new-key-' + 'n' * 40)[0], 200)

    def test_list_returns_ids_and_metadata_only_across_pages(self):
        self.google.page_size = 2
        status, body, response = self.request('/v1/secrets')
        self.assertEqual(status, 200)
        self.assertEqual(body['count'], 3)
        self.assertEqual([row['id'] for row in body['secrets']], ['alpha', 'beta', 'binary'])
        self.assertEqual(set(body['secrets'][0]), {'id', 'create_time', 'labels'})
        self.assertNotIn(VALUE, json.dumps(body))
        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
        self.assertFalse(any(url.endswith(':access') for _, url, _ in self.google.calls))

    def test_value_defaults_to_latest_enabled_version(self):
        status, body, _ = self.request('/v1/secrets/alpha')
        self.assertEqual((status, body), (200, {'id': 'alpha', 'version': '2', 'value': VALUE, 'encoding': 'utf-8'}))

    def test_explicit_version_and_binary_values(self):
        self.assertEqual(self.request('/v1/secrets/alpha?version=1')[1]['value'], 'old')
        status, body, _ = self.request('/v1/secrets/binary')
        self.assertEqual((status, body['encoding'], base64.b64decode(body['value'])), (200, 'base64', b'\xff\x00'))

    def test_unknown_secret_version_and_disabled_version_are_404(self):
        for path in ('/v1/secrets/missing', '/v1/secrets/alpha?version=9', '/v1/secrets/alpha?version=3', '/v1/secrets/bad%2Fid', '/v1/other'):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[:2], (404, {'error': 'not_found'}))

    def test_bad_query_is_400(self):
        for path in ('/v1/secrets/alpha?version=latest', '/v1/secrets/alpha?version=0', '/v1/secrets/alpha?version=1&version=2',
                     '/v1/secrets/alpha?other=1', '/v1/secrets?filter=x'):
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[:2], (400, {'error': 'bad_request'}))

    def test_upstream_errors_are_502_without_detail(self):
        for code in (403, 500, 503):
            self.google.fail = {SM + '/secrets': code}
            with self.subTest(code=code):
                for path in ('/v1/secrets', '/v1/secrets/alpha'):
                    status, body, _ = self.request(path)
                    self.assertEqual((status, body), (502, {'error': 'upstream_error'}))
        self.google.fail = {'https://iamcredentials.googleapis.com/': 403}
        self.broker.secrets._tokens.invalidate()
        self.assertEqual(self.request('/v1/secrets')[:2], (502, {'error': 'upstream_error'}))
        self.assertNotIn('internal detail', '\n'.join(self.lines))

    def test_impersonation_token_is_minted_once_cached_and_used(self):
        self.request('/v1/secrets')
        self.request('/v1/secrets/alpha')
        self.assertEqual(self.google.mints, 1)
        mint = [c for c in self.google.calls if c[1].startswith('https://iamcredentials')][0]
        self.assertEqual(mint[0], 'POST')
        self.assertIn(broker_module.TARGET, mint[1])
        self.assertEqual(mint[2]['Authorization'], 'Bearer vm-token')
        self.assertEqual([c[2].get('Metadata-flavor') for c in self.google.calls if c[1] == broker_module.METADATA_TOKEN_URL], ['Google'])
        sm = [c for c in self.google.calls if c[1].startswith(broker_module.SECRET_MANAGER)]
        self.assertTrue(sm and all(c[0] == 'GET' and c[2]['Authorization'] == 'Bearer muse-token-1' for c in sm))

    def test_token_is_reminted_near_expiry_and_after_an_upstream_401(self):
        now = [1_000_000.0]
        tokens = broker_module.TokenProvider(self.google, clock=lambda: now[0])
        self.google.expire = '1970-01-12T14:00:00Z'  # 1,000,800 s: inside the 5-minute margin after 600 s
        self.assertEqual(tokens.token(), 'muse-token-1')
        self.assertEqual(tokens.token(), 'muse-token-1')
        now[0] += 600
        self.assertEqual(tokens.token(), 'muse-token-2')
        self.google.expire = '2099-01-01T00:00:00Z'
        manager = broker_module.SecretManager(tokens, self.google)
        original = self.google.__call__
        seen = []

        def once_401(request, timeout=None):
            if request.full_url.startswith(SM) and not seen:
                seen.append(1)
                raise self.google.error(request.full_url, 401)
            return original(request, timeout)

        manager._opener = once_401
        tokens._opener = once_401
        self.assertEqual(len(manager.list_secrets()), 3)  # token 2 is inside the margin too: mint 3, its 401, then mint 4
        self.assertEqual(self.google.mints, 4)

    def test_only_get_is_served_and_bodies_are_refused(self):
        for method in ('POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'):
            with self.subTest(method=method):
                status, _, response = self.request('/v1/secrets/alpha', method=method, body=b'{}' if method != 'HEAD' else None)
                self.assertEqual(status, 405)
                self.assertEqual(response.getheader('Allow'), 'GET')
        self.assertEqual(self.request('/v1/secrets', headers={'Content-Length': '2'}, body=b'{}')[0], 413)
        self.assertFalse(any(c[0] != 'GET' and 'secretmanager' in c[1] for c in self.google.calls))

    def test_long_path_is_refused(self):
        self.assertEqual(self.request('/v1/secrets/' + 'a' * 600)[0], 414)

    def test_rate_limit(self):
        self.broker.limiter = broker_module.RateLimiter(limit=3)
        statuses = [self.request('/v1/secrets', key='wrong')[0] for _ in range(4)]
        self.assertEqual(statuses, [401, 401, 401, 429])
        self.assertEqual(self.request('/health', key=None)[0], 200)

    def test_audit_lines_never_carry_values_keys_or_tokens(self):
        self.request('/v1/secrets')
        self.request('/v1/secrets/alpha', headers={'Cf-Connecting-Ip': '203.0.113.7'})
        self.request('/v1/secrets/alpha', key='wrong-' + KEY)
        text = '\n'.join(self.lines)
        for forbidden in (VALUE, KEY, KEY[:12], 'muse-token', 'vm-token'):
            self.assertNotIn(forbidden, text)
        rows = self.audit()
        self.assertEqual([(r['endpoint'], r['status'], r['auth']) for r in rows],
                         [('/v1/secrets', 200, 'ok'), ('/v1/secrets/{id}', 200, 'ok'), ('other', 401, 'fail')])
        self.assertEqual((rows[1]['secret_id'], rows[1]['version'], rows[1]['client']), ('alpha', '2', '203.0.113.7'))
        self.assertTrue(all(isinstance(r['bytes'], int) and r['bytes'] > 0 for r in rows))


class UnitFileTests(unittest.TestCase):
    def test_unit_runs_the_installed_script_hardened_on_its_own_port(self):
        text = (Path(__file__).parents[1] / 'systemd' / 'mw-muse-broker.service').read_text()
        for line in ('User=mwagent', 'ExecStart=/usr/bin/python3 -I /opt/mw-muse-broker/muse_broker.py', 'Environment=MUSE_BROKER_PORT=8793',
                     'Restart=on-failure', 'NoNewPrivileges=true', 'ProtectSystem=strict'):
            with self.subTest(line=line):
                self.assertIn(line + '\n', text)


if __name__ == '__main__':
    unittest.main()
