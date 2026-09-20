# Service catalogue

Revision 2 — Instagram transport plus bounded production data connectivity. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

Signed Instagram webhook ingress and explicit Instagram delivery are authorized and implemented. Ingress verifies Meta signatures, stores deduplicated messages, and never processes or replies. Delivery requires both the catalogue permission and the live `sending_enabled` control; no automated worker exists.

| Service | State | Migration intent |
| --- | --- | --- |
| signed_webhook_ingress | enabled | Verify signatures, persist before acknowledgement, and deduplicate. No processing or replay. |
| partner_authentication | disabled | Resolve authenticated Instagram sender against current Partner master data. |
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
