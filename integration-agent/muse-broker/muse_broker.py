#!/usr/bin/env python3
"""Muse secret broker: a read-only Secret Manager proxy for the owner's assistant Muse (26 November 2026).

Runs on vm-mw-credit-agent as mw-muse-broker.service, bound to 127.0.0.1 only and published through the existing
Cloudflare tunnel. Muse holds one bearer key; the host keeps only its SHA-256 hash (re-read on every request, so
replacing or deleting the file rotates or revokes the key without a restart). The broker holds no Google key: it takes
the VM identity's token from the metadata server and impersonates muse-secret-reader (IAM Credentials
generateAccessToken, 1-hour token cached until 5 minutes before expiry). Only GET is served:

  GET /health                    -> {"ok": true}, no authentication, no data
  GET /v1/secrets                -> secret ids and metadata, never values
  GET /v1/secrets/{id}[?version=N] -> {"id", "version", "value", "encoding"} (latest enabled version by default)

The audit line per request (stdout, so the journal) carries the endpoint, secret id, version, status and byte count;
never a secret value, the key or a token. Standard library only (system Python 3.13).
"""
import base64
import binascii
import collections
import hashlib
import hmac
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = '127.0.0.1'  # fixed: loopback only, the tunnel is the one public path
PROJECT = os.environ.get('MUSE_BROKER_PROJECT', 'clever-oasis-508610-n7')
TARGET = os.environ.get('MUSE_BROKER_SERVICE_ACCOUNT', 'muse-secret-reader@clever-oasis-508610-n7.iam.gserviceaccount.com')
PORT = int(os.environ.get('MUSE_BROKER_PORT', '8793'))
KEY_HASH_FILE = os.environ.get('MUSE_BROKER_KEY_HASH_FILE', '/etc/mw-integration-agent/secrets/muse-broker-api-key.sha256')

METADATA_TOKEN_URL = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token'
IAM_CREDENTIALS = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{}:generateAccessToken'
SECRET_MANAGER = 'https://secretmanager.googleapis.com/v1'
SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

RATE_PER_MINUTE = 60
MAX_CONCURRENT = 8
SOCKET_TIMEOUT = 10
UPSTREAM_TIMEOUT = 10
UPSTREAM_MAX_BYTES = 4 * 1024 * 1024
MAX_PAGES = 20
MAX_PATH = 512
MAX_KEY = 256
REFRESH_MARGIN = 300

SECRET_ID = re.compile(r'[A-Za-z0-9_-]{1,255}')
VERSION = re.compile(r'[1-9][0-9]{0,9}')
HASH = re.compile(r'[0-9a-f]{64}')


class UpstreamError(Exception):
    """A Google call failed; `status` is the HTTP status (0 for transport errors). Never carries response text."""

    def __init__(self, status):
        super().__init__(f'upstream status {status}')
        self.status = status


class NotFound(Exception):
    pass


def _open_json(opener, request):
    try:
        with opener(request, timeout=UPSTREAM_TIMEOUT) as response:
            body = response.read(UPSTREAM_MAX_BYTES + 1)
    except urllib.error.HTTPError as error:
        error.close()
        raise UpstreamError(error.code) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise UpstreamError(0) from None
    if len(body) > UPSTREAM_MAX_BYTES:
        raise UpstreamError(0)
    try:
        return json.loads(body)
    except ValueError:
        raise UpstreamError(0) from None


def _expiry(text, now):
    try:
        return datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()
    except (AttributeError, ValueError):
        return now + 3000


class TokenProvider:
    """Impersonated access token for TARGET, minted from the VM identity and cached until shortly before expiry."""

    def __init__(self, opener, clock=time.time):
        self._opener, self._clock = opener, clock
        self._lock = threading.Lock()
        self._token, self._expires = None, 0.0

    def token(self):
        with self._lock:
            if self._token and self._clock() < self._expires - REFRESH_MARGIN:
                return self._token
            vm = _open_json(self._opener, urllib.request.Request(METADATA_TOKEN_URL, headers={'Metadata-Flavor': 'Google'}))
            body = json.dumps({'scope': [SCOPE], 'lifetime': '3600s'}).encode()
            minted = _open_json(self._opener, urllib.request.Request(
                IAM_CREDENTIALS.format(TARGET), data=body, method='POST',
                headers={'Authorization': 'Bearer ' + vm['access_token'], 'Content-Type': 'application/json'}))
            self._token, self._expires = minted['accessToken'], _expiry(minted.get('expireTime'), self._clock())
            return self._token

    def invalidate(self):
        with self._lock:
            self._token, self._expires = None, 0.0


