from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .config import ConfigurationError, load_secret
from .http import opener as http_opener


class InstagramAPIError(ConfigurationError):
    """Sanitized provider rejection; raw response/message is never retained."""
    def __init__(self, status, code=None, subcode=None, *, window_expired=False):
        self.status = status
        self.code = code
        self.subcode = subcode
        self.window_expired = window_expired
        self.definite_rejection = 400 <= status < 500
        category = 'WINDOW_EXPIRED' if window_expired else 'REJECTED' if self.definite_rejection else 'UNKNOWN'
        super().__init__(f'Instagram {category} (HTTP {status}, code {code}, subcode {subcode})')

    @property
    def detail_code(self):
        """Durable journal detail: IG_WINDOW_EXPIRED, IG_REJECTED_<graph code> or IG_UNKNOWN_HTTP<status>."""
        if self.window_expired:
            return 'IG_WINDOW_EXPIRED'
        if self.definite_rejection:
            return 'IG_REJECTED_' + (str(self.code) if self.code is not None else f'HTTP{self.status}')
        return f'IG_UNKNOWN_HTTP{self.status}'

    @classmethod
    def from_http(cls, error, *, message_send):
        """HTTP 4xx is a definite provider rejection (InstagramRejected); 5xx stays uncertain."""
        if 400 <= error.code < 500:
            cls = InstagramRejected
        code = subcode = None
        explicit = False
        try:
            raw = error.read(65537)
            if len(raw)>65536:
                return cls(error.code)
            payload = json.loads(raw)
            detail = payload.get('error') if isinstance(payload, dict) else None
            if isinstance(detail, dict):
                code = detail.get('code') if type(detail.get('code')) is int else None
                subcode = detail.get('error_subcode') if type(detail.get('error_subcode')) is int else None
                message = detail.get('message')
                explicit = isinstance(message, str) and message.strip().rstrip('.').casefold() == 'this message is sent outside of allowed window'
        except (ValueError, OSError, TypeError):
            pass
        return cls(error.code, code, subcode, window_expired=(
            message_send and 400 <= error.code < 500 and code == 10 and subcode == 2534022 and explicit))


class InstagramRejected(InstagramAPIError):
    """The provider definitely did not accept the request (HTTP 4xx, Graph error code retained)."""


SEND_TIMEOUT = 20


class Instagram:
    def __init__(self, config: dict[str, Any], read_timeout: float = SEND_TIMEOUT):
        self.config = config
        # Per socket operation. Reads may wait longer (the poll's conversation list); sends always keep SEND_TIMEOUT.
        self.read_timeout = read_timeout

    def request(self, path, query=None, body=None):
        from .audit import activity, digest
        with activity(self.config,'instagram',action='SEND' if body is not None else 'READ',route='instagram',
                      plan={'path':path,'request_digest':digest([query,body])},effect=body is not None):
            return self._request(path,query,body)

    def _request(self, path: str, query: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> dict[str, Any]:
        if not re.fullmatch(r"[A-Za-z0-9_-]+(?:/[a-z_]+)?", path):
            raise ConfigurationError("invalid Instagram API path")
        url = f"https://graph.instagram.com/{self.config['instagram_api_version']}/{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = None
        headers = {"Authorization": "Bearer " + load_secret(self.config, "instagram_token_file")}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
        try:
            # The bearer token must never travel to a redirect target.
            with http_opener().open(request, timeout=self.read_timeout if body is None else SEND_TIMEOUT) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            raise InstagramAPIError.from_http(exc, message_send=(body is not None and path == self.config['instagram_account_id'] + '/messages')) from None
        except Exception as exc:
            # The exception class only (TimeoutError, URLError, ...): never the URL, query or token.
            raise ConfigurationError(f"Instagram API request failed ({type(exc).__name__})") from None

    def probe(self) -> dict[str, Any]:
        account = self.request(self.config["instagram_account_id"], {"fields": "id,username"})
        conversations = self.request(
            self.config["instagram_account_id"] + "/conversations",
            {"platform": "instagram", "fields": "id", "limit": 25},
        )
        return {
            "authenticated": bool(account.get("id")),
            "username": account.get("username"),
            "conversation_count_page": len(conversations.get("data", [])),
        }

    def send(self, recipient_id: str, text: str) -> str:
        if not self.config.get("sending_enabled"):
            raise ConfigurationError("sending_enabled is false")
        if not recipient_id.isdigit() or not 0 < len(text) <= 1000:
            raise ConfigurationError("invalid Instagram recipient or message")
        result = self.request(
            self.config["instagram_account_id"] + "/messages",
            body={"recipient": {"id": recipient_id}, "message": {"text": text}},
        )
        message_id = result.get("message_id")
        if not message_id:
            raise ConfigurationError("Instagram did not return a message ID")
        return str(message_id)
