# Change notes — DEV refresh lessons-learned review, 21 October 2026

## Purpose
The owner asked for a review of the first live DEV refresh ([its change note](CHANGE_NOTES_DEV_REFRESH_2026-10-21.md)) so that the [refresh runbook](../project/Documents/Rules/Development_Refresh_Runbook.md) and the tooling carry what the run taught. The run itself ended DEV ready; this batch changes no live target.

## Changes
- [Development_Refresh_Runbook.md](../project/Documents/Rules/Development_Refresh_Runbook.md): the owner window's `CREATE ON SCHEMA public` grants survive the reconcile (`--window-owner`), schema owners first, the rehearsal built with `lab-prepare` from the live snapshot and run as root over TCP, only `Test-TriggerOrder.sql` and `Test-RowChanges.sql` in the rehearsal, the role-plan expectation (0 violations, full idempotent set), the stale reader allowlist recorded, the 13-minute restore, the tunnel closed by process id; History entry for the first live run.
- `scripts/database/Refresh-DevCatalog.py`: `--window-owner` (repeatable) exempts the window's `CREATE ON SCHEMA public` from revocation and from the residual; new `lab-prepare` mode creates NOLOGIN placeholders, memberships and the database owner from a live snapshot; a live snapshot may now drive a lab reconcile (a lab snapshot still never drives live DEV). Two tests added.
- [database/README.md](../database/README.md) paragraph and the [plan](../project/outputs/dev-refresh-plan-20261021/README.md) corrected the same way; the refresh change note's lessons list now points here.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest scripts/database/test_refresh_dev_catalog.py` | Pass, 13 tests |
| Fresh lab cluster: `lab-prepare` from the live DEV snapshot of 21 October (44 statements, 22 roles), PROD-shaped dump restored as root over TCP, deletes, `reconcile --before <live snapshot> --apply` | 40 owner and 609 privilege statements (the same counts the live rehearsal saw), residual owners and privileges 0; the only difference is the V1 baseline row of a lab-built history |
| Lab: `GRANT CREATE ON SCHEMA public TO mw_notify_owner_dev`, then `reconcile` without and with `--window-owner mw_notify_owner_dev` | 1 revoke statement without the flag; 0 statements and the grant kept with it |
| Lab: `Test-TriggerOrder.sql`, `Test-RowChanges.sql` | Pass; `Test-AccessMatrix.sql` and `Test-LedgerAccess.sql` fail on real DEV grants as the live run found |
| `npm run check:docs` | Pass on this commit |

## Not run
No live read or write; the live run's evidence folder in the private bucket was not re-read, the review used its change note and commit `cf781bf`. Database CI: no migration changed.

## Recovery
Git baseline `cf781bf`; additive script changes and documents only.

## Open questions
None. The `configure-dev-read-role.py` allowlist follow-up was closed the same day ([change note](CHANGE_NOTES_DEV_READ_ROLE_ALLOWLIST_2026-10-21.md)).

## Remaining work
None for the refresh. The next refresh follows the runbook as it now stands.
