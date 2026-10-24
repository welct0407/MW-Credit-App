# Change notes — R095 receipt projection casts and clean build, 24 October 2026

## Purpose
Two R094 candidates on `vm-mw-credit-agent`: `mw-receipt-summary` failed once on 24 October (11:06:38Z in the Cloud SQL log, reported 11:06:42Z) and once on 23 October (11:46:06Z) with `IndeterminateDatatype` (exit 2), and a stale `integration-agent/build/` directory probably makes `pip` copy the 16 removed conversation modules back into the installed package. Owner: "proceed with the four candidates", 24 October 2026. The root note is [R095 follow-ups](../../Change%20Logs/CHANGE_NOTES_R095_FOLLOW_UPS_AND_DEV_TEST_ACCOUNT_2026-10-24.md).

## Changes
- **Root cause** (Cloud SQL log on `mw_agent`, both failures identical): `could not determine data type of parameter $2` on the `partner_reviews` state update in `src/mw_integration_agent/review_cycle.py:285` (`CASE WHEN ? IS NULL …` with the note `None`; SQLSTATE 42P18). The final POSTED update failed after a successful receipt submit; the next cycle, about 30 s later, settled the row to POSTED by status alone with no resend (POSTED +1 each time, nothing left in POSTING). Byte casts that statement in `review_cycle.py`.
- `src/mw_integration_agent/receipt_projection.py`: the call to `public.attach_payment_receipt_evidence(text, text, text, timestamptz, jsonb, uuid, text)` casts every parameter (`ATTACH_SQL`). This was not the failing statement; it is kept as hardening, so the call no longer depends on the server inferring untyped psycopg parameters.
- `scripts/deploy-shared-receipt-api.py`: before `pip install`, the deploy removes `build/` and `src/*.egg-info` from the checkout and refuses to continue if one remains (`Stale build directory in the checkout`).
- Tests: `tests/test_receipt_archive.py`, `tests/test_receipt_audit_postgres.py`, `tests/test_deploy_shared_receipt_api.py`.
- No catalogue change (revision 32) and no configuration key change.

## Checks
| Command | Result |
| --- | --- |
| `ruff check --no-cache .` and `python -B -m unittest discover -s tests` in `integration-agent/` | Pass; 580 OK, 70 skipped |
| VM readback after the deploy | Pass: `/ready` `e3d5bc2a`, `check` ok, 80 keys, catalogue 32 with 16 services, collector 19 of 19 from 12:15Z, 46 clean `mw-receipt-summary` runs and no 42P18 since |
| Agent PostgreSQL lab (CI suite list at V110) | 79 run, OK; review-settlement update with and without a note, prepared and unprepared (the old statement reproduces 42P18); projection call with `None` key and `{}` |

## Not run
Not exercised: a second occurrence on the VM (two failures in two days; the fix is verified by the next clean runs).

## Recovery
The freeze directory of `deploy-runtime.py` holds the previous code; `deploy-runtime.py rollback` restores it. In Git, revert the batch.

## Open questions
None.

## Remaining work
None. (The root cause above was read from the Cloud SQL log.)

## Deploy record
VM `vm-mw-credit-agent`, 24 October 2026 (UTC); pins in the [Environment inventory](../../project/Documents/Environment_Inventory.md).
| Step | Evidence |
| --- | --- |
| Freeze | 12:12:40Z, rollback `/var/lib/mw-integration-agent/rollback/runtime-20261024T121240259866Z` (metadata sha256 `efc58aff…b1c2`) |
| Install and activate | install `removed_files` empty (the clean build worked; no retired module returned); activate 12:12:45Z to 12:12:49Z, probe `119320aa-4e53-4ad1-b1b6-34be2fab608d` |
| Readback | `/ready` `code_version` `e3d5bc2a`; `check` ok; 80 keys; catalogue 32 with 16 services; collector 19 of 19 from 12:15Z; 46 clean receipt-summary runs, no 42P18 since |
