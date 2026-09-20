# Service catalogue

Revision 3 — owner-authorized manual daily cash statements, 20 September 2026. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

Signed Instagram webhook ingress and explicit Instagram delivery are authorized and implemented. Ingress verifies Meta signatures, stores deduplicated messages, and never processes or replies. Delivery requires both the catalogue permission and the live `sending_enabled` control; no automated worker exists.

| Service | State | Migration intent |
| --- | --- | --- |
| signed_webhook_ingress | enabled | Verify signatures, persist before acknowledgement, and deduplicate. No processing or replay. |
| partner_authentication | enabled for cash statements | Fresh opt-in, supported language, unique username, conversation scoped ID and profile verification. No inbound operational commands. |
| daily_cash_statement | enabled for explicit calls | Read-only R010 cash effects; 06:00–06:00 Bangkok posting timestamp; localized account PNGs to all currently enabled Partners. No schedule. |
| operational_data_read | enabled | Bounded Find-only AppSheet reads through the official API; output probes omit row contents. |
| database_connectivity | enabled | Dedicated loopback/Cloud SQL Auth Proxy login with business-table SELECT and TEMP only; no durable operational DML. |
| persistent_codex_conversation | disabled | Per-partner isolated Codex App Server threads with host-owned bounded tools. |
| partner_oltp_gui | disabled | Linux/Chromium compatibility must be proven before migration. |
| operational_data_api | disabled | Mapped, reviewed operational edits only; no raw database or schema access. |
| instagram_delivery | enabled for explicit calls | Official API transport; live sending also requires `sending_enabled=true`. No automatic replies or retries. |
| email_fallback | disabled | Same authorized partner only; unknown outcomes never replay. |
| daily_briefing | disabled | Separate owner authorization required before schedule installation. |
| pattaya_weather | disabled | Optional commercial endpoint/key; no borrower data transmitted. |

Denied: arbitrary shell/code execution from inbound content; raw database access; app/schema/security administration; credential or identity changes; direct borrower messaging; financial-history deletion; unreviewed bulk writes; public debugging endpoints; and automatic replay of uncertain effects.

The fixed read-only cash statement query is an authorized database reporting service, not a general SQL tool. The owner selected ledger posting timestamps for the cutoff. Opening balances retain R010 opening-minus-baseline offsets; effective movement dates are shown when different. Each period freezes a private snapshot and each account/partner/page has a durable send key. An uncertain send blocks replay. Use the existing API-only Instagram transport, fresh Partner master records and signed-ingress 24-hour windows with a 60-second margin. Closed windows remain blocked; no email fallback or public statement hosting is authorized by this service. Scheduling awaits separate owner acceptance.
