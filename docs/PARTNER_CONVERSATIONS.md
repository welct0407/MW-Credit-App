# Persistent Partner conversations

Resumed by the owner on 22 September 2026 at 02:17 Bangkok after the temporary 02:07 pause. The timer is enabled and both conversation switches are true. History and journals are preserved. A fresh ingress cutoff excludes paused-period messages; prior accepted replies are not resent. Initially activated on Debian at 01:23 Bangkok. Owner requested persistent conversations and Codex-selected general operational API edits. Runtime deployment and checks are recorded in the [change log](../Change%20Logs/CHANGE_NOTES_PARTNER_CONVERSATIONS_2026-09-22.md).

Signed ingress → standalone post-cutoff text (no reply_to) → fresh Partner authentication → once-only turn → persistent Codex App Server thread → host data tools → durable localized reply → Instagram, or complete email fallback.

Threads bind the business Instagram account, immutable Partner key and actual sender ID. Each has a private Codex home under `state/partner-conversations/<binding>/`; a symlink references the existing service sign-in without importing Windows credentials/history. Only service model, reasoning effort and tier settings are inherited. Tools, plugins, shell, browser and owner rules are not inherited. Dynamic tools use the installed experimental App Server protocol; after CLI upgrades rerun `scripts/verify-partner-conversation.py` before resuming the timer. [Official App Server protocol](https://developers.openai.com/codex/app-server).

R053 native candidate (source only; activation pending): Codex retains resource/field discovery, exact decimal sums, generic Add/Edit and approved Delete carriers, plus the existing nine-resource reviewer DML tools. The reviewed catalogue covers 37 OLTP/OLAP resources with typed fields, native defaults, fixed virtual providers and bounded relationship queries. Reads use a parameterized typed JSON predicate rather than AppSheet expressions; the 1,000-row snapshot and 100-row page limits remain. Only current AI Reviewers can write, with at most ten verified sequential changes per turn. Unsupported historical expressions fail explicitly and are never replayed.

The candidate host uses the fixed MW Credit workload-authenticated catalogue/query/commands/status routes. Its separate policy resolves the current unique Partner Login Email and reviewer/integration flags; browser Firebase and receipt workload policies remain separate. The model supplies reviewed fields and expected outcomes, while the host resolves missing native defaults once, observes current versions, attributes the actor, and saves the complete typed request before network dispatch. Canonical database commands own financial effects, immutable outcomes and postcommit notification dispatch. Uncertain outcomes use status-only reconciliation with the same saved identity; there is no AppSheet or automatic DML fallback. The existing [reviewer DML](REVIEWER_DML.md) remains an explicitly selected atomic/gap route with its unchanged nine-resource boundary.

Codex must inspect related effects before claiming a complete workflow. HTTP acceptance and row persistence do not establish successful downstream posting. For asynchronous transitions it specifies the expected final state and uses verify_operation without resending. Physical financial-history deletion, identity/security/configuration changes, credit eligibility decisions and computed-field bypass are denied. Correct financial history through the app's existing reversal/void/adjustment semantics where available. Ask for missing amounts, dates, accounts or terms. The separate correlated receipt-review pipeline remains unchanged.

Native schema bootstrap requires conversation_api_enabled, the exact environment-bound command origin/audience and conversation_api_manifest_sha256. It loads the authenticated maintained catalogue and checks that pin; it does not read an AppSheet export, app ID or access key. The private historical schema capture remains recovery evidence, not runtime configuration. Fixed provider/default/action metadata is reviewed in the app repository; unknown semantics never become a formula interpreter or raw SQL gateway. Monitoring/Grafana replacement is owner-deferred.

## Controls and recovery

- `partner_conversations_enabled`: independent turn and reply kill switch.
- `reviewer_dml_enabled`: reviewer database transaction switch; `reviewer_dml_cutoff` excludes earlier messages.
- `conversation_writes_enabled`: reviewer-only general API write switch; no effect on receipt posting authority.
- `partner_conversation_cutoff`: first activation timestamp; both event and capture time must be newer. Never reset it to replay history.
- `conversation_timeout_seconds`: 30–900 seconds, default 600.
- `mw-partner-conversation.timer`: 15 seconds after the previous cycle finishes, one turn per cycle so its reply is queued promptly; a process lock prevents overlap.

Generic processing/sending/writes remain false. Current master opt-in and English/ไทย preference control conversations; disabling the Partner blocks both reply channels. Fresh authenticated sender binding is also checked before email fallback. Receipt notification fallback retains its separate existing policy.

Since the 22 September PostgreSQL migration, the existing mw_agent journals hold conversation bindings, turns, tools, immutable operation intents and delivery attempts; SQLite names survive only in local fixture/compatibility paths. Interrupted RUNNING turns remain INTERRUPTED and never restart execution. READY replies may queue without rerunning the turn. Unknown native operations reconcile through their saved request status and exact readback; legacy operations use native exact-key readback only. Neither can acquire a new identity or repeat a possible write. Earlier successful steps remain recorded when a later step fails; this is not a cross-step atomic transaction.

Unknown sends never retry. Definite unsent email rejection retries at most three total attempts with backoff. A reply over 1,000 characters goes as one complete email; no partial Instagram response is sent first. Provider acceptance is recorded accurately and does not prove inbox delivery.

Inspect timer/service status and sanitized CLI cycle output; detailed messages and journals stay private. Rollback: stop the conversation timer and service, disable its two switches, preserve journals and subsequent edits, and restore the backed-up package/configuration only with compatible catalogue. Do not restore old databases over accepted actions. Other service timers retain their existing ownership.

## Acceptance

Automated synthetic tests cover isolation, auth revocation, unknown outcomes, stale values, duplicate calls, tool boundaries, receipt-reply precedence and fresh observations. A real two-process synthetic Codex test checks thread continuity without production data or sending. Live data reads may verify fields/counts without printing records. Do not create financial records merely for testing.

From an enabled Partner account: ask a current borrower question, then a follow-up omitting the name. Compare with the app. For an operational edit, request an intended real change and check the owning app and affected related records. Restart recovery, failed delivery and unavailable API workflows must remain explicit. Owner acceptance requires actual partner interaction; a synthetic smoke test is not that acceptance.


25 September owner routing rule (revision22): **every direct reply is review-only**, including replies to hold notifications, unknown messages and already-decided requests. Such messages never enter the model or its tools; unmatched references make no change. General conversation requires a standalone message. See [held receipt rejection](PARTNER_REVIEW.md#rejecting-held-receipts--revision-22).

## Instagram reply formatting — 27 September 2026

Every new or resumed conversation receives plain-text Instagram instructions: answer first, short paragraphs, and labeled bullets per record. Markdown tables, pipe columns, code blocks and decorative Markdown are prohibited. Totals, exclusions, projections and data timestamps remain explicit; financial meaning must not be shortened away. Existing over-1,000-character email fallback remains unchanged. This prompt change does not rewrite or resend earlier replies.

Standalone `review`, `reviews`, and `resend review` (case insensitive) belong to the deterministic receipt review coordinator, not a general Codex turn. Direct replies continue to belong exclusively to review handling. See [review resend](PARTNER_REVIEW.md#reviewer-requested-instagram-resend).

Notification boundary: normal PWA, receipt and native conversation API commands request dispatch after acknowledged COMMIT. The separately chosen reviewer database_transaction path retains its existing direct SQL/audit behavior and relies on durable capture plus minute notification recovery; it has no immediate wake hook or agent-to-notify authority.
