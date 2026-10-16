# W3 operations, database tooling, CI and infrastructure (16 October 2026)

## Purpose

Wave 3 operations work for the independent review, on branch `claude/review-w3-ops` from `main` 3678eb6. It covers database access and backups, database CI, repository CI, toolchain, infrastructure hygiene and the records the owner asked for. Owner decisions of 16 October 2026 (option A) apply. No new migration, no PROD Hosting or Cloud Run change, no Debian host write. The only PROD database changes are the two access changes the owner approved later that day (DB-ACCESS-01, DB-ACCESS-03).

## Owner decisions (16 Oct)

The orchestrator relayed both instructions verbatim, at about 08:30 and 08:44 UTC: "Variant 1 for the tunnel; delete the key; revoke DELETE only", then "1 go + retire, 2 go, 3–6 as recommended".

- DB-ACCESS-01 PROD: go. Revoke DELETE only; `LOGIN` stays (no `NOLOGIN`). Retire the reviewer DELETE catalogue path (done on the agent branch: `reviewer_delete_enabled` is refused, `configure-reviewer-dml.py` and `business-grants.sql` grant DELETE only on "Cash Ledger"; the native command-API delete gets its own switch).
- DB-ACCESS-03 PROD: go for CONNECT on `loan_manager_prod` and `mw_agent` for `codex-cloud-read`.
- DB-ACCESS-05: keeping `mw-credit-app-read-dev` is confirmed.
- ALL-ARCH-03: the two password roles (`mw_reviewer_dml`, `mw_receipt_projector`) stay until W4. Accepted.
- ALL-INFRA-01: delete the old key. Done.
- AGT-WEBHOOK-03: Variant 1 (tunnel `^/instagram$`, uptime check re-pointed). Done.

## Changes

