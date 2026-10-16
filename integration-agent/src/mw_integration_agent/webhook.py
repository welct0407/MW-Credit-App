from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any


# Owner decision (16 October 2026): provider timestamps up to this far ahead of the
# receiver clock are ordinary clock skew; beyond it the message is held for review.
FUTURE_TOLERANCE_SECONDS = 60


def verify_signature(raw: bytes, signature: str | None, app_secret: str) -> bool:
    expected = "sha256=" + hmac.new(app_secret.encode(), raw, hashlib.sha256).hexdigest()
    return bool(app_secret and signature and hmac.compare_digest(expected, signature))


def extract_messages(payload: dict[str, Any], account_id: str, now: float | None = None,
                     stats: dict[str, int] | None = None) -> list[dict[str, Any]]:
    """Accepted inbound messages. Deleted (unsent) events are skipped; events older
    than 24 h or more than FUTURE_TOLERANCE_SECONDS ahead are returned with a ``quarantine`` reason
    so the journal can hold them for review instead of dropping them silently.
    ``stats`` (when given) receives ``deleted``/``late``/``future`` counts."""
    current = time.time() if now is None else now
    counts = stats if stats is not None else {}
    counts.setdefault("deleted", 0); counts.setdefault("late", 0); counts.setdefault("future", 0)
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
            if message.get("is_deleted"):
                counts["deleted"] += 1
                continue
            try:
                timestamp = float(event["timestamp"]) / 1000
            except (KeyError, TypeError, ValueError):
                continue
            quarantine = ""
            if current - timestamp > 86400:
                quarantine = "LATE"
            elif timestamp > current + FUTURE_TOLERANCE_SECONDS:
                quarantine = "FUTURE"
            if quarantine:
                counts[quarantine.lower()] += 1
            attachments = message.get('attachments')
            if not isinstance(attachments, list):
                attachments = []
            result.append({
                "quarantine": quarantine,
                "message_id": str(message["mid"]),
                "sender_id": sender,
                "timestamp": timestamp,
                "text": str(message.get("text") or "")[:12000],
                "reply_to": str((message.get('reply_to') or {}).get('mid') or '')[:2048]
                    if isinstance(message.get('reply_to'),dict) else '',
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
