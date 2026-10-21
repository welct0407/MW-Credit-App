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

`conversation_provider` selects the model behind the Partner conversation: `codex` (default, unchanged), `claude` or `gemini`. Gemini is the intended provider at activation (owner decision, 21 October 2026: Google rejected the Claude Vertex quota request because the account is new, so the owner chose `gemini-4-argon` on Vertex AI and kept Claude switchable). Everything outside the model turn is shared and unchanged: signed ingress, cutoff, fresh authentication, once-only turn keys, host data and native-API tools, reviewer-only writes, delivery journal and the reply preflight. Switching is a configuration change, not a code deploy.

| Provider | What it is | History |
| --- | --- | --- |
| `codex` | Persistent Codex App Server thread per binding (above) | The Codex thread, kept even while Claude or Gemini is selected |
| `gemini` | `gemini-4-argon` on Vertex AI (`global`), called by the VM service account; the intended provider at activation | Same `runtime.conversation_messages` journal, rows marked with the provider; each epoch is seeded as for Claude |
| `claude` | Claude Opus 5.5 (`claude-opus-5-5`) on Vertex AI, called by the VM service account | Append-only `runtime.conversation_messages` in `mw_agent` (agent migration V8); each epoch is seeded with a transcript of the Partner's past exchanges from both providers (below) |