- **DB-ACCESS-01.** DEV: nine `REVOKE DELETE` from `mw_reviewer_dml` in `loan_manager_dev`. PROD: `REVOKE DELETE` on the eight source tables in `loan_manager_prod`. DELETE on `"Cash Ledger"` is kept in PROD. Reason: the security-invoker trigger `zz_cash_source` (function `cash_source_changed`) runs on INSERT/UPDATE of Payments, Loans, Settlements and Business Expenses. It calls `sync_cash_ledger`, which deletes `"Cash Ledger"` rows with the caller's rights. `integration-agent/scripts/configure-reviewer-dml.py` grants that DELETE for this reason. `LOGIN` stays. No V93.
- **DB-ACCESS-02.** Ordinary CRUD stays the accepted correction path. Documented in `project/Documents/PWA_Data_Model_Overview.md`. New `scripts/database/Test-AccessMatrix.sql` and `Test-IamRolePrerequisites.sql`.
- **DB-ACCESS-03.** IAM user `codex-cloud-read@` with `pg_read_all_data` and CONNECT on `loan_manager_dev`, `loan_manager_prod` and `mw_agent`; Linux `Get-DbEnvironment` uses it by default; `-Admin` only for `Invoke-Flyway.ps1` and the 23 writing scripts in `scripts/database` plus six Metabase `Grant-*` scripts. Files: `scripts/database/Common.ps1`, `database/README.md`, `infrastructure/unattended-admin/main.tf`, `project/scripts/metabase/Grant-*.ps1`.
- **DB-ACCESS-04.** Recorded only. No bypass exists; the optional hardening is not done.
- **DB-ACCESS-05.** Dropped IAM user `mw-credit-app-dev@`. Kept `mw-credit-app-read-dev@` because the DEV reader still uses it.
- **DB-ACCESS-06.** Recorded only. Kept as is; changed with the next migration that touches those functions.
- **DB-ACCESS-07.** `database/environments.json` and `Common.ps1` use `verify-ca` with the pinned instance CA; new `scripts/database/server_ca.py` (wrong pin refused); `Backup-ProductionPromotion.py` uses it. `verify-full` is remaining work.
- **DB-BACKUP-01.** Restore rehearsal done; procedure and result in `project/Documents/Rules/Release_Recovery_Runbook.md`.
- **DB-BACKUP-02.** 25 superseded `Backup-*` scripts deleted, 4 kept; reference fixed in `project/scripts/analysis/README.md`.
- **DB-BACKUP-04.** `scripts/database/Invoke-CloudFlyway.py` now uses the IAP tunnel and the manifest-driven pending set; new read-only `verify` mode; production `check` and `apply` reuse the PowerShell guard and need `--connect-preflight-file`. Documented as the second PROD path in `database/README.md`.
- **DB-BACKUP-05.** Lifecycle on `mw-credit-operator-private-737787224638`: `prod-backups/` objects deleted at 180 days, noncurrent copies 30 days later. File: `infrastructure/ecosystem-shared/operator-private.tf`.
- **DB-CI-01.** Linux database CI: `Get-PgTool`, `Start-PgServer`, `Stop-PgServer` in `Common.ps1`; all four groups run on Linux; `mw-db-ci` in `project/scripts/cloud-session-setup.sh`.
- **DB-CI-02.** Five suites (plus two chained) wired into `Test-StatementBatch.sql`; fixtures updated; 16 dead `Test-*.sql` and `Test-LumpSumAppFinalization.sql` deleted. Two `Test-LumpSum` assertions removed because the behaviour no longer exists (V59 removed the posted-amount guard; since V6 every Processing receipt posts in the same statement).
- **DB-CI-03.** `Test-LumpSumConcurrency.ps1` deleted (covered by `Test-CorePaymentConcurrency.ps1`, whose race the V59 global cash-pool lock keeps), plus the R002, R005 and R008 concurrency suites.
- **DB-CI-04.** Not reproduced; done earlier.
- **DB-CI-05.** Grant-matrix test (table grants, routine grants, memberships, four spot checks). It asserts migration-owned grants only.
- **ALL-CI-01, ALL-CI-02, ALL-CI-09.** Done in W1/W2; main is green and branch protection requires "Development checks result". Recorded. Branch protection cannot be set from a session.
- **ALL-CI-03.** Terraform job validates all 20 directories and runs `terraform test` in 5 (7 files). `.github/workflows/ci.yml`.
- **ALL-CI-04.** Biome 2.5.14 (one devDependency, `npm run lint`, formatter off, non-blocking job; `biome.json`). Ruff 0.16.8 on `integration-agent` with the agent's `pyproject.toml` rules, blocking (flipped after the agent branch merged, PR #30).
- **ALL-CI-05.** All actions pinned to commit SHAs.
- **ALL-CI-06.** Bridge workflow runs on PRs and main pushes only, with a concurrency group (`grafana-mcp-bridge.yml`).
- **ALL-CI-07.** Not in scope; no change.
- **ALL-CI-08.** Clean-tree guard after the check, e2e and database jobs.
- **APP-TEST-02 (cross-reference).** `services/**`, `tests/integration/**` and `scripts/rehearsal/**` trigger `database.yml`; the database workflow runs on ubuntu-latest with a `windows-latest` dispatch input; e2e runs by changed paths, no label; concurrency groups on every workflow.
- **AGT-TEST-01 (workflow side).** `agent-tests.yml` gets the `lab` job (PostgreSQL 18, Flyway 13.6.0, Python 3.13, `requirements.lock`, `tests/lab/setup.sh`).
- **ALL-STD-01, 02, 04.** Node side (business-date module, identity module, log helper) is in the app branch. Ops records only, plus the documentation in `docs/Development.md` (error codes, request ids, time zone constants).
- **ALL-STD-03.** Error-code catalogue section in `docs/Development.md`.
- **ALL-INFRA-01.** Key `f6729ca0...` of `codex-cloud` disabled first, then deleted on the owner's decision (16 October). One user-managed key remains. Terraform declares the Owner bindings (with `prevent_destroy`), the custom role and the new service account. Rotation note (90 days at first; changed to every 2 years by the owner on 16 October 2026, next due 15 October 2028) in `infrastructure/unattended-admin/README.md`.
- **ALL-INFRA-02.** `default-allow-ssh` and `default-allow-rdp` deleted; IAP SSH rule confirmed; `default-allow-icmp` and `default-allow-internal` imported (`infrastructure/ecosystem-debian`).
- **ALL-INFRA-03.** Imported the Owner bindings, the custom role and the uptime check (`unattended-admin`, `ecosystem-debian`). No Editor binding exists. For AGT-WEBHOOK-03 Variant 1 the uptime check now calls `GET /instagram` and expects 403 with `Forbidden` (`ecosystem-debian/owned.tf`).
- **ALL-INFRA-04.** Debian VM `deletion_protection = true`; snapshot policy and its disk attachment imported; restore-to-new-VM rehearsal done (257 s), recorded in the agent operations runbook on the agent branch.
- **ALL-INFRA-05.** Recorded only; covered by the APP-PAY-03 request budget on the app branch.
- **ALL-INFRA-06.** Artifact Registry cleanup policy on the PROD and bridge repositories (keep 20 most recent, keep tag prefix `keep`, delete older than 30 days); digests pinned with `keep-*` tags in the inventory. DEV repository is in the app branch.
- **ALL-INFRA-07.** Azure hooks removed from `.claude/settings.json`; `scripts/azure-cloud-session.sh` mints a per-command token into a 0600 temporary file removed on exit; new `scripts/vm01-power.sh start|deallocate|restart`; `CLAUDE.md` updated.
- **ALL-ARCH-03 (Terraform side).** Cloud SQL IAM user `mw-integration-agent@` and `roles/cloudsql.instanceUser` on the shared instance, no database roles (`ecosystem-debian`). The GRANTs and host changes are prepared for the agent deploy.
- **ALL-ARCH-06.** Covered by the tests and documentation above; no further change.
- **ALL-ARCH-07.** Module rename `modules/dev-workers` to `modules/workers` is in the app branch.
- **ALL-ARCH-08.** One "naming legacy" paragraph in `database/README.md`.
- **ALL-MON-03.** No change; owner-performed Metabase and Railway checks are a pending row in the inventory.
- **ALL-COST-01.** No change; owner creates one GCP budget (pending row in the inventory). Grafana work is deferred to the owner's revamp entry.
- **Toolchain.** Biome and ruff as above; `package.json`/`package-lock.json` get only the linter devDependency and `lint` script.
- **Documents.** `docs/Development.md`, `database/README.md`, `PWA_Data_Model_Overview.md`, `Environment_Inventory.md`, `Development_Changes.md` (R063 Wave 3 section, stale `deploy-dev.yml` row removed), `Release_Recovery_Runbook.md`, `infrastructure/unattended-admin/README.md`.

