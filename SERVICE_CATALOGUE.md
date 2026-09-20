# Service catalogue

Revision 1 — receipt-only Instagram transport foundation. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

Signed Instagram webhook ingress is authorized and implemented. It verifies Meta signatures, stores deduplicated messages, and never processes or replies. The outbound Instagram adapter is implemented but disabled pending a deliberate live-send test and later feature work.

| Service | State | Migration intent |
| --- | --- | --- |
| signed_webhook_ingress | enabled | Verify signatures, persist before acknowledgement, and deduplicate. No processing or replay. |
| partner_authentication | disabled | Resolve authenticated Instagram sender against current Partner master data. |
| operational_data_read | disabled | Bounded Find-only AppSheet reads with fresh authorization and paging. |
| persistent_codex_conversation | disabled | Per-partner isolated Codex App Server threads with host-owned bounded tools. |
| partner_oltp_gui | disabled | Linux/Chromium compatibility must be proven before migration. |
| operational_data_api | disabled | Mapped, reviewed operational edits only; no raw database or schema access. |
| instagram_delivery | implemented, disabled | Official API transport exists; live sending remains blocked by catalogue and runtime flags. |
| email_fallback | disabled | Same authorized partner only; unknown outcomes never replay. |
| daily_briefing | disabled | Separate owner authorization required before schedule installation. |
| pattaya_weather | disabled | Optional commercial endpoint/key; no borrower data transmitted. |

Denied: arbitrary shell/code execution from inbound content; raw database access; app/schema/security administration; credential or identity changes; direct borrower messaging; financial-history deletion; unreviewed bulk writes; public debugging endpoints; and automatic replay of uncertain effects.
