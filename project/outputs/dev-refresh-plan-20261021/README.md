# DEV database refresh from PROD: execution plan for Codex

Drafted 21 October 2026 for the owner. This is a plan, not an authorization record. The owner's instruction to refresh DEV from PROD approves the scope that the [refresh runbook](../../Documents/Rules/Development_Refresh_Runbook.md) describes: a read-only PROD snapshot, a DEV backup, the destructive replacement of `loan_manager_dev`, the grant and ownership repair that follows, the required technical records and temporary maintenance permissions. It does not approve any PROD write, any notification send, copying receipt objects, schema changes, new tables or service activation.

Read first, in this order: [AGENTS.md](../../../AGENTS.md), the [refresh runbook](../../Documents/Rules/Development_Refresh_Runbook.md), [DEV preparation](../../Documents/Rules/Development_Environment_Preparation.md), [database/README.md](../../../database/README.md) (sections "Linux cloud sessions" and "Each change"), the DEV and PROD rows of the [Environment inventory](../../Documents/Environment_Inventory.md), and [R053_OPERATOR.md](../../../scripts/database/R053_OPERATOR.md) (owner authority sections). Do not read historical outputs.

## 1. What to pay attention to

These are the traps specific to this repository. Each one has a step below.

1. **One instance, two databases, cluster-wide roles.** `loan_manager_dev` and `loan_manager_prod` live on the same Cloud SQL instance `mw-credit-pg-20261017` (project `clever-oasis-508610-n7`, system identifier `7685391508477894672`). PostgreSQL roles are shared by both databases. The destructive target is the database `loan_manager_dev`; verify the full tuple before every write (database name, `session_user` `postgres`, system identifier, the `cloudsqladmin` role present, no ambient `PG*` variables). The host alone proves nothing.
2. **PROD objects are owned by `_prod` roles; DEV objects by `_dev` roles.** Tables and SECURITY DEFINER functions are owned by closed NOLOGIN roles with an environment suffix: `mw_notify_owner_<env>` (notification tables and RPCs), `mw_jobs_owner_<env>` (`pwa_job_runs`, `pwa_job_run_v1`), `mw_ledger_owner_<env>` (`sync_cash_ledger`), `mw_changes_owner_<env>` (`pwa_track_row_change`, `pwa_row_changes_prune_v1`) and `mw_app_<env>_journal_owner` (command RPCs). Because the `_prod` roles exist on the shared instance, a plain `pg_restore` of a PROD dump into DEV would **succeed** and silently hand DEV objects to PROD roles, with PROD application grants on DEV tables. Restore with `--no-owner --no-privileges`, then re-own to the DEV map and reconcile grants with the maintained tooling.
3. **`postgres` on Cloud SQL is not a superuser.** `ALTER ... OWNER TO mw_notify_owner_dev` needs temporary `SET` membership of that owner, opened and closed with `owner-authority-cli.mjs prepare` and `restore`. Open the window only for the owners the DEV snapshot names, and restore it in the same session.
4. **Push subscriptions are live device credentials.** `pwa_push_subscriptions` (comment `mw-access:secret`) holds the owner's PROD device subscriptions, and `pwa_notification_deliveries` holds pending sends. The DEV notify dispatcher runs every minute. Left in place, DEV would push real notifications to the PROD-installed app, which is a forced live notification. Delete both before any DEV worker resumes, and prove zero enabled subscriptions before unpausing the dispatcher.
5. **Never disable triggers.** A schema plus data restore is safe because `pg_restore` creates triggers after loading the data, so no calculation, ledger or change-log trigger fires during the load. A data-only restore into the existing schema is not safe: the ledger sync trigger would rebuild "Cash Ledger" rows that the dump also contains, and `--disable-triggers` or `session_replication_role` are ruled out by the hard rules. Use the full restore.
6. **Flyway history comes from PROD.** After the restore DEV carries PROD's `flyway_schema_history`. Both are at V100 on 20 October 2026; confirm again on the day. If DEV holds unreleased migrations beyond PROD, they are gone after the restore and must be reapplied with the guarded runner (`Invoke-Flyway.ps1 -Environment development -Command migrate` inside the owner window, then the post-migrate hook). Never `baseline`, `repair` or edit checksums.
7. **DEV writers.** Cloud Scheduler jobs `mw-credit-app-dev-notifications` (every minute), `mw-credit-app-dev-daily-charges` (00:05 Bangkok) and `mw-credit-app-dev-recent-analytics` (hourly), region `asia-southeast1`, drive the DEV notify and jobs services. The DEV command service writes when a person uses the DEV PWA. The integration agent's business target is `loan_manager_prod`; confirm from `pg_stat_activity` that nothing else holds DEV sessions. Pause the three schedulers first; keep every PROD scheduler, service and the Debian agent untouched.
8. **Receipt objects do not move.** Restored receipt rows reference PROD bucket objects. The DEV command service is pinned to the DEV bucket and prefix by `services/production/business-config.mjs`; restored receipt images will not render in DEV. Do not point DEV at the PROD bucket. Copying objects is a separate owner decision (default: no).
9. **Offline delta cursors reset.** `pwa_row_changes` sequence values change; DEV PWA clients with an old cursor get a full re-walk from the server (`services/business/offline-dataset-delta.mjs` returns null on a gap). Expect one slow first load per device, nothing to repair.
10. **DEV-only state is lost.** The owner's DEV push subscriptions and notification preferences, synthetic fixtures, DEV command journals and DEV `pwa_job_runs` are replaced by PROD's. Take and restore-test a DEV backup first; that backup is the rollback.
11. **Private data stays private.** Dumps and restore directories live under `MW_PRIVATE_ROOT` and `/var/tmp/mw-credit`, are copied to the private operator bucket and are deleted from the session afterwards. Records carry hashes, counts and object paths, never rows.
12. **There is no maintained refresh runner yet.** The runbook expects a "maintained reviewed runner"; the closest tools are `Backup-ProductionPromotion.py` (PROD snapshot with isolated restore proof) and the role CLIs. Write the refresh as one reviewed script with `plan`, `rehearse` and `apply` modes, following the fail-closed patterns of `Backup-ProductionPromotion.py` and `owner-authority-cli.mjs`, and have the owner review it before `apply`. Note also that `Backup-ProductionPromotion.py --expected-version` stops at 99; add 100 before using it.
13. **Executor prerequisites.** The procedure needs gcloud signed in as `codex-cloud` (`GCP_SA_KEY_B64`), PostgreSQL 18 client binaries at `/workspace/.setup/postgresql-18.6/bin`, `psycopg` under `/workspace/.setup/python-deps`, PowerShell 7.5, Node 24, an SSH client and the IAP tunnel to `vm-mw-credit-agent`. Those paths are hard-coded in the backup script and `Test-MigrationsCloud.py`. If the Codex environment lacks them, provision it with `project/scripts/cloud-session-setup.sh` or run the plan from the Claude Code cloud environment; do not create a new access path.

