# Service catalogue

Revision 11 — linked Partner receipt reviews, 21 September 2026. The machine-readable manifest is authoritative at runtime and is validated by `mw-integration-agent check`.

R014 staged refinement: Partners.AI Reviewer separates payment review authority from Partner notification/IG preferences. Tommy is initially selected in DEV V32. Source code filters requests, replies and execution by the current reviewer role. This refinement is not deployed; production still uses the previously deployed all-Partner policy. Deploy only after the R014 database prerequisite. Existing service enablement and cutoffs are unchanged.

Signed Instagram webhook ingress and explicit Instagram delivery are authorized and implemented. Ingress verifies Meta signatures and stores deduplicated messages and image references before acknowledgement. The owner authorized receipt-only processing on 21 September after promoting R011 account aliases. Receipt processing has its own switch and cutoff; generic processing and writes remain disabled; scoped partner-approved ordinary receipt posting is separately enabled.

| Service | State | Migration intent |
| --- | --- | --- |
| partner_receipt_review | enabled | Valid receipts become Partner proposals. Exact signed direct replies Yes/Approve/Approved/อนุมัติ authorize ordinary payments only. Case insensitive. Other direct replies reject. Loan closures and overpayments are manual-only. Scoped Payments Add plus readback; unknown dispatch is never replayed. |
| conversation_poll | enabled | Five-minute API-only reader for conversations containing AI-enabled borrowers. New cutoff, overlapping checks, shared receipt deduplication. No browser automation or group sends. Bounded history gaps stop without advancing the affected cursor. |
| signed_webhook_ingress | enabled | Verify signatures, persist before acknowledgement, and deduplicate. Processing stays outside the HTTP request. |
| receipt_summary | enabled, review input | New eligible images: validate and propose action for linked Partner review. IG first; email fallback is informational and cannot authorize execution. No borrower/group replies. Operator-selected preparation remains read-only. |
| partner_authentication | enabled for cash statements | Fresh opt-in, supported language, unique username, conversation scoped ID and profile verification. Only linked receipt decisions are supported; no general inbound commands. |
| daily_cash_statement | enabled and scheduled | Read-only R010 cash effects; 00:00–00:00 Bangkok ledger timestamp; localized account PNGs to all currently enabled Partners at 00:15 Bangkok. |
| operational_data_read | enabled | Bounded Find-only reads through both production OLTP and OLAP APIs, with separate keys. Probes omit row contents. DEV APIs remain unchanged. |
| database_connectivity | enabled | Dedicated loopback/Cloud SQL Auth Proxy login with business-table SELECT and TEMP only; no durable operational DML. |
| persistent_codex_conversation | disabled | Per-partner isolated Codex App Server threads with host-owned bounded tools. |
| partner_oltp_gui | disabled | Linux/Chromium compatibility must be proven before migration. |
| operational_data_api | disabled | General operational edits remain disabled. The separate partner_receipt_review capability permits only one exact approved ordinary Payments Add. No raw SQL writes or schema access. |
| instagram_delivery | enabled for statements and explicit calls | Official API transport; scheduled statements use their dedicated switch and manual sends require `sending_enabled=true`. No automatic conversational replies. |
| email_fallback | enabled for Partner notifications | Instagram first; current Partner Email is fallback. Definite non-delivery retries at most three total attempts; unknown email outcomes never replay. |
| daily_briefing | disabled | Separate owner authorization required before schedule installation. |
| pattaya_weather | disabled | Optional commercial endpoint/key; no borrower data transmitted. |

Denied: arbitrary shell/code execution from inbound content; raw database access; app/schema/security administration; credential or identity changes; direct borrower messaging; financial-history deletion; unreviewed bulk writes; public debugging endpoints; and automatic replay of uncertain effects.

The fixed read-only cash statement query is an authorized database reporting service, not a general SQL tool. The cutoff uses the existing ledger timestamp. On 21 September the owner selected receipt transfer time for receipt payments in that same field; AppSheet R013/V30 is deployed to production. Opening balances retain R010 opening-minus-baseline offsets; effective movement dates are shown when different. Each period freezes a private snapshot and each account/partner/page has a durable send key. An uncertain Instagram send blocks Instagram replay and starts the complete email fallback. Use fresh Partner master records and signed-ingress 24-hour windows with a 60-second margin. No public statement hosting is authorized.

Cash statements support only completed Bangkok calendar days. Output language follows current Partner master. Receipt summaries use a 20-second queue timer; partner notices try Instagram first and use email fallback only when unavailable or uncertain. IG opt-in controls IG delivery; a disabled IG route can fall back to that Partner's Email. Direct-email legacy entries are superseded only if definitely unsent; SENT/UNKNOWN history remains. A new notification cutoff prevents replay of earlier receipts. Successful posting notices require verified payment readback from the scoped Partner review executor. Loan closures and overpayments require manual handling. No success notice goes to the borrower/group.
