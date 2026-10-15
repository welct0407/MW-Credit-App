"""Fixed-query, read-only chart endpoint. Run behind HTTPS with Gunicorn."""
import hashlib
import hmac
import json
import os
import threading
import time
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
QUERY = (ROOT / "query.sql").read_text(encoding="utf-8")
STATIC = {"/": ("index.html", "text/html; charset=utf-8"),
          "/chart.js": ("chart.js", "text/javascript; charset=utf-8"),
          "/chart.css": ("chart.css", "text/css; charset=utf-8")}


def encode(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


class ChartApp:
    def __init__(self, config, loader=None):
        self.config = config
        self.loader = loader or self.load_rows
        self.lock = threading.Lock()
        self.cache = None
        self.loaded = 0
        self.failed = 0
        self.rate_lock = threading.Lock()
        self.rate_window = 0
        self.rate_count = 0
        self.digest = bytes.fromhex(config["secret_sha256"])
        if len(self.digest) != 32:
            raise ValueError("Invalid key digest")

    def load_rows(self):
        import psycopg
        from psycopg.rows import dict_row
        with psycopg.connect(**self.config["database"], row_factory=dict_row,
                             connect_timeout=5, application_name="mw-report-charts") as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout='12s'")
            conn.execute("SET LOCAL timezone='Asia/Bangkok'")
            identity = conn.execute("SELECT current_database() db, current_user usr").fetchone()
            if identity != {"db": "loan_manager_prod", "usr": "mw_chart_reader"}:
                raise RuntimeError("Unexpected source identity")
            return conn.execute(QUERY).fetchall()

    def data(self):
        with self.lock:
            now = time.monotonic()
            if self.cache is not None and now - self.loaded < 60:
                return self.cache
            if now - self.failed < 10:
                raise RuntimeError("Source retry backoff")
            try:
                rows = self.loader()
                if len(rows) > 2000:
                    raise RuntimeError("Unexpected source size")
                result = json.dumps({"rows": rows, "fetched_at": datetime.now(timezone.utc),
                                     "refresh_seconds": 60, "method": "bcg-display-v1"},
                                    default=encode, allow_nan=False).encode()
            except Exception:
                self.failed = now
                raise
            self.cache, self.loaded = result, now
            return result

    def __call__(self, env, start):
        headers = [("Cache-Control", "no-store"), ("Referrer-Policy", "no-referrer"),
                   ("X-Content-Type-Options", "nosniff"),
                   ("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://reports.mw-credit.com")]
        def reply(status, body, content_type="application/json"):
            start(status, headers + [("Content-Type", content_type), ("Content-Length", str(len(body)))])
            return [body]
        if env.get("REQUEST_METHOD") != "GET":
            return reply("405 Method Not Allowed", b'{"error":"method_not_allowed"}')
        if env.get("QUERY_STRING"):
            return reply("400 Bad Request", b'{"error":"unexpected_parameters"}')
        route = env.get("PATH_INFO", "")
        if route in STATIC:
            name, kind = STATIC[route]
            return reply("200 OK", (ROOT / name).read_bytes(), kind)
        if route != "/api/matrix":
            return reply("404 Not Found", b'{"error":"not_found"}')
        auth = env.get("HTTP_AUTHORIZATION", "")
        candidate = auth[7:] if auth.startswith("Bearer ") else ""
        if len(candidate) > 256 or not hmac.compare_digest(hashlib.sha256(candidate.encode()).digest(), self.digest):
            return reply("401 Unauthorized", b'{"error":"unauthorized"}')
        # A global authenticated budget bounds load without trusting forwarded IP headers.
        with self.rate_lock:
            minute = int(time.monotonic() // 60)
            if minute != self.rate_window:
                self.rate_window, self.rate_count = minute, 0
            self.rate_count += 1
            if self.rate_count > 120:
                return reply("429 Too Many Requests", b'{"error":"rate_limited"}')
        try:
            return reply("200 OK", self.data())
        except Exception:
            # No SQL, connection strings, row values or credentials in browser/log output.
            return reply("503 Service Unavailable", b'{"error":"source_unavailable"}')


def create_app():
    return ChartApp(json.loads(Path(os.environ.get("MW_CHART_CONFIG", "/etc/mw-report-charts/config.json")).read_text()))
