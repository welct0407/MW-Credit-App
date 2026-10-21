# DEV refresh from PROD: execution plan for a Claude Code cloud session

Drafted 21 October 2026 for the owner. The [refresh runbook](../../Documents/Rules/Development_Refresh_Runbook.md) is the rule; this plan is the session brief that follows it, with the facts verified on 21 October 2026, the exact commands, the expected numbers from the rehearsal and the evidence to keep for the lessons-learned review afterwards. It is a plan, not an authorization record. Start the refresh session in **Accept edits** mode, read [AGENTS.md](../../../AGENTS.md), the runbook and this file, then work the phases in order. Do the work directly (database operations are not PWA product development); Forge is not needed unless Terraform has to change.

## Verified on 21 October 2026 (read-only, from a Claude cloud session)

| Fact | Value | Consequence |
| --- | --- | --- |
| Flyway | DEV and PROD both V100, 100 rows, 0 failed, identical history md5; newest migration file V100 | No pending set to reapply after the restore; `validate` only |
| DEV owners | `postgres` 249 objects, `mw_notify_owner_dev` 21, `mw_business_audit_owner` 8, `mw_app_dev_journal_owner` 7, `mw_jobs_owner_dev` 2, `mw_changes_owner_dev` 2, `mw_ledger_owner_dev` 1, `pg_database_owner` (schema `public`), `cloudsqlsuperuser` (the database) | No `_prod` owner or grantee in DEV today; the five `_dev` owners need the window |
| `postgres` memberships | `inherit true, set true` on `cloudsqlsuperuser` and `mw_business_audit_owner`; `inherit false, set false` on every `_dev` owner | Open the window **before** the `--clean` restore (it drops objects those roles own) |
| Database owner | `cloudsqlsuperuser`; `postgres` inherits it, so grants on `public` (owned by `pg_database_owner`) work | The tool skips the database owner and reports it |
| Notifications | DEV: 1 enabled push subscription, 1 delivery, 0 pending; PROD: 4 enabled subscriptions | Four PROD device credentials would land in DEV; the deletes are mandatory |
| DEV schedulers | all three already `PAUSED`; PROD's three `ENABLED` | Nothing to pause; the Terraform plan of `dev` must stay no-change |
| DEV sessions | none at the time of the check; PROD had Metabase and the command service | Re-check in the window |
| Size | DEV 16 MB, PROD 17 MB, 33 tables, about 4,500 rows in DEV | Dump, restore and reconcile take seconds; the catalog snapshot about 5 s over the tunnel |
| Rehearsal | Lab restore of a PROD-shaped dump over a DEV-shaped database: 40 owner statements, 171 to 178 privilege statements, residual 0, catalog equal, fingerprints equal, four access tests pass; rollback rehearsal equal | Expected counts for Phase 5 (a large deviation means stop and compare) |

## Go or no-go

- [ ] Owner instruction for the refresh recorded (scope: database only unless stated otherwise); quiet window agreed; owner closes the DEV PWA.
- [ ] `gcloud auth list` active account is `codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`.
- [ ] `export MW_PRIVATE_ROOT=/root/.mw-private; mkdir -p -m 700 $MW_PRIVATE_ROOT` (outside the checkout); `git status` clean of private files.
- [ ] `bash scripts/database/cloud-db-tunnel.sh` reports the tunnel ready on `127.0.0.1:15432`.
- [ ] `pwsh -NoProfile -c ". scripts/database/Common.ps1; Get-DbEnvironment development"` returns the read identity (writes the 1-hour token file).
- [ ] No `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSERVICE`, `PGOPTIONS`, `DATABASE_URL` in the environment.
- [ ] `PGBIN=/usr/lib/postgresql/18/bin` (same binaries as `/workspace/.setup/postgresql-18.6/bin`); `$PGBIN/pg_restore --version` is 18.
- [ ] Phase 0 readings match the table above, or the differences are understood and written down.

Evidence folder for every phase: `E=$MW_PRIVATE_ROOT/AppSheet-Loan-Project/flyway/dev-refresh-$(date -u +%Y%m%d)`; `mkdir -p -m 700 $E`. Keep the shell variables `PGBIN`, `E` and `MW_PRIVATE_ROOT` in every command block (the harness does not persist them between commands; export them in each block or in `$CLAUDE_ENV_FILE`).

## Phase 0: preflight, read-only