## 2. Go or no-go checklist

Stop and report if any line fails.

- [ ] Owner instruction for the refresh is recorded with its date and scope (data only, or data plus deployed code and configuration). This plan covers the database; a code or configuration refresh follows the runbook's closure section separately.
- [ ] A quiet window is agreed: nobody uses the DEV PWA during Phases 4 to 7.
- [ ] `gcloud auth list` shows `codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com` active; `gcloud config get-value project` is `clever-oasis-508610-n7`.
- [ ] `bash scripts/database/cloud-db-tunnel.sh` reports the tunnel ready on `127.0.0.1:15432`.
- [ ] Read identity works: `pwsh -c ". scripts/database/Common.ps1; Get-DbEnvironment development"` then a `SELECT current_database(), session_user` through it returns `loan_manager_dev` and `codex-cloud-read@clever-oasis-508610-n7.iam`.
- [ ] `MW_PRIVATE_ROOT` is set, the directory exists with mode 700 and is outside the checkout; `git status` shows no private file.
- [ ] No `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSERVICE`, `PGOPTIONS` or `DATABASE_URL` in the environment.
- [ ] `database/migrations/` newest file and the Flyway versions of DEV and PROD (read identity, `SELECT max(version::int) FROM public.flyway_schema_history WHERE success`) are known and written down. Same version in DEV and PROD is the expected case.
- [ ] `ls database/migrations | sort -V | tail -1` is not newer than the DEV version, or the owner has approved reapplying the pending set after the restore.
- [ ] `/var/tmp/mw-credit` has room for two dumps and one isolated restore (PROD dump is small; tens of MB).
- [ ] `Backup-ProductionPromotion.py` accepts the current PROD version (`--expected-version 100`); if not, commit that one-line change first and run it from the committed tree.

