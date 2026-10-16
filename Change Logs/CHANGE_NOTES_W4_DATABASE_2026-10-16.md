# W4 database, access, locking and performance (16 October 2026)

## Purpose

Wave 4 database work for the independent review, on branch `claude/review-w4-db` from `main` 2b02f94. It adds one shared migration, V93 (SHA256 `d4e7e547946d4cf534ccfb1b2ef08708c774fc1c6cfa49adcdc5a77692187013`), and the tooling, tests, infrastructure plan and documents around it. The PWA and API side is in the [app note](CHANGE_NOTES_W4_APP_2026-10-16.md).

Authority (owner, 16 October 2026): new shared migrations in DEV from V93, DEV-side changes and preparing PROD changes. Not authorized: the PROD migration, any write to production `mw_agent`, any Cloud SQL flag change or restart. Read-only size readback of PROD `mw_agent` through the Debian route was allowed and done. Nothing in this note has been applied to PROD. The DEV run needed owner-approved tooling fixes (commit 9584b60: tunnel identity rule for the Auth Proxy route, credential path). DEV was migrated to V93 and verified on 16 October 2026 (21:13 Bangkok); see "DEV migration record". PROD is still V92.

Owner decisions since: the dictionary entry for `pwa_lock_key_v1` is covered by the owner's prompt; `mw_agent` audit retention is 1 week (owner, 17 October); the Cloud Storage prefix `agent-audit-archive/` is a proposal, not owner-confirmed.

## Changes

One bullet per W4 finding code (24 codes).

