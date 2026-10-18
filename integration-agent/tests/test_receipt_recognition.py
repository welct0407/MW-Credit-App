"""Receipt recognition: provider abstraction, Gemini request/retry, ID-token checks and the HTTP contract."""
import ast
import base64
import hashlib
import http.client
import io
import json
import random
import re
import socket
import tempfile
import threading
import time
import unittest
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from mw_integration_agent import receipt_image, receipt_provider_gemini as gemini, receipt_recognition_api as api
from mw_integration_agent.config import ConfigurationError, load_json, validate_catalogue, validate_config
from mw_integration_agent.receipt_image import SCHEMA, RecognitionUnavailable

ROOT = Path(__file__).resolve().parents[1]
RESULT = {'is_payment_receipt': True, 'transfer_successful': True, 'date': '2026-10-18', 'time': '10:15:00',
          'amount': '1500.00', 'currency': 'THB', 'reference': 'SYN123456', 'recipient_numbers': ['xxx-x-x4321-x']}
GEMINI = {'gemini_project': 'clever-oasis-508610-n7', 'gemini_location': 'asia-southeast1', 'gemini_model': 'gemini-2.0-flash-001'}
DEV = {'email': 'mw-credit-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '111111111111111111111'}
PROD = {'email': 'mw-credit-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '222222222222222222222'}
AUDIENCE = 'http://10.148.0.2:8790/v1/receipt-recognition'


# Test RSA key, generated per run (no key material in the repository) ------------------------------

def probable_prime(bits, rng):
    small = [p for p in range(3, 2000, 2) if all(p % q for q in range(3, int(p ** 0.5) + 1, 2))]
    while True:
        n = rng.getrandbits(bits) | (1 << (bits - 1)) | 1
        if any(n % p == 0 for p in small):
            continue
        d, r = n - 1, 0
        while d % 2 == 0:
            d, r = d // 2, r + 1
        for _ in range(20):
            x = pow(rng.randrange(2, n - 2), d, n)
            if x in (1, n - 1):
                continue
            for _ in range(r - 1):
                x = pow(x, 2, n)
                if x == n - 1:
                    break
            else:
                break
        else:
            return n


def rsa_key(seed):
    rng = random.Random(seed)
    e = 65537
    while True:
        p, q = probable_prime(1024, rng), probable_prime(1024, rng)
        phi = (p - 1) * (q - 1)
        if p != q and phi % e and (p * q).bit_length() == 2048:
            return p * q, e, pow(e, -1, phi)


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def int_bytes(value):
    return value.to_bytes((value.bit_length() + 7) // 8, 'big')


KEY = rsa_key(20261018)
OTHER = rsa_key(20261019)


def sign(claims, key=KEY, kid='k1', alg='RS256'):
    n, _, d = key
    head = b64url(json.dumps({'alg': alg, 'kid': kid, 'typ': 'JWT'}).encode())
    body = b64url(json.dumps(claims).encode())
    size = (n.bit_length() + 7) // 8
    info = api.SHA256_INFO + hashlib.sha256((head + '.' + body).encode()).digest()
    encoded = b'\x00\x01' + b'\xff' * (size - len(info) - 3) + b'\x00' + info
    signature = pow(int.from_bytes(encoded, 'big'), d, n).to_bytes(size, 'big')
    return head + '.' + body + '.' + b64url(signature)


def claims(caller=DEV, **changes):
    now = int(time.time())
    value = {'iss': 'https://accounts.google.com', 'aud': AUDIENCE, 'email': caller['email'], 'sub': caller['subject'],
             'email_verified': True, 'iat': now - 5, 'exp': now + 600}
    value.update(changes)
    return value


def keys():
    return api.Keys(lambda: ({'keys': [{'kty': 'RSA', 'alg': 'RS256', 'kid': 'k1', 'n': b64url(int_bytes(KEY[0])),
                                        'e': b64url(int_bytes(KEY[1]))}]}, 3600))


def png(size=(40, 30)):
    buffer = io.BytesIO(); Image.new('RGB', size, 'white').save(buffer, format='PNG')
    return buffer.getvalue()


# Provider abstraction --------------------------------------------------------------------------------

class ProviderTests(unittest.TestCase):
    def test_codex_stays_the_default_cycle_provider_with_its_audit_route(self):
        with patch('mw_integration_agent.receipt_provider_codex.extract', return_value=dict(RESULT)) as codex, \
                patch('mw_integration_agent.receipt_provider_gemini.extract') as vertex:
            self.assertEqual(receipt_image.extract({'state_backend': 'sqlite'}, b'png'), RESULT)
        codex.assert_called_once()
        vertex.assert_not_called()
        self.assertEqual(receipt_image.extract.__name__, 'extract')
        self.assertEqual(receipt_image._extract_codex.__wrapped__.__name__, '_extract_codex')

    def test_recognize_reports_provider_and_pinned_model(self):
        with patch('mw_integration_agent.receipt_provider_codex.extract', return_value=dict(RESULT)):
            self.assertEqual(receipt_image.recognize({}, b'png'), {'provider': 'codex', 'model': 'default', 'result': RESULT})
        with patch('mw_integration_agent.receipt_provider_gemini.extract', return_value=dict(RESULT)):
            self.assertEqual(receipt_image.recognize(GEMINI, b'png', 'gemini'),
                             {'provider': 'gemini', 'model': 'gemini-2.0-flash-001', 'result': RESULT})
        with patch('mw_integration_agent.receipt_provider_gemini.extract', return_value=dict(RESULT)):
            self.assertEqual(receipt_image.extract({**GEMINI, 'receipt_extraction_provider': 'gemini'}, b'png'), RESULT)
        with self.assertRaises(ConfigurationError):
            receipt_image.extract({'receipt_extraction_provider': 'openai'}, b'png')

    def test_shared_shape_validation_rejects_extra_missing_and_mistyped_fields(self):
        for bad in ({**RESULT, 'extra': 1}, {k: v for k, v in RESULT.items() if k != 'time'}, {**RESULT, 'amount': 1500},
                    {**RESULT, 'transfer_successful': 'true'}, {**RESULT, 'recipient_numbers': [123]}, [RESULT]):
            with self.subTest(bad=bad), self.assertRaises(RecognitionUnavailable) as caught:
                receipt_image.checked(bad)
            self.assertEqual(str(caught.exception), 'RECEIPT_EXTRACTION_UNAVAILABLE')
        self.assertEqual(receipt_image.checked(dict(RESULT)), RESULT)


# Gemini provider ------------------------------------------------------------------------------------

class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def vertex_reply(value=RESULT, finish='STOP', thought=False):
    parts = [{'text': 'thinking...', 'thought': True}] if thought else []
    parts.append({'text': json.dumps(value)})
    return json.dumps({'candidates': [{'content': {'role': 'model', 'parts': parts}, 'finishReason': finish}],
                       'modelVersion': 'gemini-2.0-flash-001'}).encode()


class FakeOpener:
    def __init__(self, *outcomes):
        self.outcomes, self.requests = list(outcomes), []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)


def http_error(code):
    return urllib.error.HTTPError('https://vertex', code, 'error', {}, io.BytesIO(b'{}'))


class GeminiTests(unittest.TestCase):
    def run_with(self, *outcomes, deadline=None):
        opener = FakeOpener(*outcomes)
        with patch.object(gemini.http, 'opener', return_value=opener), \
                patch.object(gemini.http, 'access_token', return_value='vm-token') as token, \
                patch.object(gemini.time, 'sleep') as pause:
            try:
                return gemini.extract(GEMINI, b'\x89PNGdata', deadline=deadline), opener, token, pause
            except RecognitionUnavailable as exc:
                return exc, opener, token, pause

    def test_schema_translation_uses_vertex_openapi_subset(self):
        translated = gemini.vertex_schema(SCHEMA)
        self.assertEqual(translated['type'], 'OBJECT')
        self.assertEqual(translated['required'], SCHEMA['required'])
        self.assertEqual(translated['properties']['is_payment_receipt'], {'type': 'BOOLEAN'})
        self.assertEqual(translated['properties']['amount'], {'type': 'STRING'})
        self.assertEqual(translated['properties']['recipient_numbers'], {'type': 'ARRAY', 'items': {'type': 'STRING'}})
        self.assertNotIn('additionalProperties', json.dumps(translated))

    def test_request_shape_endpoint_and_parsing(self):
        value, opener, token, _ = self.run_with(vertex_reply(thought=True))
        self.assertEqual(value, RESULT)
        token.assert_called_once()
        request, timeout = opener.requests[0]
        self.assertEqual(request.full_url, 'https://asia-southeast1-aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7'
                                           '/locations/asia-southeast1/publishers/google/models/gemini-2.0-flash-001:generateContent')
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(request.get_header('Authorization'), 'Bearer vm-token')
        self.assertLessEqual(timeout, gemini.ATTEMPT_TIMEOUT)
        body = json.loads(request.data)
        image, prompt = body['contents'][0]['parts']
        self.assertEqual(image['inlineData'], {'mimeType': 'image/png', 'data': base64.b64encode(b'\x89PNGdata').decode()})
        self.assertEqual(prompt['text'], receipt_image.PROMPT)
        config = body['generationConfig']
        self.assertEqual((config['temperature'], config['responseMimeType'], config['thinkingConfig']),
                         (0, 'application/json', {'thinkingBudget': 0}))  # GEMINI pins a 2.0 Flash id here
        self.assertEqual(config['responseSchema'], gemini.vertex_schema(SCHEMA))
        self.assertNotIn('key=', request.full_url)

    def test_global_location_uses_the_global_host(self):
        self.assertTrue(gemini.endpoint({**GEMINI, 'gemini_location': 'global'}).startswith(
            'https://aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/global/'))

    def test_model_must_be_a_fixed_version(self):
        for model in ('gemini-flash-latest', 'gemini-2.5-flash-latest', 'gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash-exp',
                      'gemini-2.0-flash-001-latest', 'gemini-2.5-flash-01', 'gemini-2.5-ultra', 'models/gemini-2.5-flash',
                      'gemini-2.5-flash ', None, ''):
            with self.subTest(model=model), self.assertRaises(ConfigurationError):
                gemini.validate({**GEMINI, 'gemini_model': model})
        for model in ('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-flash', 'gemini-2.0-flash-001',
                      'gemini-2.5-pro-002', 'gemini-2.0-flash-lite-001'):
            with self.subTest(model=model):
                gemini.validate({**GEMINI, 'gemini_model': model})
        with self.assertRaises(ConfigurationError):
            gemini.validate({**GEMINI, 'gemini_location': 'asia-southeast1/../x'})

    def test_thinking_config_follows_the_model_generation(self):
        for model in ('gemini-3.8-flash', 'gemini-3-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-pro', 'gemini-4-flash-001'):
            with self.subTest(model=model):
                thinking = gemini.body(b'png', model)['generationConfig']['thinkingConfig']
                self.assertEqual(thinking, {'thinkingLevel': 'LOW'})
                self.assertNotIn('thinkingBudget', thinking)
        for model in ('gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash-001'):
            with self.subTest(model=model):
                self.assertEqual(gemini.body(b'png', model)['generationConfig']['thinkingConfig'], {'thinkingBudget': 0})
        for model in ('gemini-2.5-pro', 'gemini-2.5-pro-002'):
            with self.subTest(model=model):
                generation = gemini.body(b'png', model)['generationConfig']
                self.assertNotIn('thinkingConfig', generation)
                self.assertEqual((generation['temperature'], generation['responseMimeType']), (0, 'application/json'))

    def test_owner_selected_model_on_the_global_endpoint(self):
        config = {**GEMINI, 'gemini_location': 'global', 'gemini_model': 'gemini-3.8-flash'}
        value, opener = None, FakeOpener(vertex_reply())
        with patch.object(gemini.http, 'opener', return_value=opener), patch.object(gemini.http, 'access_token', return_value='t'):
            value = gemini.extract(config, b'\x89PNGdata')
        self.assertEqual(value, RESULT)
        request = opener.requests[0][0]
        self.assertEqual(request.full_url, 'https://aiplatform.googleapis.com/v1/projects/clever-oasis-508610-n7/locations/global'
                                           '/publishers/google/models/gemini-3.8-flash:generateContent')
        self.assertEqual(json.loads(request.data)['generationConfig']['thinkingConfig'], {'thinkingLevel': 'LOW'})

    def test_one_retry_on_transient_errors_only(self):
        for transient in (http_error(429), http_error(503), TimeoutError(), urllib.error.URLError('reset')):
            with self.subTest(error=type(transient).__name__):
                value, opener, _, pause = self.run_with(transient, vertex_reply())
                self.assertEqual(value, RESULT)
                self.assertEqual(len(opener.requests), 2)
                pause.assert_called_once()
        value, opener, _, _ = self.run_with(http_error(400), vertex_reply())
        self.assertIsInstance(value, RecognitionUnavailable)
        self.assertEqual((len(opener.requests), value.reason), (1, 'provider_error'))
        value, opener, _, _ = self.run_with(http_error(503), http_error(503), vertex_reply())
        self.assertIsInstance(value, RecognitionUnavailable)
        self.assertEqual(len(opener.requests), 2)
        value, opener, _, _ = self.run_with(TimeoutError(), TimeoutError())
        self.assertEqual((len(opener.requests), value.reason), (2, 'timeout'))

    def test_failures_carry_an_internal_cause(self):
        for outcomes, expected in (((http_error(403),), 'vertex_http_403'), ((TimeoutError(), TimeoutError()), 'vertex_timeout'),
                                   ((urllib.error.URLError('x'), urllib.error.URLError('x')), 'vertex_unreachable'),
                                   ((vertex_reply(finish='SAFETY'),), 'vertex_response_invalid')):
            with self.subTest(expected=expected):
                value, _, _, _ = self.run_with(*outcomes)
                self.assertEqual(value.cause, expected)
        opener = FakeOpener(vertex_reply())
        with patch.object(gemini.http, 'opener', return_value=opener), \
                patch.object(gemini.http, 'access_token', side_effect=PermissionError('metadata')), patch.object(gemini.time, 'sleep'):
            with self.assertRaises(RecognitionUnavailable) as caught:
                gemini.extract(GEMINI, b'png')
        self.assertEqual(caught.exception.cause, 'vm_token_unavailable')
        with self.assertRaises(RecognitionUnavailable) as caught:
            receipt_image.checked({**RESULT, 'amount': 5})
        self.assertEqual(caught.exception.cause, 'shape_invalid')

    def test_timeouts_end_before_the_pwa_client_gives_up(self):
        self.assertEqual((api.REQUEST_BOUND, api.REQUEST_BOUND - api.PROVIDER_MARGIN, gemini.ATTEMPT_TIMEOUT), (18.0, 17.0, 12))
        self.assertEqual(gemini.RETRY_MINIMUM + gemini.RETRY_PAUSE, 4)
        self.assertLess(api.REQUEST_BOUND, 20)
        # A retry starts only with at least 4 s of the deadline left, and never outlives it.
        value, opener, _, _ = self.run_with(http_error(503), vertex_reply(), deadline=time.monotonic() + 5)
        self.assertEqual((value, len(opener.requests)), (RESULT, 2))
        self.assertLessEqual(opener.requests[1][1], 5)  # the pause is patched out here
        value, opener, _, _ = self.run_with(http_error(503), vertex_reply(), deadline=time.monotonic() + 3.5)
        self.assertEqual((value.reason, len(opener.requests)), ('provider_error', 1))

    def test_no_retry_when_the_deadline_leaves_no_room(self):
        value, opener, _, _ = self.run_with(http_error(503), vertex_reply(), deadline=time.monotonic() + 1)
        self.assertIsInstance(value, RecognitionUnavailable)
        self.assertEqual(len(opener.requests), 1)

    def test_unfinished_or_malformed_responses_are_provider_errors(self):
        for reply in (vertex_reply(finish='MAX_TOKENS'), vertex_reply(finish='SAFETY'), b'{"candidates":[]}', b'not json',
                      json.dumps({'candidates': [{'finishReason': 'STOP', 'content': {'parts': [{'text': 'no json'}]}}]}).encode()):
            with self.subTest(reply=reply[:40]):
                value, opener, _, _ = self.run_with(reply)
                self.assertIsInstance(value, RecognitionUnavailable)
                self.assertEqual(len(opener.requests), 1)


# Configuration -------------------------------------------------------------------------------------

def recognizer_config(directory, **changes):
    config = load_json(ROOT / 'config.example.json')
    config.update(GEMINI, state_backend='postgres', state_generation='11111111-1111-4111-8111-111111111111',
                  state_cutover_at='2026-10-01T00:00:00+07:00',
                  agent_database_worker_password_file='/etc/mw-integration-agent/secrets/worker.txt',
                  agent_database_relay_password_file='/etc/mw-integration-agent/secrets/relay.txt',
                  receipt_recognition_enabled=True, receipt_recognition_listen_host='10.148.0.2',
                  receipt_recognition_audience=AUDIENCE, receipt_recognition_callers=[DEV, PROD],
                  state_directory=str(directory))
    config.update(changes)
    return config


class ConfigTests(unittest.TestCase):
    def test_example_and_catalogue_stay_default_off(self):
        config = load_json(ROOT / 'config.example.json')
        validate_config(config)
        self.assertEqual((config['receipt_extraction_provider'], config['receipt_recognition_enabled'],
                          config['receipt_recognition_listen_host'], config['receipt_recognition_listen_port'],
                          config['receipt_recognition_audience']),
                         ('codex', False, '10.148.0.2', 8790, 'http://10.148.0.2:8790/v1/receipt-recognition'))
        self.assertEqual(config['receipt_recognition_callers'],
                         [{'email': 'mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '103101724082491419570'},
                          {'email': 'mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com', 'subject': '101534018806498664588'}])
        self.assertEqual((config['gemini_model'], config['gemini_location']), ('gemini-3.8-flash', 'global'))
        # Enabling only needs the switch and the PostgreSQL audit backend.
        validate_config({**config, 'receipt_recognition_enabled': True,
                         'state_backend': 'postgres', 'state_generation': '11111111-1111-4111-8111-111111111111',
                         'state_cutover_at': '2026-10-01T00:00:00+07:00',
                         'agent_database_worker_password_file': '/etc/mw-integration-agent/secrets/worker.txt',
                         'agent_database_relay_password_file': '/etc/mw-integration-agent/secrets/relay.txt'})
        catalogue = load_json(ROOT / 'service-catalogue.json')
        validate_catalogue(catalogue)
        self.assertEqual(catalogue['revision'], 29)
        self.assertEqual(catalogue['services']['receipt_recognition_api'], {'enabled': False, 'implemented': True})
        self.validator_knows_the_name(catalogue)

    def validator_knows_the_name(self, catalogue):
        services = dict(catalogue['services'])
        services['receipt_recognition_api'] = {'enabled': False, 'implemented': True}
        validate_catalogue({**catalogue, 'services': services})
        services['receipt_recognition_api'] = {'enabled': True, 'implemented': False}
        with self.assertRaises(ConfigurationError):
            validate_catalogue({**catalogue, 'services': services})

    def test_enabled_recognizer_requires_complete_pinned_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            validate_config(recognizer_config(directory))
            for change in ({'receipt_recognition_listen_host': '0.0.0.0'}, {'receipt_recognition_listen_host': '127.0.0.1'},
                           {'receipt_recognition_listen_host': '34.1.2.3'}, {'receipt_recognition_listen_host': None},
                           {'receipt_recognition_listen_port': 80}, {'receipt_recognition_listen_port': '8790'},
                           {'receipt_recognition_audience': None}, {'receipt_recognition_callers': []},
                           {'receipt_recognition_callers': [{'email': DEV['email']}]},
                           {'receipt_recognition_callers': [{**DEV, 'subject': 'abc'}]},
                           {'receipt_recognition_callers': [{**DEV, 'email': 'someone@example.com'}]},
                           {'receipt_recognition_provider': 'other'}, {'gemini_model': 'gemini-2.5-flash-preview-05-20'},
                           {'state_backend': 'sqlite'}, {'receipt_recognition_enabled': 'true'},
                           {'receipt_extraction_provider': 'other'}):
                with self.subTest(change=change), self.assertRaises(ConfigurationError):
                    validate_config(recognizer_config(directory, **change))

    def test_switching_the_cycle_to_gemini_needs_a_pinned_model(self):
        config = load_json(ROOT / 'config.example.json')
        config.update(receipt_extraction_provider='gemini', gemini_model=None)
        with self.assertRaises(ConfigurationError):
            validate_config(config)
        config['gemini_model'] = 'gemini-2.0-flash-001'
        validate_config(config)


# ID token verification -----------------------------------------------------------------------------

class TokenTests(unittest.TestCase):
    def verify(self, token):
        return api.verify_token(token, AUDIENCE, [DEV, PROD], keys())

    def test_allowed_callers_with_pinned_claims_pass(self):
        self.assertEqual(self.verify(sign(claims())), DEV)
        self.assertEqual(self.verify(sign(claims(PROD, iss='accounts.google.com'))), PROD)

    def test_every_pinned_claim_and_the_signature_are_enforced(self):
        now = int(time.time())
        for name, token in (('other key', sign(claims(), key=OTHER)), ('unknown kid', sign(claims(), kid='k2')),
                            ('alg none', sign(claims(), alg='none')), ('issuer', sign(claims(iss='https://evil.example'))),
                            ('audience', sign(claims(aud='http://10.148.0.2:8790'))),
                            ('email', sign(claims(email='other@clever-oasis-508610-n7.iam.gserviceaccount.com'))),
                            ('subject', sign(claims(sub=PROD['subject']))), ('unverified', sign(claims(email_verified=False))),
                            ('expired', sign(claims(exp=now - 1))), ('future', sign(claims(iat=now + 600))),
                            ('garbage', 'a.b.c'), ('tampered', sign(claims())[:-4] + 'AAAA')):
            with self.subTest(name):
                self.assertIsNone(self.verify(token))

    def test_key_fetches_back_off_after_failure_or_unknown_kid(self):
        calls, outcomes = [], [OSError('unreachable'), None, None]
        document = keys().fetch()

        def fetch():
            calls.append(1)
            outcome = outcomes.pop(0)
            if outcome:
                raise outcome
            return document
        cache = api.Keys(fetch)
        clock = [1000.0]
        with patch.object(api.time, 'monotonic', lambda: clock[0]):
            with self.assertRaises(OSError):
                cache.get('k1')
            for _ in range(5):  # within the minute: no refetch, still unavailable (no keys yet)
                with self.assertRaises(ConfigurationError):
                    cache.get('k1')
            self.assertEqual(len(calls), 1)
            clock[0] += api.FETCH_BACKOFF
            self.assertIsNotNone(cache.get('k1'))
            self.assertEqual(len(calls), 2)
            for _ in range(5):  # unknown key ids: no refetch within the minute, known ids keep working
                self.assertIsNone(cache.get('unknown'))
                self.assertIsNotNone(cache.get('k1'))
            self.assertEqual(len(calls), 2)
            clock[0] += api.FETCH_BACKOFF
            self.assertIsNone(cache.get('unknown'))
            self.assertEqual(len(calls), 3)

    def test_key_fetch_failure_is_not_a_denial(self):
        broken = api.Keys(lambda: (_ for _ in ()).throw(OSError('unreachable')))
        with self.assertRaises(OSError):
            api.verify_token(sign(claims()), AUDIENCE, [DEV], broken)


# HTTP contract ---------------------------------------------------------------------------------------

class ContractTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        root = Path(self.directory.name)
        self.config = recognizer_config(root)
        self.catalogue = load_json(ROOT / 'service-catalogue.json')
        self.catalogue['services']['receipt_recognition_api'] = {'enabled': True, 'implemented': True}
        self.config_path, self.catalogue_path = root / 'config.json', root / 'catalogue.json'
        self.write()
        self.audits, self.slots = [], threading.BoundedSemaphore(api.CONCURRENCY)
        self.recognize = patch.object(api, 'recognize', side_effect=lambda config, image, provider, deadline:
                                      {'provider': provider, 'model': 'gemini-2.0-flash-001', 'result': dict(RESULT)})
        self.recognize.start(); self.addCleanup(self.recognize.stop)
        self.log = io.StringIO()
        quiet = patch.object(api.sys, 'stderr', self.log)  # the one-line request reports
        quiet.start(); self.addCleanup(quiet.stop)
        self.start()

    def start(self, bound=api.REQUEST_BOUND, audit=None):
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), api.handler(
            str(self.config_path), str(self.catalogue_path), keys=keys(), slots=self.slots, bound=bound,
            audit=audit or (lambda *args: self.audits.append(args))))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown(); self.httpd.server_close(); self.directory.cleanup()

    def write(self):
        self.config_path.write_text(json.dumps(self.config)); self.catalogue_path.write_text(json.dumps(self.catalogue))

    def post(self, body=None, token=None, kind='image/png', digest=None, headers=None):
        body = png() if body is None else body
        sent = {'Content-Type': kind, 'X-Content-SHA256': hashlib.sha256(body).hexdigest() if digest is None else digest}
        if token is not False:
            sent['Authorization'] = 'Bearer ' + (token or sign(claims()))
        sent.update(headers or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        try:
            conn.request('POST', api.PATH, body=body, headers=sent)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_recognized_response_matches_the_contract(self):
        body = png()
        status, reply = self.post(body)
        self.assertEqual(status, 200)
        self.assertEqual(set(reply), {'status', 'provider', 'model', 'durationMs', 'imageSha256', 'result'})
        self.assertEqual((reply['status'], reply['provider'], reply['model'], reply['imageSha256'], reply['result']),
                         ('recognized', 'gemini', 'gemini-2.0-flash-001', hashlib.sha256(body).hexdigest(), RESULT))
        self.assertIsInstance(reply['durationMs'], int)
        image = api.recognize.call_args.args[1]
        self.assertLess(api.recognize.call_args.kwargs['deadline'] - time.monotonic(), 17.0)
        self.assertTrue(image.startswith(b'\x89PNG'))  # canonical PNG, not the caller's bytes object
        (config, caller, image_sha256, code, audited, _), = self.audits
        self.assertEqual((caller, image_sha256, code, audited['status']), (DEV, hashlib.sha256(body).hexdigest(), 200, 'recognized'))

    def test_jpeg_is_accepted(self):
        buffer = io.BytesIO(); Image.new('RGB', (20, 20), 'white').save(buffer, format='JPEG')
        self.assertEqual(self.post(buffer.getvalue(), kind='image/jpeg')[0], 200)

    def test_rejections(self):
        cases = (('hash mismatch', dict(digest='0' * 64), 400, {'status': 'rejected', 'reason': 'hash_mismatch'}),
                 ('hash missing', dict(digest=''), 400, {'status': 'rejected', 'reason': 'hash_mismatch'}),
                 ('uppercase hash', dict(digest=hashlib.sha256(png()).hexdigest().upper()), 400, {'status': 'rejected', 'reason': 'hash_mismatch'}),
                 ('webp type', dict(kind='image/webp'), 400, {'status': 'rejected', 'reason': 'unsupported_type'}),
                 ('pdf type', dict(kind='application/pdf'), 400, {'status': 'rejected', 'reason': 'unsupported_type'}),
                 ('magic mismatch', dict(kind='image/jpeg'), 400, {'status': 'rejected', 'reason': 'invalid_image'}),
                 ('not an image', dict(body=b'\x89PNG\r\n\x1a\nnot really'), 400, {'status': 'rejected', 'reason': 'invalid_image'}),
                 ('no token', dict(token=False), 401, {'status': 'denied'}),
                 ('basic auth', dict(token=False, headers={'Authorization': 'Basic abc'}), 401, {'status': 'denied'}),
                 ('bad token', dict(token=sign(claims(), key=OTHER)), 403, {'status': 'denied'}),
                 ('wrong caller', dict(token=sign(claims(sub='333333333333333333333'))), 403, {'status': 'denied'}))
        for name, kwargs, status, reply in cases:
            with self.subTest(name):
                self.assertEqual(self.post(**kwargs), (status, reply))
        api.recognize.assert_not_called()
        self.assertEqual(len(self.audits), 7)  # every authenticated request, none of the denied ones

    def raw(self, request):
        with socket.create_connection(('127.0.0.1', self.httpd.server_address[1]), timeout=10) as sock:
            sock.sendall(request)
            data = b''
            while chunk := sock.recv(65536):
                data += chunk
        head, _, body = data.partition(b'\r\n\r\n')
        return int(head.split()[1]), json.loads(body)

    def test_too_large_is_refused_before_reading_the_body(self):
        request = ('POST /v1/receipt-recognition HTTP/1.1\r\nHost: x\r\nContent-Type: image/png\r\n'
                   f'Authorization: Bearer {sign(claims())}\r\nX-Content-SHA256: {"0" * 64}\r\n'
                   f'Content-Length: {api.MAX_BYTES + 1}\r\n\r\n').encode()
        self.assertEqual(self.raw(request), (413, {'status': 'rejected', 'reason': 'too_large'}))

    def test_disabled_switch_or_catalogue_fails_closed(self):
        for change in ('config', 'catalogue', 'invalid'):
            with self.subTest(change):
                self.config['receipt_recognition_enabled'] = change != 'config'
                self.catalogue['services']['receipt_recognition_api']['enabled'] = change != 'catalogue'
                self.config['receipt_recognition_listen_port'] = 'bad' if change == 'invalid' else 8790
                self.write()
                self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'disabled'}))
                conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
                conn.request('GET', '/healthz')
                self.assertEqual(json.loads(conn.getresponse().read()), {'status': 'ok', 'enabled': False})
                conn.close()
        api.recognize.assert_not_called()

    def test_healthz_is_unauthenticated_and_calls_no_provider(self):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        conn.request('GET', '/healthz')
        response = conn.getresponse()
        self.assertEqual((response.status, json.loads(response.read())), (200, {'status': 'ok', 'enabled': True}))
        conn.close()
        api.recognize.assert_not_called()

    def test_busy_when_two_extractions_are_running(self):
        self.slots.acquire(); self.slots.acquire()
        try:
            self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'busy'}))
        finally:
            self.slots.release(); self.slots.release()
        self.assertEqual(self.post()[0], 200)

    def test_timeout_keeps_the_slot_until_the_extraction_really_ends(self):
        self.httpd.shutdown(); self.httpd.server_close()
        release = threading.Event()
        api.recognize.side_effect = lambda *args, **kwargs: release.wait(5) and {'provider': 'gemini', 'model': 'm', 'result': RESULT}
        self.start(bound=0.3)
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'timeout'}))
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'timeout'}))
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'busy'}))
        release.set()
        for _ in range(50):
            if self.slots.acquire(blocking=False):
                self.slots.release()
                break
            time.sleep(0.05)
        self.assertEqual(self.audits[-1][3:5], (503, {'status': 'unavailable', 'reason': 'busy'}))

    def test_provider_failures_are_unavailable(self):
        for error, reason in ((RecognitionUnavailable(), 'provider_error'), (RecognitionUnavailable('timeout'), 'timeout'),
                              (ConfigurationError('UNKNOWN_RECEIPT_PROVIDER'), 'provider_error')):
            with self.subTest(reason=reason):
                api.recognize.side_effect = error
                self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': reason}))

    def test_audit_failure_withholds_the_result(self):
        self.httpd.shutdown(); self.httpd.server_close()
        self.start(audit=lambda *args: (_ for _ in ()).throw(RuntimeError('audit down')))
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'provider_error'}))

    def causes(self):
        return [json.loads(line)['cause'] for line in self.log.getvalue().splitlines()]

    def test_journal_line_names_the_internal_cause_without_data(self):
        self.post(digest='0' * 64); self.post(token=False); self.post(token=sign(claims(), key=OTHER)); self.post()
        api.recognize.side_effect = RecognitionUnavailable('provider_error', 'vertex_http_403')
        self.post()
        api.recognize.side_effect = RecognitionUnavailable(cause='shape_invalid')
        self.post()
        self.assertEqual(self.causes(), ['hash_mismatch', 'token_missing', 'token_rejected', 'recognized', 'vertex_http_403', 'shape_invalid'])
        self.assertNotIn('xxx-x-x4321-x', self.log.getvalue())

    def test_audit_failure_is_named_in_the_journal(self):
        self.httpd.shutdown(); self.httpd.server_close()

        class CheckViolation(Exception):
            pass
        self.start(audit=lambda *args: (_ for _ in ()).throw(CheckViolation('new row violates check constraint')))
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'provider_error'}))
        self.assertEqual(self.causes(), ['audit_failed:CheckViolation'])
        self.assertNotIn('violates', self.log.getvalue())

    def test_key_outage_is_unavailable_with_its_cause(self):
        self.httpd.shutdown(); self.httpd.server_close()
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), api.handler(
            str(self.config_path), str(self.catalogue_path), keys=api.Keys(lambda: (_ for _ in ()).throw(OSError('down'))),
            slots=self.slots, audit=lambda *args: self.audits.append(args)))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.assertEqual(self.post(), (503, {'status': 'unavailable', 'reason': 'provider_error'}))
        self.assertEqual(self.causes(), ['keys_unavailable:OSError'])

    def test_unknown_paths_are_not_found(self):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1], timeout=10)
        conn.request('POST', '/v1/other', body=b'x')
        self.assertEqual(conn.getresponse().status, 404)
        conn.close()


