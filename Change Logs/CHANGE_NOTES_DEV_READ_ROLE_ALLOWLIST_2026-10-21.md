# Change notes — DEV reader allowlist, 21 October 2026

## Purpose
`scripts/configure-dev-read-role.py` failed against live DEV with "Unexpected business SELECT privilege". It did so before and after the first DEV refresh ([refresh note](CHANGE_NOTES_DEV_REFRESH_2026-10-21.md), [review note](CHANGE_NOTES_DEV_REFRESH_REVIEW_2026-10-21.md)). This batch makes the script's checks match the reader's recorded grants. No grant changed.

## Changes
- `scripts/configure-dev-read-role.py`:
  - `Partners` allowlist gains `"Partner Role"`. Provenance: the [Environment inventory](../project/Documents/Environment_Inventory.md) grant state of 16 October 2026, which says "DEV reader: `Partners."Partner Role"` column SELECT added to match PROD", citing the W3 operations note.
  - The readable-column check now counts only schemas where the reader holds USAGE. The `monitoring.pg_stat_statements` and `pg_stat_statements_info` views come from V93 (DB-PERF-04, `CREATE EXTENSION pg_stat_statements WITH SCHEMA monitoring`), and the extension grants them to PUBLIC. The reader has no USAGE on `monitoring` (neither direct nor through PUBLIC), so it cannot read them. They are left out rather than allowlisted.
  - The write and schema-create checks are unchanged and still cover every schema.
- [Development_Refresh_Runbook.md](../project/Documents/Rules/Development_Refresh_Runbook.md) step 2 and its History entry, plus the [refresh plan](../project/outputs/dev-refresh-plan-20261021/README.md) Phase 1 line: the script now has to report no statements.

## Checks
| Command | Result |
| --- | --- |
| Read-only grant listing of `mw-credit-app-read-dev@clever-oasis-508610-n7.iam` in `loan_manager_dev` (aclexplode on datacl, nspacl, relacl, attacl and proacl; as `codex-cloud-read`) | Member of `cloudsqliamserviceaccount` only; CONNECT on the database (plus PUBLIC TEMPORARY); USAGE on `public` only; no table-level grant to the reader; PUBLIC SELECT on the two `monitoring` views; column SELECT on `Borrowers` 9, `Charges` 7, `Loans` 15, `Partners` 3 (`Row ID`, `Partner Role`, `Login Email`), `Repayments` 4, `oltp_upcoming_charge_coverage_v1` 4, `oltp_upcoming_charge_events_v1` 10, `oltp_upcoming_charge_summary_v2` 5; EXECUTE on `forecast_schedule_v1(jsonb,jsonb,date,date)`; settings `default_transaction_read_only=on`, `statement_timeout=5000ms`. Nothing else falls outside the allowlist |
| `python3 scripts/configure-dev-read-role.py` (plan, read-only transaction) against live DEV | Exit 0, `"statements": []`, 57 readable columns, matching the 57 in the allowlist |
| `python3 -m unittest discover -s scripts/database -p "test_*.py"` | Pass, 49 tests (includes `test_environments.py`, which loads this script) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
`--apply`: there was nothing to apply, and no live GRANT or REVOKE was part of this batch. The PROD reader was not compared.

## Recovery
Revert this commit; the live database was not changed.

## Open questions
None.

## Remaining work
None.