Switching back to `codex` resumes the Partner's existing Codex thread; the Claude and Gemini rows stay. A change of provider starts a new history epoch, seeded from the Partner's earlier exchanges. Claude and Gemini history is conversational context only, never authority or current financial evidence. When a Partner's stored history reaches the provider's token limit (`claude_history_token_limit` or `gemini_conversation_history_token_limit`), the host starts a new history epoch: earlier rows stay stored and are no longer sent, and the new epoch is seeded as described in [History, epochs and failures](#history-epochs-and-failures).

| Key | Default | Meaning |
| --- | --- | --- |
| `conversation_provider` | `codex` | `codex`, `claude` or `gemini` |
| `claude_project` | none | GCP project for Vertex AI |
| `claude_location` | `global` | Vertex AI location |
| `claude_model` | `claude-opus-5-5` | Pinned model |
| `claude_effort` | `high` | Reasoning effort |
| `claude_request_timeout_seconds` | 300 | Per model request |
| `claude_max_tool_rounds` | 24 | Tool rounds per turn |
| `claude_history_token_limit` | 150000 | Starts a new history epoch |
| `claude_seed_history_chars` | 40000 (0 to 200000) | Character budget of the "Earlier conversation" seed transcript of each epoch; 0 disables seeding |
| `gemini_project`, `gemini_location` | existing keys | Reused by the Gemini conversation (project and location, `global`) |
| `gemini_conversation_model` | `gemini-4-argon` | Allowlist of one model |
| `gemini_conversation_thinking_level` | `HIGH` | `LOW`, `MEDIUM`, `HIGH` or `MAX`; always sent. Owner decision: default `HIGH`; `MAX` stays allowed and can be set later if needed. `thinkingBudget` is not supported by `gemini-4-argon`. Forge's live test: all four levels return 200, `XHIGH` returns 400. Higher levels can make replies slower; lower the level in config if they are |
| `gemini_conversation_request_timeout_seconds` | 300 | Per model request |
| `gemini_conversation_max_tool_rounds` | 24 | Tool rounds per turn |
| `gemini_conversation_history_token_limit` | 150000 | Starts a new history epoch |
| `gemini_conversation_seed_history_chars` | 40000 | Character budget of the seed transcript; 0 disables seeding |
| `conversation_sql_read_enabled` | `false` | Offers `sql_query` and `loan_payoff` to the Claude and Gemini providers (one switch gates both) |

Authentication for both Vertex AI providers is the VM service account's existing `roles/aiplatform.user`; no IAM, key or credential is added, and no infrastructure change is needed. Gemini: `gemini-4-argon` answers on `global` (test calls returned 200 and function calling worked). It has no per-project quota row (dynamic shared quota), so there is no quota request to make; retries are described under History, epochs and failures. Claude: the owner enabled the model in Model Garden, but Google rejected the quota request (new account), so Claude needs a quota grant for `global` `anthropic-claude-opus` before it can be used. Gemini has run two live synthetic turns on Vertex AI (owner-approved test, 21 October 2026, synthetic lab data); Claude has not run, having no quota.

The Claude and Gemini providers use the same authorization-checked host tools and add two read tools, `loan_payoff` (the payoff figure for a loan under the encoded payoff rules) and `sql_query`, both offered only when `conversation_sql_read_enabled` is true. Their system prompt carries the packaged [business rules](CONVERSATION_BUSINESS_RULES.md) and a generated schema digest (`scripts/build-schema-digest.py` writes `src/mw_integration_agent/assets/schema-digest.json`; regenerate it when business migrations change tables or columns).

### SQL read tool

`sql_query` is a bounded read-only route for open-ended questions (payoff mid-cycle, profit per borrower, ratios), not a write path and not a reviewer-DML replacement.

Owner decision, 21 October 2026: the tool has full read access, sensitive data included. The owner said to keep `mw_integration_agent` as it is, with no limits, because only the owner and Partners use it. Access is whatever the role's grants allow: no denied relations or columns and no output redaction, so the assistant can read, and may disclose, sensitive fields (Partner emails, account numbers, push and audit data) to a Partner who asks. Controls that remain:

- Login as the existing PostgreSQL role `mw_integration_agent` (read-only; grants unchanged and applied by the operator outside Git; the tool never grants anything).
- Every call runs in its own transaction with `READ ONLY` and statement and lock timeouts, asserts `current_user` and the database before the query, and always rolls back.
- One statement only, and only `SELECT` or `WITH`. Refused before any connection use: comments, `$`, `;`, row locks, write, DDL and transaction keywords, non-ASCII outside quotes, unbalanced parentheses, and side-effect or dynamic-SQL functions (including `pg_try_advisory*`, `pg_logical_emit_message`, `pg_export_snapshot`, `ts_stat`, `ts_rewrite` and `query_to_xml*`, also when quoted or schema-qualified). The session also sets `standard_conforming_strings=on`.
- Rows come through a server-side cursor with a 501-row fetch ; more than 500 rows is refused (`SQL_ROW_CAP_NARROW_QUERY`), so the model must aggregate, filter or page, and results are never silently truncated. A result over 256 KB and a cell over 256 KB are refused too, the byte bound being enforced server-side before data is sent.

### History, epochs and failures

- Each `runtime.conversation_messages` row (agent V8) stores the message content as exact JSON text, not `jsonb`, because `jsonb` reorders keys and Opus 5.5 rejects replayed thinking after any change. The last row of a turn also carries `input_tokens`. `created_at` exists only in PostgreSQL.
- A new history epoch starts when the token limit is exceeded, when the provider changes, or when the model, system prompt (instructions, rules file, schema digest) or tool set changes. A deploy that changes the rules file or the digest therefore starts a new epoch for every Partner. Every new epoch (first Claude turn for a binding, token rollover, prompt, model or tool change, or the restart below) begins with a plain-text "Earlier conversation" transcript of that binding's past exchanges from both providers: Partner texts from the ingress messages and assistant replies from `turns.result`, oldest first with Bangkok timestamps (the turn's start time), replies labeled "Assistant:" only for READY and QUEUED turns and "Notice:" for FAILED, UNKNOWN_WRITE and INTERRUPTED turns (including their `_NOTIFIED` forms), keeping the newest whole exchanges that fit the `claude_seed_history_chars` budget; the header counts the omitted exchanges. It holds the binding's finished turns from both providers and excludes the current message, running turns and other Partners. A brand-new Partner gets no transcript and no note. Codex-era tool details are not recoverable. The model treats the transcript as context only and re-checks figures with tools. If the transcript cannot be read, or seeding is disabled (`claude_seed_history_chars` 0), the turn proceeds with an "earlier history unavailable" note. The restart after a first-round 400 is seeded too.
- A first-round 400 for invalid replayed history restarts the turn once with empty history.
- A refusal or `max_tokens` stop fails the turn (`CLAUDE_STOP_*`; Gemini: `GEMINI_STOP_<REASON>`). There is no fallback model.
- Retries, both providers: 429, 503 and 529 get up to 3 attempts (pauses of 2 s, then 5 s); 500, 502, 504 and timeouts get one retry after 1 s; other 4xx never retry. A retry starts only if 4 s plus its pause remain before the deadline. When retries are exhausted the turn fails with `<PROVIDER>_HTTP_<code>`.
- Gemini behaviour: `thinkingLevel` is always sent and `thinkingBudget` never; `maxOutputTokens` is 16384 and no temperature is set. Response parts are stored and replayed verbatim with their signatures and any unknown part fields (signature-only parts are accepted and replayed), `functionCall` ids are echoed in the response (a duplicate id within one response is journalled under a derived id while the model's id is still echoed), STOP with no parts fails as `GEMINI_RESPONSE_INVALID`, and a malformed call is resent once. The round-cap nudge is sent to Gemini as a separate user content after the tool answers, never mixed into the `functionResponse` content (Vertex answered the mixed shape with HTTP 400 "Requests ending with a model turn are not supported"); Claude's nudge is unchanged. Other Gemini failure codes: `GEMINI_PROMPT_BLOCKED_<REASON>`, `GEMINI_UNEXPECTED_PART` (only a part with no text, thought, `functionCall` or signature, that is an empty or data-only part), `GEMINI_TIMEOUT`, `GEMINI_UNREACHABLE`, `GEMINI_TOKEN_UNAVAILABLE` and `GEMINI_TOOL_ROUNDS_EXCEEDED`.
- The instructions shared by Claude and Gemini live in `conversation_session.py` (`ASSISTANT_INSTRUCTIONS`). The prompt digest includes the provider and model, so a provider or model change, and the first Gemini deploy for any Partner with Claude history, starts a new seeded epoch.
- The `gemini_conversation_*` keys are validated only when the provider is `gemini`; `gemini_location` defaults to `global`.
- `codex_executable` and `codex_home` are required only when the Codex conversation or a Codex receipt provider is active.
- Audit: the `model_turn` plan records provider, model, effort (Claude) or thinking level (Gemini), and max rounds. A separate `model_rounds` event records token usage (Gemini: prompt, candidates, thoughts and cached-content tokens), `finish_reason`, rounds, `attempts`, the epoch, and `seeded_exchanges`, `seeded_chars` and `seed_status`.

### Reply rules

Replies are plain text. Target about 700 characters; the hard limit is 1,000. For Claude and Gemini the limit is enforced in `finish`: a longer reply is returned to the model, which must shorten it, so their replies are not held for length. A Codex reply over 1,000 characters is held for review as before. Format rules CONV-UX-01..12 (answer first, labeled bullets, no tables or Markdown, explicit data date, totals and exclusions) apply to all providers.

## Controls and recovery

- `partner_conversations_enabled`: independent turn and reply kill switch.
- `reviewer_dml_enabled`: reviewer database transaction switch; `reviewer_dml_cutoff` excludes earlier messages.
- `conversation_writes_enabled`: reviewer-only general API write switch; no effect on receipt posting authority.
- `partner_conversation_cutoff`: first activation timestamp; both event and capture time must be newer. Never reset it to replay history.
- `conversation_timeout_seconds`: 30–900 seconds, default 600.
- `conversation_provider`: `codex`, `claude` or `gemini`; set it back to `codex` to roll back. `conversation_sql_read_enabled`: separate switch for `sql_query`. Other `claude_*` keys: [Conversation providers](#conversation-providers-21-october-2026).
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
