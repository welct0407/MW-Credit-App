"""Chat relay for the MW Credit chat services (catalogue key chat_messages_relay, R102).

POST /v1/chat/messages takes one Anthropic Messages API request (JSON, at most 1 MB, a claude-* model, stream true,
custom tools only) from an allowed chat service identity (Google ID token, audience = the relay URL), and forwards it
to https://api.anthropic.com/v1/messages, streaming the SSE bytes back unchanged. The relay is keyless: it holds no
Anthropic API key. Upstream credentials come from Anthropic workload identity federation: the VM's own Google ID
token (audience per environment, format=full) is exchanged at /v1/oauth/token for a short-lived Bearer token, cached
in memory per environment and refreshed before expiry (CredentialProvider; Forge's R102 federation spec). A DEV chat
caller may use only the DEV federation rule and a PROD caller only the PROD rule.

It never writes or logs a request or response body, the caller's token, the VM identity token, the exchange body or
the access token; the audit row and the one log line carry caller, environment, rule id, model, status, duration,
byte counts and the upstream request id. Disabled configuration or catalogue entry fails closed (503 disabled), read
per request. At most four relays run at once (else 503 busy); each is bounded by chat_relay_upstream_timeout_seconds
(110 s, below the chat service's 120 s request bound). GET /healthz needs no token and never calls upstream. The
listener binds only to a private VPC address.
"""
import http.client
import ipaddress
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from . import http as agent_http
from .config import ConfigurationError, load_controls, load_json, validate_catalogue, validate_config
from .receipt_recognition_api import Keys, verify_token  # the shared Google ID-token verifier

SERVICE = 'chat_messages_relay'
PATH = '/v1/chat/messages'
DEFAULT_PORT = 8791
MAX_BYTES = 1_048_576
CONCURRENCY = 4
DEFAULT_UPSTREAM_TIMEOUT = 110
UPSTREAM_HOST = 'api.anthropic.com'
MESSAGES_PATH = '/v1/messages'
TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token'
ANTHROPIC_VERSION = '2023-06-01'
GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
ENVIRONMENTS = ('dev', 'prod')
PROJECT = 'clever-oasis-508610-n7'
CALLER_EMAIL = re.compile(r'mw-credit-app-chat-(dev|prod)@' + re.escape(PROJECT) + r'\.iam\.gserviceaccount\.com')
MODEL = re.compile(r'claude-[a-z]+-[0-9]+(?:-[0-9]+)?')
REQUEST_KEYS = frozenset({'model', 'system', 'messages', 'tools', 'tool_choice', 'max_tokens', 'output_config', 'stream', 'metadata'})
RULE_KEYS = {'federation_rule_id': r'fdrl_[A-Za-z0-9_-]{1,120}', 'service_account_id': r'svac_[A-Za-z0-9_-]{1,120}',
             'workspace_id': r'wrkspc_[A-Za-z0-9_-]{1,120}'}
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
ADVISORY_REFRESH = 120  # seconds before expiry: refresh, keep the cached token if the exchange fails
MANDATORY_REFRESH = 30  # seconds before expiry: refresh, fail the request if the exchange fails
IDENTITY_TIMEOUT = 5
EXCHANGE_TIMEOUT = 10
ERROR_LIMIT = 65536
CHUNK = 65536
# Sent before closing a stream the relay ends itself, in the Messages API's SSE error shape, so the chat service can
# tell a relay deadline (timeout_error -> MODEL_TIMEOUT) and an upstream interruption (api_error) from a complete stream.
RELAY_DEADLINE_EVENT = b'event: error\ndata: {"type":"error","error":{"type":"timeout_error","message":"relay deadline"}}\n\n'
RELAY_INTERRUPTED_EVENT = b'event: error\ndata: {"type":"error","error":{"type":"api_error","message":"upstream stream interrupted"}}\n\n'
# An API key or other Anthropic credential in the service environment is refused: there is no API key path.
FORBIDDEN_ENVIRONMENT = ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE')


def rule_audience(environment):
    return f'https://api.anthropic.com/mw-credit-chat-{environment}'


# Configuration ---------------------------------------------------------------------------------

def validate(config):
    """Chat relay settings; called from config.validate_config. Every key starts with chat_relay_ (never claude_)."""
    if type(config.get('chat_relay_enabled', False)) is not bool:
        raise ConfigurationError('chat_relay_enabled must be boolean')
    if not config.get('chat_relay_enabled'):
        return
    if config.get('state_backend') != 'postgres':
        raise ConfigurationError('chat relay requires PostgreSQL audit')
    bind(config)
    audience = config.get('chat_relay_audience')
    if not isinstance(audience, str) or not re.fullmatch(r'http://[0-9.]+:[0-9]{4,5}' + re.escape(PATH), audience):
        raise ConfigurationError('chat_relay_audience must be the relay URL')
    upstream_timeout(config)
    for caller in callers(config):
        rule(config, caller['environment'])