class SecretManager:
    """The three read calls the broker needs: list secrets, list enabled versions, access one version."""

    def __init__(self, tokens, opener):
        self._tokens, self._opener = tokens, opener

    def _get(self, url):
        for attempt in (1, 2):
            request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + self._tokens.token()})
            try:
                return _open_json(self._opener, request)
            except UpstreamError as error:
                if error.status == 401 and attempt == 1:
                    self._tokens.invalidate()
                    continue
                if error.status == 404 or (error.status == 400 and '/versions/' in url):
                    raise NotFound() from None  # unknown secret or version; 400 = version disabled or destroyed
                raise
        raise UpstreamError(401)

    def _pages(self, url, key):
        items, token = [], None
        for _ in range(MAX_PAGES):
            query = {'pageSize': '250', **({'pageToken': token} if token else {})}
            data = self._get(url + ('&' if '?' in url else '?') + urllib.parse.urlencode(query))
            items.extend(data.get(key, []))
            token = data.get('nextPageToken')
            if not token:
                return items
        raise UpstreamError(0)

    def list_secrets(self):
        secrets = self._pages(f'{SECRET_MANAGER}/projects/{PROJECT}/secrets', 'secrets')
        rows = [{'id': s['name'].rsplit('/', 1)[-1], 'create_time': s.get('createTime'), 'labels': s.get('labels', {})} for s in secrets]
        return sorted(rows, key=lambda row: row['id'])

    def latest_enabled_version(self, secret_id):
        url = f'{SECRET_MANAGER}/projects/{PROJECT}/secrets/{secret_id}/versions?' + urllib.parse.urlencode({'filter': 'state:ENABLED'})
        numbers = [int(v['name'].rsplit('/', 1)[-1]) for v in self._pages(url, 'versions') if v.get('state', 'ENABLED') == 'ENABLED']
        if not numbers:
            raise NotFound()
        return str(max(numbers))

    def access(self, secret_id, version):
        data = self._get(f'{SECRET_MANAGER}/projects/{PROJECT}/secrets/{secret_id}/versions/{version}:access')
        try:
            return base64.b64decode(data['payload']['data'], validate=True)
        except (KeyError, TypeError, binascii.Error):
            raise UpstreamError(0) from None


class RateLimiter:
    def __init__(self, limit=RATE_PER_MINUTE, window=60.0, clock=time.monotonic):
        self._limit, self._window, self._clock = limit, window, clock
        self._hits, self._lock = collections.deque(), threading.Lock()

    def allow(self):
        with self._lock:
            now = self._clock()
            while self._hits and now - self._hits[0] >= self._window:
                self._hits.popleft()
            if len(self._hits) >= self._limit:
                return False
            self._hits.append(now)
            return True


def key_matches(header, hash_file=None):
    """Constant-time check of 'Bearer <key>' against the stored SHA-256 hex digest; fails closed on any file problem."""
    if not header or not header.startswith('Bearer '):
        return False
    key = header[7:].strip()
    if not key or len(key) > MAX_KEY:
        return False
    try:
        with open(hash_file or KEY_HASH_FILE, encoding='ascii') as handle:
            stored = handle.read(200).strip().lower()
    except (OSError, UnicodeDecodeError):
        return False
    if not HASH.fullmatch(stored):
        return False
    return hmac.compare_digest(hashlib.sha256(key.encode()).hexdigest(), stored)