## Checks

| Check | Result |
| --- | --- |
| `mw-db-ci` (all four groups, Linux) | Pass, 489 s |
| GitHub CI on `03a027f`: Development checks run 38870234577 (manual dispatch, the one CI run) | Pass: check, e2e shards 1–3, terraform (fmt, 20 roots validated, tests) and the aggregate `Development checks result`; the Biome `lint` job reported findings and failed as designed (non-blocking) |
| GitHub CI on `03a027f`: Database migrations run 38870209133 (push) | Pass: guards and the four Linux rebuild groups (migrations, receiving, phase5, phase8) |
| Migration routes | 5 routes pass |
| Node tests for database-backed suites | 196 of 196 pass |
| Independent tester on the database changes | Pass |
| `python3 -m unittest` in `scripts/database` | 25 of 25 after fixes |
| `npm test` | 459 of 459 |
| Biome (`npm run lint`) | 43 errors, 766 warnings, 116 infos, mostly in app files; non-blocking |
| Ruff | Blocking subset (E9, F63, F7, F82): 0 on ops and agent trees; full config clean after the agent merge, now blocking |
| `actionlint` | Pass |
| `terraform fmt -check` | Pass |
| `terraform validate`, all roots | 20 directories pass; `terraform test` 7 files, 39 tests pass |
| Terraform plans | `unattended-admin`: 4 imports, 5 adds, 0 changes, 0 destroys. `ecosystem-debian`: 5 imports, 2 adds, 1 change (deletion protection), 0 destroys. Production and bridge: cleanup policy only. `ecosystem-shared`: 1 change (lifecycle). Re-plan after apply: no changes in each |
| Negative proofs for `Test-AccessMatrix.sql` | Revoked EXECUTE on `pwa_job_run_v1`, an extra SELECT on `pwa_job_runs` and a removed command-user membership each fail the test |
| `Invoke-CloudFlyway.py verify --target dev` | `verified: true`, V92, 91 applied, 0 pending, 0 writes (nothing pending, so validate only) |
| Refresh-only plan through the Azure wrapper | Authenticated; VM-01 read as deallocated; nothing applied |