- **DB-ACCESS-08** (first W4 item). V93 makes `sync_cash_ledger(text,text)` `SECURITY DEFINER`, owned by the closed role `mw_ledger_owner_<env>` (NOLOGIN, provisioned by the operator, never created by a migration), `search_path` pinned. The V23 body is unchanged except the four `FOR UPDATE` row locks, which a definer without UPDATE on the source tables cannot take and the AFTER ROW trigger makes redundant. EXECUTE is revoked from PUBLIC and granted to `mw_app_<env>`, the reviewer roles and the runner; the `pg_trigger_depth()` guard still blocks direct calls. The ledger owner gets exactly what the body and the depth-2 ledger triggers touch (SELECT on the four sources, cash accounts/holders and the two cutover tables, lock-only column UPDATE on Cash Accounts/Cash Holders/r008, all four privileges on "Cash Ledger", USAGE on `public`). V93 revokes INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on "Cash Ledger" from `mw_app_<env>` and both reviewer roles and asserts the result. The journal owner keeps explicit INSERT/UPDATE/DELETE (governed cash-movement CRUD and payment corrections write the ledger as that role); the reviewer gets the lock-only `UPDATE ("Created At")` that payment edits need. A direct source DELETE by the app role now fails at the ledger cleanup; no consumer does that. Files: `database/migrations/V93__review_wave4_hygiene.sql`, `scripts/database/app-role-policy.mjs` (Cash Ledger read-only for the app role, ledger-owner definer approved), `scripts/database/application-role-cli.mjs`, `Test-AccessMatrix.sql`, `Test-AppRolePrerequisites.sql`, new `Test-LedgerAccess.sql`, `tests/integration/dev-app-capability-independent.test.mjs`, `integration-agent/scripts/configure-reviewer-dml.py`, `integration-agent/src/mw_integration_agent/conversation_dml.py` ("Cash Ledger" is no longer an offered DML target) and their tests. Because Cloud SQL `postgres` is not a superuser, changing the owner needs temporary `SET` membership of the ledger owner and `CREATE` on `public` for it: new `scripts/database/owner-authority-cli.mjs` (`role`, `prepare`, `restore`; Linux tunnel capable; PROD gate as R053), `provisionClosedOwnerRole`/`prepareOwnerAuthority`/`restoreOwnerAuthority` in `r053-operator-tooling.mjs`, rehearsal `Run-R053OperatorIndependent.ps1 -LedgerOwner` with `ledger-owner-operator-independent.test.mjs` (wired into the `phase8` group), procedure in `scripts/database/R053_OPERATOR.md`.
- **DB-AGENTDB-01.** `integration-agent/tests/test_state_migration_postgres.py` applies V1 to V4 from an empty server twice (the second run applies nothing) and checks that a tampered copy fails with a checksum mismatch, plus out-of-order and target refusals. `agent-tests.yml` starts an empty cluster (port 15611, `MW_AGENT_FRESH_PG_DSN`) for it.
- **DB-AGENTDB-02.** The business-side `agent_audit` grants of `business-grants.sql` (reviewer, relay, auditor) are restated in V93 section 3, role-existence guarded, using the runner's inherited or `SET` authority on `mw_business_audit_owner` (fail closed otherwise). `integration-agent/database/setup/business-grants.sql` is deleted. `integration-agent/tests/lab/setup.sh` grants the reviewer role inline (it is created after the Flyway chain); `Test-AgentAuditPrerequisites.sql` creates the roles for CI.
- **DB-AGENTDB-03.** Already resolved on main: the PROD provisioning script `provision-agent-database.py` was removed in the W3 agent merge (92cd65e). No change.
- **DB-AGENTDB-04.** No finding (sound defaults). Recorded; no change.
- **DB-PAY-01.** No finding (guard holds; the seven definitions are covered by DB-SCHEMA-01). No change.
- **DB-PAY-02.** No defect found by static read. No change.
- **DB-PAY-03.** Cross-reference to DB-ACCESS-02 (W3): ordinary CRUD stays the accepted correction path; materialized totals self-heal. V93 narrows the ledger only. Text added to `project/Documents/PWA_Data_Model_Overview.md`.
- **DB-PERF-01.** Read-only PROD readback (sizes and counts only, no rows): `mw_agent` is 1,742 MB; `audit.events` 840 MB, `audit.operations` 629 MB, `runtime.operation_state` 139 MB, `runtime.job_runs` 119 MB. **0 stored receipt images**, so the suspected cause (images in the database) is refuted; the growth (about 60 to 100 MB a day, roughly 30,000 heartbeat operations a day) is audit and job rows. Prepared, not run on PROD: `integration-agent/scripts/agent-db-maintenance.py` (`null-archived-images`, `audit-retention`; dry run by default, connection file outside the repository, expected environment check) and `integration-agent/database/maintenance/vacuum-full-agent.sql`. Measured on a disposable scaled copy: delete in batches of 2,000 operation trees, about 90 s; `VACUUM FULL` cut a 1,653 MB lab copy to about 750 MB. The temporary foreign-key indexes the script builds are needed (without them one batch ran over 9 minutes and blocked a writer). Retention is one week by owner decision (17 October): `--older-than-days` defaults to 7 and cannot go lower; effectful and deterministic-key operations are never deleted. Disabled units `integration-agent/systemd/mw-audit-retention.service` and `.timer` (daily 03:40 Asia/Bangkok) are drafted, not installed. The text is in `integration-agent/docs/POSTGRESQL_OPERATIONS.md`. The GCS prefix is a proposal.
- **DB-PERF-02.** No performance defect at current scale. No change.
- **DB-PERF-03.** `infrastructure/ecosystem-shared/owned.tf`: the four `cron.*`/`pg_cron` flags removed, `max_connections` 200 to 50. Plan only: 0 add, 1 change (flags in place), 0 destroy. Daily peak connections are 12 to 13 since AppSheet retired; worst configured case is about 39 of about 47 usable. Applying restarts the shared instance (DEV, PROD and `mw_agent`).
- **DB-PERF-04.** V93 creates `pg_stat_statements` in schema `monitoring` (guarded on `pg_available_extensions`; a plain operator without privilege gets a NOTICE). Correction to the brief: Cloud SQL has no `shared_preload_libraries` flag and already preloads the library, so no flag and no restart are needed for this item.
- **DB-LOCK-01.** App side, see the app note: pre-commit lock, deadlock, timeout and try-lock failures return `409 command_busy`; the PWA retries the same request.
- **DB-LOCK-02.** Not changed. The lease columns of `pwa_job_runs` are dead state but harmless; dropping them is a later contract migration (expand/contract).
- **DB-LOCK-03.** V93 adds `public.pwa_lock_key_v1(kind text, target text)` (`IMMUTABLE STRICT PARALLEL SAFE`, no `search_path`, EXECUTE stays PUBLIC) returning `hashtextextended(kind || ':' || target, 0)`. Proven byte-identical to the inline form, NULL included. Node uses it (app note). The SQL bodies keep the inline expression: rewriting `pwa_submit_operation_v2` needs journal-owner authority in every environment, and the other ten sites have no Node twin. `Test-StatementBatch.sql` asserts the equality and the function attributes. Two-integer request-id locks are a different key space and are untouched.
- **DB-SCHEMA-01.** New generated `database/current/public-functions.sql` (`pg_dump --schema-only` of a fresh rebuild, `Normalize-Schema.ps1 -FunctionsOnly`), `scripts/database/Update-PublicFunctions.ps1` (check mode fails on drift; `MW_WRITE_PUBLIC_FUNCTIONS=1` or `-Write` regenerates; refuses another `pg_dump` major), wired into `Test-CI.ps1` and `Test-MigrationsCloud.py`.
- **DB-SCHEMA-02.** V93 renames `appsheet_blank_refs` to `a000_blank_refs` on the nine tables so the normalizer fires first. New `Test-TriggerOrder.sql` holds the firing-order snapshot (81 rows for Payments, Loans, Charges, Repayments) and the "normalizer first" check, included from `Test-StatementBatch.sql`.
- **DB-SCHEMA-03.** Four plain indexes in V93: `allocations_charge_idx` ("Payment Allocations"."Ref Charge"), `repayments_allocation_idx` ("Repayments"."Ref Payment Allocation"), `cash_ledger_payment` ("Cash Ledger"."Ref Payment"), `settlements_partner_idx` ("Settlements"."Ref Partner"). Asserted in `Test-StatementBatch.sql`.
- **DB-SCHEMA-04.** Assertion in `Test-StatementBatch.sql` that `lc_monetary` is `C` and `money` text and numeric output are what the views and Node casts expect. The `money` type is kept.
- **DB-SCHEMA-05.** Kept as is: V26/V32/V53 are immutable. For new work, write full view definitions and keep business choices out of migrations. No change.
- **DB-SCHEMA-06.** `scripts/database/Production-Transaction.ps1` no longer lists release hops. The pending set must be exactly every manifest migration above the baseline through the target, contiguous, once each, with the manifest hash and migration directory matching. `Test-ProductionTransactionGuards.ps1` is one generic test (new CI step in `database.yml`); the old per-release test `tests/unit/production-transaction-independent.ps1` is removed.
- **DB-SCHEMA-07.** Already done in W3 under DB-BACKUP-04: `Invoke-CloudFlyway.py` uses the manifest-driven pending set (`test_cloud_flyway.py`). No change.
- **DB-SCHEMA-08.** Expand/contract is being followed. No change.
- **APP-OFFLINE-03.** App side: offline dataset polling every 5 minutes. See the app note.
- **Documents.** `database/README.md`, `docs/Development.md`, `project/Documents/Development_Changes.md` (R064 Wave 4 section), `Environment_Inventory.md`, `PWA_Data_Model_Overview.md`, `scripts/database/R053_OPERATOR.md`, `infrastructure/ecosystem-shared/README.md`, `integration-agent/docs/REVIEWER_DML.md`, `integration-agent/docs/POSTGRESQL_OPERATIONS.md`, `integration-agent/tests/lab/README.md`. Data Dictionary (helper, then `index` and `validate`): four indexes, nine trigger renames, "Cash Ledger" ACLs (table and `Created At`), `sync_cash_ledger` (definer, owner, body, ACL), schema `public` ACL, new `pwa_lock_key_v1` and schema `monitoring`, extension entry, and the stale "V91" text. All V93 values there are migration-source values, marked as such in each object's evidence; they are not live captures.

