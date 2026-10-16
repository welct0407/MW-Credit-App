# W4 database, access, locking and performance (16 October 2026)

## Purpose

Wave 4 database work for the independent review, on branch `claude/review-w4-db` from `main` 2b02f94. It adds one shared migration, V93 (SHA256 `d4e7e547946d4cf534ccfb1b2ef08708c774fc1c6cfa49adcdc5a77692187013`), and the tooling, tests, infrastructure plan and documents around it. The PWA and API side is in the [app note](CHANGE_NOTES_W4_APP_2026-10-16.md).

Authority: first (owner, 16 October 2026) new shared migrations in DEV from V93, DEV-side changes and preparing PROD changes; later the same day the owner instruction "Go ahead to execute all the steps until wave 4 is fully done" covered the PROD V93 migration, the `mw_agent` backup and purge, and the Cloud SQL change (see the PROD execution record). Read-only size readback of PROD `mw_agent` through the Debian route was allowed and done. V93 and the instance changes are applied in PROD (see "PROD execution record"); the `mw_agent` purge is running. The DEV run needed owner-approved tooling fixes (commit 9584b60: tunnel identity rule for the Auth Proxy route, credential path). DEV was migrated to V93 and verified on 16 October 2026 (21:13 Bangkok); see "DEV migration record". PROD followed at 22:17 Bangkok.

Owner decisions since: the dictionary entry for `pwa_lock_key_v1` is covered by the owner's prompt; `mw_agent` audit retention is 7 days (owner, 16 October); the Cloud Storage prefix `agent-audit-archive/` is accepted; the agent gets a retention role and purge function in migration V5; `VACUUM FULL` is postponed to the SSD move; the tier is `db-g1-small` with `max_connections` 200 (supersedes DB-PERF-03's 50).

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
- **DB-PERF-01.** Read-only PROD readback (sizes and counts only, no rows): `mw_agent` is 1,742 MB; `audit.events` 840 MB, `audit.operations` 629 MB, `runtime.operation_state` 139 MB, `runtime.job_runs` 119 MB. **0 stored receipt images**, so the suspected cause (images in the database) is refuted; the growth (about 60 to 100 MB a day, roughly 30,000 heartbeat operations a day) is audit and job rows. Run on PROD from 16 October (backup, dry run, purge; `VACUUM FULL` postponed): `integration-agent/scripts/agent-db-maintenance.py` (`null-archived-images`, `audit-retention`; dry run by default, connection file outside the repository, expected environment check) and `integration-agent/database/maintenance/vacuum-full-agent.sql`. Measured on a disposable scaled copy: delete in batches of 2,000 operation trees, about 90 s; `VACUUM FULL` cut a 1,653 MB lab copy to about 750 MB. The temporary foreign-key indexes the script builds are needed (without them one batch ran over 9 minutes and blocked a writer). Retention is one week by owner decision (16 October): `--older-than-days` defaults to 7 and cannot go lower; effectful and deterministic-key operations are never deleted. Disabled units `integration-agent/systemd/mw-audit-retention.service` and `.timer` (daily 03:40 Asia/Bangkok) are drafted, not installed. The text is in `integration-agent/docs/POSTGRESQL_OPERATIONS.md`. The GCS prefix is a proposal.
- **DB-PERF-02.** No performance defect at current scale. No change.
- **DB-PERF-03.** `infrastructure/ecosystem-shared/owned.tf`: the four `cron.*`/`pg_cron` flags removed, `max_connections` 200 to 50. Planned as 0 add, 1 change (flags in place), 0 destroy and applied the same day, with the tier raised and `max_connections` kept at 200 by owner decision. Daily peak connections are 12 to 13 since AppSheet retired; worst configured case is about 39 of about 47 usable. Applying restarts the shared instance (DEV, PROD and `mw_agent`).
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
| PROD drift check before and after V93 (read identity) | Pass apart from one accepted line (the capture-switch `application_name`) |
| PROD backup `Backup-ProductionPromotion.py --expected-version 92` with isolated restore | Pass, fingerprints match |
| PROD `migrate` and `validate` | V93 applied (92 to 93); `validate` successful, 94 migrations; authority restored in 57 s |
| PROD runtime and Hosting smoke | Pass (see Development Changes) |
| Retention dry run on PROD `mw_agent` | 682,425 operations in 226,464 trees eligible; 1,242 old trees kept; plan 153 s |
| `mw-db-ci` groups `receiving`, `phase5`, `phase8` | Pass (run 3b) |
| `mw-db-ci` group `migrations` at 93 migrations, trigger-order and ledger-access assertions, public-functions drift check | Run 2 failed in `Test-AccountOpeningCrud.sql` (permission on the r008 cutover table) until V93 granted the ledger owner its lock-only column; run 3 passed these steps. Final-commit confirmation: orchestrator |
| Terraform `ecosystem-shared`: `fmt -check`, `init`, refreshed `plan` | Pass: 0 add, 1 change, 0 destroy, flags only (plan sha256 `63ab9ac9…a18`) |
| `ruff check` on `agent-db-maintenance.py`; `unittest tests.test_operator_scripts` | Pass |
| Disposable lab run of the maintenance scripts (scaled copy of the PROD shape) | Pass: dry run, export, batched delete equal to the export, concurrent writer without lock timeouts, `VACUUM FULL`, rerun with 0 eligible, three guard refusals |