## Not run

| Item | Reason |
| --- | --- |
| Other PROD database statements (ALL-ARCH-03 grants) | Wait for the agent deploy go |
| Debian host changes | Prepared in the agent note; applied with the agent deploy |
| Windows database CI run | Linux route replaces it; the `windows-latest` dispatch exists but was not run |
| `lab` CI job | Red on this branch alone until the agent branch merges |
| Full-suite Playwright | Not warranted; no PWA change on this branch |

## Live changes applied

| What | Command | Readback |
| --- | --- | --- |
| Disable `codex-cloud` key `f6729ca0...` (ALL-INFRA-01) | `gcloud iam service-accounts keys disable f6729ca08daef9c25c24e5954a12b897d3b19aa9 --iam-account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com` | `disabled=True`; the in-use key `37df51c6...` still works |
| `unattended-admin` Terraform apply | Terraform apply of the reviewed plan | 4 imported, 5 added; re-plan no changes |
| Delete default SSH and RDP rules (ALL-INFRA-02) | `gcloud compute firewall-rules delete default-allow-ssh default-allow-rdp` | Both gone (both disabled since 2026-09-21); IAP rule, icmp and internal remain |
| `ecosystem-debian` Terraform apply | Terraform apply of the reviewed plan | 5 imported, 2 added, deletion protection true, VM RUNNING; re-plan no changes |
| Restore-to-new-VM rehearsal (ALL-INFRA-04) | Temporary VM from the snapshot, isolated by two deny-all rules | 257 s total; Debian 13, fsck clean; all temporary objects deleted |
| Artifact Registry cleanup policy (ALL-INFRA-06) | Terraform on PROD and bridge repos; dry run, then enforced | Dry run computed 0 deletions; enforced (`cleanupPolicyDryRun=False`) |
| Backup lifecycle (DB-BACKUP-05) | Terraform in `ecosystem-shared` | Rule at 180 days on `prod-backups/`; 1 change |
| `REVOKE DELETE ... FROM mw_reviewer_dml` on nine tables in `loan_manager_dev` (DB-ACCESS-01) | As `postgres` | 0 DELETE rows remain; `rolcanlogin` still true (instance-wide); no CONNECT on `loan_manager_dev` already |
| `GRANT pg_read_all_data` and `GRANT CONNECT ON DATABASE loan_manager_dev` to `codex-cloud-read@` (DB-ACCESS-03) | As `postgres` | Impersonated reads work; INSERT, UPDATE, DELETE denied; connect to `loan_manager_prod` refused |
| `GRANT SELECT ("Partner Role") ON public."Partners"` to `mw-credit-app-read-dev@` | As `postgres` in `loan_manager_dev` | Granted; mirrors PROD |
| Restore rehearsal clone (DB-BACKUP-01) | Throwaway `db-f1-micro` instance, backup restore, four counts-only CSV exports, delete | Schema history identical; clone, CSVs and temporary bucket grants removed |
| Delete `codex-cloud` key `f6729ca0...` (ALL-INFRA-01, owner decision 16 October) | `gcloud iam service-accounts keys delete f6729ca08daef9c25c24e5954a12b897d3b19aa9 --iam-account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com --quiet` at 08:35:56Z | `keys list --managed-by=user` shows only `37df51c6...`; `gcloud auth print-access-token` ok |
| Re-point uptime check `mw-webhook-external-health-ySLl0784KgI` (AGT-WEBHOOK-03 Variant 1, step A) | Terraform `ecosystem-debian`, applied 08:36:53Z. Before: `curl https://hooks.mw-credit.com/instagram` gave 403 `Forbidden` | Plan 0 add, 1 change, 0 destroy (uptime check only); re-plan no changes; config `/instagram`, 403, `Forbidden`; `check_passed` true from Singapore and Oregon. The tunnel path change followed (agent note) |
| PROD `REVOKE DELETE ON public."Borrowers", public."Business Expenses", public."Cash Pool Contributions", public."Charges", public."Loans", public."Payments", public."Repayments", public."Settlements" FROM mw_reviewer_dml;` (DB-ACCESS-01, owner go) | One transaction in `loan_manager_prod`, as `postgres` through the IAP route, 08:45:31Z | Before: DELETE on the nine tables. After: only `"Cash Ledger"` DELETE remains. Diff of 1,044 table and column privilege rows: exactly the eight DELETE rows removed, nothing added. `rolcanlogin` true |
| PROD `GRANT CONNECT ON DATABASE loan_manager_prod` and `mw_agent` to `codex-cloud-read@...iam` (DB-ACCESS-03, owner go) | As `postgres`, 08:45:45Z | CONNECT true on `loan_manager_dev`, `loan_manager_prod`, `mw_agent`. Impersonated: `loan_manager_prod` `flyway_schema_history` 92 rows; `UPDATE public."Partners" ... WHERE false` permission denied (rolled back); `mw_agent` catalogue query ok. No borrower rows read |
| Drop `mw-credit-app-dev@...iam` (DB-ACCESS-05) | `gcloud sql users delete mw-credit-app-dev@clever-oasis-508610-n7.iam --instance=appsheet-pg-prod-20260914 --quiet` at 07:50:27Z, after a read-only check found no owned objects or grants | User gone; remaining DEV IAM users `-read-`, `-command-`, `-jobs-`, `-notify-dev`, `codex-cloud`, `codex-cloud-read` |
| Read route restored after ALL-ARCH-03 (owner: "Fix that issue") | Cause: from 10:20Z the 5433 `auto-iam-authn` listener shared one proxy process with 5432, so 5432 used the VM's IAM certificate and refused `codex-cloud-read` token logins. Fix 11:49Z: 5433 in its own unit `cloud-sql-auth-proxy-iam.service`; steps, rollback test and agent health in the [agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#read-route-fix-16-october-2026) | Through `cloud-db-tunnel.sh` as `codex-cloud-read`: `loan_manager_dev` and `loan_manager_prod` 92; UPDATE denied (rolled back); `Invoke-CloudFlyway.py verify --target prod` 0 pending, 0 writes. Route and scripts unchanged |

