# Receipt notification status emojis — 22 September 2026

Owner requested small status emojis for reviewer/Partner messages. Baseline e1ea3582226005f01683cc0f6fc2094c075e4468; clean tree.

Added delivery-time heading decoration in partner_notice.py: review ❓, verified payment ✅, rejection ❌, manual handling 📝, stale/unknown ⚠️, expiry ⌛, unposted receipt 📩. Both preferred languages and email fallback share the same heading. Ordinary conversation replies remain unchanged. Delivery length checks include the icon.

Reserved payloads, event/message keys, review correlation and delivery history are unchanged, avoiding NOTICE_CONTENT_CHANGED for queued records. Completed notices are not replayed. No new service authority, financial logic, AppSheet or database change; no release number needed.

Rollback: restore the prior package from the reviewed installer backup, preserving current configuration and PostgreSQL journals. Existing successful Cloud SQL recovery remains applicable; no schema migration or operational backfill is performed.

Status: implementation complete; relevant checks, publication and Debian installation pending. No live test message will be forced.
