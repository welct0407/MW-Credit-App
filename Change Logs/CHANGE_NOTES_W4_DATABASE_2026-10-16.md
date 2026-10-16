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

PROD V93 (owner go, backup first):

```text
1. Verified restorable PROD backup of loan_manager_prod at V92 (Backup-ProductionPromotion.py); manifest from New-Release.ps1 for the tested commit.
2. node scripts/database/owner-authority-cli.mjs role    --environment production --apply   (mw_ledger_owner_prod)
3. node scripts/database/owner-authority-cli.mjs prepare --environment production --approval-reference <ref> --source-commit <sha> --backup-proof <file> --apply
4. Invoke-CloudFlyway.py apply --target prod (or Invoke-Flyway.ps1 -Environment production migrate -ReleaseFile ...), then validate
5. node scripts/database/owner-authority-cli.mjs restore --environment production --state <prepare record> --apply
6. Post-migrate reconciliation; Test-AccessMatrix readback; replace source-derived dictionary values with the PROD readback.
```

Cloud SQL flags: backup first, then the Terraform apply of `owned.tf` (expect the R057 maintenance-day 400, then the narrow `gcloud sql instances patch ... --database-flags=cloudsql.iam_authentication=on,max_connections=50`), then a no-change plan. Window proposal: Saturday 03:20 to 03:50 Asia/Bangkok. Steps and checks are in `infrastructure/ecosystem-shared/README.md`.

`mw_agent` maintenance: stop agent writers, take an on-demand backup and a `pg_dump -Fc`, tunnel as `postgres`, dry run of `agent-db-maintenance.py audit-retention`, then `--apply`, then `vacuum-full-agent.sql`. Needs the owner's go and the open decisions below.

## Recovery

- Files: `git revert` the commits.
- V93 is additive and immutable once applied. Forward fix, not an edit. To undo behaviour in DEV: `ALTER FUNCTION public.sync_cash_ledger(text,text) SECURITY INVOKER` with the V23 body as `postgres` (needs the same temporary owner authority), then re-grant "Cash Ledger" INSERT/UPDATE/DELETE to `mw_app_dev` by the capability policy. The indexes and the trigger rename are harmless to keep; `ALTER TRIGGER a000_blank_refs ... RENAME TO appsheet_blank_refs` reverses the rename.
- Owner authority: `owner-authority-cli.mjs restore --state <record>` returns the exact prior tuple state; a repeat is a no-op. A failed migration applies nothing.
- Terraform flags: revert the `owned.tf` commit and apply again (another restart), or patch the full previous flag list with `gcloud sql instances patch`.
- `mw_agent` maintenance: rows are restorable from the verified export or a `pg_dump`; an instance restore would also rewind DEV and PROD and is a last resort.
- Dictionary: `git revert`; the helper reports no live state.

## Open questions

1. Reviewer payment-input edits fail with `42501` in `payment_crud_prepare_core_v83` since V83 (pre-existing, not caused by V93, which adds the lock-only grants it needs on "Cash Ledger"). Decide whether the reviewer path should be fixed or left.
2. `mw_agent` audit retention is 1 week; the heartbeat volume decision (stop persisting no-op cycles) is still the largest lever and needs the agent owner.
3. Is `agent-audit-archive/` the export prefix? (A proposal only.)
4. Reader grants for `monitoring.pg_stat_statements` (`pg_read_all_stats`, USAGE) are a separate owner decision.

## Remaining work

- PROD promotion with the sequence above (the DEV run is the rehearsal).
- Contract migration for the `pwa_job_runs` lease columns (DB-LOCK-02).
- Move the SQL bodies to `pwa_lock_key_v1` in the next migration that touches `pwa_submit_operation_v2` for a functional reason (needs journal-owner authority).
- Agent migration V5: indexes on `runtime.operation_state(last_event_id)` and `runtime.job_runs(operation_id)` (missing foreign-key indexes).
- `scripts/backup-agent-database.py` hard-codes Windows binaries and a fixed dump name; add platform binaries and `--dump-name` before it is reused on Linux.
- Install the `mw-audit-retention` timer only after the owner authorizes scheduled activation (units are drafts in the agent tree).
- ALL-ARCH-03 cleanup (password roles, `NOLOGIN`) is unchanged from the W3 notes.