## 3. Procedure

Every phase writes its evidence as JSON under `$MW_PRIVATE_ROOT/AppSheet-Loan-Project/flyway/dev-refresh-<date>/` (mode 0600). Commands run from the repository root. Read-only steps use the read identity; writes use `Get-DbEnvironment development -Admin`, which writes the 0600 admin credential file the CLIs require.

### Phase 0: Prove the route, read-only

1. Run the checklist above.
2. Read back both databases with the read identity and save them: Flyway history (version, description, checksum, success) for DEV and PROD; the two must match row for row up to PROD's head. A checksum difference is drift: stop.
3. `SELECT pid, usename, application_name, client_addr, state FROM pg_stat_activity WHERE datname='loan_manager_dev'` to learn who connects to DEV (expect the DEV reader, command, jobs and notify IAM users, possibly Metabase or Grafana readers). Anything unexpected is a question for the owner before Phase 4.

### Phase 1: DEV baselines and backup (the rollback)

1. **Catalog snapshot of DEV** (read identity, save as `dev-catalog-before.json`): for every schema other than `pg_*` and `information_schema`, and for every table, view, materialized view, sequence, function and procedure in them: kind, qualified name, owner, ACL; every trigger (table, name, enabled state, function); installed extensions with schema and version; the database owner and `datacl`; role memberships of the five DEV owner roles and `mw_business_audit_owner`. The expected owner set is `postgres`, `mw_app_dev_journal_owner`, `mw_notify_owner_dev`, `mw_jobs_owner_dev`, `mw_ledger_owner_dev`, `mw_changes_owner_dev` and `mw_business_audit_owner`. Any `_prod` owner in DEV is an existing defect: stop and report.
2. **Data fingerprints of DEV** with the same query `Backup-ProductionPromotion.py` uses (count and md5 of ordered row hashes per table), saved as `dev-fingerprints-before.json`. They are for the rollback test only.
3. **DEV backup with restore proof.** `Backup-DevActivation.ps1` is Windows-only, so follow the Linux precedent used for the R078 and R081 DEV backups: `pg_dump -Fc` of `loan_manager_dev` as the read identity through the tunnel with a `REPEATABLE READ` snapshot, `pg_restore --list`, an isolated restore into a throwaway cluster under `/var/tmp/mw-credit` run as the `postgres` OS user with `--no-owner --no-privileges --exit-on-error`, fingerprints equal to step 2, sha256 of the dump, then copy the folder to `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-<date>-<uuid>/`. Prefer giving `Backup-ProductionPromotion.py` a reviewed `--database loan_manager_dev` mode with its own fixed tuple over a scratch copy; either way the proof fields (`dumpSha256`, `restore`, `restoredFingerprintsMatch`, `privateRecoveryObject`) are what the records cite.
4. **DEV application-role plan.** `node scripts/database/application-role-cli.mjs --action plan` must report zero pending statements. If it does not, DEV grants already drift from the policy; record it and continue only if the owner agrees that the refresh may reconcile them.

### Phase 2: PROD snapshot (the refresh input)

1. Run the maintained snapshot, read-only on PROD:

   ```bash
   MW_PRIVATE_ROOT=<private> python3 scripts/database/Backup-ProductionPromotion.py \
     --approval-reference '<owner refresh instruction, date>' --expected-version 100
   ```

   It opens the tunnel, dumps `loan_manager_prod` as `codex-cloud-read` from a repeatable-read snapshot, restores it into an isolated local cluster, compares every table's fingerprint, writes `recovery.json` and `baseline-private.json` and copies the folder to `prod-backups/`. Keep `privateRecoveryDirectory`, `dumpSha256` and `privateRecoveryObject`.