class AuditTests(unittest.TestCase):
    def test_audit_records_caller_hash_provider_model_duration_and_outcome(self):
        events, plans = [], []

        class Activity:
            def __init__(self, config, service, action, route, plan):
                plans.append((service, action, route, plan))

            def __enter__(self):
                return 'op'

            def __exit__(self, kind, exc, tb):
                events.append(('exit', kind.__name__ if kind else None))
                return False

        class Transaction:
            def __enter__(self):
                return 'conn'

            def __exit__(self, *_):
                return False

        with patch('mw_integration_agent.audit.activity', Activity), \
                patch('mw_integration_agent.audit.event', lambda conn, op, kind, payload, route: events.append((kind, payload, route))), \
                patch('mw_integration_agent.state.transaction', lambda config: Transaction()):
            api.audit_outcome(GEMINI, DEV, 'a' * 64, 200, {'status': 'recognized'}, time.monotonic())
            api.audit_outcome(GEMINI, DEV, None, 413, {'status': 'rejected', 'reason': 'too_large'}, time.monotonic())
        self.assertEqual(plans[0], ('receipt_recognition_api', 'PROCESS', 'internal',
                                    {'caller': DEV['email'], 'image_sha256': 'a' * 64, 'provider': 'gemini', 'model': 'gemini-2.0-flash-001'}))
        kind, payload, route = events[0]
        self.assertEqual((kind, payload['outcome'], payload['http_status'], route), ('result_observed', 'recognized', 200, 'internal'))
        self.assertIsInstance(payload['duration_ms'], int)
        self.assertEqual(events[1], ('exit', None))
        self.assertEqual(events[2][1]['reason'], 'too_large')
        self.assertEqual(events[3], ('exit', 'Rejected'))  # non-recognized outcomes end the operation FAILED
        self.assertNotIn('image', json.dumps([plans, events[0][1]]).replace('image_sha256', ''))


