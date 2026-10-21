from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, UTC
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .config import ConfigurationError, load_controls, load_json, load_secret, validate_catalogue, validate_config
from .journal import IngressJournal
from .receipt_wake import CONVERSATION, converses, wake, wakes
from .webhook import extract_messages, verify_signature

PACKAGE = Path(__file__).resolve().parent
READY_BUDGET = 3.0
CHECKS = ("config", "catalogue", "secrets", "state", "current")
# Identity of the code this process loaded; /ready compares it with what is on disk now.
STARTUP: dict = {}


def package_sha256(root: Path = PACKAGE) -> str:
    lines = [f"{p.name} {hashlib.sha256(p.read_bytes()).hexdigest()}" for p in sorted(root.glob("*.py"))]
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def record_startup(config: dict) -> dict:
    STARTUP.clear()
    STARTUP.update(pid=os.getpid(), started_at=datetime.now(UTC).isoformat(),
                   code_version=config.get("code_version"), package_sha256=package_sha256())
    return STARTUP


def _check_config(context, config_path, _catalogue_path):
    config = load_json(config_path)
    validate_config(config)
    context["config"] = config
    return config.get("receiver_enabled") is True


def _check_catalogue(_context, _config_path, catalogue_path):
    catalogue = load_json(catalogue_path)
    validate_catalogue(catalogue)
    return catalogue["services"].get("signed_webhook_ingress", {}).get("enabled") is True


def _check_secrets(context, _config_path, _catalogue_path):
    return all(load_secret(context["config"], key) for key in ("meta_app_secret_file", "webhook_verify_token_file"))


def _check_state(context, _config_path, _catalogue_path):
    config = context["config"]
    if config.get("state_backend") == "postgres":
        from . import state
        with state.transaction(config) as conn:  # proxy, credential, pool and generation fence
            conn.execute("SELECT 1")
    return True


def _check_current(context, _config_path, _catalogue_path):
    version = context["config"].get("code_version")
    return (version is not None and version == STARTUP.get("code_version")
            and package_sha256() == STARTUP.get("package_sha256"))


_CHECKS = {"config": _check_config, "catalogue": _check_catalogue, "secrets": _check_secrets,
           "state": _check_state, "current": _check_current}


def readiness(config_path: str, catalogue_path: str, budget: float | None = None) -> dict:
    """Named checks in order within one budget; unrun or unfinished checks count as failed."""
    results: dict[str, bool] = {}

    def work():
        context: dict = {}
        for name in CHECKS:
            try:
                results[name] = bool(_CHECKS[name](context, config_path, catalogue_path))
            except Exception:
                results[name] = False

    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    thread.join(READY_BUDGET if budget is None else budget)
    done = dict(results)
    failed = [name for name in CHECKS if done.get(name) is not True]
    body = {"ready": not failed, "code_version": STARTUP.get("code_version"),
            "started_at": STARTUP.get("started_at"), "failed": failed}
    if thread.is_alive():
        body["budget_exceeded"] = True
    return body


def poll_ready(host: str, port: int, wait: float = 0) -> tuple[bool, dict]:
    """Poll the loopback /ready once per second until ready or the wait expires."""
    url = f"http://{'[' + host + ']' if ':' in host else host}:{port}/ready"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + wait
    while True:
        try:
            with opener.open(url, timeout=5) as response:
                body = json.loads(response.read(4096))
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read(4096))
            except ValueError:
                body = {"ready": False, "status": exc.code}
        except (OSError, ValueError):
            body = {"ready": False, "failed": ["unreachable"]}
        if not isinstance(body, dict):
            body = {"ready": False, "failed": ["invalid"]}
        if body.get("ready") is True:
            return True, body
        if time.monotonic() >= deadline:
            return False, body
        time.sleep(1)