2. `pg_restore --list <dump>` and save the TOC. Confirm the schemas it creates (expected: `public`, `agent_audit`, `monitoring`, `assessment_lab` if present) and the extension `pg_stat_statements` in `monitoring`. Compare the object list with the DEV catalog snapshot: objects only in the dump mean PROD is ahead of DEV (stop); objects only in DEV must all belong to migrations newer than PROD's version (otherwise stop).
3. Do not open the dump's data anywhere except the isolated restore of Phase 3.

### Phase 3: Rehearsal on a disposable local cluster (required)

The rehearsal produces the exact statement list that Phase 5 replays, and proves it against the repository's own access tests.

1. Start a disposable PostgreSQL 18 cluster as `postgres` under `$MW_LAB_DIR` (the Linux database CI uses the same pattern; see `docs/Development.md`, "Database CI on Linux"). Create the role prerequisites the CI uses so the DEV roles exist as plain NOLOGIN roles: `Test-AgentAuditPrerequisites.sql`, `Test-AppRolePrerequisites.sql`, `Test-IamRolePrerequisites.sql`. Also create the `_prod` owner roles as NOLOGIN, so the rehearsal can catch any statement that would touch them.
2. Create `loan_manager_dev` in the cluster, then restore the PROD dump exactly as Phase 5 will: `pg_restore --no-owner --no-privileges --exit-on-error -1 -d loan_manager_dev <dump>`. In the rehearsal the database is empty, so `--clean` is not exercised here; Phase 5 decides between `--clean --if-exists` and explicit schema drops (see Phase 5 step 3) and the choice is rehearsed a second time against a copy restored from the DEV backup of Phase 1, which is also the rollback rehearsal.
3. Neutralize: `DELETE FROM public.pwa_notification_deliveries; DELETE FROM public.pwa_push_subscriptions;` as the restoring user, before any ownership change. Record the deleted counts.
4. Re-own: generate `ALTER TABLE|SEQUENCE|VIEW|FUNCTION ... OWNER TO <owner>` statements from `dev-catalog-before.json` for every object whose DEV owner is not `postgres`, apply them, and save the statement list as `reown.sql`. In the rehearsal the local `postgres` is a superuser, so the owner window is not needed; Phase 5 needs it.
5. Grants: run the DEV policy reconciliation against the rehearsal database the way `application-role-cli.mjs --action reconcile --apply` would (the tooling module `app-role-policy.mjs` exposes `reconcileApplicationRole`), then the reader column grants of `scripts/configure-dev-read-role.py` in plan mode to list what is missing. Record the statement counts; they are the expected counts for Phase 5.
6. Verify in the rehearsal cluster: `Test-AccessMatrix.sql`, `Test-TriggerOrder.sql`, `Test-RowChanges.sql`, `Test-LedgerAccess.sql` and `Test-AppRolePrerequisites.sql` pass; the catalog snapshot query now equals `dev-catalog-before.json` except for objects the owner has agreed are DEV-only; fingerprints equal PROD's `baseline-private.json` except the two emptied tables; `SELECT count(*) FROM pwa_push_subscriptions WHERE enabled` is 0.
7. Run Flyway `validate` against the rehearsal database with the checkout's migrations (`Invoke-Flyway.ps1` only targets the configured environments, so use the Flyway binary from `database/toolchain.json` directly with `-url` to the local port, read-only `validate`). Pending migrations here equal the pending set Phase 5 must apply.
8. Stop and delete the cluster. Keep only the JSON evidence and `reown.sql`.

Fix the script and repeat the rehearsal until step 6 and 7 pass without manual intervention. Only then continue.

### Phase 4: Quiesce DEV

1. Pause the three DEV schedulers (bounded API exception; Terraform reconciles them back in Phase 7):

   ```bash
   for j in notifications daily-charges recent-analytics; do
     gcloud scheduler jobs pause "mw-credit-app-dev-$j" --location asia-southeast1 --project clever-oasis-508610-n7
   done
   gcloud scheduler jobs list --location asia-southeast1 --project clever-oasis-508610-n7 --filter='name~mw-credit-app-dev' --format='table(name,state)'
   ```

   All three must read `PAUSED`; every `mw-credit-app-prod-*` job stays `ENABLED`.
