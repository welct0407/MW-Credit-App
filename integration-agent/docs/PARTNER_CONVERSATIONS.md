# Persistent Partner conversations

**Production native transport, 12 October 2026:** catalogue27 is active (deployed version: [Environment Inventory](../../project/Documents/Environment_Inventory.md#latest-verified-deployments)) after actual authenticated operational/analytical read and receipt-status probes. Existing conversation/receipt cutoffs, service flags and six active timers were preserved. Native catalogue/query/typed command/status transport replaces operational AppSheet calls and schema bootstrap; no financial sample was issued during deployment. First genuine operation remains the production business verification opportunity. Native monitoring subsequently replaced the AppSheet probes in R055 on 13 October 2026. Exact delivery and recovery: `project/outputs/r053-appsheet-retirement/agent-native-deployment-evidence.json`.

Resumed by the owner on 22 September 2026 at 02:17 Bangkok after the temporary 02:07 pause. The timer is enabled and both conversation switches are true. History and journals are preserved. A fresh ingress cutoff excludes paused-period messages; prior accepted replies are not resent. Initially activated on Debian at 01:23 Bangkok. Owner requested persistent conversations and Codex-selected general operational API edits. Runtime deployment and checks are recorded in the [change log](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/integration-agent/Change%20Logs/CHANGE_NOTES_PARTNER_CONVERSATIONS_2026-09-22.md).

Signed ingress → standalone post-cutoff text (no reply_to) → fresh Partner authentication → once-only turn → persistent Codex App Server thread → host data tools → durable localized reply → Instagram, or complete email fallback.

Threads bind the business Instagram account, immutable Partner key and actual sender ID. Each has a private Codex home under `state/partner-conversations/<binding>/`; a symlink references the existing service sign-in without importing Windows credentials/history. Only service model, reasoning effort and tier settings are inherited. Tools, plugins, shell, browser and owner rules are not inherited. Dynamic tools use the installed experimental App Server protocol; after CLI upgrades rerun `scripts/verify-partner-conversation.py` before resuming the timer. [Official App Server protocol](https://developers.openai.com/codex/app-server).

R053 native transport (deployed 12 October 2026): Codex retains resource/field discovery, exact decimal sums, generic Add/Edit and approved Delete carriers (Delete behind its own `native_delete_enabled` switch since 16 October 2026, when reviewer SQL DELETE was retired), plus the existing nine-resource reviewer DML tools. The reviewed catalogue covers 37 OLTP/OLAP resources with typed fields, native defaults, fixed virtual providers and bounded relationship queries. Reads use a parameterized typed JSON predicate rather than AppSheet expressions; the 1,000-row snapshot and 100-row page limits remain. Only current AI Reviewers can write, with at most ten verified sequential changes per turn. Unsupported historical expressions fail explicitly and are never replayed.

The deployed host uses the fixed MW Credit workload-authenticated catalogue/query/commands/status routes. Its separate policy resolves the current unique Partner Login Email and reviewer/integration flags; browser Firebase and receipt workload policies remain separate. The model supplies reviewed fields and expected outcomes, while the host resolves missing native defaults once, observes current versions, attributes the actor, and saves the complete typed request before network dispatch. Canonical database commands own financial effects, immutable outcomes and postcommit notification dispatch. Uncertain outcomes use status-only reconciliation with the same saved identity; there is no AppSheet or automatic DML fallback. The existing [reviewer DML](REVIEWER_DML.md) remains an explicitly selected atomic/gap route with its unchanged nine-resource boundary.

Codex must inspect related effects before claiming a complete workflow. HTTP acceptance and row persistence do not establish successful downstream posting. For asynchronous transitions it specifies the expected final state and uses verify_operation without resending. Physical financial-history deletion, identity/security/configuration changes, credit eligibility decisions and computed-field bypass are denied. Correct financial history through the app's existing reversal/void/adjustment semantics where available. Ask for missing amounts, dates, accounts or terms. The separate correlated receipt-review pipeline remains unchanged.

Native schema bootstrap requires conversation_api_enabled, the exact environment-bound command origin/audience and conversation_api_manifest_sha256. It loads the authenticated maintained catalogue and checks that pin; it does not read an AppSheet export, app ID or access key. The private historical schema capture remains recovery evidence, not runtime configuration. Fixed provider/default/action metadata is reviewed in the app repository; unknown semantics never become a formula interpreter or raw SQL gateway. R055 monitoring uses the native key-only probe.

## Conversation providers (21 October 2026)

`conversation_provider` selects the model behind the Partner conversation: `codex` (default, unchanged) or `claude`. Everything outside the model turn is shared and unchanged: signed ingress, cutoff, fresh authentication, once-only turn keys, host data and native-API tools, reviewer-only writes, delivery journal and the reply preflight. Switching is a configuration change, not a code deploy.

| Provider | What it is | History |
| --- | --- | --- |
| `codex` | Persistent Codex App Server thread per binding (above) | The Codex thread, kept even while Claude is selected |
| `claude` | Claude Opus 5.5 (`claude-opus-5-5`) on Vertex AI, called by the VM service account | Append-only `runtime.conversation_messages` in `mw_agent` (agent migration V8); each epoch is seeded with a transcript of the Partner's past exchanges from both providers (below) |

Switching back to `codex` resumes the Partner's existing Codex thread; the Claude rows stay. Claude history is conversational context only, never authority or current financial evidence. When a Partner's stored history reaches `claude_history_token_limit`, the host starts a new history epoch: earlier rows stay stored and are no longer sent, and the new epoch is seeded as described in [History, epochs and failures](#history-epochs-and-failures).

| Key | Default | Meaning |
| --- | --- | --- |
| `conversation_provider` | `codex` | `codex` or `claude` |
| `claude_project` | none | GCP project for Vertex AI |
| `claude_location` | `global` | Vertex AI location |
| `claude_model` | `claude-opus-5-5` | Pinned model |
| `claude_effort` | `high` | Reasoning effort |
| `claude_request_timeout_seconds` | 300 | Per model request |
| `claude_max_tool_rounds` | 24 | Tool rounds per turn |
| `claude_history_token_limit` | 150000 | Starts a new history epoch |
| `claude_seed_history_chars` | 40000 (0 to 200000) | Character budget of the "Earlier conversation" seed transcript of each epoch; 0 disables seeding |
| `conversation_sql_read_enabled` | `false` | Offers `sql_query` and `loan_payoff` to the Claude provider (one switch gates both) |

Authentication is the VM service account's existing `roles/aiplatform.user`; no IAM, key or credential is added. Owner console prerequisites, not yet done on 21 October 2026: Model Garden enablement of the Claude model (the owner confirmed in the implementing session that it will be enabled; not enabled yet) and quota for `global` `anthropic-claude-opus` (currently 0). Until both hold, Claude calls fail and the provider stays on `codex`. Activation is a separate owner-authorized step ([Operations](OPERATIONS.md#claude-partner-conversation-activation-and-rollback)). No live Vertex call has been made.

The Claude provider uses the same authorization-checked host tools and adds two read tools, `loan_payoff` (the payoff figure for a loan under the encoded payoff rules) and `sql_query`, both offered only when `conversation_sql_read_enabled` is true. Its system prompt carries the packaged [business rules](CONVERSATION_BUSINESS_RULES.md) and a generated schema digest (`scripts/build-schema-digest.py` writes `src/mw_integration_agent/assets/schema-digest.json`; regenerate it when business migrations change tables or columns).

### SQL read tool

`sql_query` is a bounded read-only route for open-ended questions (payoff mid-cycle, profit per borrower, ratios), not a write path and not a reviewer-DML replacement.

Owner decision, 21 October 2026: the tool has full read access, sensitive data included. The owner said to keep `mw_integration_agent` as it is, with no limits, because only the owner and Partners use it. Access is whatever the role's grants allow: no denied relations or columns and no output redaction, so the assistant can read, and may disclose, sensitive fields (Partner emails, account numbers, push and audit data) to a Partner who asks. Controls that remain:

- Login as the existing PostgreSQL role `mw_integration_agent` (read-only; grants unchanged and applied by the operator outside Git; the tool never grants anything).
- Every call runs in its own transaction with `READ ONLY` and statement and lock timeouts, asserts `current_user` and the database before the query, and always rolls back.
- One statement only, and only `SELECT` or `WITH`. Refused before any connection use: comments, `$`, `;`, row locks, write, DDL and transaction keywords, non-ASCII outside quotes, unbalanced parentheses, and side-effect or dynamic-SQL functions (including `pg_try_advisory*`, `pg_logical_emit_message`, `pg_export_snapshot`, `ts_stat`, `ts_rewrite` and `query_to_xml*`, also when quoted or schema-qualified). The session also sets `standard_conforming_strings=on`.
- Rows come through a server-side cursor with a 501-row fetch ; more than 500 rows is refused (`SQL_ROW_CAP_NARROW_QUERY`), so the model must aggregate, filter or page, and results are never silently truncated. A result over 256 KB and a cell over 256 KB are refused too, the byte bound being enforced server-side before data is sent.

### History, epochs and failures

- Each `runtime.conversation_messages` row (agent V8) stores the message content as exact JSON text, not `jsonb`, because `jsonb` reorders keys and Opus 5.5 rejects replayed thinking after any change. The last row of a turn also carries `input_tokens`. `created_at` exists only in PostgreSQL.
- A new history epoch starts when the token limit is exceeded, or when the model, system prompt (instructions, rules file, schema digest) or tool set changes. A deploy that changes the rules file or the digest therefore starts a new epoch for every Partner. Every new epoch (first Claude turn for a binding, token rollover, prompt, model or tool change, or the restart below) begins with a plain-text "Earlier conversation" transcript of that binding's past exchanges from both providers: Partner texts from the ingress messages and assistant replies from `turns.result`, oldest first with Bangkok timestamps (the turn's start time), replies labeled "Assistant:" only for READY and QUEUED turns and "Notice:" for FAILED, UNKNOWN_WRITE and INTERRUPTED turns (including their `_NOTIFIED` forms), keeping the newest whole exchanges that fit the `claude_seed_history_chars` budget; the header counts the omitted exchanges. It holds the binding's finished turns from both providers and excludes the current message, running turns and other Partners. A brand-new Partner gets no transcript and no note. Codex-era tool details are not recoverable. The model treats the transcript as context only and re-checks figures with tools. If the transcript cannot be read, or seeding is disabled (`claude_seed_history_chars` 0), the turn proceeds with an "earlier history unavailable" note. The restart after a first-round 400 is seeded too.
- A first-round 400 for invalid replayed history restarts the turn once with empty history.
- A refusal or `max_tokens` stop fails the turn (`CLAUDE_STOP_*`). There is no fallback model.
- `codex_executable` and `codex_home` are required only when the Codex conversation or a Codex receipt provider is active.
- Audit: the turn plan records provider, model, effort and max rounds; a separate `model_rounds` event records rounds, token usage, `seeded_exchanges`, `seeded_chars` and `seed_status`.

### Reply rules

Replies are plain text. Target about 700 characters; the hard limit is 1,000. For Claude the limit is enforced in `finish`: a longer reply is returned to the model, which must shorten it, so a Claude reply is not held for length. A Codex reply over 1,000 characters is held for review as before. Format rules CONV-UX-01..12 (answer first, labeled bullets, no tables or Markdown, explicit data date, totals and exclusions) apply to both providers.

## Controls and recovery

- `partner_conversations_enabled`: independent turn and reply kill switch.
- `reviewer_dml_enabled`: reviewer database transaction switch; `reviewer_dml_cutoff` excludes earlier messages.
- `conversation_writes_enabled`: reviewer-only general API write switch; no effect on receipt posting authority.
- `partner_conversation_cutoff`: first activation timestamp; both event and capture time must be newer. Never reset it to replay history.
- `conversation_timeout_seconds`: 30–900 seconds, default 600.
- `conversation_provider`: `codex` or `claude`; set it back to `codex` to roll back. `conversation_sql_read_enabled`: separate switch for `sql_query`. Other `claude_*` keys: [Conversation providers](#conversation-providers-21-october-2026).
- `mw-partner-conversation.timer`: 15 seconds after the previous cycle finishes, one turn per cycle so its reply is queued promptly; a process lock prevents overlap.

Generic processing/sending/writes remain false. Current master opt-in and English/ไทย preference control conversations; disabling the Partner blocks both reply channels. Fresh authenticated sender binding is also checked before email fallback. Receipt notification fallback retains its separate existing policy.

Since the 22 September PostgreSQL migration, the existing mw_agent journals hold conversation bindings, turns, tools, immutable operation intents and delivery attempts; SQLite names survive only in local fixture/compatibility paths. Interrupted RUNNING turns remain INTERRUPTED and never restart execution. READY replies may queue without rerunning the turn. Unknown native operations reconcile through their saved request status and exact readback; legacy operations use native exact-key readback only. Neither can acquire a new identity or repeat a possible write. Earlier successful steps remain recorded when a later step fails; this is not a cross-step atomic transaction.

Unknown sends never retry. Definite unsent email rejection retries at most three total attempts with backoff. A reply over 1,000 characters is never sent in part and never emailed: the Instagram preflight holds the notice for review (`IG_MESSAGE_TOO_LONG`). Email fallback applies only when Instagram is unavailable or its outcome is unknown. Provider acceptance is recorded accurately and does not prove inbox delivery.

Inspect timer/service status and sanitized CLI cycle output; detailed messages and journals stay private. Rollback: stop the conversation timer and service, disable its two switches, preserve journals and subsequent edits, and restore the backed-up package/configuration only with compatible catalogue. Do not restore old databases over accepted actions. Other service timers retain their existing ownership.

## Acceptance

Automated synthetic tests cover isolation, auth revocation, unknown outcomes, stale values, duplicate calls, tool boundaries, receipt-reply precedence and fresh observations. A real two-process synthetic Codex test checks thread continuity without production data or sending. Live data reads may verify fields/counts without printing records. Do not create financial records merely for testing.

From an enabled Partner account: ask a current borrower question, then a follow-up omitting the name. Compare with the app. For an operational edit, request an intended real change and check the owning app and affected related records. Restart recovery, failed delivery and unavailable API workflows must remain explicit. Owner acceptance requires actual partner interaction; a synthetic smoke test is not that acceptance.


25 September owner routing rule (revision22): **every direct reply is review-only**, including replies to hold notifications, unknown messages and already-decided requests. Such messages never enter the model or its tools; unmatched references make no change. General conversation requires a standalone message. See [held receipt rejection](PARTNER_REVIEW.md#rejecting-held-receipts--revision-22).

## Instagram reply formatting — 27 September 2026

Every new or resumed conversation receives plain-text Instagram instructions: answer first, short paragraphs, and labeled bullets per record. Markdown tables, pipe columns, code blocks and decorative Markdown are prohibited. Totals, exclusions, projections and data timestamps remain explicit; financial meaning must not be shortened away. Replies over 1,000 characters are held for review, not emailed (see Controls and recovery); the Claude provider must shorten them before finishing (see [Reply rules](#reply-rules)). This prompt change does not rewrite or resend earlier replies.

Standalone `review`, `reviews`, and `resend review` (case insensitive) belong to the deterministic receipt review coordinator, not a general Codex turn. Direct replies continue to belong exclusively to review handling. See [review resend](PARTNER_REVIEW.md#reviewer-requested-instagram-resend).

Notification boundary: normal PWA, receipt and native conversation API commands request dispatch after acknowledged COMMIT. The separately chosen reviewer database_transaction path retains its existing direct SQL/audit behavior and relies on durable capture plus minute notification recovery; it has no immediate wake hook or agent-to-notify authority.