def bind(config):
    """The (host, port) to listen on: a private VPC IPv4 address, never loopback, wildcard or public."""
    host, port = config.get('chat_relay_listen_host'), config.get('chat_relay_listen_port', DEFAULT_PORT)
    try:
        address = ipaddress.IPv4Address(host)
    except (ValueError, TypeError):
        raise ConfigurationError('chat_relay_listen_host must be the VM VPC address') from None
    if not address.is_private or address.is_loopback or address.is_unspecified or address.is_link_local:
        raise ConfigurationError('chat_relay_listen_host must be the VM VPC address')
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ConfigurationError('chat_relay_listen_port must be 1024..65535')
    return str(address), port


def callers(config):
    """The allowed chat service identities: email, numeric subject, and the environment named by the email."""
    value = config.get('chat_relay_callers')
    if not isinstance(value, list) or not 1 <= len(value) <= 2:
        raise ConfigurationError('chat_relay_callers must list 1..2 callers')
    seen = set()
    result = []
    for caller in value:
        match = isinstance(caller, dict) and isinstance(caller.get('email'), str) and CALLER_EMAIL.fullmatch(caller['email'])
        if (not match or set(caller) != {'email', 'subject', 'environment'} or caller['environment'] != match.group(1)
                or not isinstance(caller['subject'], str) or not re.fullmatch(r'\d{10,30}', caller['subject'])
                or caller['environment'] in seen):
            raise ConfigurationError('chat_relay_callers entries need the environment\'s chat service account, its subject and environment')
        seen.add(caller['environment'])
        result.append(caller)
    return result


def rule(config, environment):
    """The federation rule of one environment (IDs only, no secrets); incomplete or placeholder values fail closed."""
    organization = config.get('chat_relay_wif_organization_id')
    if not isinstance(organization, str) or not UUID.fullmatch(organization):
        raise ConfigurationError('chat_relay_wif_organization_id must be the Anthropic organization UUID')
    rules = config.get('chat_relay_wif')
    value = rules.get(environment) if isinstance(rules, dict) and set(rules) <= set(ENVIRONMENTS) else None
    if not isinstance(value, dict) or set(value) != set(RULE_KEYS) | {'audience'}:
        raise ConfigurationError(f'chat_relay_wif.{environment} must name the federation rule, service account, workspace and audience')
    for key, pattern in RULE_KEYS.items():
        if not isinstance(value[key], str) or not re.fullmatch(pattern, value[key]):
            raise ConfigurationError(f'chat_relay_wif.{environment}.{key} is invalid')
    if value['audience'] != rule_audience(environment):
        raise ConfigurationError(f'chat_relay_wif.{environment}.audience must be {rule_audience(environment)}')
    return {'organization_id': organization, **value}


def upstream_timeout(config):
    value = config.get('chat_relay_upstream_timeout_seconds', DEFAULT_UPSTREAM_TIMEOUT)
    if type(value) is not int or not 30 <= value <= 115:
        raise ConfigurationError('chat_relay_upstream_timeout_seconds must be 30..115')
    return value


# Upstream credentials: Anthropic workload identity federation ------------------------------------

class CredentialError(Exception):
    """A credential failure with the audit code of the federation spec; the relay answers 503."""
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def metadata_identity(audience):
    """A fresh VM Google ID token for the audience (format=full: the rule matches email). Never cached."""
    try:
        return agent_http.identity_token(audience, agent_http.opener(), IDENTITY_TIMEOUT)
    except Exception:
        raise CredentialError('RELAY_IDENTITY_UNAVAILABLE') from None


def token_exchange(body, timeout=EXCHANGE_TIMEOUT):
    """POST /v1/oauth/token; returns (status, parsed JSON or None). The body and response are never logged."""
    request = urllib.request.Request(TOKEN_URL, data=json.dumps(body).encode(), method='POST',
                                     headers={'content-type': 'application/json', 'User-Agent': 'MW-Chat-Relay/1.0'})
    try:
        with agent_http.opener().open(request, timeout=timeout) as response:
            raw = response.read(ERROR_LIMIT + 1)
            status = response.status
    except urllib.error.HTTPError as exc:
        try:
            exc.read(ERROR_LIMIT)
        finally:
            exc.close()
        return exc.code, None
    if len(raw) > ERROR_LIMIT:
        return status, None
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, None


