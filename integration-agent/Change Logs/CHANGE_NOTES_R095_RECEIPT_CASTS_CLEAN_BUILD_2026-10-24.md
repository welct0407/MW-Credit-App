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
| Agent PostgreSQL lab (CI suite list at V110) | 79 run, OK; review-settlement update with and without a note, prepared and unprepared (the old statement reproduces 42P18); projection call with `None` key and `{}` |

## Not run
Not exercised: a second occurrence on the VM (two failures in two days; the fix is verified by the next clean runs).

## Recovery
The freeze directory of `deploy-runtime.py` holds the previous code; `deploy-runtime.py rollback` restores it. In Git, revert the batch.

## Open questions
None.

## Remaining work
Done at the VM deploy; still to observe over the next days: the installed package equals source (no conversation module), `/ready` `code_version`, the next `mw-receipt-summary` runs clean. The root cause above is already read from the Cloud SQL log.

## Deploy record
Deployed with the payer-name release on 24 October 2026 (checkout `e3d5bc2` to `14c4a403`, freeze 18:34:20Z, activate 18:34:47Z; rollback `runtime-20261024T183420716659Z`). The helper cleared the stale `build/` and egg-info before pip (removed files none, no unit change); `/ready` true at `14c4a403`; first `mw-receipt-summary` run 18:35:14Z and later cycles succeeded. Pins are in the [Environment inventory](../../project/Documents/Environment_Inventory.md).
