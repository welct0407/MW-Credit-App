from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from typing import Any

from .config import ConfigurationError, load_secret


class Instagram:
    def __init__(self, config: dict[str, Any]):
        self.config = config

    def request(self, path: str, query: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> dict[str, Any]:
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
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except Exception as exc:
            raise ConfigurationError("Instagram API request failed") from exc

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