## Checks

Results from the working sessions; the orchestrator re-confirms the final run on the commits named below.

| Check | Result |
| --- | --- |
| `python3 scripts/dictionary/dictionary.py validate` (from `project/`) after the dictionary batch and `index` | Pass: 416 documents, 0 errors (414 before; two new objects) |
| Disposable PG18 proof of V93 (superuser): applied twice, only "already exists" notices; populated ledger sync under `mw_app_dev` and `mw_reviewer_dml`; direct ledger writes denied | Pass (Agent A, `proof.sql`) |
| Non-superuser `postgres` (Cloud SQL shape): closed ledger owner, V93 refused with `must be able to SET ROLE`, history stays at 92; applied with the temporary authority; `validate` clean; exact restoration; app-role ledger sync | Pass (`Run-R053OperatorIndependent.ps1 -LedgerOwner`, in the `phase8` group) |
| DEV `Invoke-Flyway.ps1 -Environment development -Command migrate`, then `validate` | V93 applied (history 93 success, checksum 1099189299); `validate` successful, 94 migrations. Runner exit 1 only at the post-migrate hook until the tunnel fix |
| DEV `application-role-cli.mjs --action post-migrate` | 0 violations, 494 statements; "Cash Ledger" SELECT only for `mw_app_dev` |
| DEV `owner-authority-cli.mjs restore` | `authority-restored`; repeat reports `authority-already-restored`; readback inherit f, set f, admin f for all four owners |
| `New-Release.ps1` for the tested commit `9eee10e` | Manifest written outside Git: 93 migrations, SHA256 `033b10fc...bea9c`; V93 hash matches |
| DEV schema drift proof: `Export-Schema.ps1` of DEV at V93, normalized, against `expected-v93-8dec0b4.normalized.sql` | Equal (empty diff); expected V92 hash `10ac37ea...ec5c8`, V93 `981fa91f...e867c` |
| DEV app deploy smoke (app note) | Pass: health 200, unauthenticated 401, origins, new Hosting marker, 0 errors in Cloud Run logs since the deploy |
| Agent C DB-LOCK-01 real-SQL race | Pass |
| Agent C DB-ACCESS-08 role proof | Pass |
| Agent C DB-LOCK-03 | Pass |
| Agent C `npm run check` | Pass: 517 of 517 |
| Agent C e2e | 129 passed, 1 skipped |
| Agent C phase5 | Fixture and stale-503 failures; being fixed on the app branch |
| `mw-db-ci` groups `receiving`, `phase5`, `phase8` | Pass (run 3b) |
| `mw-db-ci` group `migrations` at 93 migrations, trigger-order and ledger-access assertions, public-functions drift check | Run 2 failed in `Test-AccountOpeningCrud.sql` (permission on the r008 cutover table) until V93 granted the ledger owner its lock-only column; run 3 passed these steps. Final-commit confirmation: orchestrator |
| Terraform `ecosystem-shared`: `fmt -check`, `init`, refreshed `plan` | Pass: 0 add, 1 change, 0 destroy, flags only (plan sha256 `63ab9ac9…a18`) |
| `ruff check` on `agent-db-maintenance.py`; `unittest tests.test_operator_scripts` | Pass |
| Disposable lab run of the maintenance scripts (scaled copy of the PROD shape) | Pass: dry run, export, batched delete equal to the export, concurrent writer without lock timeouts, `VACUUM FULL`, rerun with 0 eligible, three guard refusals |

