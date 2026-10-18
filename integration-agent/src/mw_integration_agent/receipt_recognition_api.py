"""Receipt recognition API for the MW Credit command services (catalogue key receipt_recognition_api).

POST /v1/receipt-recognition takes raw PNG/JPEG bytes (at most 5 MB) with a matching
X-Content-SHA256 header and a Google ID token from an allowed caller, runs the shared extraction
module and returns the shape-checked result with the provider and pinned model. It never stores
the image, reads no business database and does no account matching. Disabled configuration or
catalogue entry fails closed (503 disabled), read per request. At most two extractions run at
once (else 503 busy) and each request is bounded (503 timeout). GET /healthz needs no token and
never calls a provider. The listener binds only to a private VPC address.
"""
import base64
import hashlib
import hmac
import ipaddress
import json
import re
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from . import http
from .config import ConfigurationError, load_controls, load_json, validate_catalogue, validate_config
from .receipt_image import PROVIDERS, RecognitionUnavailable, canonical_image, provider_module, recognize

SERVICE = 'receipt_recognition_api'
PATH = '/v1/receipt-recognition'
MAX_BYTES = 5_242_880
CONCURRENCY = 2
REQUEST_BOUND = 30.0
PROVIDER_MARGIN = 2.0  # the provider's own deadline ends before the request bound
DEFAULT_PORT = 8790
TYPES = {'image/png': b'\x89PNG\r\n\x1a\n', 'image/jpeg': b'\xff\xd8\xff'}
ISSUERS = ('https://accounts.google.com', 'accounts.google.com')
CERTS = 'https://www.googleapis.com/oauth2/v3/certs'
CALLER_EMAIL = re.compile(r'[a-z0-9-]+@(?:[a-z0-9-]+\.iam|developer)\.gserviceaccount\.com')
CLOCK_SKEW = 60
FETCH_BACKOFF = 60  # seconds between Google key fetches, successful or failed
# DER DigestInfo prefix for SHA-256 (RFC 8017, section 9.2 note 1).
SHA256_INFO = bytes.fromhex('3031300d060960864801650304020105000420')


# Configuration ---------------------------------------------------------------------------------

def validate(config):
    """Recognizer and receipt-cycle provider settings; called from config.validate_config."""
    cycle = config.get('receipt_extraction_provider', 'codex')
    if cycle not in PROVIDERS:
        raise ConfigurationError('receipt_extraction_provider must be codex or gemini')
    if cycle == 'gemini':
        provider_module('gemini').validate(config)
    if type(config.get('receipt_recognition_enabled', False)) is not bool:
        raise ConfigurationError('receipt_recognition_enabled must be boolean')
    if not config.get('receipt_recognition_enabled'):
        return
    provider = config.get('receipt_recognition_provider', 'gemini')
    if provider not in PROVIDERS:
        raise ConfigurationError('receipt_recognition_provider must be codex or gemini')
    if provider == 'gemini':
        provider_module('gemini').validate(config)
    if config.get('state_backend') != 'postgres':
        raise ConfigurationError('receipt recognition requires PostgreSQL audit')
    bind(config)
    audience = config.get('receipt_recognition_audience')
    if not isinstance(audience, str) or not re.fullmatch(r'https?://[A-Za-z0-9.:\[\]-]+(?:/[A-Za-z0-9._/-]*)?', audience) or len(audience) > 200:
        raise ConfigurationError('receipt_recognition_audience must be the recognizer URL')
    callers(config)


def bind(config):
    """The (host, port) to listen on: a private VPC IPv4 address, never loopback, wildcard or public."""
    host, port = config.get('receipt_recognition_listen_host'), config.get('receipt_recognition_listen_port', DEFAULT_PORT)
    try:
        address = ipaddress.IPv4Address(host)
    except (ValueError, TypeError):
        raise ConfigurationError('receipt_recognition_listen_host must be the VM VPC address') from None
    if not address.is_private or address.is_loopback or address.is_unspecified or address.is_link_local:
        raise ConfigurationError('receipt_recognition_listen_host must be the VM VPC address')
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ConfigurationError('receipt_recognition_listen_port must be 1024..65535')
    return str(address), port