## Not run

| Item | Reason |
| --- | --- |
| `mw_agent` `VACUUM FULL` | Postponed to the SSD move (owner) |
| Authenticated PROD write or notification | Not done; the owner's next normal sign-in is the proof |
| Agent V5 and agent deploy | Pending in this session |
| Windows database CI | Linux route replaces it |
| Full-content comparison of ledger rows before and after in PROD | Not needed; V93 changes no data |

## DEV migration record

Owner instruction: prompt authorization (16 October 2026) plus chat the same day: "go ahead with the DEV migration once CI passes"; owner approved the tunnel identity rule and the temporary owner authority in chat. Target tuple: instance `appsheet-pg-prod-20260914`, database `loan_manager_dev`, user `postgres`, Linux IAP tunnel 127.0.0.1:15432 → Debian Auth Proxy. Source: branch `claude/review-w4-db` commit ca56ca8 (V93 SHA256 d4e7e547946d4cf534ccfb1b2ef08708c774fc1c6cfa49adcdc5a77692187013) plus the two tunnel-identity fixes and credential-path fix committed afterwards (tooling only; V93 unchanged).

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

## PROD execution record (16 October 2026)

Owner instruction, 16 October 2026 (Bangkok): "Go ahead to execute all the steps until wave 4 is fully done." Owner decisions in the same session: `mw_agent` audit retention 7 days; purge now and `VACUUM FULL` postponed to the SSD move; agent migration V5 for the retention role and purge function; archive prefix `agent-audit-archive/` accepted. Decisions applied by the sync-fix session: tier `db-g1-small`, Query Insights, `max_connections` back to 200 (this supersedes the 50 planned under DB-PERF-03); an SSD needs a new instance (separate later decision). Full detail, with the runtime and Hosting steps, is in [Development Changes, R064 production promotion](../project/Documents/Development_Changes.md#r064-production-promotion).

### (a) PROD V93: done

| Step (UTC / Bangkok) | Result |
| --- | --- |
| Drift check, 15:06 / 22:06 | PROD schema against expected V92: one difference, the `application_name` of `pwa_capture_notification_v1` (R053 capture switch, on in PROD by design; V93 does not touch it). Accepted |
| Backup, 15:08 / 22:08 | `Backup-ProductionPromotion.py --expected-version 92` (tool fix `b1126d4`): 32 tables, isolated restore passed, fingerprints match, dump SHA256 `09b4c124a5b797c2fac6c3a5b3a43f4f3db06842e189f287875574b1ab27fc73`, copied to `prod-backups/prod-promotion-06576951d49c4c3ea69ec104563a9a99/`. Cloud SQL backup `1792163475892` at 15:11 |
| Role, 15:13 / 22:13 | `owner-authority-cli.mjs role --environment production --owner mw_ledger_owner_prod --apply`: closed role provisioned |
| Preflight, 15:14 / 22:14 | CONNECT preflight from live readback: 16 retained consumers, no DEV sessions, head 92, 0 failed; preflight SHA256 `399fa183…cc4b`, release copy with `productionTransaction` 92 to 93 SHA256 `1a4b312a…053e` |
| Authority, 15:15 / 22:15 | `prepare` opened only `mw_ledger_owner_prod` |
| Migrate, 15:16 / 22:16 | `Invoke-Flyway.ps1 -Environment production -Command migrate` from the clean checkout `9eee10e` with `-GroupedProduction -ConnectPreflightFile`: success, 92 to 93, one migration |
| Restore, 15:16:22 / 22:16 | `restore --apply`: authority restored (window 57 s) |
| Validate, 15:17 / 22:17 | `validationSuccessful`, 94 migrations; post drift equals expected V93 except the same capture-switch line |
| Readback, 15:18 / 22:18 | `postgres` in the ledger owner inherit f, set f; `public` CREATE only `pg_database_owner` and `cloudsqlsuperuser`; `sync_cash_ledger` a definer owned by `mw_ledger_owner_prod`; "Cash Ledger": `mw_app_prod`, `mw_reviewer_dml`, `mw_integration_agent` SELECT, journal owner INSERT/UPDATE/DELETE, ledger owner INSERT/SELECT/UPDATE/DELETE; `pg_stat_statements` 1.12 in `monitoring`; PROD services 200 with no errors (the R063 app is compatible) |

The PROD runtime (image `8611c23d…`) and Hosting (`2b6c25c065f1a45a`) followed (Development Changes). Dictionary: the PROD-scope values now match this readback.

### (b) `mw_agent` 7-day retention: in progress

- Backup done: `pg_dump` SHA256 `baf28e2d7457553f2bd9d87514b825dbb7771b023c4782802699b4372185d92e`, full isolated restore passed, stored under `prod-backups/prod-promotion-83914936e38c459ba539e53e44f2cd1f/`; Cloud SQL backups `1792165191960` and `1792165979631` (taken before the instance patch).
- Dry run (`audit-retention`, cutoff 7 days, database 1,834 MB): 226,464 trees, 682,425 operations eligible, events 1,475,012, states 682,425, job runs 225,943, about 835 MB of rows; 1,242 old trees kept as protected; plan 153 s.
- Export done and verified: run `424cf0f8-ea6e-4572-9b91-446e037e7990`, cutoff 2026-10-09T16:04:41Z, 682,595 operations, 1,475,344 events, 682,595 states, 226,012 job runs, under `gs://mw-credit-operator-private-737787224638/agent-audit-archive/2026-10/424cf0f8-ea6e-4572-9b91-446e037e7990/` (sha256 readback per object). A second, incomplete export (`9256be5d…`) stayed local and is not used.
- Purge **paused, partial**. The first apply run deadlocked against agent writers after about 9.3k operations (all of them in the export) and rolled back its last batch; the lock order and a deadlock/lock-timeout retry were fixed (`fe7f731`). The rerun repeated the export, so `--resume-run` (`412b56b`) now deletes only rows found in an earlier verified export. Resuming ran about 10 s per 50-tree batch (HDD random reads, `pg_stat_statements`), and its `ALTER TABLE ... DISABLE TRIGGER` held SHARE ROW EXCLUSIVE locks that pushed agent inserts past their 3 s `lock_timeout`. That caused 32 lock timeouts and failed timer runs between about 00:26 and 00:35 Bangkok on 17 October. It was stopped; the agent recovered with no new errors after 00:36.
- Fix: agent V5 now gates `audit.reject_rewrite()` itself. A DELETE passes only for `mw_agent_owner` with the transaction-local `mw_agent.retention_purge` flag; UPDATE and TRUNCATE are always refused. The purge (script owner path and `audit.purge_routine_trees`) sets the flag instead of disabling triggers, so it holds row locks only. Trees go oldest first. V5 adopts the script's `maint_*` foreign-key indexes by rename when they are valid. Tests cover the gate, an agent insert during an open purge batch, and the index adoption.
- Agent V5 applied to PROD `mw_agent` at 17:47Z (13 s, from `57cefef`, `lock_timeout` 5 s). Role `mw_agent_retention` was created first as `postgres` with the bootstrap statement. Both valid `maint_*` indexes were renamed, not rebuilt; the triggers stay enabled. The agent IAM user holds `mw_agent_retention` (INHERIT FALSE, SET TRUE).
- Trial resume with the gate, at the owner's direction ("try purge now if the fix could make it faster; if still slow, stop it for SSD"), 17:47 to 17:58Z. Plan and archive check took 8.5 minutes. Deletes ran 2 minutes: 902 operations at about 6.5 per second, so the remaining ~670k would need about 29 hours on HDD. There were 0 agent lock timeouts, deadlocks or failed units. Stopped; the open batch rolled back, and no session or lock remains.
- Paused for the SSD move: resume from the same export (`--resume-run …424cf0f8…`, no re-export), then `VACUUM FULL`.
- Image nulling has 0 eligible rows.
- Pending: the agent deploy, the resumed purge and enabling the daily timer. The create-only bucket binding `agent_audit_archive_create` is applied (15:58:47Z, targeted apply, 1 added).

### (c) Cloud SQL: done, changed from the plan

Patch 15:42:54 to 15:49:21Z: tier `db-g1-small`, IAM flag, `max_connections` 50, Query Insights; second patch 15:54:56 to 15:55:37Z: `max_connections` 200. Post-checks: `max_connections` 200, no `cron.*` flags, `monitoring.pg_stat_statements` readable; the full `ecosystem-shared` plan on `0a3fd3b` shows no changes (`owned.tf` aligned with the live instance). Both restarts dropped the notify worker's connections briefly; it recovered.

## Recovery

- Files: `git revert` the commits.
- V93 is additive and immutable once applied. Forward fix, not an edit. To undo behaviour in DEV: `ALTER FUNCTION public.sync_cash_ledger(text,text) SECURITY INVOKER` with the V23 body as `postgres` (needs the same temporary owner authority), then re-grant "Cash Ledger" INSERT/UPDATE/DELETE to `mw_app_dev` by the capability policy. The indexes and the trigger rename are harmless to keep; `ALTER TRIGGER a000_blank_refs ... RENAME TO appsheet_blank_refs` reverses the rename.
- Owner authority: `owner-authority-cli.mjs restore --state <record>` returns the exact prior tuple state; a repeat is a no-op. A failed migration applies nothing.
- Terraform flags: revert the `owned.tf` commit and apply again (another restart), or patch the full previous flag list with `gcloud sql instances patch`.
- `mw_agent` maintenance: rows are restorable from the verified export or a `pg_dump`; an instance restore would also rewind DEV and PROD and is a last resort. Agent V5 is immutable once applied; its purge gate can be closed by a later migration restoring the V1 body of `audit.reject_rewrite()`.
- Dictionary: `git revert`; the helper reports no live state.

## Open questions

1. Reviewer payment-input edits fail with `42501` in `payment_crud_prepare_core_v83` since V83 (pre-existing, not caused by V93, which adds the lock-only grants it needs on "Cash Ledger"). Decide whether the reviewer path should be fixed or left.
2. Resolved by the owner on 16 October: retention identity is agent migration V5 (role plus purge function); the bucket binding and the `agent-audit-archive/` prefix are accepted and applied.
3. SSD: needs a new instance; separate later owner decision (also unblocks `VACUUM FULL` of `mw_agent`).
4. Reader grants for `monitoring.pg_stat_statements` (`pg_read_all_stats`, USAGE) are a separate owner decision.

## Remaining work

- After the SSD move: the resumed purge from export `424cf0f8…` (record its counts above), `VACUUM FULL`, the agent deploy, then enable the daily timer.
- `scripts/backup-agent-database.py` hard-codes Windows binaries and a fixed dump name; add platform binaries and `--dump-name` before it is reused on Linux.
- Contract migration for the `pwa_job_runs` lease columns (DB-LOCK-02).
- Move the SQL bodies to `pwa_lock_key_v1` in the next migration that touches `pwa_submit_operation_v2` for a functional reason (needs journal-owner authority).
- DB-ACCESS-07: `verify-full` TLS needs a `server_ca_mode` change on the instance (unchanged from W3).
- Lesson for readbacks on the shared instance: use cheap single-scan counts. Two whole-tree queries hit their time limits and wrote about 2.7 GB of temporary files before they were cancelled; disk stayed at 10 GB and the instance stayed RUNNABLE.
- ALL-ARCH-03 cleanup (password roles, `NOLOGIN`) is unchanged from the W3 notes.
