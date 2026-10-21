# Change notes — Claude and Gemini Partner conversation providers, 21 October 2026

## Purpose
Owner decision, 21 October 2026: the Partner conversation no longer depends only on the Codex App Server. A second provider, Claude Opus 5.5 on Vertex AI, can answer the same Partner turns, with a business-rules reference, a `loan_payoff` tool and an optional bounded read-only SQL tool. Later the same day Google rejected the Claude Vertex quota request (new account), so the owner chose `gemini-4-argon` on Vertex AI as the intended provider and kept Claude switchable (second batch on the same pull request, below). Source only; nothing is deployed or activated, and Codex stays the default.

## Changes
Owner decisions (relayed 21 October 2026; Model Garden enablement confirmed by the owner in the implementing session):
- Provider is switchable with `conversation_provider: codex|claude|gemini`, default `codex`; rollback is setting it back. The owner chose `gemini-4-argon` on Vertex AI as the intended provider at activation after Google rejected the Claude quota request; the Claude Model Garden enablement was done but Claude needs a quota grant before use.
- Past conversation context is kept: every new Claude history epoch is seeded with an "Earlier conversation" transcript of the binding's past exchanges from both providers (`claude_seed_history_chars`, default 40000, 0 disables). The Codex thread is kept and resumes on switch back.
- The assistant gets a bounded read-only SQL tool and a payoff tool for open-ended questions. The SQL tool has full read access, sensitive data included: the owner said to keep `mw_integration_agent` as it is, no limits, because only the owner and Partners use it. The assistant may therefore disclose sensitive fields to Partners.
- Agent migration V8 is applied in PROD together with activation, with no separate approval; activation itself still needs the owner's go.
- The owner corrected an earlier "fresh start" decision: past context is kept through seeding, above.

Team: Archie (A) design, Byte (B) code and tests, Chase (C) verification, Dewey (D) documentation, Echo (E) reply format CONV-UX-01..12, Forge (F) Vertex readiness. Forge found the Vertex AI API enabled (first batch), `roles/aiplatform.user` on the VM service account sufficient, egress working, the model not yet enabled in Model Garden and `global` `anthropic-claude-opus` quota 0; no cloud change was made.