def handler(config_path: str, catalogue_path: str):
    class Handler(BaseHTTPRequestHandler):
        timeout = 15  # a slow or stuck client cannot hold a handler thread forever

        def log_message(self, *_args):
            return

        def respond(self, status: int, text: str, content_type: str = "text/plain; charset=utf-8") -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.end_headers()
            self.wfile.write(text.encode())

        def report(self, method: str, exc: Exception) -> None:
            # One line per failure; never the payload, headers or a non-configuration message.
            print(json.dumps({"event": "ingress_error", "method": method, "error": type(exc).__name__,
                              "code": str(exc) if isinstance(exc, ConfigurationError) else ""},
                             separators=(",", ":")), file=sys.stderr, flush=True)

        def do_GET(self):
            path = urlsplit(self.path)
            if path.path == "/health":
                self.respond(200, "mw-instagram-webhook")
                return
            if path.path == "/ready":
                # Loopback-only until the tunnel restricts its path: tunnelled requests never see it.
                if self.headers.get("Cf-Connecting-Ip") is not None or self.headers.get("Cf-Ray") is not None:
                    self.respond(404, "Not found")
                    return
                body = readiness(config_path, catalogue_path)
                self.respond(200 if body["ready"] else 503, json.dumps(body), "application/json")
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
            except Exception as exc:
                self.report("GET", exc)
                self.respond(503, "Unavailable")

        def do_POST(self):
            if urlsplit(self.path).path != "/instagram":
                self.respond(404, "Not found")
                return
            try:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    self.respond(400, "Invalid length")
                    return
                if not 0 < length <= 1024 * 1024 or self.headers.get("Transfer-Encoding"):
                    self.respond(413, "Invalid size")
                    return
                raw = self.rfile.read(length)
                # Both kill switches are read per request (AGT-WEBHOOK-05): the configuration flag
                # and the catalogue entry, so disabling either takes effect without a restart.
                config, catalogue = load_controls(config_path, catalogue_path)
                if not config.get("receiver_enabled") or not catalogue["services"].get("signed_webhook_ingress", {}).get("enabled"):
                    self.respond(503, "Receiver disabled")
                    return
                if not verify_signature(raw, self.headers.get("X-Hub-Signature-256"), load_secret(config, "meta_app_secret_file")):
                    self.respond(403, "Forbidden")
                    return
                try:
                    payload = json.loads(raw)
                except ValueError:
                    payload = None
                if not isinstance(payload, dict):
                    self.respond(400, "Invalid body")
                    return
                stats: dict[str, int] = {}
                messages = extract_messages(payload, config["instagram_account_id"], stats=stats)
                journal = IngressJournal(Path(config["state_directory"]) / "instagram-ingress.db", config=config)
                try:
                    _, inserted = journal.capture(hashlib.sha256(raw).hexdigest(), messages, stats=stats)
                finally:
                    journal.close()
                # After the capture committed (journal closed): a wake never precedes the row it announces,
                # and never fails the delivery; each worker's timer is the fallback.
                if inserted and any(wakes(m) for m in messages):
                    wake(config)
                if inserted and any(converses(m) for m in messages):
                    wake(config, CONVERSATION)
                self.respond(200, "EVENT_RECEIVED")
            except Exception as exc:
                self.report("POST", exc)
                self.respond(503, "Unavailable")
    return Handler


def serve(config_path: str, catalogue_path: str) -> None:
    config = load_json(config_path)
    validate_config(config)
    # Load every request-path module now, so a later package replacement cannot mix versions in this process.
    from . import audit, conversation_api, receipt_api, receipt_storage, state  # noqa: F401
    if state.enabled(config):
        import psycopg  # noqa: F401
    if not config.get("receiver_enabled"):
        raise ValueError("receiver_enabled is false")
    record_startup(config)
    server = ThreadingHTTPServer((config["listen_host"], config["listen_port"]), handler(config_path, catalogue_path))
    try:
        server.serve_forever()
    finally:
        server.server_close()
