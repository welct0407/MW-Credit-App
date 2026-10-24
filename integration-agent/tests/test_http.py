"""Shared outbound HTTP helpers (AGT-QUALITY-01): one redirect denial, one token fetch, one request-id derivation."""
import io
import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent import http as agent_http
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.instagram import Instagram
from mw_integration_agent.receipt_api import request_id as receipt_request_id


class RedirectingServer:
    """Loopback origin: every path except /target answers 302 Location: /target; /target records headers."""
    def __init__(self):
        self.target_headers = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                return

            def _serve(self):
                if self.path == '/target':
                    outer.target_headers.append(dict(self.headers))
                    self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                    self.wfile.write(b'{"followed":true}')
                else:
                    self.send_response(302); self.send_header('Location', '/target'); self.end_headers()
            do_GET = do_POST = _serve

        self.httpd = HTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown(); self.httpd.server_close()


class Rewriter(urllib.request.BaseHandler):
    """Points the Instagram client's fixed HTTPS origin at the loopback server for this test only."""
    def __init__(self, port):
        self.port = port

    def https_request(self, request):
        request.full_url = f"http://127.0.0.1:{self.port}/{request.full_url.split('/', 3)[3]}"
        return request


class RedirectTests(unittest.TestCase):
    def setUp(self):
        self.server = RedirectingServer(); self.addCleanup(self.server.close)

    def test_shared_opener_denies_redirects_and_exposes_the_target(self):
        with self.assertRaises(agent_http.RedirectDenied) as denied:
            agent_http.opener().open(f'http://127.0.0.1:{self.server.port}/start', timeout=5)
        self.assertEqual(str(denied.exception), 'HTTP_REDIRECT_DENIED')
        self.assertIsInstance(denied.exception, ConfigurationError)
        self.assertEqual((denied.exception.code, denied.exception.location),
                         (302, f'http://127.0.0.1:{self.server.port}/target'))
        self.assertEqual(self.server.target_headers, [])

    def test_instagram_bearer_token_never_follows_a_redirect(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'token'; token.write_text('synthetic-bearer')
            client = Instagram({'instagram_account_id': '123', 'instagram_api_version': 'v1',
                                'instagram_token_file': str(token), 'secrets_directory': directory,
                                'state_backend': 'sqlite', 'state_directory': directory})
            rewired = lambda: urllib.request.build_opener(Rewriter(self.server.port), agent_http.NoRedirect())
            with patch('mw_integration_agent.instagram.http_opener', rewired):
                with self.assertRaises(ConfigurationError):
                    client._request('123/messages', body={'recipient': {'id': '456'}, 'message': {'text': 'x'}})
        self.assertEqual(self.server.target_headers, [])


class FakeOpener:
    def __init__(self, body):
        self.body, self.requests = body, []

    def open(self, request, timeout=None):
        self.requests.append((request, timeout))
        return io.BytesIO(self.body)


class TokenTests(unittest.TestCase):
    def test_identity_token_requests_the_audience_and_validates_the_jwt_shape(self):
        opener = FakeOpener(b'aaa.bbb.ccc')
        self.assertEqual(agent_http.identity_token('https://audience.example', opener, 3), 'aaa.bbb.ccc')
        request, timeout = opener.requests[0]
        self.assertEqual(timeout, 3)
        self.assertIn('audience=https%3A%2F%2Faudience.example', request.full_url)
        self.assertIn('format=full', request.full_url)
        self.assertEqual(request.get_header('Metadata-flavor'), 'Google')
        for body in (b'not-a-jwt', b'a.b', b'a.b.c.d', b'x' * 20000 + b'.y.z'):
            with self.subTest(body=body[:12]), self.assertRaisesRegex(ConfigurationError, 'INVALID_WORKLOAD_TOKEN'):
                agent_http.identity_token('https://audience.example', FakeOpener(body), 3)

    def test_access_token_reads_the_metadata_token_endpoint(self):
        class Response(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *_): return False
        with patch('urllib.request.urlopen', return_value=Response(json.dumps({'access_token': 'ya29.x'}).encode())) as urlopen:
            self.assertEqual(agent_http.access_token(timeout=7), 'ya29.x')
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, agent_http.METADATA + 'token')
        self.assertEqual(urlopen.call_args.kwargs['timeout'], 7)


class RequestIdTests(unittest.TestCase):
    def test_builder_matches_the_two_previous_derivations(self):
        # Regression pins recorded from the pre-W3 builders (ALL-STD-03): the salts and byte layout are frozen.
        self.assertEqual(receipt_request_id('dev', 'synthetic-review-1'), '1da49312-d7f1-4948-85a6-b3bf3e61035c')
        self.assertEqual(receipt_request_id('prod', 'synthetic-review-1'), 'b8ffcf33-e1ea-439b-aba5-24b6c914918b')
        self.assertEqual(receipt_request_id('prod', 'ใบเสร็จ'), '499ce400-26db-41ad-9095-d69c4f7bbe05')
        # The conversation builder (salt mw-credit-agent-conversation-v1) left with the conversation (R091).
        self.assertEqual(agent_http.uuid_from_sha256(['mw-credit-agent-receipt-v1', 'dev', 'synthetic-review-1']),
                         '1da49312-d7f1-4948-85a6-b3bf3e61035c')
        value = agent_http.uuid_from_sha256(['salt', 'x'])
        self.assertEqual((value[14], value[19] in '89ab'), ('4', True))


if __name__ == '__main__':
    unittest.main()