Code (Byte; the commit holds the exact file list):
- Claude provider on Vertex AI with the config keys `conversation_provider`, `claude_project`, `claude_location` (default `global`), `claude_model` (`claude-opus-5-5`), `claude_effort` (default `high`), `claude_request_timeout_seconds` (300), `claude_max_tool_rounds` (24), `claude_history_token_limit` (150000) and `conversation_sql_read_enabled` (default `false`). Authentication is the VM service account's existing `roles/aiplatform.user`; no new IAM.
- Tools `sql_query` (role `mw_integration_agent`, per-transaction READ ONLY with timeouts, `current_user` assertion, single `SELECT`/`WITH`, keyword and function deny lists (incl. `ts_stat`, `ts_rewrite`, `query_to_xml*`), server-side cursor with a 501-row fetch (more than 500 rows is refused, not truncated), 256 KB per result and per cell enforced server-side; also refuses comments, `$`, `;`, row locks, non-ASCII outside quotes, unbalanced parentheses ``pg_try_advisory*`, `pg_logical_emit_message` and `pg_export_snapshot`; the session sets `standard_conforming_strings=on`) and `loan_payoff`. Full read access, no denied relations or redaction (owner decision below).
- Agent migration V8, `runtime.conversation_messages`: append-only history, content stored as exact JSON text (not `jsonb`; the CHECK uses `json`, so `\u0000` is accepted), `input_tokens` on a turn's last row. A new epoch starts on the token limit or a change of model, system prompt (instructions, rules file, schema digest) or tool set; a first-round 400 for invalid replayed history restarts the turn once with empty history. Each epoch begins with the seed transcript (Partner texts from ingress messages, assistant replies from `turns.result`, oldest first with Bangkok timestamps (turn start), "Assistant:" for READY/QUEUED turns and "Notice:" for FAILED, UNKNOWN_WRITE and INTERRUPTED turns, newest whole exchanges within `claude_seed_history_chars`, omitted count in the header; excludes the current message, running turns and other Partners; also seeds after the first-round 400 restart; an unreadable or disabled seed proceeds with a note, a brand-new Partner gets neither; `model_rounds` records `seeded_exchanges`, `seeded_chars` and `seed_status`; Codex-era tool details are not recoverable). Refusal or `max_tokens` stops fail the turn (`CLAUDE_STOP_*`), no fallback model. `conversation_sql_read_enabled` gates both `sql_query` and `loan_payoff`. `codex_executable`/`codex_home` are required only when a Codex path is active. The turn plan records provider, model, effort and max rounds; a `model_rounds` event records rounds and token usage.
- Generated schema digest: `scripts/build-schema-digest.py` writes `src/mw_integration_agent/assets/schema-digest.json`.
- Business-rules reference moved (`git mv`) from `docs/CONVERSATION_BUSINESS_RULES.md` to `src/mw_integration_agent/assets/conversation-business-rules.md` and used as the system-prompt reference. The owner decided all nine section-15 points on 21 October 2026 and the file records them ([earlier note](CHANGE_NOTES_CONVERSATION_BUSINESS_RULES_2026-10-21.md)).
- Reply rules: plain text, about 700 characters, hard limit 1,000 enforced in `finish` for Claude (the model must shorten).
- Catalogue revision 30: `claude_partner_conversation` and `conversation_sql_read`, implemented and disabled.

Second batch, Gemini provider (Byte; Forge: `gemini-4-argon` works on `global`, test calls 200, function calling OK, no per-project quota row, `roles/aiplatform.user` covers it, no infrastructure change):
- `conversation_provider` also accepts `gemini`. A shared core (`conversation_session.py`, which holds `ASSISTANT_INSTRUCTIONS`; Claude's public interface unchanged) plus `gemini_conversation.py`; Gemini gets the same instructions, tools, seeding and 1,000-character `finish` gate as Claude.
- Config: reuses `gemini_project` and `gemini_location`; new `gemini_conversation_model` (allowlist `gemini-4-argon`), `gemini_conversation_thinking_level` (`LOW|MEDIUM|HIGH|MAX`, default `HIGH` by owner decision (`MAX` stays allowed and can be set later), always sent; `thinkingBudget` is unsupported by `gemini-4-argon`; Forge's live test returned 200 for all four levels and 400 for `XHIGH`; higher levels can slow replies and the level can be lowered in config), `gemini_conversation_request_timeout_seconds` (300), `gemini_conversation_max_tool_rounds` (24), `gemini_conversation_history_token_limit` (150000) and `gemini_conversation_seed_history_chars` (40000).
- Agent V8 gains a `provider` column (`claude` or `gemini`); the role CHECK is tied to it (Claude `user`/`assistant`, Gemini `user`/`model`). A new epoch starts on a provider, prompt-digest or token-limit change; the digest includes provider and model, so existing Claude history starts a fresh seeded epoch.
- Retries, all providers: 429/503/529 up to 3 attempts (2 s, then 5 s), 500/502/504 and timeouts one retry after 1 s, other 4xx never; a retry starts only with 4 s plus the pause left before the deadline; exhausted gives `<PROVIDER>_HTTP_<code>`; `attempts` goes in `model_rounds`.
- Gemini behaviour: `maxOutputTokens` 16384, no temperature; parts stored and replayed verbatim with signatures and unknown part fields (signature-only parts accepted); `functionCall` ids echoed, a duplicate id in one response journalled under a derived id while the model's id is still echoed; STOP with no parts fails `GEMINI_RESPONSE_INVALID`; a malformed call is resent once. Error codes: `GEMINI_STOP_<REASON>`, `GEMINI_PROMPT_BLOCKED_<REASON>`, `GEMINI_RESPONSE_INVALID`, `GEMINI_UNEXPECTED_PART` (only parts with no text, thought, `functionCall` or signature), `GEMINI_HTTP_<code>`, `GEMINI_TIMEOUT`, `GEMINI_UNREACHABLE`, `GEMINI_TOKEN_UNAVAILABLE`, `GEMINI_TOOL_ROUNDS_EXCEEDED`.
- The `gemini_conversation_*` keys are validated only for provider `gemini`; `gemini_location` defaults to `global`.
- Audit: the `model_turn` plan holds provider, model, thinking level and max rounds; `model_rounds` holds usage (prompt, candidates, thoughts, cached-content tokens), `finish_reason`, rounds, `attempts`, epoch and the seed fields, for both providers.
- Catalogue revision 31: `gemini_partner_conversation`, implemented and disabled.

Documentation (Dewey):
- `docs/PARTNER_CONVERSATIONS.md`: new "Conversation providers" section (providers, keys, auth, prerequisites, history, SQL read tool, reply rules) and the new controls. Corrected a doc conflict: replies over 1,000 characters are held for review (`IG_MESSAGE_TOO_LONG`, `partner_notice.py`), never emailed; the earlier text said they went out by email.
- `SERVICE_CATALOGUE.md`: revision 30 paragraph, rows for the two new services, and the same 1,000-character correction.
- `docs/OPERATIONS.md`: "Claude Partner conversation: activation and rollback" (prerequisites, deploy order V8 then code then config, separate owner-authorized activation, rollback).
- `docs/POSTGRESQL_OPERATIONS.md`: "Claude conversation history (agent V8)" and the note that `mw_integration_agent` grants are operator-applied outside Git.
- `README.md`: Current state entry.
- Second batch: the same documents updated to make Gemini the intended provider at activation with Claude as the alternative (`docs/OPERATIONS.md` section renamed "Partner conversation provider: activation and rollback"), and the `project/Documents/Development_Changes.md` row.
- `src/mw_integration_agent/assets/README.md`: covers the rules file and the schema digest (regenerated with `scripts/build-schema-digest.py`, drift-checked by a test).
- `docs/CONVERSATION_BUSINESS_RULES.md`: now a pointer to the packaged file.
- Earlier business-rules change note: path references repointed.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, Byte, HEAD `f1dedcc` plus the uncommitted batch) | 697 tests, OK, 97 skipped (lab suites) |
| `ruff check --no-cache integration-agent` (Byte, same tree) | Passed |
| CI lab test list (Byte, same tree, freshly rebuilt lab) | 113 tests, OK |
| `scripts/build-schema-digest.py --check` (Byte, same tree) | Exit 0; digest lists 84 relations |
| `ci-reuse-evidence` (Byte, same tree) | 10 pass |
| Chase re-verification of the SQL tool and seeding (HEAD `f1dedcc` plus the batch) | About 45 write and side-effect probes: all refused or failing at the server, except `pg_logical_emit_message` (writes WAL), now denied. No role switch via dynamic SQL; wrapper-escape probes found no bypass; client memory 37 MB at 4M rows; seeding review clean; synthetic end-to-end turn with seeding and real lab SQL ended READY |
| Byte fix round after Chase (same tree) | ruff passed; 39 focused tests OK; unit discover 697 OK / 97 skipped; `test_conversation_sql_postgres` 7 OK |
| `mw-integration-agent check --config config.example.json` | Status ok, exit 0 (orchestrator, HEAD `f1dedcc` plus the batch); activation shows everything off: `partner_conversations` false, `conversation_writes` false, receipt provider codex |
| `python -m unittest tests.test_service_catalogue` (Dewey, revision 30 catalogue) | 1 test, OK |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Second batch (Gemini), Byte on `51fe32a` plus the batch: ruff; `python -m unittest discover -s tests`; CI lab list (fresh lab, V8 fresh and V7 to V8); focused tests | ruff passed; 721 tests OK, 97 skipped; 113 OK; 73 OK |
| Chase Gemini re-verification (second batch) | No High or Medium defects. Synthetic turn with Forge's real part shapes, real lab SQL and Codex seeding ended READY; replay byte-identical; Gemini to Claude to Gemini gave separate seeded epochs; all 11 tool schemas within the Vertex subset; failure shapes behaved as specified. Two Lows (duplicate call id in one response; unknown part fields) fixed by Byte |
| Byte final round (second batch) | ruff passed; focused 74 OK; unit discover 722 OK / 97 skipped; lab list unchanged since its 113 OK |
| Second batch (Gemini): `mw-integration-agent check` (orchestrator) | Status ok |
| Second batch (Gemini), `tests.test_service_catalogue` (revision 31) and `npm run check:docs` (Dewey) | 1 test OK; 0 failures, 0 warnings |
| Pull request `Development checks` | Pending: CI run after the orchestrator pushes |

- Chase's verification found guard bypasses in the first SQL tool (whole-row reads, `ts_stat` dynamic SQL with a mid-statement role switch, an `E''` hole, unbounded client memory). `READ ONLY` held against every write attempt. They are resolved by Byte's rework (server-side cursor, function deny list) and the owner's decision above; Chase re-verified the rework (Checks).

## Not run
- Two Gemini mixed-content request shapes are not yet confirmed; one live turn must confirm them before activation.
- No live conversation turn on Vertex AI for either provider (Gemini test calls by Forge only; Claude has no quota).
- Nothing executed against DEV or PROD; V8 is not applied to any `mw_agent` database; the `mw_integration_agent` role is unchanged and its live grants were not verified.
- No deployment, no config change and no provider switch; PROD activation is not authorized.
- Disposable-lab PostgreSQL suites run only where a lab exists (see [Operations](../docs/OPERATIONS.md#test-lab-prerequisites)); Chase records which ran.

## Recovery
- Before activation: revert the batch with Git. The defaults (`codex`, SQL tool off) leave behaviour unchanged, so a deployed-but-inactive batch needs no recovery.
- After activation: set `conversation_provider` to `codex` and `conversation_sql_read_enabled` to `false` (config-only route in [Operations](../docs/OPERATIONS.md#partner-conversation-provider-activation-and-rollback)). Codex threads resume. V8 and its rows stay; do not delete or rewrite them. Never restore an older journal over accepted sends or writes.

## Open questions
- Claude only: a `global` `anthropic-claude-opus` quota grant (the request was rejected). Gemini needs no console action.
- Owner authorization to deploy, to switch a Partner conversation to Gemini (or Claude) and to enable `conversation_sql_read_enabled`, each separately.

## Remaining work
- Fill the Checks table; push; read the pull request run.
- Owner-authorized deploy (V8 first, catalogue revision 30 two-step, code), then activation and one synthetic Partner turn on the VM.
- Confirm the existing `mw_integration_agent` grants on the VM before enabling `conversation_sql_read_enabled`.
