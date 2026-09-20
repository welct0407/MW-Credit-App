import hashlib
import hmac
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.instagram import Instagram
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.webhook import extract_messages, verify_signature


class InstagramTransportTests(unittest.TestCase):
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
        messages = extract_messages(payload, "123", now)
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
