"""Synthetic, ephemeral shared-secret HTTP proof. Not a production chart service.

Run with Python 3.13; uses only stdlib. Binds loopback on a random port during
self-tests, then stops. No SQL, secrets on disk, public ingress or service edits.
"""
import hashlib
import hmac
import json
import secrets
import threading
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class ProofHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log credential-bearing requests.

    def do_GET(self):
        if self.path != "/api/proof":
            status, body = 404, {"error": "not_found"}
        else:
            supplied = self.headers.get("Authorization", "")
            digest = hashlib.sha256(supplied.encode()).digest()
            if not hmac.compare_digest(digest, self.server.credential_digest):
                status, body = 401, {"error": "unauthorized"}
            else:
                status, body = 200, {"synthetic": True, "borrower": "Demo borrower", "category": "Star"}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors https://reports.mw-credit.com")
        self.end_headers()
        self.wfile.write(payload)


class SharedSecretProof(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = secrets.token_urlsafe(32)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ProofHandler)
        cls.server.credential_digest = hashlib.sha256(("Bearer " + cls.key).encode()).digest()
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join()

    def request(self, path="/api/proof", headers=None):
        request = urllib.request.Request(self.base + path, headers=headers or {})
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, json.loads(response.read())

    def test_missing_secret_denied(self):
        self.assertEqual(self.request()[0], 401)

    def test_wrong_secret_denied(self):
        self.assertEqual(self.request(headers={"Authorization": "Bearer wrong"})[0], 401)

    def test_valid_secret_accepts_synthetic_data(self):
        status, _, body = self.request(headers={"Authorization": "Bearer " + self.key})
        self.assertEqual(status, 200)
        self.assertTrue(body["synthetic"])

    def test_referrer_cannot_authenticate(self):
        self.assertEqual(self.request(headers={"Referer": "https://reports.mw-credit.com/dashboard/3"})[0], 401)

    def test_url_key_is_not_accepted(self):
        self.assertEqual(self.request(path="/api/proof?key=" + self.key)[0], 404)

    def test_response_does_not_echo_secret(self):
        _, _, body = self.request(headers={"Authorization": "Bearer " + self.key})
        self.assertNotIn(self.key, json.dumps(body))

    def test_no_cache_or_cross_origin_read_permission(self):
        _, headers, _ = self.request(headers={"Authorization": "Bearer " + self.key})
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))
        self.assertIn("frame-ancestors https://reports.mw-credit.com", headers["Content-Security-Policy"])

    def test_rotation_revokes_old_secret(self):
        old = self.server.credential_digest
        self.server.credential_digest = hashlib.sha256(("Bearer " + secrets.token_urlsafe(32)).encode()).digest()
        try:
            self.assertEqual(self.request(headers={"Authorization": "Bearer " + self.key})[0], 401)
        finally:
            self.server.credential_digest = old


if __name__ == "__main__":
    unittest.main(verbosity=2)
