# Change notes — DEV database refresh from PROD, 21 October 2026

## Purpose
The owner asked for `loan_manager_dev` to be replaced with a PROD snapshot, following the [refresh plan](../project/outputs/dev-refresh-plan-20261021/README.md) and the [refresh runbook](../project/Documents/Rules/Development_Refresh_Runbook.md). The scope was the database only. DEV code, configuration and schedulers were not changed.

## Changes
- Live DEV `loan_manager_dev` on `clever-oasis-508610-n7` / `mw-credit-pg-20261017` (system identifier `7685391508477894672`) was replaced by the PROD snapshot of 04:59:45Z, with `pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -1`. The PROD notification rows were deleted (`pwa_push_subscriptions` 4, `pwa_notification_deliveries` 29), then owners and privileges were reconciled back to the DEV snapshot. The [Environment inventory](../project/Documents/Environment_Inventory.md) DEV database row records the references.
- `scripts/database/Refresh-DevCatalog.py`: owner statements now restore schema owners first. On Cloud SQL the new owner of an object needs CREATE on its schema, so the first live dry run failed on `agent_audit` (`permission denied for schema agent_audit`) and rolled back. The superuser lab could not show this. `scripts/database/test_refresh_dev_catalog.py` gained a test for the order.
- PROD was only read: the snapshot through `Backup-ProductionPromotion.py`. No PROD write and no scheduler change.

## Checks
| Command | Result |
| --- | --- |
| Phase 0 readings, DEV and PROD | Both V100, 100 rows, history md5 `6eea86d9…` equal; DEV had no sessions, 1 subscription, 0 pending; PROD had 4 subscriptions; DEV schedulers `PAUSED` |
| `Refresh-DevCatalog.py snapshot --identity read --fingerprints` | 292 objects, 204 triggers, 100 Flyway rows, 33 tables; `_prod` appears only as `postgres` memberships with inherit and set false, never as an owner or grantee |
| `application-role-cli.mjs --action plan` | 501 statements (the full idempotent set, not 0 as the plan expected), 0 violations. The same statement set after the refresh |
| `configure-dev-read-role.py` | Fails before and after the refresh with `Unexpected business SELECT privilege`: the DEV reader can also read the `monitoring.pg_stat_statements*` views and `Partners."Partner Role"`, which the script's allowlist leaves out. This predates the refresh; the reconcile kept the grants exactly as they were |
| `Backup-ProductionPromotion.py --environment development` | Restore passed, fingerprints match, sha256 `369abcf7…` |
| `Backup-ProductionPromotion.py` (PROD snapshot) | Restore passed, fingerprints match, sha256 `23523db3…`; 1,253 TOC entries, schemas `agent_audit`, `assessment_lab`, `monitoring`, extension `pg_stat_statements` |
| Phase 3 rehearsal, PostgreSQL 18 lab | Restore, deletes, reconcile 40 owner and 609 privilege statements, residual 0; compare: catalog and fingerprints equal; `Test-TriggerOrder` and `Test-RowChanges` pass. `Test-AccessMatrix` (unexpected grants such as `metabase_borrower_reader` and `mw_app_dev` on reporting views) and `Test-LedgerAccess` (`permission denied for table Daily Analytics`) fail with identical errors on DEV's own dump with the same grants, so they follow the real DEV grants and not the refresh. Rollback rehearsal: 40 owner and 587 privilege statements, compare equal |
| Phase 4 identity, sessions | `loan_manager_dev | postgres | null | 7685391508477894672 | t`; 0 sessions; schedulers `PAUSED` |
| Phase 5 restore | Exit 0, empty log, 05:06:18Z to 05:19:20Z (13 minutes over the IAP tunnel, against seconds in the plan) |
| `reconcile` dry run, then `--apply` | Dry run (after the schema-order fix): 40 owner and 592 privilege statements, residual 0, nothing committed. Apply: same counts, committed |
| `Invoke-Flyway.ps1 -Environment development -Command validate` | `validationSuccessful: true`, 101 validated |
| `owner-authority-cli.mjs restore` | First attempt refused ("Owned authority changed concurrently"): the reconcile had already put the `public` ACL back to its pre-window state, which removed the window's CREATE grants but left the memberships elevated. The CREATE grants were re-granted as `prepare` did, then `restore` returned `authority-restored` (20 statements). No elevated membership and no owner CREATE on `public` remain |
| Phase 6 `compare --identity read --prod-baseline` | Catalog equal (0 differences of any kind), fingerprints equal to PROD, both notification tables empty |
| DEV reader and command `/health`, unauthenticated `/api/session` | 200 and 401 on both; no ERROR logs on DEV services since 05:00Z |
| `Invoke-Terraform.ps1 -Stack dev -Command plan` | No changes |
| `python3 -m unittest scripts/database/test_refresh_dev_catalog.py` | Pass, 11 tests |

Wall-clock per phase (UTC): preflight 04:55; baselines and DEV backup 04:55 to 04:59; PROD snapshot 04:59 to 05:02; rehearsal 05:02 to 05:05 (three attempts); quiesce 05:05; replace 05:05 to 05:37 (restore 13 min; dry-run failure and fix 05:19 to 05:30); verify 05:37; Terraform 05:38; records 05:40.

## Not run
The owner's sign-in on the DEV PWA, and re-enabling DEV notifications on a device: the owner has to do both. No synthetic write test (default in the plan). No database CI run: no migration or SQL test changed.

## Recovery
Run Phase 5 of the plan with the DEV dump in `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-b640e7d004144360903cee23100f3d73/`, without the two deletes. Then reconcile and compare against the pre-refresh snapshot in the evidence folder `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-20261021-evidence/`. The rollback rehearsal of this run ended equal.

## Open questions
None beyond the plan's defaults: no receipt objects copied (restored receipts do not render in DEV), no DEV code refresh.

## Remaining work
- Owner: open the DEV PWA on each DEV device and re-enable notifications.
- Lessons-learned review (step 3 of the plan's session):
  - Phase 3 cannot reconcile against a live snapshot as written. It needs a lab-flagged copy (`identity.lab=true`), NOLOGIN placeholders for every role the snapshot names, and the lab database owned by `cloudsqlsuperuser`.
  - Run `pg_restore` as root over TCP: the `postgres` OS user cannot read the private folder.
  - `application-role-cli.mjs --action plan` needs `Get-DbEnvironment development -Admin` first and always prints 501 statements.
  - The four access tests do not fit live DEV grants.
  - `configure-dev-read-role.py` has a stale allowlist.
  - The reconcile and the owner window interact on `public` CREATE: re-grant before `restore`, or exclude the window's grants from the reconcile.
  - The live restore takes about 13 minutes through the tunnel.
  - The plan's `pkill -f` tunnel close would match its own shell; close the tunnel by the ssh PID.