def callers(config):
    value = config.get('receipt_recognition_callers')
    if not isinstance(value, list) or not 1 <= len(value) <= 4:
        raise ConfigurationError('receipt_recognition_callers must list 1..4 callers')
    for caller in value:
        if (not isinstance(caller, dict) or set(caller) != {'email', 'subject'}
                or not isinstance(caller['email'], str) or not CALLER_EMAIL.fullmatch(caller['email'])
                or not isinstance(caller['subject'], str) or not re.fullmatch(r'\d{10,30}', caller['subject'])):
            raise ConfigurationError('receipt_recognition_callers entries need a service account email and numeric subject')
    return value


def provider(config):
    return config.get('receipt_recognition_provider', 'gemini')


# Google ID token verification (RS256, Google signing keys, pinned claims) ----------------------

def b64(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


class Keys:
    """Google's ID-token signing keys, cached by Cache-Control max-age (60 s .. 6 h)."""
    def __init__(self, fetch=None):
        self.fetch, self.lock = fetch or self.download, threading.Lock()
        self.keys, self.expires, self.attempted = {}, float('-inf'), float('-inf')

    @staticmethod
    def download():
        request = urllib.request.Request(CERTS, headers={'User-Agent': 'MW-Receipt-Recognition/1.0'})
        with http.opener().open(request, timeout=5) as response:
            raw = response.read(65537)
            match = re.search(r'max-age=(\d+)', response.headers.get('Cache-Control', ''))
        if len(raw) > 65536:
            raise ConfigurationError('INVALID_GOOGLE_CERTS')
        return json.loads(raw), int(match.group(1)) if match else 300

    def get(self, kid):
        """The (n, e) of a current key id, or None.

        At most one fetch a minute, successful or not: an unknown key id or a failed fetch cannot make
        every request wait on the 5 s download under the lock. Within that minute expired keys stay in
        use; with no keys at all the request is unavailable (not denied).
        """
        with self.lock:
            now = time.monotonic()
            due = now >= self.expires or kid not in self.keys
            if due and now - self.attempted >= FETCH_BACKOFF:
                self.attempted = now  # before the fetch, so a failure also backs off
                document, age = self.fetch()
                self.keys = {k['kid']: (int.from_bytes(b64(k['n']), 'big'), int.from_bytes(b64(k['e']), 'big'))
                             for k in document.get('keys', []) if k.get('kty') == 'RSA' and k.get('alg', 'RS256') == 'RS256'}
                self.expires = now + min(max(age, 60), 21600)
            if not self.keys:
                raise ConfigurationError('GOOGLE_CERTS_UNAVAILABLE')
            return self.keys.get(kid)


def rsa_sha256_valid(signed, signature, key):
    """RSASSA-PKCS1-v1_5 with SHA-256 (RFC 8017 8.2.2), full encoded-message comparison."""
    n, e = key
    size = (n.bit_length() + 7) // 8
    if len(signature) != size or size < 256:
        return False
    s = int.from_bytes(signature, 'big')
    if s >= n:
        return False
    digest_info = SHA256_INFO + hashlib.sha256(signed).digest()
    expected = b'\x00\x01' + b'\xff' * (size - len(digest_info) - 3) + b'\x00' + digest_info
    return hmac.compare_digest(pow(s, e, n).to_bytes(size, 'big'), expected)


def verify_token(token, audience, allowed, keys, now=None):
    """The matching allowed caller, or None. Pinned issuer, audience, email, numeric subject, expiry.

    A failure to fetch Google's keys propagates (the request is unavailable, not denied).
    """
    try:
        head, payload, signature = token.split('.')
        header, claims, signature = json.loads(b64(head)), json.loads(b64(payload)), b64(signature)
        if header.get('alg') != 'RS256' or not isinstance(header.get('kid'), str) or not isinstance(claims, dict):
            return None
    except (ValueError, TypeError, AttributeError, UnicodeError):
        return None
    key = keys.get(header['kid'])
    if key is None or not rsa_sha256_valid((head + '.' + payload).encode('ascii'), signature, key):
        return None
    now = time.time() if now is None else now
    if (claims.get('iss') not in ISSUERS or claims.get('aud') != audience or claims.get('email_verified') is not True
            or type(claims.get('exp')) not in (int, float) or claims['exp'] <= now
            or type(claims.get('iat')) not in (int, float) or claims['iat'] > now + CLOCK_SKEW):
        return None
    for caller in allowed:
        if claims.get('email') == caller['email'] and claims.get('sub') == caller['subject']:
            return caller
    return None


# Request handling -------------------------------------------------------------------------------

class Rejected(Exception):
    """A contract response. `cause` is the internal failure class for the journal line only."""
    def __init__(self, status, body, cause=None):
        super().__init__(body.get('reason') or body['status'])
        self.status, self.body = status, body
        self.cause = cause or body.get('reason') or body['status']


def unavailable(reason, cause=None):
    return Rejected(503, {'status': 'unavailable', 'reason': reason}, cause)


def rejected(reason, status=400):
    return Rejected(status, {'status': 'rejected', 'reason': reason})


def run_bounded(slots, work, bound):
    """Run work() on its own thread holding one slot; 503 busy without a slot, 503 timeout past the bound.

    The slot is released only when work() really finishes, so an overrunning extraction keeps counting.
    """
    if not slots.acquire(blocking=False):
        raise unavailable('busy')
    outcome = {}

    def target():
        try:
            outcome['value'] = work()
        except BaseException as exc:  # handed to the request thread
            outcome['error'] = exc
        finally:
            slots.release()

    thread = threading.Thread(target=target, name='receipt-recognition', daemon=True)
    thread.start()
    thread.join(bound)
    if thread.is_alive():
        raise unavailable('timeout', 'request_timeout')
    if 'error' in outcome:
        raise outcome['error']
    return outcome['value']


def recognise_image(config, raw, deadline):
    try:
        image, _ = canonical_image(raw)
    except ConfigurationError:
        raise rejected('invalid_image') from None
    try:
        return recognize(config, image, provider(config), deadline=deadline)
    except RecognitionUnavailable as exc:
        raise unavailable('timeout' if exc.reason == 'timeout' else 'provider_error', exc.cause) from None
    except ConfigurationError:
        raise unavailable('provider_error', 'provider_config') from None


def audit_outcome(config, caller, image_sha256, status, body, started):
    """One audit operation per authenticated request: caller, image hash, provider, model, duration, outcome."""
    from .audit import activity, event
    from .state import transaction
    name = provider(config)
    try:
        model = provider_module(name).model(config)
    except ConfigurationError:
        model = None
    plan = {'caller': caller['email'], 'image_sha256': image_sha256, 'provider': name, 'model': model}
    observed = {'outcome': body['status'], 'reason': body.get('reason'), 'http_status': status,
                'duration_ms': int((time.monotonic() - started) * 1000)}
    # Route 'internal': audit.events.route has a fixed CHECK list (V1) without provider names.
    try:
        with activity(config, SERVICE, 'PROCESS', 'internal', plan) as op:
            if op:
                with transaction(config) as conn:
                    event(conn, op, 'result_observed', observed, 'internal')
                if status != 200:
                    raise Rejected(status, body)
    except Rejected:
        pass


def handler(config_path, catalogue_path, keys=None, slots=None, bound=REQUEST_BOUND, audit=audit_outcome):
    keys = keys or Keys()
    slots = slots or threading.BoundedSemaphore(CONCURRENCY)

    class Handler(BaseHTTPRequestHandler):
        timeout = 15  # a slow client cannot hold a handler thread forever

        def log_message(self, *_args):
            return

        def respond(self, status, body):
            data = json.dumps(body, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def report(self, status, body, started, caller=None, cause=None):
            # One line per request: never the image, token, result fields or exception messages.
            print(json.dumps({'event': 'receipt_recognition', 'status': status, 'outcome': body['status'],
                              'reason': body.get('reason'), 'cause': cause, 'caller': caller and caller['email'],
                              'duration_ms': int((time.monotonic() - started) * 1000)}, separators=(',', ':')),
                  file=sys.stderr, flush=True)

        def controls(self):
            config, catalogue = load_controls(config_path, catalogue_path)
            on = bool(config.get('receipt_recognition_enabled') and catalogue['services'].get(SERVICE, {}).get('enabled'))
            return config, on

        def do_GET(self):
            if urlsplit(self.path).path != '/healthz':
                self.respond(404, {'status': 'not_found'})
                return
            try:
                enabled = self.controls()[1]
            except Exception:
                enabled = False
            self.respond(200, {'status': 'ok', 'enabled': enabled})

        def do_POST(self):
            started = time.monotonic()
            if urlsplit(self.path).path != PATH:
                self.respond(404, {'status': 'not_found'})
                return
            caller, image_sha256, self.image_sha256, cause = None, None, None, None
            try:
                try:
                    config, enabled = self.controls()
                except Exception as exc:
                    enabled, cause = False, 'config_invalid:' + type(exc).__name__
                if not enabled:
                    raise unavailable('disabled', cause)
                authorization = self.headers.get('Authorization', '')
                if not authorization.startswith('Bearer ') or len(authorization) > 8192:
                    raise Rejected(401, {'status': 'denied'}, 'token_missing')
                try:
                    caller = verify_token(authorization[7:], config['receipt_recognition_audience'], callers(config), keys)
                except Exception as exc:
                    raise unavailable('provider_error', 'keys_unavailable:' + type(exc).__name__) from None
                if caller is None:
                    raise Rejected(403, {'status': 'denied'}, 'token_rejected')
                try:
                    status, body = self.authorised(config, started)
                    image_sha256, cause = body.get('imageSha256'), 'recognized'
                except Rejected as exc:
                    status, body, cause = exc.status, exc.body, exc.cause
                    image_sha256 = self.image_sha256
                try:
                    audit(config, caller, image_sha256, status, body, started)
                except Exception as exc:
                    # Fail closed: a result whose audit row could not be written is not returned.
                    status, body = 503, {'status': 'unavailable', 'reason': 'provider_error'}
                    cause = 'audit_failed:' + type(exc).__name__
            except Rejected as exc:
                status, body, cause = exc.status, exc.body, exc.cause
            except Exception as exc:
                status, body = 503, {'status': 'unavailable', 'reason': 'provider_error'}
                cause = 'internal:' + type(exc).__name__
            self.report(status, body, started, caller, cause)
            self.respond(status, body)

        def authorised(self, config, started):
            if self.headers.get('Transfer-Encoding'):
                raise rejected('invalid_image')
            try:
                length = int(self.headers.get('Content-Length', ''))
            except ValueError:
                raise rejected('invalid_image') from None
            if length > MAX_BYTES:
                raise rejected('too_large', 413)
            if length <= 0:
                raise rejected('invalid_image')
            kind = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
            if kind not in TYPES:
                raise rejected('unsupported_type')
            claimed = self.headers.get('X-Content-SHA256', '')
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise rejected('invalid_image')
            self.image_sha256 = hashlib.sha256(raw).hexdigest()
            if not re.fullmatch(r'[0-9a-f]{64}', claimed) or not hmac.compare_digest(claimed, self.image_sha256):
                raise rejected('hash_mismatch')
            if not raw.startswith(TYPES[kind]):
                raise rejected('invalid_image')
            deadline = started + bound - PROVIDER_MARGIN
            value = run_bounded(slots, lambda: recognise_image(config, raw, deadline), max(0.0, started + bound - time.monotonic()))
            return 200, {'status': 'recognized', 'provider': value['provider'], 'model': value['model'],
                         'durationMs': int((time.monotonic() - started) * 1000), 'imageSha256': self.image_sha256,
                         'result': value['result']}
    return Handler


def serve(config_path, catalogue_path):
    config = load_json(config_path)
    validate_config(config)
    validate_catalogue(load_json(catalogue_path))
    host, port = bind(config)
    # Load every request-path module now, so a later package replacement cannot mix versions in this process.
    from . import audit, receipt_provider_codex, receipt_provider_gemini, state  # noqa: F401
    if state.enabled(config):
        import psycopg  # noqa: F401
    server = ThreadingHTTPServer((host, port), handler(config_path, catalogue_path))
    server.daemon_threads = True
    try:
        server.serve_forever()
    finally:
        server.server_close()