class BindTests(unittest.TestCase):
    def test_bind_accepts_only_a_private_vpc_address(self):
        self.assertEqual(api.bind({'receipt_recognition_listen_host': '10.148.0.2'}), ('10.148.0.2', 8790))
        for host in ('0.0.0.0', '127.0.0.1', '8.8.8.8', '169.254.169.254', '::1', 'localhost', None):
            with self.subTest(host=host), self.assertRaises(ConfigurationError):
                api.bind({'receipt_recognition_listen_host': host})

    def test_run_bounded_releases_its_slot_only_when_work_finishes(self):
        slots = threading.BoundedSemaphore(1)
        self.assertEqual(api.run_bounded(slots, lambda: 7, 1), 7)
        self.assertTrue(slots.acquire(blocking=False)); slots.release()
        with self.assertRaises(api.Rejected) as caught:
            api.run_bounded(slots, lambda: (_ for _ in ()).throw(api.rejected('invalid_image')), 1)
        self.assertEqual(caught.exception.status, 400)
        self.assertTrue(slots.acquire(blocking=False)); slots.release()


if __name__ == '__main__':
    unittest.main()


class AuditRouteTests(unittest.TestCase):
    """Every literal audit route in the agent code must pass audit.events' CHECK list (V1 migration)."""
    # Pre-existing routes outside the CHECK list, found 18 October 2026; reported separately. Remove an entry
    # when its code or the constraint is fixed; a new violation fails this test.
    KNOWN_OUTSIDE_CHECK = {'native_api', 'shared-command-api'}
    POSITION = {'audited': 1, 'activity': 3, 'event': 4}

    def allowed(self):
        sql = (ROOT / 'database' / 'migrations' / 'V1__audit_and_control.sql').read_text(encoding='utf-8')
        match = re.search(r"route text NOT NULL CHECK\(route IN \(([^)]*)\)\)", sql)
        return set(re.findall(r"'([^']+)'", match.group(1)))

    def used(self):
        routes = {}
        for path in sorted((ROOT / 'src' / 'mw_integration_agent').glob('*.py')):
            for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
                if not isinstance(node, ast.Call):
                    continue
                name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, 'id', None)
                if name not in self.POSITION:
                    continue
                values = [k.value for k in node.keywords if k.arg == 'route']
                if len(node.args) > self.POSITION[name]:
                    values.append(node.args[self.POSITION[name]])
                for value in values:
                    if isinstance(value, ast.Constant) and isinstance(value.value, str):
                        routes.setdefault(value.value, set()).add(path.name)
        return routes

    def test_literal_audit_routes_are_allowed_by_the_schema(self):
        allowed, used = self.allowed(), self.used()
        self.assertIn('internal', allowed)
        self.assertTrue({'internal', 'codex', 'postgres'} <= set(used))
        outside = {route for route in used if route not in allowed}
        self.assertEqual(outside, self.KNOWN_OUTSIDE_CHECK, {r: sorted(used[r]) for r in outside})
        self.assertNotIn('gemini', used)
