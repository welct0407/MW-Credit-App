# Persistent Partner conversations

Owner requested Debian implementation and operational edits on 22 September 2026. Runtime deployment and checks are recorded in the [change log](../Change%20Logs/CHANGE_NOTES_PARTNER_CONVERSATIONS_2026-09-22.md).

Signed ingress → post-cutoff text → fresh Partner authentication → once-only turn → persistent Codex App Server thread → host data tools → durable localized reply → Instagram, or complete email fallback.

Threads bind the business Instagram account, immutable Partner key and actual sender ID. Each has a private Codex home under `state/partner-conversations/<binding>/`; a symlink references the existing service sign-in without importing Windows credentials/history. Only service model, reasoning effort and tier settings are inherited. Tools, plugins, shell, browser and owner rules are not inherited. Dynamic tools use the installed experimental App Server protocol; after CLI upgrades rerun `scripts/verify-partner-conversation.py` before resuming the timer. [Official App Server protocol](https://developers.openai.com/codex/app-server).

The tool set is general field discovery, record search/projection/paging, exact decimal aggregation, inspected record edits and evidence-backed completion. It does not route a fixed list of business questions. Follow-ups reuse the thread, but observations and read caches live for one turn only. Reads fail if the matching population reaches 1,001 rows; narrow the query rather than treating truncated data as a complete total. Sum results label partial pages. No default model or effort override is introduced.

Supported edits are one Borrowers row per message: Borrower Name, English Name (`Description`), Address, City, Working Location and Borrower Note. The current signed message must request the edit. The host requires an observed row and expected values, checks the same row in both production apps before writing, records intent before dispatch, and reads both apps afterward. Borrower Note is absent from the current OLAP app: that field is verified in OLTP, while the exposed OLAP descriptive fields must stay unchanged. Other edited fields require matching readback in both apps. Existing API access is used; no SQL write or app configuration changes occur. These descriptive fields do not post payments or alter financial terms. API expected-value checks are not an atomic compare-and-swap against concurrent human edits; discrepancies fail before dispatch or become uncertain on readback.

Other operational edits, new borrowers/loans, financial transactions/corrections and general GUI actions remain unavailable in this conversation tool set. Debian currently has no authenticated AppSheet GUI session. The existing separately authorized receipt approval service remains active and independent. A receipt-review reply is never processed as a free-form command. This is not a claim of migrating every Windows GUI capability.

## Controls and recovery

- `partner_conversations_enabled`: independent turn and reply kill switch.
- `conversation_writes_enabled`: descriptive edit switch; no effect on receipt posting authority.
- `partner_conversation_cutoff`: first activation timestamp; both event and capture time must be newer. Never reset it to replay history.
- `conversation_timeout_seconds`: 30–900 seconds, default 600.
- `mw-partner-conversation.timer`: 15 seconds after the previous cycle finishes, one turn per cycle so its reply is queued promptly; a process lock prevents overlap.

Generic processing/sending/writes remain false. Current master opt-in and English/ไทย preference control conversations; disabling the Partner blocks both reply channels. Fresh authenticated sender binding is also checked before email fallback. Receipt notification fallback retains its separate existing policy.

`partner-conversations.db` holds bindings, turns, tool calls and edit journals. `conversation-notices.db` holds replies and delivery attempts. Neither belongs in Git. An interrupted RUNNING turn becomes INTERRUPTED and never calls `turn/start` again. READY answers can be queued after restart without re-executing the turn. Unknown edits retain expected/desired values and block further edits on the same row. Reconcile read-only against OLTP and OLAP; never erase a reservation or retry a possible write. A failed turn gets a localized limitation reply when identity and delivery controls permit it.

Unknown sends never retry. Definite unsent email rejection retries at most three total attempts with backoff. A reply over 1,000 characters goes as one complete email; no partial Instagram response is sent first. Provider acceptance is recorded accurately and does not prove inbox delivery.

Inspect timer/service status and sanitized CLI cycle output; detailed messages and journals stay private. Rollback: stop the conversation timer and service, disable its two switches, preserve journals and subsequent edits, and restore the backed-up package/configuration only with compatible catalogue. Do not restore old databases over accepted actions. Other service timers retain their existing ownership.

## Acceptance

Automated synthetic tests cover isolation, auth revocation, unknown outcomes, stale values, duplicate calls, tool boundaries, receipt-reply precedence and fresh observations. A real two-process synthetic Codex test checks thread continuity without production data or sending. Live data reads may verify fields/counts without printing records. Do not create financial records merely for testing.

From an enabled Partner account: ask a current borrower question, then a follow-up omitting the name. Compare with the app. For a supported edit, request an intended note/location update and check both apps. Restart recovery, failed delivery and broader workflow limitations must remain explicit. Owner acceptance requires actual partner interaction; a synthetic smoke test is not that acceptance.
