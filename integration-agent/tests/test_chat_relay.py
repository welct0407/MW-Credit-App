"""R102 keyless chat relay: configuration, the workload-identity-federation credential provider (exchange, cache,
refresh, single flight, error mapping, environment-to-rule binding), and the HTTP contract with a fake upstream.
Synthetic identities, rule ids and tokens only; nothing reaches Google or Anthropic."""
import http.client
import io
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import chat_relay_api as relay
from mw_integration_agent.config import ConfigurationError, load_json, validate_catalogue, validate_config
from test_receipt_recognition import OTHER, keys as google_keys, sign

ROOT = Path(__file__).resolve().parents[1]
AUDIENCE = 'http://10.148.0.2:8791/v1/chat/messages'
ORG = '11111111-2222-4333-8444-555555555555'
DEV = {'email': 'mw-credit-app-chat-dev@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '110567525407665876362', 'environment': 'dev'}
PROD = {'email': 'mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '109821788246551148361', 'environment': 'prod'}
RULES = {env: {'federation_rule_id': f'fdrl_synthetic{env}', 'service_account_id': f'svac_synthetic{env}', 'workspace_id': f'wrkspc_synthetic{env}',
               'audience': f'https://api.anthropic.com/mw-credit-chat-{env}'} for env in ('dev', 'prod')}
BODY = {'model': 'claude-opus-5-5', 'max_tokens': 16384, 'stream': True, 'system': [{'type': 'text', 'text': 'SYNTHETIC SYSTEM'}],
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': 'SYNTHETIC QUESTION'}]}],
        'tools': [{'name': 'sql_query', 'description': 'x', 'input_schema': {'type': 'object'}}], 'tool_choice': {'type': 'auto'},
        'output_config': {'effort': 'medium'}}
SSE = (b'event: message_start\ndata: {"type":"message_start"}\n\n', b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"SYNTHETIC ANSWER"}}\n\n',
       b'event: message_stop\ndata: {"type":"message_stop"}\n\n')


def relay_config(directory, **changes):
    config = load_json(ROOT / 'config.example.json')
    config.update(state_backend='postgres', state_generation='11111111-1111-4111-8111-111111111111', state_cutover_at='2026-10-01T00:00:00+07:00',
                  agent_database_worker_password_file='/etc/mw-integration-agent/secrets/worker.txt',
                  agent_database_relay_password_file='/etc/mw-integration-agent/secrets/relay.txt', state_directory=str(directory),
                  chat_relay_enabled=True, chat_relay_wif_organization_id=ORG, chat_relay_wif=json.loads(json.dumps(RULES)))
    config.update(changes)
    return config


def claims(caller=DEV, **changes):
    now = int(time.time())
    value = {'iss': 'https://accounts.google.com', 'aud': AUDIENCE, 'email': caller['email'], 'sub': caller['subject'],
             'email_verified': True, 'iat': now - 5, 'exp': now + 600}
    value.update(changes)
    return value


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class Exchange:
    """Fake /v1/oauth/token: a script of (status, value) answers; records every body (assertion included)."""
    def __init__(self, *answers):
        self.answers, self.bodies, self.count = list(answers), [], 0

    def __call__(self, body):
        self.bodies.append(dict(body))
        self.count += 1
        answer = self.answers.pop(0) if self.answers else (200, None)
        if isinstance(answer, Exception):
            raise answer
        status, value = answer
        return status, value if value is not None or status != 200 else {
            'access_token': f'sk-ant-oat01-synthetic-{body["federation_rule_id"]}-{self.count}', 'token_type': 'Bearer', 'expires_in': 3600, 'scope': 'workspace:inference'}


def provider(exchange=None, clock=None, identity=None):
    audiences, sleeps = [], []
    minted = iter(range(1, 10_000))

    def mint(audience):
        audiences.append(audience)
        return f'synthetic.identity.{next(minted)}'
    p = relay.CredentialProvider(identity=identity or mint, exchange=exchange or Exchange(), clock=clock or Clock(), sleep=sleeps.append)
    return p, audiences, sleeps