```bash
export MW_PRIVATE_ROOT=/root/.mw-private PGBIN=/usr/lib/postgresql/18/bin; E=$MW_PRIVATE_ROOT/AppSheet-Loan-Project/flyway/dev-refresh-$(date -u +%Y%m%d); mkdir -p -m 700 $E
export PGPASSWORD="$(cat $MW_PRIVATE_ROOT/AppSheet-Loan-Project/credentials/read-token.txt)"; U='codex-cloud-read@clever-oasis-508610-n7.iam'
for db in loan_manager_dev loan_manager_prod; do echo "== $db"; $PGBIN/psql -X -q -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 15432 -U $U -d $db \
  -c "SELECT 'flyway head '||max(version::int)||' rows '||count(*)||' failed '||count(*) FILTER (WHERE NOT success) FROM public.flyway_schema_history" \
  -c "SELECT 'history md5 '||md5(string_agg(version||':'||checksum, ',' ORDER BY installed_rank)) FROM public.flyway_schema_history WHERE success" \
  -c "SELECT 'sessions: '||coalesce(string_agg(usename||'/'||coalesce(application_name,'')||'/'||state||' x'||n,'; '),'none') FROM (SELECT usename,application_name,state,count(*) n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() GROUP BY 1,2,3) s" \
  -c "SELECT 'push subscriptions enabled '||count(*) FILTER (WHERE enabled)||' of '||count(*) FROM public.pwa_push_subscriptions" \
  -c "SELECT 'pending deliveries '||count(*) FROM public.pwa_notification_deliveries WHERE state IN ('pending','retry')"; done | tee $E/phase0-readings.txt
unset PGPASSWORD; ls database/migrations | sort -V | tail -1
gcloud scheduler jobs list --location asia-southeast1 --project clever-oasis-508610-n7 --filter='name~mw-credit-app-' --format='table(name.basename(),state,schedule)' | tee $E/phase0-schedulers.txt
```

Stop if the two history md5 values differ, if PROD's head is above DEV's, or if the newest migration file is above DEV's head without an approved pending set.

## Phase 1: DEV baselines and backup (the rollback)

```bash
python3 scripts/database/Refresh-DevCatalog.py snapshot --identity read --fingerprints --out $E/dev-catalog-before.json
node scripts/database/application-role-cli.mjs --action plan            # expect 0 statements
python3 scripts/configure-dev-read-role.py                               # expect nothing pending
python3 scripts/database/Backup-ProductionPromotion.py --environment development --expected-version 100 \
  --approval-reference '<owner refresh instruction, date>' | tee $E/dev-backup.json
```

The DEV backup prints `dumpSha256`, `restore: passed`, `restoredFingerprintsMatch: true` and the `dev-backups/dev-refresh-<uuid>/` object. Any `_prod` owner or grantee in `dev-catalog-before.json` is an existing defect: stop and report.

## Phase 2: PROD snapshot (the refresh input)

```bash
python3 scripts/database/Backup-ProductionPromotion.py --expected-version 100 --approval-reference '<owner refresh instruction, date>' | tee $E/prod-snapshot.json
D=$(python3 -c "import json;print(json.load(open('$E/prod-snapshot.json'))['privateRecoveryDirectory'])"); DUMP=$D/loan_manager_prod.dump; BASE=$D/baseline-private.json
$PGBIN/pg_restore --list $DUMP > $E/prod-dump.toc; grep -c '' $E/prod-dump.toc; grep -E 'SCHEMA -|EXTENSION' $E/prod-dump.toc
```

Expected in the listing: schemas `agent_audit`, `assessment_lab`, `monitoring` and the ACL of `public`, extension `pg_stat_statements`. The dump never leaves the private folder, the isolated restore of the backup script and the rehearsal cluster.

## Phase 3: rehearsal on a disposable cluster (required)