## Not run

| Item | Reason |
| --- | --- |
| V93, flags, `mw_agent` maintenance in PROD | Not authorized |
| Windows database CI | Linux route replaces it |
| Live PROD readback of the V93 ACLs | PROD not migrated; the PROD-scope dictionary values are source-derived (DEV readback matches) |
| Full `mw-db-ci` run on the final commit | Orchestrator, before publication |

## DEV migration record

Owner instruction: prompt authorization (16 October 2026) plus chat 17 October: "go ahead with the DEV migration once CI passes"; owner approved the tunnel identity rule and the temporary owner authority in chat. Target tuple: instance `appsheet-pg-prod-20260914`, database `loan_manager_dev`, user `postgres`, Linux IAP tunnel 127.0.0.1:15432 → Debian Auth Proxy. Source: branch `claude/review-w4-db` commit ca56ca8 (V93 SHA256 d4e7e547946d4cf534ccfb1b2ef08708c774fc1c6cfa49adcdc5a77692187013) plus the two tunnel-identity fixes and credential-path fix committed afterwards (tooling only; V93 unchanged).

| Step (UTC / Bangkok) | Command | Result |
| --- | --- | --- |
| Step 0 readback | read identity, pg_auth_members | journal/notify/jobs owners closed (grantor cloudsqladmin); audit owner inherit+set; ledger owner absent |
| 13:54 / 20:54 | `owner-authority-cli.mjs role --owner mw_ledger_owner_dev --apply` | `role-provisioned`: NOLOGIN NOINHERIT unprivileged; record `owner-authority-dev-role-c6dc213c….json` |
| 13:56 / 20:56 | `owner-authority-cli.mjs prepare` (ledger, notify, jobs, journal owners) `--apply` | `authority-prepared`; record `owner-authority-dev-prepare-a711db75….json` |
| 13:56:46 / 20:56:46 | `Invoke-Flyway.ps1 -Environment development -Command migrate` | V93 applied (`flyway_schema_history` 93 success, checksum 1099189299). Runner exit 1 only because the post-migrate hook refused the tunnel route (NULL server address); fixed under owner approval |
| 13:59–14:10 / 20:59–21:10 | `application-role-cli.mjs --action post-migrate --if-present` (plan, then `--apply`) | 0 violations, 494 statements; "Cash Ledger" SELECT only for mw_app_dev; EXECUTE on sync_cash_ledger and pwa_lock_key_v1; record `application-role-012543e7….json` |
| 14:11:48 / 21:11:48 | `owner-authority-cli.mjs restore --state <prepare> --apply` | `authority-restored`; repeat plan `authority-already-restored` |
| 14:13 / 21:13 | `Invoke-Flyway.ps1 -Environment development -Command validate` | validationSuccessful true, 94 migrations, Flyway 13.6.0 |