class CredentialProvider:
    """Per-environment Bearer tokens from workload identity federation, in memory only.

    headers(config, environment, deadline) -> upstream auth headers; invalidate(environment, token) drops a token the
    upstream refused. Single flight per environment: one exchange at a time, concurrent requests wait on it. Refresh
    is advisory from expires_at - 120 s (a failure keeps the cached token) and mandatory from expires_at - 30 s.
    """
    def __init__(self, identity=metadata_identity, exchange=token_exchange, clock=time.monotonic, sleep=time.sleep):
        self.identity, self.exchange, self.clock, self.sleep = identity, exchange, clock, sleep
        self.cache, self.locks, self.guard = {}, {}, threading.Lock()

    def lock(self, environment):
        with self.guard:
            return self.locks.setdefault(environment, threading.Lock())

    def headers(self, config, environment, deadline=None):
        settings = rule(config, environment)  # fails closed on placeholders
        key = tuple(settings[k] for k in ('organization_id', 'federation_rule_id', 'service_account_id', 'workspace_id', 'audience'))
        with self.lock(environment):
            cached = self.cache.get(environment)
            if cached and cached['key'] != key:
                cached = None
            now = self.clock()
            if cached is None or now >= cached['expires_at'] - MANDATORY_REFRESH:
                cached = self.refresh(environment, settings, key, deadline)
            elif now >= cached['expires_at'] - ADVISORY_REFRESH:
                try:
                    cached = self.refresh(environment, settings, key, deadline)
                except CredentialError:
                    pass  # keep serving the cached token until the mandatory refresh
            return {'authorization': 'Bearer ' + cached['token']}, settings['federation_rule_id']

    def invalidate(self, environment, authorization):
        with self.lock(environment):
            cached = self.cache.get(environment)
            if cached and 'Bearer ' + cached['token'] == authorization:
                del self.cache[environment]

    def refresh(self, environment, settings, key, deadline):
        body = {'grant_type': GRANT_TYPE, 'assertion': None, 'federation_rule_id': settings['federation_rule_id'],
                'organization_id': settings['organization_id'], 'service_account_id': settings['service_account_id'],
                'workspace_id': settings['workspace_id']}
        for attempt in range(2):
            body['assertion'] = self.identity(settings['audience'])  # a fresh token per exchange
            started = self.clock()
            try:
                status, value = self.exchange(body)
            except Exception:
                status, value = None, None
            if status == 200 and isinstance(value, dict):
                token, kind, lifetime = value.get('access_token'), value.get('token_type'), value.get('expires_in')
                if (isinstance(token, str) and 0 < len(token) <= 4096 and not re.search(r'\s', token)
                        and isinstance(kind, str) and kind.lower() == 'bearer' and type(lifetime) is int and 0 < lifetime <= 86400):
                    entry = {'key': key, 'token': token, 'expires_at': started + lifetime}
                    self.cache[environment] = entry
                    return entry
                raise CredentialError('RELAY_FEDERATION_UNAVAILABLE')
            if status == 400:
                raise CredentialError('RELAY_FEDERATION_CONFIG')
            if status in (401, 403):
                raise CredentialError('RELAY_FEDERATION_DENIED')
            retryable = status is None or status == 429 or status >= 500
            if not retryable or attempt or (deadline is not None and deadline - self.clock() < 1 + EXCHANGE_TIMEOUT):
                raise CredentialError('RELAY_FEDERATION_UNAVAILABLE')
            self.sleep(1)
        raise CredentialError('RELAY_FEDERATION_UNAVAILABLE')


# Request handling -------------------------------------------------------------------------------

class Rejected(Exception):
    """A contract response. `code` is the audit code for the journal line only."""
    def __init__(self, status, body, code=None):
        super().__init__(body.get('reason') or body['status'])
        self.status, self.body = status, body
        self.code = code or body.get('reason') or body['status']


def unavailable(reason, code=None):
    return Rejected(503, {'status': 'unavailable', 'reason': reason}, code)


def rejected(reason, status=400):
    return Rejected(status, {'status': 'rejected', 'reason': reason})


def checked_request(raw):
    """The model of a request the relay may forward; Rejected(400) otherwise. The bytes are forwarded unchanged."""
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise rejected('invalid_json') from None
    if not isinstance(value, dict) or not set(value) <= REQUEST_KEYS or 'messages' not in value:
        raise rejected('invalid_request')
    if not isinstance(value.get('model'), str) or not MODEL.fullmatch(value['model']) or len(value['model']) > 64:
        raise rejected('model_not_allowed')
    if value.get('stream') is not True:
        raise rejected('stream_required')
    tools = value.get('tools', [])
    if not isinstance(tools, list) or any(not isinstance(t, dict) or t.get('type', 'custom') != 'custom' for t in tools):
        raise rejected('tools_not_allowed')  # custom tools only: no server-side tool spends or fetches on the relay
    return value['model']


