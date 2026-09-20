# Service catalogue

Revision 0 — repository preparation only. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

No business service is enabled or implemented in this revision.

| Service | State | Migration intent |
| --- | --- | --- |
| signed_webhook_ingress | disabled | Verify signatures, persist before acknowledgement, and deduplicate. No processing while paused. |
| partner_authentication | disabled | Resolve authenticated Instagram sender against current Partner master data. |
| operational_data_read | disabled | Bounded Find-only AppSheet reads with fresh authorization and paging. |
| persistent_codex_conversation | disabled | Per-partner isolated Codex App Server threads with host-owned bounded tools. |
| partner_oltp_gui | disabled | Linux/Chromium compatibility must be proven before migration. |
| operational_data_api | disabled | Mapped, reviewed operational edits only; no raw database or schema access. |
| instagram_delivery | disabled | Official API, current opt-in/window checks, durable outcome journal. |
| email_fallback | disabled | Same authorized partner only; unknown outcomes never replay. |
| daily_briefing | disabled | Separate owner authorization required before schedule installation. |
| pattaya_weather | disabled | Optional commercial endpoint/key; no borrower data transmitted. |

Denied: arbitrary shell/code execution from inbound content; raw database access; app/schema/security administration; credential or identity changes; direct borrower messaging; financial-history deletion; unreviewed bulk writes; public debugging endpoints; and automatic replay of uncertain effects.