2. Confirm with the owner that the DEV PWA is closed on their devices.
3. Through the admin route, terminate the remaining DEV sessions except your own: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='loan_manager_dev' AND pid<>pg_backend_pid()`. Re-run the `pg_stat_activity` query; a session that reappears within a minute is an active writer you have not paused: find it before continuing.
4. Write `connect-preflight.json` with the terminated sessions and the final empty list; the identity assertion of item 1 in section 1 belongs in the same file.

### Phase 5: Replace DEV

Work in one admin session with the tunnel open and `MW_PRIVATE_ROOT` set. Every command asserts the DEV tuple first.

1. `pwsh -c ". scripts/database/Common.ps1; Get-DbEnvironment development -Admin"` writes the 0600 admin credential file; the CLIs below read it.
2. Open the owner window for exactly the owners in `reown.sql` plus the journal owner for the reconciliation:

   ```bash
   node scripts/database/owner-authority-cli.mjs prepare --environment development \
     --owner mw_notify_owner_dev --owner mw_jobs_owner_dev --owner mw_ledger_owner_dev \
     --owner mw_changes_owner_dev --owner mw_app_dev_journal_owner --apply
   ```

   Keep the printed `privateRecoveryFile`; it is the `--state` for `restore`.
3. Restore. Preferred form, atomic: `pg_restore -h 127.0.0.1 -p 15432 -U postgres -d loan_manager_dev --clean --if-exists --no-owner --no-privileges --exit-on-error -1 <dump>` with `PGPASSWORD` read from the credential file for that command only and `PGSSLMODE=disable` (the proxy encrypts the hop). With `-1`, a failure rolls back everything, including the drops, and DEV is unchanged. If the rehearsal against the DEV copy showed that `--clean` cannot drop DEV-only objects in order, use the fallback: in one transaction, `DROP SCHEMA` the schemas listed in the TOC with `CASCADE`, recreate `public` with its snapshot owner, then run `pg_restore` without `--clean` inside the same session (`-1` cannot span both, so the fallback is not atomic; the DEV backup is the recovery). Record which form ran.
4. Neutralize before anything resumes: `DELETE FROM public.pwa_notification_deliveries; DELETE FROM public.pwa_push_subscriptions;` and record the counts.
5. Re-own: `psql -f reown.sql` from the rehearsal; it must apply the same number of statements as the rehearsal did.
6. Grants: `node scripts/database/application-role-cli.mjs --action reconcile --apply`, then `python3 scripts/configure-dev-read-role.py` (read-only plan) and the same with `--apply` for the DEV reader. Statement counts should match the rehearsal; a large difference means the restore differs from the rehearsal: stop and compare before continuing.
7. Flyway: `pwsh -NoProfile -File scripts/database/Invoke-Flyway.ps1 -Environment development -Command validate`. If Phase 3 step 7 found pending migrations, run `-Command migrate` now (still inside the owner window), then `node scripts/database/application-role-cli.mjs --action post-migrate --apply`, then `validate` again.
8. Close the window: `node scripts/database/owner-authority-cli.mjs restore --environment development --state <file from step 2> --apply`. The result must show every owner back to inherit false, set false, admin false and no `CREATE` on `public`.

### Phase 6: Verify before anything resumes

1. Catalog snapshot again (`dev-catalog-after.json`) and diff against `dev-catalog-before.json`: owners, ACLs, triggers (all present and enabled, the 19 plus 19 `ENABLE ALWAYS` change-log triggers included), extensions and the database ACL must be equal; the only allowed differences are objects that the pending migrations of Phase 5 step 7 added.
2. Data fingerprints against PROD's `baseline-private.json`: equal for every table except `pwa_notification_deliveries` and `pwa_push_subscriptions` (0 rows). `flyway_schema_history` row count equals PROD's, or PROD's plus the reapplied set.
3. `SELECT count(*) FROM public.pwa_push_subscriptions WHERE enabled` is 0 and `SELECT count(*) FROM public.pwa_notification_deliveries WHERE state IN ('pending','retry')` is 0.
4. `node scripts/database/application-role-cli.mjs --action plan` reports zero statements.
5. Read-identity smoke: `codex-cloud-read` can `SELECT count(*) FROM public."Loans"` in DEV; `mw-credit-app-read-dev` grants exist on the approved columns (the plan output of `configure-dev-read-role.py` is empty).
6. DEV API smoke without writes: the DEV reader and command services answer `/health` with 200 and an unauthenticated `/api/session` with 401 (the R081 DEV smoke in the Environment inventory is the precedent). One owner sign-in on the DEV PWA shows the refreshed data.
7. Only if the owner wants a write test: one synthetic payment on a synthetic borrower through the DEV PWA, then check that "Cash Ledger" gained its projection row and `pwa_row_changes` logged the change. Delete the synthetic rows through the PWA afterwards.

### Phase 7: Resume

1. Reconcile the schedulers with Terraform, which also proves no other DEV infrastructure changed: `pwsh -NoProfile -File scripts/Invoke-Terraform.ps1 -Stack dev -Command plan` should show exactly the three `paused` attributes reverting; then `-Command apply`. If the plan shows anything else, stop and report before applying.
2. Watch the first dispatcher tick and the first hourly `recent-analytics` run in the DEV logs: no ERROR, zero deliveries attempted.
3. The owner opens the DEV PWA on each DEV device and re-enables notifications there; the new subscriptions carry the DEV origin. Verify `pwa_push_subscriptions` then holds only those rows.

### Phase 8: Records and cleanup

1. Delete the local dumps and restore directories under `/var/tmp/mw-credit` and `$MW_PRIVATE_ROOT` once the bucket copies are confirmed; close the tunnel (`pkill -f 'ssh -f -N .*vm-mw-credit-agent'` targets only that process); remove the admin credential file.
2. Update existing documents in one batch: the DEV Flyway row of the [Environment inventory](../../Documents/Environment_Inventory.md) (refresh date, PROD dump sha256 and object, DEV backup sha256 and object, owner-window and reconciliation record ids, "DEV data refreshed from PROD snapshot of <timestamp>"), the DEV notes in the same document about push subscriptions, and the known-gaps row in [Development_Changes.md](../../Documents/Development_Changes.md) if the backup script gained a DEV mode. Write one change note with the [template](../../Documents/Rules/Development_Workflow.md#records-change-notes-and-retention); run `npm run check:docs`.
3. Commit and push only the task's files (the refresh script, the backup script change, the documents) to the configured branch. Publication does not merge or deploy anything.
4. Report to the owner: DEV ready, incomplete or rolled back; the PROD snapshot timestamp; what the owner still has to do (notification re-subscription, receipt images not rendering for restored rows).

## 4. Rollback

At any point after Phase 5 step 3 started: run Phase 5 again with the DEV dump from Phase 1 instead of the PROD dump, same options, same neutralization skipped (the DEV dump holds the DEV subscriptions, keep them), same re-own and reconciliation, then Phase 6. This is why Phase 1 step 3 restore-tests the DEV dump and Phase 3 rehearses against it. Schedulers stay paused until the rollback verifies. Do not touch PROD as a workaround.

## 5. Decisions the owner still has to make

| Decision | Default in this plan |
| --- | --- |
| Copy PROD receipt objects into the DEV bucket so restored receipts render in DEV | No. Restored receipt images stay unavailable in DEV; synthetic receipts work as before |
| Keep the owner's DEV push subscriptions across the refresh (re-insert from the DEV backup) or re-subscribe on each device | Re-subscribe. Simpler and proves the DEV route end to end |
| Commit the refresh script and the DEV mode of the backup script as maintained tooling | Yes. The runbook calls for a maintained reviewed runner, and the next refresh then has one |
| Refresh deployed DEV code and configuration too | Not in this plan. If wanted, follow the runbook's closure section after Phase 7 |
| Write test in Phase 6 step 7 | Skip unless asked; the read smoke and the trigger snapshot already prove the schema |

## 6. Stop conditions

Stop, leave DEV paused and contained, and report with the evidence file names when: the DEV catalog shows a `_prod` owner before the refresh; Flyway checksums differ between DEV and PROD; the PROD snapshot fails its own restore proof; the rehearsal does not pass the access tests; the live restore or the re-own applies a different statement count than the rehearsal; `restore` of the owner window does not return every owner to closed; the Terraform plan in Phase 7 shows anything but the three scheduler attributes.