def https_connection(timeout):
    return http.client.HTTPSConnection(UPSTREAM_HOST, 443, timeout=timeout)


def audit_outcome(config, caller, outcome):
    """One audit operation per authenticated request: caller, environment, rule, model, status, duration, bytes."""
    from .audit import activity, event
    from .state import transaction
    plan = {key: outcome.get(key) for key in ('caller', 'environment', 'rule', 'model')}
    observed = {key: outcome.get(key) for key in ('http_status', 'code', 'duration_ms', 'bytes_in', 'bytes_out', 'request_id')}
    with activity(config, SERVICE, 'PROCESS', 'internal', plan) as op:
        if op:
            with transaction(config) as conn:
                event(conn, op, 'result_observed', observed, 'internal')


def handler(config_path, catalogue_path, keys=None, slots=None, credentials=None, connect=https_connection,
            audit=audit_outcome, clock=time.monotonic):
    keys = keys or Keys()
    slots = slots or threading.BoundedSemaphore(CONCURRENCY)
    credentials = credentials or CredentialProvider()

    class Handler(BaseHTTPRequestHandler):
        timeout = 15  # a slow client cannot hold a handler thread before the body is read

        def log_message(self, *_args):
            return

        def respond(self, status, body, content_type='application/json'):
            data = body if isinstance(body, bytes) else json.dumps(body, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
            return len(data)

        def report(self, outcome):
            # One line per request: never a body, token, credential or exception message.
            print(json.dumps({'event': 'chat_relay', **outcome}, separators=(',', ':')), file=sys.stderr, flush=True)

        def controls(self):
            config, catalogue = load_controls(config_path, catalogue_path)
            on = bool(config.get('chat_relay_enabled') and catalogue['services'].get(SERVICE, {}).get('enabled'))
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
            started = clock()
            outcome = {'caller': None, 'environment': None, 'rule': None, 'model': None, 'http_status': None, 'code': None,
                       'duration_ms': None, 'bytes_in': 0, 'bytes_out': 0, 'request_id': None}
            if urlsplit(self.path).path != PATH:
                self.respond(404, {'status': 'not_found'})
                return
            caller, config = None, None
            try:
                try:
                    config, enabled = self.controls()
                except Exception as exc:
                    enabled, outcome['code'] = False, 'config_invalid:' + type(exc).__name__
                if not enabled:
                    raise unavailable('disabled', outcome['code'])
                authorization = self.headers.get('Authorization', '')
                if not authorization.startswith('Bearer ') or len(authorization) > 8192:
                    raise Rejected(401, {'status': 'denied'}, 'token_missing')
                try:
                    caller = verify_token(authorization[7:], config['chat_relay_audience'], callers(config), keys)
                except Exception as exc:
                    raise unavailable('identity', 'keys_unavailable:' + type(exc).__name__) from None
                if caller is None:
                    raise Rejected(403, {'status': 'denied'}, 'token_rejected')
                outcome['caller'], outcome['environment'] = caller['email'], caller['environment']
                if not slots.acquire(blocking=False):
                    raise unavailable('busy')
                try:
                    self.relay(config, caller, started, outcome)
                finally:
                    slots.release()
            except Rejected as exc:
                outcome['http_status'], outcome['code'] = exc.status, exc.code
                outcome['bytes_out'] = self.respond(exc.status, exc.body)
            except Exception as exc:
                outcome['http_status'], outcome['code'] = 503, 'internal:' + type(exc).__name__
                outcome['bytes_out'] = self.respond(503, {'status': 'unavailable', 'reason': 'internal'})
            outcome['duration_ms'] = int((clock() - started) * 1000)
            if caller is not None:
                try:
                    audit(config, caller, outcome)
                except Exception as exc:
                    outcome['audit'] = 'failed:' + type(exc).__name__
            self.report(outcome)

        def relay(self, config, caller, started, outcome):
            if self.headers.get('Transfer-Encoding'):
                raise rejected('invalid_request')
            try:
                length = int(self.headers.get('Content-Length', ''))
            except ValueError:
                raise rejected('invalid_request') from None
            if length > MAX_BYTES:
                raise rejected('too_large', 413)
            if length <= 0:
                raise rejected('invalid_request')
            if (self.headers.get('Content-Type') or '').split(';')[0].strip().lower() != 'application/json':
                raise rejected('unsupported_type', 415)
            raw = self.rfile.read(length)
            outcome['bytes_in'] = len(raw)
            if len(raw) != length:
                raise rejected('invalid_request')
            outcome['model'] = checked_request(raw)
            deadline = started + upstream_timeout(config)
            environment = caller['environment']
            for attempt in range(2):
                try:
                    auth, outcome['rule'] = credentials.headers(config, environment, deadline)
                except CredentialError as exc:
                    raise unavailable('credentials', exc.code) from None
                except ConfigurationError:
                    raise unavailable('credentials', 'RELAY_FEDERATION_CONFIG') from None
                remaining = deadline - clock()
                if remaining <= 1:
                    raise Rejected(504, {'status': 'unavailable', 'reason': 'timeout'}, 'UPSTREAM_TIMEOUT')
                connection = connect(remaining)
                try:
                    try:
                        connection.request('POST', MESSAGES_PATH, body=raw, headers={
                            **auth, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json',
                            'accept': 'text/event-stream', 'content-length': str(len(raw))})
                        response = connection.getresponse()
                    except TimeoutError:
                        raise Rejected(504, {'status': 'unavailable', 'reason': 'timeout'}, 'UPSTREAM_TIMEOUT') from None
                    except OSError:
                        raise Rejected(502, {'status': 'unavailable', 'reason': 'upstream_unreachable'}, 'UPSTREAM_UNREACHABLE') from None
                    outcome['request_id'] = (response.getheader('request-id') or '')[:128] or None
                    if response.status == 401 and attempt == 0:
                        response.read(ERROR_LIMIT)
                        credentials.invalidate(environment, auth['authorization'])
                        continue  # one fresh exchange, one retry
                    if response.status == 401:
                        response.read(ERROR_LIMIT)
                        raise unavailable('credentials', 'RELAY_FEDERATION_DENIED')
                    if response.status == 403:
                        response.read(ERROR_LIMIT)
                        raise unavailable('credentials', 'RELAY_SCOPE_DENIED')
                    if response.status != 200:
                        body = response.read(ERROR_LIMIT)
                        outcome['http_status'], outcome['code'] = response.status, f'UPSTREAM_{response.status}'
                        outcome['bytes_out'] = self.respond(response.status, body, response.getheader('content-type') or 'application/json')
                        return
                    self.stream(response, connection, deadline, outcome)
                    return
                finally:
                    connection.close()

        def stream(self, response, connection, deadline, outcome):
            """SSE pass-through: bytes as they arrive, the connection closed at the end (no Content-Length)."""
            self.send_response(200)
            self.send_header('Content-Type', response.getheader('content-type') or 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            outcome['http_status'], outcome['code'] = 200, 'relayed'
            ending = None
            try:
                while True:
                    remaining = deadline - clock()
                    if remaining <= 0:
                        outcome['code'], ending = 'UPSTREAM_DEADLINE', RELAY_DEADLINE_EVENT
                        break
                    if connection.sock is not None:
                        connection.sock.settimeout(remaining)
                    try:
                        chunk = response.read1(CHUNK)
                    except TimeoutError:
                        outcome['code'], ending = 'UPSTREAM_DEADLINE', RELAY_DEADLINE_EVENT
                        break
                    except OSError:
                        outcome['code'], ending = 'STREAM_INTERRUPTED', RELAY_INTERRUPTED_EVENT
                        break
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    outcome['bytes_out'] += len(chunk)
                if ending:
                    # A blank line first closes any event the upstream left half written.
                    self.wfile.write(b'\n\n' + ending)
                    self.wfile.flush()
                    outcome['bytes_out'] += len(ending) + 2
            except OSError:
                outcome['code'] = 'CLIENT_GONE'
    return Handler


def serve(config_path, catalogue_path):
    present = [name for name in FORBIDDEN_ENVIRONMENT if os.environ.get(name)]
    if present:
        raise ConfigurationError('the chat relay is keyless; unset ' + ', '.join(present))
    config = load_json(config_path)
    validate_config(config)
    validate_catalogue(load_json(catalogue_path))
    host, port = bind(config)
    # Load every request-path module now, so a later package replacement cannot mix versions in this process.
    from . import audit, state  # noqa: F401
    if state.enabled(config):
        import psycopg  # noqa: F401
    server = ThreadingHTTPServer((host, port), handler(config_path, catalogue_path))
    server.daemon_threads = True
    try:
        server.serve_forever()
    finally:
        server.server_close()
