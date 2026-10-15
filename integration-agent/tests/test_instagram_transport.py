import hashlib
import hmac
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.instagram import Instagram, InstagramAPIError
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.webhook import extract_messages, verify_signature


def http_error(status, body):
    import io
    import urllib.error
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    return urllib.error.HTTPError("https://graph.instagram.invalid/x", status, "err", {}, io.BytesIO(raw))


WINDOW = {"error": {"message": "This message is sent outside of allowed window.", "code": 10, "error_subcode": 2534022}}


class InstagramTransportTests(unittest.TestCase):
    def test_provider_window_expiry_is_classified_only_for_message_sends(self):
        error = InstagramAPIError.from_http(http_error(400, WINDOW), message_send=True)
        self.assertTrue(error.window_expired)
        self.assertTrue(error.definite_rejection)
        self.assertEqual((error.status, error.code, error.subcode), (400, 10, 2534022))
        self.assertIsInstance(error, ConfigurationError)
        self.assertNotIn("allowed window", str(error))  # provider text is not retained
        self.assertFalse(InstagramAPIError.from_http(http_error(400, WINDOW), message_send=False).window_expired)
        for payload in [{"error": {"message": "Something else", "code": 10, "error_subcode": 2534022}},
                        {"error": {"message": WINDOW["error"]["message"], "code": 10, "error_subcode": 1}},
                        {"error": {"message": WINDOW["error"]["message"], "code": "10", "error_subcode": 2534022}},
                        b"not json", {"error": "text"}]:
            with self.subTest(payload=payload):
                self.assertFalse(InstagramAPIError.from_http(http_error(400, payload), message_send=True).window_expired)
        self.assertFalse(InstagramAPIError.from_http(http_error(500, WINDOW), message_send=True).window_expired)

    def test_definite_rejection_is_4xx_only_and_oversized_bodies_keep_status(self):
        rejected = InstagramAPIError.from_http(http_error(403, {"error": {"code": 190}}), message_send=True)
        self.assertTrue(rejected.definite_rejection)
        self.assertEqual(rejected.code, 190)
        unknown = InstagramAPIError.from_http(http_error(503, {"error": {"code": 2}}), message_send=True)
        self.assertFalse(unknown.definite_rejection)
        self.assertIn("UNKNOWN", str(unknown))
        huge = InstagramAPIError.from_http(http_error(400, b"x" * 70000), message_send=True)
        self.assertEqual((huge.status, huge.code, huge.window_expired), (400, None, False))

    def test_request_maps_http_errors_and_other_failures(self):
        import urllib.request
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / "token"
            token.write_text("synthetic")
            client = Instagram({"instagram_account_id": "123", "instagram_api_version": "v1",
                                "instagram_token_file": str(token), "secrets_directory": directory,
                                "state_backend": "sqlite", "state_directory": directory})
            with patch.object(urllib.request, "urlopen", side_effect=http_error(400, WINDOW)):
                with self.assertRaises(InstagramAPIError) as sent:
                    client._request("123/messages", body={"recipient": {"id": "456"}, "message": {"text": "x"}})
                self.assertTrue(sent.exception.window_expired)
                with self.assertRaises(InstagramAPIError) as read:
                    client._request("456", {"fields": "id"})
                self.assertFalse(read.exception.window_expired)
            with patch.object(urllib.request, "urlopen", side_effect=TimeoutError()):
                with self.assertRaises(ConfigurationError) as other:
                    client._request("456", {"fields": "id"})
                self.assertNotIsInstance(other.exception, InstagramAPIError)

    def test_signature_and_message_filtering(self):
        now = time.time()
        payload = {
            "object": "instagram",
            "entry": [{
                "id": "123",
                "messaging": [
                    {"sender": {"id": "456"}, "recipient": {"id": "123"}, "timestamp": now * 1000,
                     "message": {"mid": "m1", "text": "hello"}},
                    {"sender": {"id": "123"}, "recipient": {"id": "456"}, "timestamp": now * 1000,
                     "message": {"mid": "echo", "text": "ignore", "is_echo": True}},
                ],
            }],
        }
        raw = json.dumps(payload).encode()
        signature = "sha256=" + hmac.new(b"secret", raw, hashlib.sha256).hexdigest()
        self.assertTrue(verify_signature(raw, signature, "secret"))
        self.assertFalse(verify_signature(raw, "sha256=wrong", "secret"))
        messages = extract_messages(payload, "123", now + 1)
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["message_id"], "m1")
        self.assertEqual(messages[0]["sender_id"], "456")
        self.assertEqual(messages[0]["text"], "hello")
        self.assertAlmostEqual(messages[0]["timestamp"], now, places=3)

    def test_journal_deduplicates_receipts_and_messages(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = IngressJournal(Path(directory) / "ingress.db")
            message = {"message_id": "m1", "sender_id": "456", "timestamp": 1.0, "text": "hello"}
            self.assertEqual(journal.capture("payload", [message]), (True, 1))
            self.assertEqual(journal.capture("payload", [message]), (False, 0))
            self.assertEqual(journal.latest()[0]["status"], "CAPTURED_NO_PROCESSING")
            journal.close()

    def test_send_is_blocked_while_disabled(self):
        with self.assertRaises(ConfigurationError):
            Instagram({"sending_enabled": False}).send("456", "hello")

    def test_enabled_send_requires_provider_message_id(self):
        client = Instagram({"sending_enabled": True, "instagram_account_id": "123"})
        with patch.object(client, "request", return_value={"message_id": "accepted"}) as request:
            self.assertEqual(client.send("456", "hello"), "accepted")
        request.assert_called_once_with(
            "123/messages",
            body={"recipient": {"id": "456"}, "message": {"text": "hello"}},
        )


if __name__ == "__main__":
    unittest.main()
