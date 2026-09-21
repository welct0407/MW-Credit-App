# Service catalogue

Revision 8 — borrower receipt summaries, 21 September 2026. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

Signed Instagram webhook ingress and explicit Instagram delivery are authorized and implemented. Ingress verifies Meta signatures and stores deduplicated messages and image references before acknowledgement. The owner authorized receipt-only processing on 21 September after promoting R011 account aliases. Receipt processing has its own switch and cutoff; generic processing and writes remain disabled.

| Service | State | Migration intent |
| --- | --- | --- |
| signed_webhook_ingress | enabled | Verify signatures, persist before acknowledgement, and deduplicate. Processing stays outside the HTTP request. |
| receipt_summary | enabled, summary only | New image messages from uniquely mapped, AI-enabled Borrowers; basic receipt validation and Partner Email/Language Preference summaries only. No payment creation or borrower replies. See [receipt operations](docs/RECEIPTS.md). |
| partner_authentication | enabled for cash statements | Fresh opt-in, supported language, unique username, conversation scoped ID and profile verification. No inbound operational commands. |
| daily_cash_statement | enabled and scheduled | Read-only R010 cash effects; 00:00–00:00 Bangkok ledger timestamp; localized account PNGs to all currently enabled Partners at 00:15 Bangkok. |
| operational_data_read | enabled | Bounded Find-only AppSheet reads through the official API; output probes omit row contents. |
| database_connectivity | enabled | Dedicated loopback/Cloud SQL Auth Proxy login with business-table SELECT and TEMP only; no durable operational DML. |
| persistent_codex_conversation | disabled | Per-partner isolated Codex App Server threads with host-owned bounded tools. |
| partner_oltp_gui | disabled | Linux/Chromium compatibility must be proven before migration. |
| operational_data_api | disabled | Mapped, reviewed operational edits only; no raw database or schema access. |
| instagram_delivery | enabled for statements and explicit calls | Official API transport; scheduled statements use their dedicated switch and manual sends require `sending_enabled=true`. No automatic conversational replies. |
| email_fallback | enabled for statements | Complete localized statement set to the same enabled Partner's current Email; definite non-delivery retries at most three times; unknown outcomes never replay. |
| daily_briefing | disabled | Separate owner authorization required before schedule installation. |
| pattaya_weather | disabled | Optional commercial endpoint/key; no borrower data transmitted. |

Denied: arbitrary shell/code execution from inbound content; raw database access; app/schema/security administration; credential or identity changes; direct borrower messaging; financial-history deletion; unreviewed bulk writes; public debugging endpoints; and automatic replay of uncertain effects.

The fixed read-only cash statement query is an authorized database reporting service, not a general SQL tool. The cutoff uses the existing ledger timestamp. On 21 September the owner selected receipt transfer time for receipt payments in that same field; AppSheet R013/V30 is DEV-only pending promotion. Opening balances retain R010 opening-minus-baseline offsets; effective movement dates are shown when different. Each period freezes a private snapshot and each account/partner/page has a durable send key. An uncertain Instagram send blocks Instagram replay and starts the complete email fallback. Use fresh Partner master records and signed-ingress 24-hour windows with a 60-second margin. No public statement hosting is authorized.

Cash statements support only completed Bangkok calendar days. Output language always follows the current Partner master. Temporary statement preview and language-override paths used during design review are retired. Receipt summaries use a separate 20-second queue timer, including at most three attempts for definitely rejected email; unknown send outcomes remain blocked. Receipt email delivery uses all Partners with valid Email, independently of statement IG opt-in.