```bash
LAB=$MW_LAB_DIR/dev-refresh-rehearsal; PORT=54331; rm -rf $LAB; install -d -m 700 -o postgres -g postgres $LAB
runuser -u postgres -- $PGBIN/initdb -D $LAB/data -U postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null
runuser -u postgres -- $PGBIN/pg_ctl -D $LAB/data -l $LAB/postgres.log -o "-h 127.0.0.1 -p $PORT" -w start >/dev/null
P="$PGBIN/psql -X -q -h 127.0.0.1 -p $PORT -U postgres"; $P -d postgres -c "CREATE DATABASE loan_manager_dev"
for f in Test-AgentAuditPrerequisites Test-AppRolePrerequisites Test-IamRolePrerequisites; do $P -d loan_manager_dev -v ON_ERROR_STOP=1 -f scripts/database/$f.sql; done
runuser -u postgres -- $PGBIN/pg_restore -h 127.0.0.1 -p $PORT -U postgres -d loan_manager_dev --no-owner --no-privileges --exit-on-error -1 $DUMP
$P -d loan_manager_dev -c "DELETE FROM public.pwa_notification_deliveries" -c "DELETE FROM public.pwa_push_subscriptions"
python3 scripts/database/Refresh-DevCatalog.py reconcile --lab-port $PORT --before $E/dev-catalog-before.json --apply --report $E/rehearsal-reconcile.json
python3 scripts/database/Refresh-DevCatalog.py compare --lab-port $PORT --before $E/dev-catalog-before.json --prod-baseline $BASE \
  --expect-empty public.pwa_notification_deliveries,public.pwa_push_subscriptions --report $E/rehearsal-compare.json
for t in Test-AccessMatrix Test-TriggerOrder Test-RowChanges Test-LedgerAccess; do printf "%s: " $t; $P -d loan_manager_dev -v ON_ERROR_STOP=1 -f scripts/database/$t.sql >/dev/null && echo pass || echo FAIL; done
# rollback rehearsal with the DEV dump (same options as the live restore, including --clean)
DEVDUMP=$(python3 -c "import json;print(json.load(open('$E/dev-backup.json'))['privateRecoveryDirectory'])")/loan_manager_dev.dump
runuser -u postgres -- $PGBIN/pg_restore -h 127.0.0.1 -p $PORT -U postgres -d loan_manager_dev --clean --if-exists --no-owner --no-privileges --exit-on-error -1 $DEVDUMP
python3 scripts/database/Refresh-DevCatalog.py reconcile --lab-port $PORT --before $E/dev-catalog-before.json --apply >/dev/null
python3 scripts/database/Refresh-DevCatalog.py compare --lab-port $PORT --before $E/dev-catalog-before.json --prod-baseline $E/dev-catalog-before.json --report $E/rehearsal-rollback.json
runuser -u postgres -- $PGBIN/pg_ctl -D $LAB/data -m fast -w stop >/dev/null; rm -rf $LAB
```

Expected: reconcile `committed: true`, residual all zero; compare `catalogEqual: true`, `fingerprintsEqual: true`; four passes; rollback compare equal. Note the owner and privilege statement counts; Phase 5 must reproduce them within a few statements. The rehearsal `postgres` is a superuser, so it cannot show Cloud SQL permission failures; the dry run in Phase 5 does.

## Phase 4: quiesce DEV

1. Schedulers: all three DEV jobs were `PAUSED` on 21 October. If any is `ENABLED` now, `gcloud scheduler jobs pause mw-credit-app-dev-<name> --location asia-southeast1 --project clever-oasis-508610-n7` and note it for Phase 7. PROD jobs are never touched.
2. Owner confirms the DEV PWA is closed.
3. Admin route and session termination:

```bash
pwsh -NoProfile -c ". scripts/database/Common.ps1; Get-DbEnvironment development -Admin | Out-Null"
export PGPASSWORD="$(cat $MW_PRIVATE_ROOT/AppSheet-Loan-Project/credentials/postgres-password.txt)" PGSSLMODE=disable
A="$PGBIN/psql -X -q -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 15432 -U postgres -d loan_manager_dev"
$A -c "SELECT current_database(), session_user, host(inet_server_addr()), (SELECT system_identifier FROM pg_control_system()), EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cloudsqladmin')" | tee $E/phase4-identity.txt
$A -c "SELECT pg_terminate_backend(pid), usename, application_name FROM pg_stat_activity WHERE datname='loan_manager_dev' AND pid<>pg_backend_pid()" | tee $E/phase4-terminated.txt
$A -c "SELECT count(*) FROM pg_stat_activity WHERE datname='loan_manager_dev' AND pid<>pg_backend_pid()"
```

The identity line must read `loan_manager_dev | postgres | (null) | 7685391508477894672 | t`. A session that reappears within a minute is an active writer you have not found: stop until it is explained.

## Phase 5: replace DEV

```bash
node scripts/database/owner-authority-cli.mjs prepare --environment development --owner mw_notify_owner_dev --owner mw_jobs_owner_dev \
  --owner mw_ledger_owner_dev --owner mw_changes_owner_dev --owner mw_app_dev_journal_owner --apply | tee $E/owner-window.json
STATE=$(python3 -c "import json;print(json.load(open('$E/owner-window.json'))['privateRecoveryFile'])")
$PGBIN/pg_restore -h 127.0.0.1 -p 15432 -U postgres -d loan_manager_dev --clean --if-exists --no-owner --no-privileges --exit-on-error -1 $DUMP 2>&1 | tee $E/restore.log
$A -c "DELETE FROM public.pwa_notification_deliveries" -c "DELETE FROM public.pwa_push_subscriptions" | tee $E/neutralize.txt
python3 scripts/database/Refresh-DevCatalog.py reconcile --identity admin --before $E/dev-catalog-before.json --report $E/reconcile-dry.json        # dry run: executes, verifies, rolls back
python3 scripts/database/Refresh-DevCatalog.py reconcile --identity admin --before $E/dev-catalog-before.json --report $E/reconcile-apply.json --apply
pwsh -NoProfile -File scripts/database/Invoke-Flyway.ps1 -Environment development -Command validate | tee $E/flyway-validate.txt
node scripts/database/owner-authority-cli.mjs restore --environment development --state $STATE --apply | tee $E/owner-restore.json
unset PGPASSWORD
```