## Prepared for a later go

ALL-ARCH-03 (with the agent deploy):

```sql
ALTER ROLE "mw-integration-agent@clever-oasis-508610-n7.iam" NOINHERIT;
GRANT mw_agent_worker, mw_agent_relay, mw_integration_agent TO "mw-integration-agent@clever-oasis-508610-n7.iam" WITH INHERIT FALSE, SET TRUE;
GRANT CONNECT ON DATABASE mw_agent, loan_manager_prod TO "mw-integration-agent@clever-oasis-508610-n7.iam";
```

## Recovery

- Files: `git revert` the commit.
- Terraform changes: revert the commit, then `terraform plan` and apply the reviewed result. Imports are removed from state with `terraform state rm`, never by destroy. Do not destroy the Owner bindings (`prevent_destroy`).
- Deleted key: it cannot be restored. A machine that still needs `codex-cloud` gets a new key from the owner (rotation procedure in `infrastructure/unattended-admin/README.md`).
- Uptime check: set path `/health`, status 200 and content `mw-instagram-webhook` in `ecosystem-debian/owned.tf` and apply (only after the tunnel path is set back to null).
- Firewall: re-create `default-allow-ssh` and `default-allow-rdp` from the definitions recorded before deletion (create them disabled, as they were since 2026-09-21). The IAP rule is the admin path.
- PROD reviewer DELETE: `GRANT DELETE ON` the eight source tables `TO mw_reviewer_dml` in `loan_manager_prod`, as `postgres`.
- PROD read CONNECT: `REVOKE CONNECT ON DATABASE loan_manager_prod FROM "codex-cloud-read@clever-oasis-508610-n7.iam";` and the same for `mw_agent`.
- DEV grants: `GRANT DELETE` on the same nine tables `TO mw_reviewer_dml` in `loan_manager_dev`. The reader column grant and `codex-cloud-read` grants are reverted with `REVOKE`.
- Dropped IAM user: `gcloud sql users create mw-credit-app-dev@clever-oasis-508610-n7.iam --instance=appsheet-pg-prod-20260914 --type=CLOUD_IAM_SERVICE_ACCOUNT`; it owned nothing.
- Backup lifecycle and Artifact Registry policy: remove the rule from Terraform and apply; nothing has been deleted by them yet.
- Debian deletion protection: set `deletion_protection = false` and apply.

