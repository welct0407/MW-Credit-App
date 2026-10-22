# Change notes — question usage for the Cost page (agent V9, V10), 22 October 2026

## Purpose
Owner request (R090): a Cost page section listing the 10 latest Partner conversation questions and each one's cost, with the question text read by Grafana directly from the agent database (owner choice: no copy in Cloud Monitoring) through Grafana Private Data Source Connect, priced at list price.

## Changes
- `conversation_session.ConversationSession.record()`: the `model_rounds` usage event carries the turn's `message_id`, so usage joins its question exactly. Test: `test_conversation_parallel.test_model_rounds_totals_are_per_turn_with_per_round_lists`.
- `database/migrations/V9__recent_question_usage.sql`: schema `monitoring`, `monitoring.recent_questions_v1(n)` (SECURITY DEFINER, owner `mw_agent_owner`, read-only, at most 50 rows: asked time, question text up to 1,000 characters, status, provider, model, rounds and input, cached, output and thinking tokens), EXECUTE for `mw_agent_dashboard` only.
- `database/migrations/V10__recent_question_usage_match.sql`: the live check after V9 showed the time match giving a 14 October question the usage of a 21 October synthetic check. The time match (for usage written before the `message_id` field) now takes only a `partner-conversation-cycle` model turn's event within 30 minutes of the turn's capture and before the next turn.
- `database/setup/bootstrap.sql`: role `mw_agent_dashboard` (NOLOGIN, `default_transaction_read_only=on`, `statement_timeout=10s` in `mw_agent`).
- Tests: `test_state_migration_postgres` covers the join by `message_id`, the time match, a synthetic check's event, an event past 30 minutes, a Codex turn without usage, IGNORED turns and that the dashboard role reads no table; the migration lists in both PostgreSQL suites end at V10.
- Docs: `docs/POSTGRESQL_OPERATIONS.md` (Cost per Partner question).

## Checks
| Command | Result |
| --- | --- |
| `MW_AGENT_FRESH_PG_DSN=… python3 -m unittest tests.test_state_migration_postgres tests.test_audit_retention_postgres` (disposable PostgreSQL 18) | 22 tests OK (2 skipped: isolated-lab manifest) |
| `python3 -m unittest tests.test_conversation_parallel tests.test_deploy_runtime` | 25 tests OK |
| `ruff check --no-cache` on the changed Python files | Clean |
| Cloud SQL on-demand backup before the migration | `1792697990273`, 19:39:50Z, SUCCESSFUL |
| Role `mw_agent_dashboard` as postgres (`codex-cloud`, the bootstrap statement and its two settings) | Created; settings read back |
| Deploy `a7d7773` (V9): freeze 19:42:34Z (backup `runtime-20261022T194234972446Z`), `agent-state-admin.py migrate` applied V9, install | OK. The first activate failed at its probe: the deploy shell's `umask 077` had made the reinstalled package root-only, so `mwagent` could not import it; the running receiver was unaffected. Package permissions restored to 755/644 (0 unreadable files), import as `mwagent` checked, activate 19:43:53Z OK; timers paused about 80 s in all |
| Deploy `fbc6b18` (V10): freeze 19:46:28Z (backup `runtime-20261022T194628199784Z`), migrate applied V10, install (0 unreadable files), activate 19:46:38Z | OK; 0 failed units; all 8 timers and path units resumed |
| Login `mw_grafana_reader` (Cloud SQL built-in user; password generated into Secret Manager `mw-grafana-agent-reader-password` version 1, readback matched, never printed) | `cloudsqlsuperuser` revoked, NOCREATEDB NOCREATEROLE, connection limit 3, member of `mw_agent_dashboard` only, same two settings in `mw_agent`; can connect to `mw_agent` and `postgres` (PUBLIC default) but not to the loan databases |
| `monitoring.recent_questions_v1(10)` as `mw_grafana_reader` after V10 | 10 rows: 9 since 21 October with their own usage (`gemini-4-argon`), the 14 October question without usage; a table read is denied |

## Not run
- The Grafana side (PDC agent, datasource, dashboard): recorded in the root R090 change note when it runs.

## Recovery
`deploy-runtime.py rollback --commit fbc6b18…` restores `a7d7773` from `runtime-20261022T194628199784Z`, and `rollback --commit a7d7773…` restores `d444d67` from `runtime-20261022T194234972446Z`. V9 and V10 stay applied (immutable); the old package ignores them. To remove access: `DROP USER`-equivalent `gcloud sql users delete mw_grafana_reader`, then `REVOKE EXECUTE` from `mw_agent_dashboard` if needed. The Cloud SQL backup `1792697990273` predates both migrations.

## Open questions
None.

## Remaining work
- The VM checkout is detached at `fbc6b18` on `claude/vigilant-allen-kfzogm`; merge it to `main` with a merge commit.
