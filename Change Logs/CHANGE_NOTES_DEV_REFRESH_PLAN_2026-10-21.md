# Change notes — DEV refresh runbook, tooling and plan, 21 October 2026

## Purpose
The owner wants DEV refreshed from PROD by a Claude Code cloud session. The refresh runbook predated the shared Cloud SQL instance, the IAP route and the closed owner roles, and no maintained tool repaired DEV owners and privileges after a restore. This batch updates the rule, adds the tooling, proves it on a disposable cluster and leaves an executable plan.

## Changes
- [Development_Refresh_Runbook.md](../project/Documents/Rules/Development_Refresh_Runbook.md) rewritten: scope and authority, executor and route, the facts that shape the procedure (shared roles, owner window before the `--clean` restore, trigger rule, notification credentials, schedulers, receipts), the eight-step procedure with the maintained tools, rollback, closure, history.
- New `scripts/database/Refresh-DevCatalog.py` (`snapshot`, `reconcile`, `compare`) with `scripts/database/test_refresh_dev_catalog.py`; ACLs are captured server-side in one round trip per object kind.
- `scripts/database/Backup-ProductionPromotion.py`: `--environment development` (fixed DEV tuple, `dev-backups/`, explicit `--expected-version`), version 100 accepted; PROD behaviour unchanged.
- [database/README.md](../database/README.md) Linux cloud sessions paragraph names both tools; the R075 tooling-gaps row in Development_Changes.md marks the DEV backup gap closed.
- [project/outputs/dev-refresh-plan-20261021/README.md](../project/outputs/dev-refresh-plan-20261021/README.md) rewritten for a Claude cloud session: facts verified on 21 October 2026, go or no-go, phases 0 to 8 as command blocks, rollback, stop conditions, owner decisions, review hook.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest scripts/database/test_refresh_dev_catalog.py` | Pass, 10 tests |
| Lab (PostgreSQL 18, two databases migrated to V100 with `_dev` and `_prod` roles, synthetic rows): `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -1` of the prod dump over dev, deletes, `reconcile --apply`, `compare` | 40 owner statements, 171 privilege statements, residual 0, catalog equal, fingerprints equal except the two emptied tables; dry run committed nothing |
| Lab, dev-only cluster: same restore, reconcile (178 privilege statements), compare, then `Test-AccessMatrix.sql`, `Test-TriggerOrder.sql`, `Test-RowChanges.sql`, `Test-LedgerAccess.sql` | All pass |
| Lab rollback rehearsal: dev dump restored over the refreshed dev, reconcile, compare against the dev snapshot with fingerprints | Equal |
| Live DEV, read identity through the tunnel: `Refresh-DevCatalog.py snapshot --fingerprints` | Identity rule passed; 292 objects, 204 triggers, 100 Flyway rows, 33 tables; 5 s after the round-trip change (93 s before); no `_prod` owner or grantee |
| Live DEV and PROD Flyway history, sessions, push subscriptions, schedulers (read-only) | Both V100 with equal history md5; DEV schedulers paused; DEV 1 subscription, PROD 4 |
| `npm run check:docs` | Pass on this commit |

## Not run
`Backup-ProductionPromotion.py --environment development` against live DEV: it writes a backup object and is left for the refresh session (Phase 1). Database CI (`mw-db-ci`): no migration or SQL test changed. No live write of any kind was performed.

## Recovery
Git baseline before this batch: commit `af5f8b8`. The scripts and documents are additive; no live state changed.

## Open questions
The owner decisions listed in the plan (receipt object copy, DEV push subscription, code refresh, write test).

## Remaining work
The refresh itself in a later session under the owner's instruction, then the lessons-learned review that updates the runbook's History section.