Readback after restore (read identity): postgres in ledger/notify/jobs/journal owners inherit f, set f, admin f (grantor cloudsqladmin); audit owner inherit+set unchanged; ledger owner has no other members; public CREATE only pg_database_owner and cloudsqlsuperuser; sync_cash_ledger owner mw_ledger_owner_dev, SECURITY DEFINER; "Cash Ledger" ACL: mw_app_dev SELECT, mw_app_dev_journal_owner INSERT/UPDATE/DELETE, mw_ledger_owner_dev INSERT/SELECT/UPDATE/DELETE, postgres owner; a000_blank_refs ×9, appsheet_blank_refs 0; four indexes present; pg_stat_statements 1.12 in schema monitoring; pwa_lock_key_v1 equality true.
Private records stay under ~/.mw-private/AppSheet-Loan-Project/flyway (0600), not in Git.

The dictionary keeps PROD-scope values; their evidence now says the DEV readback matches and PROD is source-derived until its migration.

## Prepared for a later go

Three separate requests. Each needs its own owner go; none is authorized now. Release file: `~/.mw-private/AppSheet-Loan-Project/flyway/release-9eee10e56974f04c464c70b1a815f70be9809c6c.json` (SHA256 `033b10fcba0ac18c437878880025cf5a5f78202b7588be3c93b509d191abea9c`, 93 migrations, V93 `d4e7e547946d4cf534ccfb1b2ef08708c774fc1c6cfa49adcdc5a77692187013`), written by `New-Release.ps1` from the tested commit `9eee10e56974f04c464c70b1a815f70be9809c6c`.

### (a) PROD V93

Backup reference needed: a restore-verified backup of `loan_manager_prod` at V92 from `Backup-ProductionPromotion.py` (its `cleanup.json` is the `--backup-proof`) and the Cloud SQL backup id. Expected effect: V93 as in DEV. The ledger projection becomes a definer owned by `mw_ledger_owner_prod`; `mw_app_prod` and `mw_reviewer_dml` lose direct "Cash Ledger" writes; four indexes, `a000_blank_refs`, `pwa_lock_key_v1`, `monitoring.pg_stat_statements`, and the `agent_audit` grants in Flyway history. No data change. Steps, in order:

```text
1. Drift check (read identity, never -Admin), exactly as in the promotion drift commands:
   - sha256sum -c the expected-file hash; Export-Schema.ps1 -Environment production; Normalize-Schema.ps1;
   - diff against expected-v92-8dec0b4.normalized.sql (SHA256 10ac37ea...ec5c8). Go only on an empty diff.
   (Method proof: the DEV export at V93 equals expected-v93-8dec0b4.normalized.sql, SHA256 981fa91f...e867c, empty diff.)
2. Backup: Backup-ProductionPromotion.py (isolated restore verified; copy to the private bucket). Record ids.
3. node scripts/database/owner-authority-cli.mjs role --environment production --owner mw_ledger_owner_prod \
     --approval-reference '<owner go>' --source-commit 9eee10e56974f04c464c70b1a815f70be9809c6c --backup-proof <backup cleanup.json> --apply
4. CONNECT preflight file and the productionTransaction block (baseline 92, target 93) pinned in the release file.
5. node scripts/database/owner-authority-cli.mjs prepare --environment production --owner mw_ledger_owner_prod \
     --approval-reference '<owner go>' --source-commit 9eee10e56974f04c464c70b1a815f70be9809c6c --backup-proof <backup cleanup.json> [--baseline-version 92] --apply
   Only the ledger owner is opened. The rehearsal proved V93 needs nothing else; DEV also opened the notify, jobs and journal owners
   only for the DEV post-migrate hook, which does not run in production.
6. Invoke-Flyway.ps1 -Environment production -Command migrate -ReleaseFile <manifest> -ApprovalReference '<owner go>' \
     -BackupReference '<verified backup>' -GroupedProduction -ConnectPreflightFile <file>
   (or the second path: Invoke-CloudFlyway.py apply --target prod with --connect-preflight-file)
7. Invoke-Flyway.ps1 -Environment production -Command validate
8. node scripts/database/owner-authority-cli.mjs restore --environment production --state <prepare record> --apply
9. Post-check: repeat the export and diff against expected-v93-8dec0b4.normalized.sql; read back the live ACLs and update the
   dictionary values that are still source-derived. Record paths and hashes in the promotion record (no secrets).
```