class Broker:
    def __init__(self, secrets, limiter=None, hash_file=None, log=None):
        self.secrets, self.limiter, self.hash_file = secrets, limiter or RateLimiter(), hash_file
        self.slots = threading.BoundedSemaphore(MAX_CONCURRENT)
        self.log = log or (lambda line: print(line, flush=True))

    def audit(self, handler, endpoint, status, size, auth, secret_id=None, version=None, started=None):
        record = {'ts': datetime.now(UTC).isoformat(timespec='seconds'), 'event': 'request', 'method': handler.command,
                  'endpoint': endpoint, 'secret_id': secret_id, 'version': version, 'status': status, 'bytes': size, 'auth': auth,
                  'client': handler.headers.get('Cf-Connecting-Ip') or 'local'}
        if started is not None:
            record['ms'] = int((time.monotonic() - started) * 1000)
        self.log(json.dumps(record, separators=(',', ':')))

    def respond(self, handler, status, payload, headers=()):
        body = json.dumps(payload, separators=(',', ':')).encode()
        handler.send_response(status)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Content-Length', str(len(body)))
        handler.send_header('Cache-Control', 'no-store')
        handler.send_header('X-Content-Type-Options', 'nosniff')
        for name, value in headers:
            handler.send_header(name, value)
        handler.end_headers()
        if handler.command != 'HEAD':
            handler.wfile.write(body)
        return len(body)

    def handle(self, handler):
        started = time.monotonic()
        if not self.slots.acquire(blocking=False):
            self.respond(handler, 503, {'error': 'busy'})
            return
        try:
            self._handle(handler, started)
        finally:
            self.slots.release()

    def _handle(self, handler, started):
        if len(handler.path) > MAX_PATH:
            size = self.respond(handler, 414, {'error': 'uri_too_long'})
            return self.audit(handler, 'other', 414, size, 'none', started=started)
        parts = urllib.parse.urlsplit(handler.path)
        path = parts.path
        if path == '/health' and handler.command == 'GET' and not parts.query:
            self.respond(handler, 200, {'ok': True})
            return None
        if handler.command != 'GET':
            size = self.respond(handler, 405, {'error': 'method_not_allowed'}, [('Allow', 'GET')])
            return self.audit(handler, 'other', 405, size, 'none', started=started)
        if handler.headers.get('Content-Length', '0').strip() not in ('', '0') or handler.headers.get('Transfer-Encoding'):
            size = self.respond(handler, 413, {'error': 'body_not_allowed'})
            return self.audit(handler, 'other', 413, size, 'none', started=started)
        if not self.limiter.allow():
            size = self.respond(handler, 429, {'error': 'rate_limited'}, [('Retry-After', '60')])
            return self.audit(handler, 'other', 429, size, 'none', started=started)
        if not key_matches(handler.headers.get('Authorization'), self.hash_file):
            size = self.respond(handler, 401, {'error': 'unauthorized'}, [('WWW-Authenticate', 'Bearer')])
            return self.audit(handler, 'other', 401, size, 'fail', started=started)

        query = urllib.parse.parse_qs(parts.query, keep_blank_values=True, max_num_fields=4)
        if path == '/v1/secrets':
            if query:
                return self._finish(handler, started, '/v1/secrets', 400, {'error': 'bad_request'})
            try:
                rows = self.secrets.list_secrets()
            except UpstreamError:
                return self._finish(handler, started, '/v1/secrets', 502, {'error': 'upstream_error'})
            return self._finish(handler, started, '/v1/secrets', 200, {'project': PROJECT, 'count': len(rows), 'secrets': rows})

        match = re.fullmatch(r'/v1/secrets/([^/]+)', path)
        if not match:
            return self._finish(handler, started, 'other', 404, {'error': 'not_found'})
        endpoint, secret_id = '/v1/secrets/{id}', urllib.parse.unquote(match.group(1))
        if not SECRET_ID.fullmatch(secret_id):
            return self._finish(handler, started, endpoint, 404, {'error': 'not_found'})
        if set(query) - {'version'} or len(query.get('version', [])) > 1:
            return self._finish(handler, started, endpoint, 400, {'error': 'bad_request'}, secret_id)
        version = query.get('version', [None])[0]
        if version is not None and not VERSION.fullmatch(version):
            return self._finish(handler, started, endpoint, 400, {'error': 'bad_request'}, secret_id)
        try:
            version = version or self.secrets.latest_enabled_version(secret_id)
            value = self.secrets.access(secret_id, version)
        except NotFound:
            return self._finish(handler, started, endpoint, 404, {'error': 'not_found'}, secret_id, version)
        except UpstreamError:
            return self._finish(handler, started, endpoint, 502, {'error': 'upstream_error'}, secret_id, version)
        try:
            payload = {'id': secret_id, 'version': version, 'value': value.decode('utf-8'), 'encoding': 'utf-8'}
        except UnicodeDecodeError:
            payload = {'id': secret_id, 'version': version, 'value': base64.b64encode(value).decode(), 'encoding': 'base64'}
        return self._finish(handler, started, endpoint, 200, payload, secret_id, version)

    def _finish(self, handler, started, endpoint, status, payload, secret_id=None, version=None):
        size = self.respond(handler, status, payload)
        self.audit(handler, endpoint, status, size, 'ok', secret_id, version, started)


def make_handler(broker):
    class Handler(BaseHTTPRequestHandler):
        server_version, sys_version = 'mw-muse-broker', ''
        timeout = SOCKET_TIMEOUT

        def log_message(self, *args):  # the audit line replaces the default access log (which would echo the path only)
            return None

        def _dispatch(self):
            broker.handle(self)

        do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _dispatch

    return Handler


def build_server(broker, port=None):
    server = ThreadingHTTPServer((HOST, PORT if port is None else port), make_handler(broker))
    server.daemon_threads = True
    return server


def main():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({})).open
    broker = Broker(SecretManager(TokenProvider(opener), opener))
    server = build_server(broker)
    print(json.dumps({'event': 'started', 'host': HOST, 'port': server.server_address[1], 'project': PROJECT, 'target': TARGET}), flush=True)
    server.serve_forever()


if __name__ == '__main__':
    sys.exit(main())