Rules: a failed `pg_restore` with `-1` leaves DEV unchanged (check `restore.log`, fix the cause, retry the same command); a failed `prepare` or a dry run with a residual difference stops the phase before anything is committed; `restore` must show every owner back to `inherit false, set false, admin false` and no `CREATE` on `public`. Only an approved pending migration set adds `-Command migrate` before `validate`, then `node scripts/database/application-role-cli.mjs --action post-migrate --apply`, all inside the window.

## Phase 6: verify before anything resumes

```bash
python3 scripts/database/Refresh-DevCatalog.py compare --identity read --before $E/dev-catalog-before.json --prod-baseline $BASE \
  --expect-empty public.pwa_notification_deliveries,public.pwa_push_subscriptions --report $E/verify-compare.json
node scripts/database/application-role-cli.mjs --action plan; python3 scripts/configure-dev-read-role.py
```

Then the DEV reader and command services answer `/health` with 200 and an unauthenticated `/api/session` with 401 (URLs in the Environment inventory's DEV smoke), and one owner sign-in on the DEV PWA shows the refreshed data (first load re-walks the offline dataset). A synthetic write test only if the owner asks; the trigger snapshot in the catalog compare already proves the schema.

## Phase 7: resume

`pwsh -NoProfile -File scripts/Invoke-Terraform.ps1 -Stack dev -Command plan` must show no change (or exactly the scheduler attributes you paused in Phase 4, then `-Command apply`). The owner opens the DEV PWA on each DEV device and re-enables notifications; `pwa_push_subscriptions` then holds only DEV-origin rows. If the owner wants the DEV dispatcher or jobs enabled, that is a Terraform activation change, not part of the refresh.

## Phase 8: records and cleanup

1. Copy `$E` to `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-<date>-evidence/` (`gcloud storage cp --recursive`), then delete local dumps and restore directories under `/var/tmp/mw-credit` and the credential files under `$MW_PRIVATE_ROOT/AppSheet-Loan-Project/credentials/`; close the tunnel (`pkill -f 'ssh -f -N .*vm-mw-credit-agent'`).
2. Update the DEV row of the [Environment inventory](../../Documents/Environment_Inventory.md): refresh date, PROD snapshot `observedAt` and dump sha256, DEV backup sha256 and object, owner-window record id, reconcile statement counts, `flyway validate` result; note that DEV push subscriptions were cleared. Write one change note with the [template](../../Documents/Rules/Development_Workflow.md#records-change-notes-and-retention); `npm run check:docs`; commit and push the task's files only.
3. Report: DEV ready, incomplete or rolled back; the PROD snapshot timestamp; what the owner still has to do (re-subscribe notifications; restored receipt images do not render in DEV).

## Rollback

From any point after the restore started: Phase 5 again with `$DEVDUMP` instead of `$DUMP`, without the two deletes, then Phase 6 against `dev-catalog-before.json` with `--prod-baseline $E/dev-catalog-before.json` and no `--expect-empty`. Schedulers stay paused until that verifies. Never touch PROD as a workaround.

## Stop conditions

Stop, leave DEV contained and report with the evidence file names when: a `_prod` owner or grantee appears in the DEV snapshot; the history md5 values differ; the PROD snapshot fails its own restore proof; the rehearsal fails a test or leaves a residual difference; the live restore fails twice with the same error; the dry run's statement counts deviate materially from the rehearsal; `owner-authority-cli.mjs restore` does not close every owner; the Terraform plan shows anything beyond the schedulers.

## Decisions for the owner (defaults)

| Decision | Default |
| --- | --- |
| Copy PROD receipt objects into the DEV bucket so restored receipts render | No |
| Keep the owner's one DEV push subscription across the refresh | No; re-subscribe on the device (the DEV dump keeps it for a rollback) |
| Refresh deployed DEV code and configuration too | Not in this plan |
| Synthetic write test in Phase 6 | Skip unless asked |

## For the lessons-learned review afterwards

Keep these in `$E` and in the change note so the review session can compare plan and reality: wall-clock time per phase; the statement counts of rehearsal, dry run and apply; every command that failed on the first attempt and what fixed it; every deviation from this plan; anything the owner had to decide during the window; what the first DEV PWA load and the first scheduler tick looked like. The review updates the runbook's History section and, where a step was wrong or missing, the procedure itself.
