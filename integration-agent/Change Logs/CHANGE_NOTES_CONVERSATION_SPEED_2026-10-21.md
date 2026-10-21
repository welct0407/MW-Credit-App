# Change notes — Partner conversation speed (R085), 21 October 2026

## Purpose
The first real Partner turn on Gemini ([R084](CHANGE_NOTES_CLAUDE_CONVERSATION_2026-10-21.md#promotion-record)) was correct but slow: 4 min 9 s. R085 makes the conversation faster with fewer model rounds, a lower PROD thinking level, fewer identity checks and concurrent reads. Owner decisions, 21 October 2026: "expose the entire db, functions, views and everything to the model… the goal is not security, it's speed"; "Go for all your suggested steps"; and, for the schema digest, "expose all business related functions, and keep other write functions away".

## Changes
Before data (Forge, two real PROD turns of 21 October 2026):
- The turns took 4 min 9 s over 11 rounds and 3 min 50 s over 12 rounds.
- About 84% of the time was sequential model rounds; the final finish round alone took about 66 s at thinking level HIGH.
- About 13% was two Instagram identity re-checks per tool call, about 2.4 s each.
- About 1% was SQL, about 0.25 s per query.
- One round was lost to a missing EXECUTE on `forecast_schedule_v1`.

PROD changes already done by Forge (outside Git; no code deployed yet):
- Config: `gemini_conversation_thinking_level` set to `MEDIUM`, 12:34:18Z to 12:34:24Z, 21 October 2026. Backup `/root/config.json.pre-medium` on the VM, `check` ok, `/ready` ok. Rollback: restore that file by the config-only route, or set `HIGH`.
- Grants on `loan_manager_prod` for `mw_integration_agent`, committed 12:36:48.53Z as `postgres` through Secret Manager `mw-credit-ops-cloudsql-postgres-admin` (the secret value was never printed). Grants live outside Git; the exact statements and the rollback are under Grants below.
  - Granted: USAGE on schemas `agent_audit`, `assessment_lab` and `monitoring` (USAGE only for the last two: existing tables there are readable only if they already were); SELECT on the `agent_audit` tables and sequences; EXECUTE on the 41 functions of the SQL file, including `forecast_schedule_v1`; default privileges for future tables, sequences and routines created by `postgres` (and, in `monitoring`, no routines) and `mw_business_audit_owner`.
  - Left out on purpose: the `monitoring` functions (one of them resets `pg_stat_statements`); 28 functions owned by five application owner roles stay non-executable, because `postgres` lacks SET on those roles and they are nearly all writers.
  - Verified: the forecast view returns 34 rows, `agent_audit` is readable, and an INSERT is refused read-only.
- DEV: no agent read role is in use there, so nothing changed.

Code (Byte; merged as `6a3673e5`, the commit holds the exact file list):
- `conversation_session.py`, `assets/conversation-business-rules.md`: FAST PATHS at the top of the instructions (a reporting question is 2 to 3 rounds: fetch, optional follow-up, finish; batch independent reads in one round; one broad summary-view row over many narrow queries; never re-query what the turn already observed; no unfiltered scans of `"Charges"` or `"Payments"`), COMMON QUESTIONS with the exact reply figures, and sign rules (amounts shown positive with a label; only true negatives such as default loss are negative). Rules section 14 is now "Answer recipes" built on the summary views `reporting_borrower_directory_v1`, `reporting_borrower_loan_facts_v1`, `oltp_borrower_payment_health_v1`, `oltp_upcoming_charge_events_v1` and `olap_borrowers_analytics`. The upcoming view is capped: dates after today only, within 7 days or the first 5 dates, at most 93 days, so "yet to be charged" also reads `"Charges"` with `"Charge Date"` > today, and outstanding principal comes from the loan facts. The paid-so-far total comes from the loan facts (including a first-day repayment); the interest and principal split comes from `"Repayments"` `"Interest Paid"` and `"Principal Paid"` with `"Ref Payment"` not null, and the instructions carry the defaulted-loan caveat (the zero-cash default repayment). When the health view's overdue amounts are NULL the model computes them from `"Charges"` (before today, remaining > 0) and says so in one line. Name corrections in the recipes: `"Charges"` uses `"Ref Loans"`, so filter it through `"Loans"."Ref Borrowers"`; `"Basis"` has four values (`Recorded`, `Recorded settlement`, `Recorded - review status`, `Projected`); the borrower profit id is `"Row ID"`.
- `partner_conversation.py`, `conversation_tools.py`: identity is checked three times in a read-only turn (start, finish, and at the end of execute) instead of twice per tool call; a write is re-checked before and after it. The start-of-turn check is kept as `turn_config` and serves every read. This is an owner speed decision (D2 in Chase's review): if a Partner is revoked or a kill switch is set in the middle of a turn, reads in that window still run and their data can still go to Vertex; delivery is still blocked at finish and at the final check.
- `conversation_tools.py`, `audit.py`: reads of one model round run concurrently (`call_many`, at most 4 workers, `TOOL_WORKERS`); journal and audit writes stay on the calling thread in call order, and a call still running at the turn deadline fails as `TOOL_TIMEOUT`. A round containing a write, `finish` or an unknown tool runs one call at a time, as before. `audit.started` and `audit.finished` are the two halves of a non-effect activity.
- `conversation_session.py`: the `model_rounds` event carries per-turn token totals plus `round_usage`, `round_ms` and `tool_ms`; failed turns also record `model_rounds` (with `failure`), so slow failures are measurable.
- `scripts/conversation-timing.py` (new): read-only per-turn timing report from the agent audit tables (rounds, model seconds, tool seconds, token totals) and a summary; turns recorded before R085 show empty timing lists.
- `scripts/build-schema-digest.py`, `assets/schema-digest.json`: the digest lists every relation in `public` and `agent_audit` and the functions the model may call. The digest is 85,970 bytes (was 92,801) with 87 relations and 1,368 columns and 28 functions (was 113). Each function entry has function, result, kind, volatility, purpose and use_when, plus the dictionary comment where one exists; the `loan_close_calculation_v83` entry points to the `loan_payoff` tool. All 183 dictionary routines are classified: 28 allow-listed, 70 triggers, and 85 excluded (61 by prefix `public.pwa_`, `public.vc_refresh_`, `public.r051_`, `agent_audit.` and `assessment_lab.`, and 24 by name: the writers, `cash_account_holder` for its FOR SHARE, and `attach_payment_receipt_evidence`). The allow-list overrides the `pwa_` prefix for 4 read helpers. The build fails on any unclassified routine and on any allow-listed routine missing from the dictionary.
- Tests: `tests/test_conversation_parallel.py` (new), `tests/test_conversation_sql_postgres.py`, `tests/test_schema_digest.py` (including `test_every_dictionary_routine_is_classified` and `test_allow_listed_routines_never_write`: no INSERT, UPDATE or DELETE line and no FOR UPDATE or FOR SHARE in an allowed routine; the same patterns flag 48 of the 85 excluded routines).

Grants (not secrets; applied once in PROD on 21 October 2026, outside Git). Forge's statements, applied as `postgres` on `loan_manager_prod`:

```sql
GRANT USAGE ON SCHEMA agent_audit TO mw_integration_agent;
GRANT USAGE ON SCHEMA assessment_lab TO mw_integration_agent;
GRANT USAGE ON SCHEMA monitoring TO mw_integration_agent;
GRANT SELECT ON SEQUENCE agent_audit.row_changes_change_id_seq TO mw_integration_agent;
GRANT SELECT ON SEQUENCE pwa_row_changes_seq_seq TO mw_integration_agent;
GRANT SELECT ON TABLE agent_audit.commits TO mw_integration_agent;
GRANT SELECT ON TABLE agent_audit.exports TO mw_integration_agent;
GRANT SELECT ON TABLE agent_audit.row_changes TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION agent_audit.capture_change() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION agent_audit.reject_rewrite() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION apply_loan_close_calculation_v83(text,date,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION attach_payment_receipt_evidence(text,text,text,timestamp with time zone,jsonb,uuid,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION forecast_scenario_v1(numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION forecast_schedule_v1(jsonb,jsonb,date,date) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION guard_payment_receipt_evidence() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION guard_pwa_explicit_payment_v6() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION guard_pwa_payment_commands_immutable() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION payment_crud_finish_core_v83("Payments","Payments",text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION payment_crud_prepare_core_v83("Payments","Payments",text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION payment_receipt_upload_stamp() TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_analytics_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_assessment_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_cash_opening_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_charge_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_expense_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_loan_close_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_loan_create_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_loan_source_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_management_financial_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_management_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_payment_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_apply_preference_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_assessment_refresh_window_v2(date,date,date) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_cash_opening_basis_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_expense_version_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_management_financial_text_v2(text,jsonb) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_management_input_text_v2(text,jsonb) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_management_tools_text_v2(text,jsonb) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_native_inverse_permitted_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_payment_correction_text_v2(jsonb) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_payment_head_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_payment_version_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION pwa_preference_version_v2(text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION reallocate_payment_interest_audited(uuid,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION reallocate_payment_interest(uuid,text,jsonb,jsonb,text,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION reporting_borrower_period_v1(date,date,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION reporting_cash_period(date,date,text) TO mw_integration_agent;
GRANT EXECUTE ON FUNCTION reporting_cash_period_entries(date,date,text) TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, agent_audit, assessment_lab, monitoring GRANT SELECT ON TABLES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, agent_audit, assessment_lab, monitoring GRANT SELECT ON SEQUENCES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, agent_audit, assessment_lab GRANT EXECUTE ON ROUTINES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner GRANT SELECT ON TABLES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner GRANT SELECT ON SEQUENCES TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner GRANT EXECUTE ON ROUTINES TO mw_integration_agent;
```

Rollback statements (run as `postgres` on `loan_manager_prod`):

```sql
-- Rollback of the 21 October 2026 PROD grants. The postgres public-schema default SELECT ON TABLES existed before and is kept.
REVOKE USAGE ON SCHEMA agent_audit FROM mw_integration_agent;
REVOKE USAGE ON SCHEMA assessment_lab FROM mw_integration_agent;
REVOKE USAGE ON SCHEMA monitoring FROM mw_integration_agent;
REVOKE SELECT ON SEQUENCE agent_audit.row_changes_change_id_seq FROM mw_integration_agent;
REVOKE SELECT ON SEQUENCE pwa_row_changes_seq_seq FROM mw_integration_agent;
REVOKE SELECT ON TABLE agent_audit.commits FROM mw_integration_agent;
REVOKE SELECT ON TABLE agent_audit.exports FROM mw_integration_agent;
REVOKE SELECT ON TABLE agent_audit.row_changes FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION agent_audit.capture_change() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION agent_audit.reject_rewrite() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION apply_loan_close_calculation_v83(text,date,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION attach_payment_receipt_evidence(text,text,text,timestamp with time zone,jsonb,uuid,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION forecast_scenario_v1(numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION forecast_schedule_v1(jsonb,jsonb,date,date) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION guard_payment_receipt_evidence() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION guard_pwa_explicit_payment_v6() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION guard_pwa_payment_commands_immutable() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION payment_crud_finish_core_v83("Payments","Payments",text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION payment_crud_prepare_core_v83("Payments","Payments",text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION payment_receipt_upload_stamp() FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_analytics_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_assessment_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_cash_opening_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_charge_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_expense_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_loan_close_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_loan_create_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_loan_source_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_management_financial_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_management_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_payment_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_apply_preference_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_assessment_refresh_window_v2(date,date,date) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_cash_opening_basis_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_expense_version_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_management_financial_text_v2(text,jsonb) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_management_input_text_v2(text,jsonb) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_management_tools_text_v2(text,jsonb) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_native_inverse_permitted_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_payment_correction_text_v2(jsonb) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_payment_head_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_payment_version_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION pwa_preference_version_v2(text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION reallocate_payment_interest_audited(uuid,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION reallocate_payment_interest(uuid,text,jsonb,jsonb,text,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION reporting_borrower_period_v1(date,date,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION reporting_cash_period(date,date,text) FROM mw_integration_agent;
REVOKE EXECUTE ON FUNCTION reporting_cash_period_entries(date,date,text) FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA agent_audit, assessment_lab, monitoring REVOKE SELECT ON TABLES FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, agent_audit, assessment_lab, monitoring REVOKE SELECT ON SEQUENCES FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public, agent_audit, assessment_lab REVOKE EXECUTE ON ROUTINES FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner REVOKE SELECT ON TABLES FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner REVOKE SELECT ON SEQUENCES FROM mw_integration_agent;
ALTER DEFAULT PRIVILEGES FOR ROLE mw_business_audit_owner REVOKE EXECUTE ON ROUTINES FROM mw_integration_agent;
```

Documentation (Dewey):
- `docs/PARTNER_CONVERSATIONS.md`: SQL tool scope (whole database per the owner), identity cadence, parallel reads, PROD thinking level MEDIUM, timing script.
- `docs/OPERATIONS.md`, `SERVICE_CATALOGUE.md` (`conversation_sql_read` wording), `docs/POSTGRESQL_OPERATIONS.md` (the grants; writes blocked by the per-transaction READ ONLY).
- `project/Documents/Environment_Inventory.md`: live thinking level MEDIUM and the grants.
- `project/Documents/Development_Changes.md`: the R085 row; the R084 follow-up row closed. `project/Documents/Release_Tracker.md`: the R085 sentence.
- `Change Logs/CHANGE_NOTES_CLAUDE_CONVERSATION_2026-10-21.md`: first real Partner turn recorded, Remaining work updated.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache integration-agent` (Byte, working tree on main `b42bea8`) | Passed |
| `scripts/build-schema-digest.py --check` (Byte, same tree, before the digest curation) | Exit 0 |
| `python -m unittest discover -s tests` in `integration-agent/` (Byte, same tree, before the digest curation) | 739 tests, OK, 98 skipped (lab suites) |
| CI lab test list (Byte, same tree, before the digest curation) | 114 tests, OK |
| Production verification of the grants (Forge, 21 October 2026) | Forecast view returns 34 rows; `agent_audit` readable; INSERT refused read-only |
| `mw-integration-agent check` and `/ready` after the thinking change (Forge, 12:34Z) | Status ok; ready ok |
| Chase review of identity checks and parallel reads | Write authorization holds in every case (mixed rounds, aliases, finish, execute end); all journal and audit writes stay on the calling thread. D1 (Medium): cancelled queued futures surfaced as `TOOL_FAILED` instead of `TOOL_TIMEOUT`; Byte is fixing it. D2 is by design (see Changes). D3 to D6 minor, accepted: a same-round `sum_field` reference, audit parent linkage, repeated `read_records` schema loads, straggler connections up to the 20 s statement timeout |
| Chase review of the recipes | All names exist up to V100; overdue and due-today semantics match. R1 (the upcoming view is capped: future dates only, 7 days or the first 5 dates, 3-month horizon), R2 (align the paid-so-far source, add the defaulted caveat) and R3 (NULL overdue fallback) are being fixed by Byte in the instruction text |
| Chase review of the curation | All 28 functions are STABLE or IMMUTABLE, none is SECURITY DEFINER, none writes, and no recipe points to an excluded function |
| Chase live Vertex measurement (`gemini-4-argon`, MEDIUM, synthetic Puifai data on a throwaway lab database, about 10 calls) | 3 runs: 3 rounds 54.6 s; 4 rounds 97.1 s; 3 rounds 27.8 s. All answers correct and in the right format. SQL took 11 to 156 ms per call; the time is model time, mostly the final composing round. Baseline on PROD at HIGH: 4 min 9 s over 11 rounds and 3 min 50 s over 12 rounds |
| Byte fix round (D1, R1 to R3), clean copy of the tree, venv: `ruff check`; `scripts/build-schema-digest.py --check`; focused tests; `python -m unittest discover -s tests` | D1: a cancelled queued read now counts as `TOOL_TIMEOUT` (new test: 6 calls with a 0.2 s deadline all return `TOOL_TIMEOUT`, only 4 run, none stores a result). R1 to R3 fixed in the instruction text (see Changes). ruff passed; `--check` exit 0; focused 76 OK, 1 skipped; unit discover 741 OK, 98 skipped |
| Digest curation re-run (Byte, final allow-list): `ruff check --no-cache integration-agent`; `scripts/build-schema-digest.py --check`; `python -m unittest discover -s tests` | ruff passed; `--check` exit 0; 740 tests OK, 98 skipped. Lab list not rerun after the curation |
| `python -m unittest tests.test_service_catalogue` and `npm run check:docs` (Dewey) | Pending: run at the end of this batch |
| Pull request #111 `Development checks`, merged as `6a3673e5` | Passed: agent test and lab passed, `Development checks` result success |

## Not run
- Chase could not verify PROD connection limits, the native `read_records` path, the PostgreSQL-audit path or defaulted loans; the last three were checked by reading the code only. The lab measurement is synthetic and not a PROD turn.
- No real Partner turn had run with MEDIUM thinking or the new code when R085 was deployed, so the turn time after R085 is not measured yet. `scripts/conversation-timing.py` is the measure.
- No real Partner turn has run on the deployed R085 code yet; the post-deployment timing is the follow-up in Development Changes.
- The CI lab test list (114 OK) was run before the digest curation and not repeated after it; the pull request's `Development checks` is the broad run.
- The 28 owner-role functions and the `monitoring` functions were not granted, so the model cannot call them.

## Recovery
- Code: revert the R085 commit; the audit payload change is additive. Nothing in the agent database schema changed (no migration).
- Thinking level: restore `/root/config.json.pre-medium` on the VM by the config-only route, or set `gemini_conversation_thinking_level` back to `HIGH`.
- Grants: run the rollback statements above as `postgres` on `loan_manager_prod`. The `postgres` public-schema default SELECT on tables existed before and stays.

## Open questions
None.

## Remaining work
- The first real PROD turn after R085, timed with `scripts/conversation-timing.py` and compared with the baseline below (one follow-up row in Development Changes).

## Promotion record

Release R085, agent only (no Hosting, Cloud Run or database change, no migration), 21 October 2026 (UTC).

- **Authority:** the owner's words on 21 October 2026: "Go for all your suggested steps", in reply to the proposal of MEDIUM thinking, fast-path guidance, once-per-turn read authorization, parallel reads and the permission grant, built and deployed through the usual path; "I told you to expose the entire db, functions, views and everything to model, so it could choose the most efficient way to get the answer. The goal is not security, it's speed"; and "expose all business related functions, and keep other write functions away". Owner acceptance was not given separately; it is recorded as the production instruction, as for R084. The PROD thinking level and grants were applied before the code (see Changes).
- **Package:** pull request #111 merged as `6a3673e52657d8fe97a8ae2702fd1f4a08c5552a`; CI passed (agent test and lab, `Development checks` success). Release tag `R085` on that commit.
- **Deployment (UTC):** operator file 13:17:25Z; checkout (`update-from-github`) moved to `6a3673e5` 13:17:25Z to 13:17:30Z; dry-run 13:17:30Z (agent schema nothing missing, applied through V8; catalogue revision 31 matched; units unchanged; four modules changed: `audit.py`, `conversation_session.py`, `conversation_tools.py`, `partner_conversation.py`); freeze 13:17:41Z (backup `runtime-20261021T131741308023Z`); install 13:17:41Z, `check` ok afterwards; activate 13:17:46Z to 13:17:49Z (probe `6d90f179-bcb7-493b-bebf-e8af6816388c`); `/ready` code_version `6a3673e5`, started 13:17:48.28Z, failed none; verify 13:17:55Z (no failed units, 8 timers, wake path active, first cycle ok with 0 turns attempted, config unchanged at `MEDIUM`); operator file shredded 13:17:59Z.
- **Recognizer not restarted:** this deploy did not restart `mw-receipt-recognition.service`, which was still broken by the revision 31 catalogue until the incident session restarted it at 13:17:58Z (see the R084 note's known issue).
- **History reset:** the new digest changes the prompt fingerprint, so each Partner's next turn starts a new seeded epoch.
- **Recovery:** `deploy-runtime.py rollback --commit 6a3673e5…` restores `a3646f30d9aeabad954b5b6c208ef1f5ff1617a5` from `runtime-20261021T131741308023Z`. Config and grants: see Recovery above. Pins go to the [environment inventory](../../project/Documents/Environment_Inventory.md).
- **PROD baseline for the follow-up** (`scripts/conversation-timing.py`, all at `HIGH`, before R085): real turn `8801e7c4` 11 rounds, 249.3 s (model 199.6 s, tools 49.7 s, 15 calls); real turn `183dc67f` 12 rounds, 229.9 s (model 193.9 s, tools 35.8 s, 12 calls); synthetic `87a974e2` 3 rounds, 30.5 s. No real turn ran between the MEDIUM switch and the deployment.
- **Outcome:** applied and verified (`/ready`, units, first cycle); owner acceptance is the owner's production instruction. The first real turn after R085 is the speed check.

### Closure pruning (release workflow, 21 October 2026)
- Nothing deleted. The retention window is now R085, R084 and R083. R082's change notes stay because the open R082 follow-up row in Development Changes links them and agent change notes are not pruned; the R085 Development Changes row became one follow-up row.