The PWA and API PROD promotion follows only after V93 (the new API calls `pwa_lock_key_v1`). Rollback: forward fix. V93 is additive except the ledger revokes, which a forward migration can re-grant; a restore from the backup needs separate authorization. A failed migrate applies nothing; still run step 8.

### (b) `mw_agent` maintenance (7-day retention)

Backup reference needed: an on-demand Cloud SQL backup (`gcloud sql backups create --instance=appsheet-pg-prod-20260914 --project=clever-oasis-508610-n7 --description="R064 DB-PERF-01 before 7-day agent audit retention"`, record the id) and a `pg_dump -Fc` of `mw_agent` restored into a disposable lab with per-table counts compared. Expected effect: about 681k operations, 1.47M events, 681k states and 222k job runs removed (about 0.84 GB of tuple data), exported first to `agent-audit-archive/`; `VACUUM FULL` takes `mw_agent` from about 1.8 GB to about 0.5 GB; steady state 0.6 to 0.7 GB; image nulling has 0 eligible rows, so nothing to run. Commands (cloud session, tunnel `bash scripts/database/cloud-db-tunnel.sh`, connection file private 0600):

```text
dry run: PYTHONPATH=/workspace/.setup/python-deps python3 integration-agent/scripts/agent-db-maintenance.py audit-retention --connection-file <f> --expect-environment production --output <private>/plan.json
apply:   ... audit-retention --connection-file <f> --expect-environment production --apply --batch 50 --work-directory <private> --token-source gcloud --readback --actor codex-cloud --output <private>/apply.json
         (about 2 h on the real instance; the agent can keep running; deleted counts must equal export counts)
window:  sudo systemctl stop 'mw-*.timer' mw-instagram-webhook.service; wait for no active mw-* worker;
         psql "host=127.0.0.1 port=15432 user=postgres dbname=mw_agent sslmode=disable" -X -v ON_ERROR_STOP=1 -f integration-agent/database/maintenance/vacuum-full-agent.sql
         then start the receiver and timers; mw-integration-agent check; relay health
```

The `VACUUM FULL` window can share the Saturday window of (c). The daily timer (`mw-audit-retention.timer`, 03:40 Asia/Bangkok, disabled) is activated only after the owner authorizes it and the two decisions in Open questions are settled. Rollback: restore rows from the verified archive (JSONL into `jsonb`, `INSERT ... SELECT (jsonb_populate_record(NULL::<table>, line)).*` in the order operations, events, operation_state, job_runs) or restore the `pg_dump`; an instance backup or PITR clone is the last resort because it also rewinds DEV and PROD. The timer is undone with `systemctl disable --now mw-audit-retention.timer`.

### (c) Cloud SQL flags

