"""Shared outbound HTTP helpers: redirect denial, VM identity tokens, deterministic request IDs.

One `NoRedirect` for every opener. A redirect of a request that carries a bearer
token or a signed payload is never followed; the caller sees `RedirectDenied`
(a `ConfigurationError` with code HTTP_REDIRECT_DENIED) and classifies it itself.
"""
import hashlib
import json
import re
import urllib.parse
import urllib.request
import uuid

from .config import ConfigurationError

METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/'
METADATA_HEADERS = {'Metadata-Flavor': 'Google'}
TOKEN_LIMIT = 16384


class RedirectDenied(ConfigurationError):
    """Raised instead of following a redirect. `location` is the resolved target, `code` the HTTP status."""
    def __init__(self, code, location):
        super().__init__('HTTP_REDIRECT_DENIED')
        self.code, self.location = code, location


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RedirectDenied(code, newurl)


def opener():
    return urllib.request.build_opener(NoRedirect())


def identity_token(audience, opener, timeout):
    """OIDC identity token for `audience` from the VM metadata server (full format, JWT shape only)."""
    request = urllib.request.Request(METADATA + 'identity?' + urllib.parse.urlencode({'audience': audience, 'format': 'full'}),
                                     headers=METADATA_HEADERS)
    with opener.open(request, timeout=timeout) as response:
        token = response.read(TOKEN_LIMIT + 1).decode()
    if len(token) > TOKEN_LIMIT or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token):
        raise ConfigurationError('INVALID_WORKLOAD_TOKEN')
    return token


def access_token(timeout=10):
    """OAuth access token of the VM service account from the metadata server."""
    request = urllib.request.Request(METADATA + 'token', headers=METADATA_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read(TOKEN_LIMIT))['access_token']


def uuid_from_sha256(parts):
    """Deterministic UUID (version 4 layout) from a list of strings; the agent's request-id derivation.

    Derivation (ALL-STD-03, shared with the Node command API's idempotency key):
    1. `parts` is a JSON array of strings encoded with `ensure_ascii=False` and
       separators (',', ':'), i.e. `["<salt>","<environment>",...]` with no spaces;
       the first element is a per-transport salt that never changes
       (`mw-credit-agent-receipt-v1`, `mw-credit-agent-conversation-v1`).
    2. SHA-256 of the UTF-8 bytes of that array; keep the first 16 bytes.
    3. Byte 6 keeps its low nibble and gets version nibble 0x4; byte 8 keeps
       its low six bits and gets variant bits 0b10, so the result is a valid
       RFC 4122 version-4 UUID string that the API's `requestId` regex accepts.
    The same inputs always yield the same UUID, which is what makes a re-claim of
    an approved review resubmit under the server's existing idempotency key.
    """
    encoded = json.dumps(list(parts), ensure_ascii=False, separators=(',', ':')).encode()
    raw = bytearray(hashlib.sha256(encoded).digest()[:16])
    raw[6] = (raw[6] & 15) | 64
    raw[8] = (raw[8] & 63) | 128
    return str(uuid.UUID(bytes=bytes(raw)))