## Open questions

1. DB-ACCESS-07: `verify-full` needs a `server_ca_mode` change on the instance. Later wave?
2. Low: `codex-cloud-read` can also connect to the `postgres` database through PUBLIC CONNECT.

## Remaining work

- `verify-full` plus the `server_ca_mode` change; then `connector_enforcement=REQUIRED` once VM-01 uses the Auth Proxy.
- About 60 old one-off Python scripts still use `sslmode=require`; current ones outside this branch: `scripts/dictionary/capture_postgresql.py` and `project/scripts/metabase/chart_service/provision_role.py`.
- Make Biome blocking once the TS/JS tree is clean (43 errors, mostly app files).
- Regenerate `package-lock.json` on merge with the app branch (`npm install --package-lock-only`).
- `tests/integration/agent-native-operation-independent.test.mjs` has a one-line pwsh fix; the app branch does not change that file. `tests/integration/Run-Phase5.ps1` carries the same one-line addition as the app branch (merges cleanly). `Run-Phase5.ps1 -ManagementOnly` lists `business-money-reads-independent.test.mjs`, which warns and skips until the app branch merges.
- A future DEV reviewer target (W4, `mw_reviewer_dml_dev`) must be granted DELETE on `"Cash Ledger"` for the `zz_cash_source` trigger. The nine DEV revokes from `mw_reviewer_dml` stay as they are.
- W4 first item DB-ACCESS-08 (owner, 16 October 2026; added to the overall backlog): make `sync_cash_ledger()` `SECURITY DEFINER` (owned by a ledger-owner role, pinned `search_path`) so callers no longer need DELETE on `"Cash Ledger"`; then revoke direct ledger writes from `mw_reviewer_dml` and the app roles and assert it in `Test-AccessMatrix.sql`. Needs a migration, so it runs when W4 is authorized.
- ALL-ARCH-03 grants with the agent deploy (Prepared above). DB-ACCESS-06 with the next migration that touches those functions. ALL-ARCH-04 after W4.