Backup reference needed: an on-demand Cloud SQL backup taken just before (`gcloud sql backups create ... --description="R064 DB-PERF-03 before flag restart"`, record the id). Plan (reviewed): pg_cron flags removed and `max_connections` 50; no preload flag is needed; 0 add, 1 change, 0 destroy. Expected effect: one restart of the shared instance (DEV, PROD and `mw_agent` unavailable about 1 to 5 minutes; reads retry, in-flight commands can end unknown and must be reconciled first). Window: Saturday 03:20 to 03:50 Asia/Bangkok (may share the `VACUUM FULL` window). Apply with `terraform plan -out` then `terraform apply` in `infrastructure/ecosystem-shared`; the provider is expected to hit the R057 maintenance-day 400 (nothing changes), then use the documented narrow fallback `gcloud sql instances patch appsheet-pg-prod-20260914 --project=clever-oasis-508610-n7 --database-flags=cloudsql.iam_authentication=on,max_connections=50 --quiet`, then a no-change re-plan. Post-checks: state RUNNABLE, flags exactly those two, maintenance window unchanged, `SHOW max_connections` 50, PWA DEV and PROD health smoke, agent check and relay health, `num_backends` under 50 for 30 minutes. Rollback: revert the `owned.tf` commit and apply again (restarts again), or patch the previous flag list (`cloudsql.enable_pg_cron=on`, `cron.database_name=loan_manager_prod`, `cron.max_running_jobs=1`, `cron.timezone=Asia/Bangkok`, `max_connections=200` plus `cloudsql.iam_authentication=on`) and run a no-change plan.

## Recovery

- Files: `git revert` the commits.
- V93 is additive and immutable once applied. Forward fix, not an edit. To undo behaviour in DEV: `ALTER FUNCTION public.sync_cash_ledger(text,text) SECURITY INVOKER` with the V23 body as `postgres` (needs the same temporary owner authority), then re-grant "Cash Ledger" INSERT/UPDATE/DELETE to `mw_app_dev` by the capability policy. The indexes and the trigger rename are harmless to keep; `ALTER TRIGGER a000_blank_refs ... RENAME TO appsheet_blank_refs` reverses the rename.
- Owner authority: `owner-authority-cli.mjs restore --state <record>` returns the exact prior tuple state; a repeat is a no-op. A failed migration applies nothing.
- Terraform flags: revert the `owned.tf` commit and apply again (another restart), or patch the full previous flag list with `gcloud sql instances patch`.
- `mw_agent` maintenance: rows are restorable from the verified export or a `pg_dump`; an instance restore would also rewind DEV and PROD and is a last resort.
- Dictionary: `git revert`; the helper reports no live state.

## Open questions

1. Reviewer payment-input edits fail with `42501` in `payment_crud_prepare_core_v83` since V83 (pre-existing, not caused by V93, which adds the lock-only grants it needs on "Cash Ledger"). Decide whether the reviewer path should be fixed or left.
2. Retention identity (decision for the daily timer). Only `postgres` can `SET ROLE mw_agent_owner`, and putting its password on the VM would give every agent process superuser rights. Recommended: agent migration V5 with the two foreign-key indexes, a NOLOGIN role `mw_agent_retention`, a `SECURITY DEFINER` purge function owned by `mw_agent_owner` that re-checks eligibility server-side, and membership for the agent IAM user (`INHERIT FALSE, SET TRUE`). Alternative: keep the run manual from a cloud session as `postgres`.
3. Bucket write for the VM (decision). A create-only IAM binding on `agent-audit-archive/` for `mw-integration-agent@` (role `objectCreator` with a prefix condition; Terraform snippet in the F report, kept out of the flags plan so the plan stays flags-only; applies without a restart). Also confirm the prefix itself, which is still a proposal.
4. Reader grants for `monitoring.pg_stat_statements` (`pg_read_all_stats`, USAGE) are a separate owner decision.

## Remaining work

- Owner go for (a) PROD V93, (b) `mw_agent` maintenance and (c) the flag restart, in that order of readiness; the app PROD promotion follows (a).
- Agent migration V5 (indexes on `runtime.operation_state(last_event_id)` and `runtime.job_runs(operation_id)`; the retention role and purge function if the owner picks that option), then the script mode switch, before the daily timer is activated.
- `scripts/backup-agent-database.py` hard-codes Windows binaries and a fixed dump name; add platform binaries and `--dump-name` before it is reused on Linux.
- Contract migration for the `pwa_job_runs` lease columns (DB-LOCK-02).
- Move the SQL bodies to `pwa_lock_key_v1` in the next migration that touches `pwa_submit_operation_v2` for a functional reason (needs journal-owner authority).
- DB-ACCESS-07: `verify-full` TLS needs a `server_ca_mode` change on the instance (unchanged from W3).
- Lesson for readbacks on the shared instance: use cheap single-scan counts. Two whole-tree queries hit their time limits and wrote about 2.7 GB of temporary files before they were cancelled; disk stayed at 10 GB and the instance stayed RUNNABLE.
- ALL-ARCH-03 cleanup (password roles, `NOLOGIN`) is unchanged from the W3 notes.