class ConfigTests(unittest.TestCase):
    def test_example_stays_default_off_with_placeholders_and_catalogue_lists_the_disabled_service(self):
        config = load_json(ROOT / 'config.example.json')
        validate_config(config)
        self.assertEqual((config['chat_relay_enabled'], config['chat_relay_listen_port'], config['chat_relay_audience'], config['chat_relay_wif_organization_id']),
                         (False, 8791, AUDIENCE, ''))
        self.assertEqual({env: rule['federation_rule_id'] for env, rule in config['chat_relay_wif'].items()}, {'dev': '', 'prod': ''})
        self.assertFalse([key for key in config if key.startswith('claude_')])
        catalogue = load_json(ROOT / 'service-catalogue.json')
        validate_catalogue(catalogue)
        self.assertEqual(catalogue['services']['chat_messages_relay'], {'enabled': False, 'implemented': True})

    def test_enabled_configuration_needs_complete_rules_matching_callers_and_a_private_bind(self):
        with tempfile.TemporaryDirectory() as directory:
            validate_config(relay_config(directory))
            for change in ({'chat_relay_wif_organization_id': ''}, {'chat_relay_wif': {**RULES, 'dev': {**RULES['dev'], 'federation_rule_id': ''}}},
                           {'chat_relay_wif': {**RULES, 'prod': {**RULES['prod'], 'audience': RULES['dev']['audience']}}},
                           {'chat_relay_wif': {'dev': RULES['dev']}}, {'chat_relay_callers': [{**DEV, 'environment': 'prod'}]},
                           {'chat_relay_callers': [DEV, dict(DEV)]}, {'chat_relay_callers': [{**DEV, 'email': 'someone@example.com'}]},
                           {'chat_relay_callers': [{k: v for k, v in DEV.items() if k != 'environment'}]},
                           {'chat_relay_listen_host': '0.0.0.0'}, {'chat_relay_listen_host': '127.0.0.1'}, {'chat_relay_listen_port': 80},
                           {'chat_relay_audience': 'http://10.148.0.2:8790/v1/receipt-recognition'}, {'chat_relay_upstream_timeout_seconds': 120},
                           {'state_backend': 'sqlite'}, {'chat_relay_enabled': 'yes'}):
                with self.subTest(change=change), self.assertRaises(ConfigurationError):
                    validate_config(relay_config(directory, **change))
            # The retired claude_ prefix stays refused: relay keys are chat_relay_* only.
            with self.assertRaisesRegex(ConfigurationError, 'retired'):
                validate_config(relay_config(directory, claude_relay_key='x'))

    def test_catalogue_fails_closed_on_an_enabled_but_unimplemented_relay(self):
        catalogue = load_json(ROOT / 'service-catalogue.json')
        catalogue['services']['chat_messages_relay'] = {'enabled': True, 'implemented': False}
        with self.assertRaisesRegex(ConfigurationError, 'not implemented'):
            validate_catalogue(catalogue)

    def test_serve_refuses_an_api_key_in_the_environment(self):
        with patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'synthetic'}), self.assertRaisesRegex(ConfigurationError, 'keyless'):
            relay.serve('/nonexistent/config.json', '/nonexistent/catalogue.json')


class CredentialTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = relay_config(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_exchange_uses_the_environment_rule_and_a_fresh_identity_token(self):
        exchange, clock = Exchange(), Clock()
        p, audiences, _ = provider(exchange, clock)
        headers, rule = p.headers(self.config, 'dev')
        self.assertEqual(headers, {'authorization': 'Bearer sk-ant-oat01-synthetic-fdrl_syntheticdev-1'})
        self.assertEqual(rule, 'fdrl_syntheticdev')
        self.assertEqual(audiences, ['https://api.anthropic.com/mw-credit-chat-dev'])
        self.assertEqual(exchange.bodies[0], {'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': 'synthetic.identity.1',
                                              'federation_rule_id': 'fdrl_syntheticdev', 'organization_id': ORG,
                                              'service_account_id': 'svac_syntheticdev', 'workspace_id': 'wrkspc_syntheticdev'})
        prod, _ = p.headers(self.config, 'prod')
        self.assertIn('fdrl_syntheticprod', prod['authorization'])
        self.assertEqual(audiences[1], 'https://api.anthropic.com/mw-credit-chat-prod')
        self.assertEqual(exchange.bodies[1]['assertion'], 'synthetic.identity.2')  # never reused
        # Cached per environment: no new exchange while fresh.
        clock.now += 3600 - 121
        self.assertEqual(p.headers(self.config, 'dev')[0], headers)
        self.assertEqual(exchange.count, 2)

    def test_advisory_refresh_at_t_minus_120_keeps_the_token_on_failure_and_mandatory_refresh_at_t_minus_30_fails(self):
        exchange, clock = Exchange((200, None), (503, None), (503, None), (200, None), (503, None), (503, None)), Clock()
        p, _, sleeps = provider(exchange, clock)
        first = p.headers(self.config, 'dev', deadline=clock.now + 100)[0]
        clock.now += 3600 - 120
        self.assertEqual(p.headers(self.config, 'dev', deadline=clock.now + 100)[0], first)  # advisory failure keeps the token
        self.assertEqual((exchange.count, sleeps), (3, [1]))  # one retry after 1 s
        refreshed = p.headers(self.config, 'dev', deadline=clock.now + 100)[0]
        self.assertNotEqual(refreshed, first)  # the next advisory refresh succeeds
        clock.now += 3600 - 29
        with self.assertRaises(relay.CredentialError) as caught:
            p.headers(self.config, 'dev', deadline=clock.now + 100)
        self.assertEqual(caught.exception.code, 'RELAY_FEDERATION_UNAVAILABLE')

    def test_error_mapping_follows_the_federation_spec(self):
        for answers, code, exchanges in (([(400, None)], 'RELAY_FEDERATION_CONFIG', 1), ([(401, None)], 'RELAY_FEDERATION_DENIED', 1),
                                         ([(429, None), (500, None)], 'RELAY_FEDERATION_UNAVAILABLE', 2),
                                         ([TimeoutError(), TimeoutError()], 'RELAY_FEDERATION_UNAVAILABLE', 2),
                                         ([(200, {'access_token': 'x y', 'token_type': 'Bearer', 'expires_in': 3600})], 'RELAY_FEDERATION_UNAVAILABLE', 1)):
            exchange = Exchange(*answers)
            p, _, _ = provider(exchange)
            with self.subTest(code=code, answers=answers), self.assertRaises(relay.CredentialError) as caught:
                p.headers(self.config, 'dev', deadline=10**9)
            self.assertEqual((caught.exception.code, exchange.count), (code, exchanges))
        retried = Exchange((503, None), (200, None))
        p, _, sleeps = provider(retried)
        self.assertIn('Bearer', p.headers(self.config, 'dev', deadline=10**9)[0]['authorization'])
        self.assertEqual(sleeps, [1])
        late = Exchange((503, None))
        p, _, _ = provider(late, Clock())
        with self.assertRaises(relay.CredentialError):
            p.headers(self.config, 'dev', deadline=1000.0 + 5)  # no time left for a retry
        self.assertEqual(late.count, 1)

        def down(_audience):
            raise relay.CredentialError('RELAY_IDENTITY_UNAVAILABLE')
        p, _, _ = provider(identity=down)
        with self.assertRaises(relay.CredentialError) as caught:
            p.headers(self.config, 'dev')
        self.assertEqual(caught.exception.code, 'RELAY_IDENTITY_UNAVAILABLE')
        with patch.object(relay.agent_http, 'identity_token', side_effect=OSError('metadata down')), self.assertRaises(relay.CredentialError) as caught:
            relay.metadata_identity('https://api.anthropic.com/mw-credit-chat-dev')
        self.assertEqual(caught.exception.code, 'RELAY_IDENTITY_UNAVAILABLE')

    def test_single_flight_and_invalidate(self):
        gate, started = threading.Event(), threading.Event()
        inner = Exchange()

        def slow(body):
            started.set(); gate.wait(5)
            return inner(body)
        p, _, _ = provider(slow)
        results = []
        threads = [threading.Thread(target=lambda: results.append(p.headers(self.config, 'dev')[0])) for _ in range(4)]
        for t in threads:
            t.start()
        started.wait(5); time.sleep(0.05); gate.set()
        for t in threads:
            t.join(5)
        self.assertEqual((inner.count, len(set(map(json.dumps, results)))), (1, 1))
        p.invalidate('dev', 'Bearer something-else')
        self.assertEqual(p.headers(self.config, 'dev')[0], results[0])
        p.invalidate('dev', results[0]['authorization'])
        self.assertNotEqual(p.headers(self.config, 'dev')[0], results[0])
        self.assertEqual(inner.count, 2)

    def test_placeholder_rules_fail_closed_and_a_changed_rule_drops_the_cache(self):
        p, _, _ = provider()
        with self.assertRaises(ConfigurationError):
            p.headers(relay_config(self.directory.name, chat_relay_wif_organization_id=''), 'dev')
        first = p.headers(self.config, 'dev')[0]
        changed = relay_config(self.directory.name, chat_relay_wif={**RULES, 'dev': {**RULES['dev'], 'federation_rule_id': 'fdrl_rotated'}})
        self.assertIn('fdrl_rotated', p.headers(changed, 'dev')[0]['authorization'])
        self.assertNotEqual(first, p.headers(changed, 'dev')[0])


class FakeResponse:
    def __init__(self, status, body=b'', chunks=(), headers=None):
        self.status, self.body, self.chunks = status, body, list(chunks)
        self.headers = {'content-type': 'text/event-stream' if chunks else 'application/json', 'request-id': 'req_synthetic', **(headers or {})}

    def getheader(self, name, default=None):
        return self.headers.get(name.lower(), default)

    def read(self, _n=-1):
        body, self.body = self.body, b''
        return body

    def read1(self, _n):
        if self.chunks and isinstance(self.chunks[0], Exception):
            raise self.chunks.pop(0)
        return self.chunks.pop(0) if self.chunks else b''


class Upstream:
    """Fake api.anthropic.com: a script of responses or exceptions, one per connection; records each request."""
    def __init__(self, *script):
        self.script, self.requests = list(script), []

    def __call__(self, timeout):
        upstream = self

        class Connection:
            sock = None

            def request(self, method, path, body, headers):
                upstream.requests.append({'method': method, 'path': path, 'body': body, 'headers': headers, 'timeout': timeout})

            def getresponse(self):
                item = upstream.script.pop(0)
                if isinstance(item, Exception):
                    raise item
                return item

            def close(self):
                pass
        return Connection()


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.config = relay_config(root)
        self.catalogue = load_json(ROOT / 'service-catalogue.json')
        self.catalogue['services']['chat_messages_relay'] = {'enabled': True, 'implemented': True}
        self.config_path, self.catalogue_path = root / 'config.json', root / 'catalogue.json'
        self.write()
        self.exchange = Exchange()
        self.credentials, self.audiences, _ = provider(self.exchange, Clock())
        self.audits = []
        self.log = io.StringIO()
        quiet = patch.object(relay.sys, 'stderr', self.log)
        quiet.start(); self.addCleanup(quiet.stop)

    def start(self, upstream):
        self.upstream = upstream
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), relay.handler(
            str(self.config_path), str(self.catalogue_path), keys=google_keys(), credentials=self.credentials, connect=upstream,
            audit=lambda config, caller, outcome: self.audits.append(dict(outcome))))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(lambda: (self.httpd.shutdown(), self.httpd.server_close()))

    def tearDown(self):
        self.directory.cleanup()

    def write(self):
        self.config_path.write_text(json.dumps(self.config)); self.catalogue_path.write_text(json.dumps(self.catalogue))

    def post(self, body=None, token=None, caller=DEV, headers=None):
        raw = json.dumps(BODY if body is None else body).encode() if not isinstance(body, bytes) else body
        sent = {'Content-Type': 'application/json'}
        if token is not False:
            sent['Authorization'] = 'Bearer ' + (token or sign(claims(caller)))
        sent.update(headers or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        try:
            conn.request('POST', relay.PATH, body=raw, headers=sent)
            response = conn.getresponse()
            return response.status, response.read(), response.getheader('content-type')
        finally:
            conn.close()

    def test_dev_caller_streams_through_the_dev_rule_unchanged(self):
        self.start(Upstream(FakeResponse(200, chunks=SSE)))
        status, data, kind = self.post()
        self.assertEqual((status, data, kind), (200, b''.join(SSE), 'text/event-stream'))
        sent = self.upstream.requests[0]
        self.assertEqual((sent['method'], sent['path'], sent['body']), ('POST', '/v1/messages', json.dumps(BODY).encode()))
        self.assertEqual(sent['headers']['authorization'], 'Bearer sk-ant-oat01-synthetic-fdrl_syntheticdev-1')
        self.assertEqual((sent['headers']['anthropic-version'], 'x-api-key' in sent['headers']), ('2023-06-01', False))
        self.assertNotIn(sign(claims(DEV))[:20], json.dumps(sent['headers']))  # the caller's token is never forwarded
        self.assertEqual(self.audiences, ['https://api.anthropic.com/mw-credit-chat-dev'])
        self.assertLessEqual(sent['timeout'], 110)
        audit = self.audits[0]
        self.assertEqual({k: audit[k] for k in ('caller', 'environment', 'rule', 'model', 'http_status', 'code', 'request_id')},
                         {'caller': DEV['email'], 'environment': 'dev', 'rule': 'fdrl_syntheticdev', 'model': 'claude-opus-5-5', 'http_status': 200,
                          'code': 'relayed', 'request_id': 'req_synthetic'})
        self.assertEqual((audit['bytes_in'], audit['bytes_out']), (len(json.dumps(BODY)), len(b''.join(SSE))))
        log = self.log.getvalue()
        for secret in ('sk-ant-oat01', 'synthetic.identity', 'SYNTHETIC QUESTION', 'SYNTHETIC ANSWER', 'SYNTHETIC SYSTEM'):
            self.assertNotIn(secret, log)
        self.assertIn('"event":"chat_relay"', log)

    def test_a_stream_cut_at_the_deadline_or_interrupted_ends_with_an_sse_error_event(self):
        self.start(Upstream(FakeResponse(200, chunks=(SSE[0], TimeoutError()), headers={'content-type': 'text/event-stream'}),
                            FakeResponse(200, chunks=(SSE[0], ConnectionResetError()), headers={'content-type': 'text/event-stream'})))
        status, data, _ = self.post()
        self.assertEqual(status, 200)
        self.assertTrue(data.startswith(SSE[0]) and data.endswith(relay.RELAY_DEADLINE_EVENT), data)
        self.assertIn(b'"type":"timeout_error"', data)
        self.assertEqual(self.audits[-1]['code'], 'UPSTREAM_DEADLINE')
        status, data, _ = self.post()
        self.assertTrue(data.endswith(relay.RELAY_INTERRUPTED_EVENT), data)
        self.assertEqual(self.audits[-1]['code'], 'STREAM_INTERRUPTED')

    def test_prod_caller_uses_only_the_prod_rule(self):
        self.start(Upstream(FakeResponse(200, chunks=SSE)))
        self.assertEqual(self.post(caller=PROD)[0], 200)
        self.assertIn('fdrl_syntheticprod', self.upstream.requests[0]['headers']['authorization'])
        self.assertEqual(self.audiences, ['https://api.anthropic.com/mw-credit-chat-prod'])
        self.assertEqual(self.exchange.bodies[0]['workspace_id'], 'wrkspc_syntheticprod')

    def test_a_caller_whose_environment_has_no_allowlist_entry_is_denied(self):
        self.config['chat_relay_callers'] = [DEV]
        self.config['chat_relay_wif'] = {'dev': RULES['dev']}
        self.write()
        self.start(Upstream())
        self.assertEqual(self.post(caller=PROD)[0], 403)
        self.assertEqual((self.upstream.requests, self.exchange.count), ([], 0))

    def test_upstream_401_reexchanges_once_then_fails(self):
        self.start(Upstream(FakeResponse(401, b'{}'), FakeResponse(200, chunks=SSE)))
        self.assertEqual(self.post()[0], 200)
        self.assertEqual(self.exchange.count, 2)
        tokens = [r['headers']['authorization'] for r in self.upstream.requests]
        self.assertEqual(len(set(tokens)), 2)
        self.upstream.script = [FakeResponse(401, b'{}'), FakeResponse(401, b'{}')]
        status, data, _ = self.post()
        self.assertEqual((status, json.loads(data)), (503, {'status': 'unavailable', 'reason': 'credentials'}))
        self.assertEqual(self.audits[-1]['code'], 'RELAY_FEDERATION_DENIED')
        self.assertEqual(self.exchange.count, 3)

    def test_upstream_status_mapping(self):
        self.start(Upstream(FakeResponse(403, b'{}'), FakeResponse(529, b'{"type":"error","error":{"type":"overloaded_error"}}'),
                            FakeResponse(400, b'{"type":"error"}'), TimeoutError(), OSError('reset')))
        self.assertEqual(self.post()[0], 503)
        self.assertEqual(self.audits[-1]['code'], 'RELAY_SCOPE_DENIED')
        status, data, _ = self.post()
        self.assertEqual((status, json.loads(data)['error']['type']), (529, 'overloaded_error'))
        self.assertEqual(self.audits[-1]['code'], 'UPSTREAM_529')
        self.assertEqual(self.post()[0], 400)
        self.assertEqual(self.post()[0], 504)
        self.assertEqual(self.post()[0], 502)

    def test_federation_failures_answer_503(self):
        self.exchange.answers = [(401, None)]
        self.start(Upstream())
        status, data, _ = self.post()
        self.assertEqual((status, json.loads(data)['reason']), (503, 'credentials'))
        self.assertEqual((self.audits[-1]['code'], self.upstream.requests), ('RELAY_FEDERATION_DENIED', []))

    def test_authentication_and_request_shape(self):
        self.start(Upstream())
        self.assertEqual(self.post(token=False)[0], 401)
        self.assertEqual(self.post(token=sign(claims(), key=OTHER))[0], 403)
        self.assertEqual(self.post(token=sign(claims(aud='http://10.148.0.2:8790/v1/receipt-recognition')))[0], 403)
        stranger = {**DEV, 'email': 'mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com'}
        self.assertEqual(self.post(caller=stranger)[0], 403)
        for body, reason in (({**BODY, 'model': 'gemini-4-argon'}, 'model_not_allowed'), ({**BODY, 'model': 'claude-opus-5-5-20260401'}, 'model_not_allowed'),
                             ({**BODY, 'stream': False}, 'stream_required'), ({k: v for k, v in BODY.items() if k != 'stream'}, 'stream_required'),
                             ({**BODY, 'tools': [{'type': 'web_search_20260209', 'name': 'web_search'}]}, 'tools_not_allowed'),
                             ({**BODY, 'fallbacks': 'default'}, 'invalid_request'), (b'not json', 'invalid_json')):
            with self.subTest(reason=reason):
                status, data, _ = self.post(body)
                self.assertEqual((status, json.loads(data)['reason']), (400, reason))
        self.assertEqual(self.post(b'x' * (relay.MAX_BYTES + 1))[0], 413)
        self.assertEqual(self.post(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual((self.upstream.requests, self.exchange.count), ([], 0))

    def test_disabled_switch_or_catalogue_entry_and_health(self):
        self.start(Upstream())
        for change in ('config', 'catalogue'):
            if change == 'config':
                self.config['chat_relay_enabled'] = False
            else:
                self.config['chat_relay_enabled'] = True
                self.catalogue['services']['chat_messages_relay'] = {'enabled': False, 'implemented': True}
            self.write()
            with self.subTest(change=change):
                status, data, _ = self.post()
                self.assertEqual((status, json.loads(data)), (503, {'status': 'unavailable', 'reason': 'disabled'}))
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        conn.request('GET', '/healthz')
        response = conn.getresponse()
        self.assertEqual((response.status, json.loads(response.read())), (200, {'status': 'ok', 'enabled': False}))
        conn.close()
        self.assertEqual(self.upstream.requests, [])


if __name__ == '__main__':
    unittest.main()
