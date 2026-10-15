from __future__ import annotations

import hashlib
import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .config import load_json, load_secret, validate_config
from .journal import IngressJournal
from .webhook import extract_messages, verify_signature


def handler(config_path: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            return

        def respond(self, status: int, text: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(text.encode())

        def do_GET(self):
            path = urlsplit(self.path)
            if path.path == "/health":
                self.respond(200, "mw-instagram-webhook")
                return
            if path.path != "/instagram":
                self.respond(404, "Not found")
                return
            try:
                config = load_json(config_path)
                validate_config(config)
                query = parse_qs(path.query)
                challenge = query.get("hub.challenge", [""])[0]
                expected = load_secret(config, "webhook_verify_token_file")
                valid = (
                    config.get("receiver_enabled")
                    and query.get("hub.mode") == ["subscribe"]
                    and hmac.compare_digest(query.get("hub.verify_token", [""])[0], expected)
                    and 0 < len(challenge) <= 512
                )
                self.respond(200, challenge) if valid else self.respond(403, "Forbidden")
            except Exception:
                self.respond(503, "Unavailable")

        def do_POST(self):
            if urlsplit(self.path).path != "/instagram":
                self.respond(404, "Not found")
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 1024 * 1024 or self.headers.get("Transfer-Encoding"):
                    self.respond(413, "Invalid size")
                    return
                raw = self.rfile.read(length)
                config = load_json(config_path)
                validate_config(config)
                if not config.get("receiver_enabled"):
                    self.respond(503, "Receiver disabled")
                    return
                if not verify_signature(raw, self.headers.get("X-Hub-Signature-256"), load_secret(config, "meta_app_secret_file")):
                    self.respond(403, "Forbidden")
                    return
                messages = extract_messages(json.loads(raw), config["instagram_account_id"])
                journal = IngressJournal(Path(config["state_directory"]) / "instagram-ingress.db", config=config)
                try:
                    journal.capture(hashlib.sha256(raw).hexdigest(), messages)
                finally:
                    journal.close()
                self.respond(200, "EVENT_RECEIVED")
            except Exception:
                self.respond(503, "Unavailable")
    return Handler


def serve(config_path: str) -> None:
    config = load_json(config_path)
    validate_config(config)
    if not config.get("receiver_enabled"):
        raise ValueError("receiver_enabled is false")
    server = ThreadingHTTPServer((config["listen_host"], config["listen_port"]), handler(config_path))
    try:
        server.serve_forever()
    finally:
        server.server_close()
