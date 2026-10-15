# Receipt notification status emojis — 22 September 2026

Owner requested small status emojis for reviewer/Partner messages. Baseline e1ea3582226005f01683cc0f6fc2094c075e4468; clean tree.

Added delivery-time heading decoration in partner_notice.py: review ❓, verified payment ✅, rejection ❌, manual handling 📝, stale/unknown ⚠️, expiry ⌛, unposted receipt 📩. Both preferred languages and email fallback share the same heading. Ordinary conversation replies remain unchanged. Delivery length checks include the icon.

Reserved payloads, event/message keys, review correlation and delivery history are unchanged, avoiding NOTICE_CONTENT_CHANGED for queued records. Completed notices are not replayed. No new service authority, financial logic, AppSheet or database change; no release number needed.

Rollback: restore the prior package from the reviewed installer backup, preserving current configuration and PostgreSQL journals. Existing successful Cloud SQL recovery remains applicable; no schema migration or operational backfill is performed.

Complete: 52 relevant local tests completed (51 passed, one platform skip); English/Thai rendering, all status categories and immutable input checks passed. Source 4b88bb4035dc45c87f714ab363c0d77f8deae04f published and installed on Debian through the reviewed updater. Its 185-test suite completed (155 passed, 30 optional skips), installed configuration validation passed and timers resumed. Private package/config backup: /var/lib/mw-integration-agent/rollback/reviewed-20260922T123743Z. No live test message was forced or prior notice replayed.
