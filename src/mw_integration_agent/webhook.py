from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any


def verify_signature(raw: bytes, signature: str | None, app_secret: str) -> bool:
    expected = "sha256=" + hmac.new(app_secret.encode(), raw, hashlib.sha256).hexdigest()
    return bool(app_secret and signature and hmac.compare_digest(expected, signature))


def extract_messages(payload: dict[str, Any], account_id: str, now: float | None = None) -> list[dict[str, Any]]:
    current = time.time() if now is None else now
    if payload.get("object") != "instagram":
        return []
    result: list[dict[str, Any]] = []
    for entry in payload.get("entry", []):
        if str(entry.get("id")) != account_id:
            continue
        for event in entry.get("messaging", []):
            message = event.get("message")
            if not isinstance(message, dict) or message.get("is_echo") or not message.get("mid"):
                continue
            sender = str(event.get("sender", {}).get("id") or "")
            recipient = str(event.get("recipient", {}).get("id") or "")
            if not sender.isdigit() or sender == account_id or recipient != account_id:
                continue
            try:
                timestamp = float(event["timestamp"]) / 1000
            except (KeyError, TypeError, ValueError):
                continue
            if not 0 <= current - timestamp <= 86400:
                continue
            attachments = message.get('attachments')
            if not isinstance(attachments, list):
                attachments = []
            result.append({
                "message_id": str(message["mid"]),
                "sender_id": sender,
                "timestamp": timestamp,
                "text": str(message.get("text") or "")[:12000],
                "attachments": [
                    {"type": "image", "url": a["payload"]["url"]}
                    for a in attachments[:10]
                    if isinstance(a, dict) and a.get("type") == "image"
                    and isinstance(a.get("payload"), dict)
                    and isinstance(a["payload"].get("url"), str)
                    and len(a["payload"]["url"]) <= 8192
                ],
            })
    return result
