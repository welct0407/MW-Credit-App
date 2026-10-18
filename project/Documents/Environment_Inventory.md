# Current environment inventory

Updated 18 October 2026 from existing deployment evidence (R074 Hosting-only promotion, R072 About screen on DEV Hosting, R069 runtime and agent, R068 schema V95). This is the only document that holds deployment pins (Hosting versions, Cloud Run revisions and image digests, Debian commit, Flyway version). Other documents link here. No unrelated live audit was performed; use [release tracker](Release_Tracker.md) for release status.

| Component | DEV | PROD |
| --- | --- | --- |
| Origin | https://dev-lm.mw-credit.com | https://lm.mw-credit.com |
| Firebase Hosting site | mw-credit-app-dev-737787224638 | mw-credit-prod-737787224638 |
| Business database | loan_manager_dev | loan_manager_prod |
| Cloud Run workers | mw-credit-app-notify-dev / mw-credit-app-jobs-dev | mw-credit-app-notify-prod / mw-credit-app-jobs-prod |
| Worker time zone | Asia/Bangkok | Asia/Bangkok |

Google project: `clever-oasis-508610-n7` (737787224638), region `asia-southeast1`. Shared Cloud SQL: `mw-credit-pg-20261017` (PD_SSD 10 GB, tier `db-g1-small`, POSTGRES_18), public IP `136.85.127.134` (identity pin only: access is through Cloud SQL connectors/Auth Proxy, DB-ACCESS-07; VM-01 starts its pinned proxy on demand at `127.0.0.1:15432`), restored from a backup of `appsheet-pg-prod-20260914` on 17 October 2026 (Bangkok; backup `1792178023102`). Verify the complete project/instance/database tuple for any operation. Query Insights, `cloudsql.iam_authentication=on` and `max_connections` 200; no `cron.*` flags; `pg_stat_statements` 1.12 is readable in schema `monitoring`. The previous HDD instance `appsheet-pg-prod-20260914` (`34.21.174.215`) was DELETED on 17 October 2026 03:26 Bangkok (owner); its 21 backups are retained (FINAL until 15 November 2026, on-demand without expiry incl. `1792178023102` and `1792181705210`) and can be restored into a new instance. The IAM conditions name only the new instance, and the services accept only the new name (`services/lib/identity.mjs`; R067).

Private receipts: `gs://mw-payment-receipts-prod-508610-n7`. Agent originals and manual uploads retain their existing validated paths. Public access is not enabled. AppSheet connection records are removed; current service identities own access. Do not restore old store keys.

Schema state (V93 to V95, no repeat needed): post-migrate role reconciliation 0 violations; temporary owner authority restored exactly. `mw_ledger_owner_dev` and `mw_ledger_owner_prod` are provisioned closed (NOLOGIN, no other members) and own the `sync_cash_ledger` definer. In PROD, "Cash Ledger": `mw_app_prod`, `mw_reviewer_dml` and `mw_integration_agent` SELECT only, journal owner INSERT/UPDATE/DELETE, ledger owner all four; DEV `mw_app_dev` has SELECT only. V94 retired the lease columns and shared lock key; V95 added the reviewer/projector identity pair. Pre-V93 PROD backups: dump `09b4c124…`, Cloud SQL backup `1792163475892`.

## Latest verified deployments

One pin per cell, one row per target. Rollback entries are the previous verified value. Narrative is in the linked promotion record (permalinks at commit `cbc8843`, where the section still exists).

### Firebase Hosting

| Target | Hosting version | Release / public version | Verified | Rollback version | Record |
| --- | --- | --- | --- | --- | --- |
| DEV | `5057ec71cae7079e` | release `1792307275218000`; public `edc25e55f69e35f929f04939`; entry `/assets/index-DOu8wrP1.js` | R072 claim-before-prune cache fix, source `3cbe36a` (PR CI green), 18 October 2026; marker no-store on both hosts; same DEV build inputs as the R072 About build (DEV web app `appId`, `VITE_COMMAND_MODE=dev-owner-testing`, notifications unset) | `012ec4be805d719b` (R072 button alignment, source `53cf07d`, public `c6648d0b7316fa49456b575a`); earlier `3b9239bc2a6bc659` (R072 cache fix) and `fe7eaaa40b48ebff` (R071) | [R072 About screen](https://github.com/welct0407/MW-Credit-App/blob/c8257ae68e082901fc28ab393be5c532b0526236/project/Documents/Development_Changes.md#r072-about-screen) |
| PROD | `047af2dcdd4016e2` | release `1792332604127000`; public `48e174c49ec578d20ba7efab`; entry `/assets/index-J612-CT8.js` | R074, source `b88653d4b84860b7eab622d0edfb472d851c03ce`, about 14:09Z 18 October 2026 (21:09 Bangkok), 15 of 15 files byte-identical on both hosts, package `012d4c6b...` | `191483d8f3f5ef87` (R073, release `1792318600122000`, public `085badcaf50ff9c886227364`); earlier `6f0fd98b6c19c1f9` (R072), `8d479df729eb1a78` (R071) | [R074 production promotion](https://github.com/welct0407/MW-Credit-App/blob/2c28911c1cbd7dc292364fabf22bb6ceaec1b328/project/Documents/Development_Changes.md#r074-production-promotion) |

Headers on both: CSP (PROD API origins only on PROD), `X-Frame-Options: DENY`, immutable `/assets/**`, `no-store` for `/`, `sw.js`, `build-version.json`, manifest and `offline.html`; viewport zoom lock kept (accepted design, W5 R068).

### Cloud Run (one image shared by four services per environment)

| Target | Service | Revision (100%) | Image digest | Rollback revision and image |
| --- | --- | --- | --- | --- |
| DEV | reader | read-00031-wkl | `api@sha256:1fb9d763451c...` (R069, source `ba52508`) | read-00030-8sl on `2857d7ce...` (R068) |
| DEV | command | command-00038-m6m | same | command-00037-tbn |
| DEV | notify | notify-00011-lxg | same | notify-00010-8nq |
| DEV | jobs | jobs-00011-7t7 | same | jobs-00010-rnl |
| PROD | reader | read-00012-2lv | `api@sha256:3d152a44c6111b4ef0d7a5670790b967c3031749e78c7211f8ecd9e940bd1294` (R069, source `9c4a4cb`) | read-00011-2j9 on `808cc07761a3...` (R068) |
| PROD | command | command-00016-9nn | same | command-00015-2w9 |
| PROD | notify | notify-00010-xrd | same | notify-00009-sxg |
| PROD | jobs | jobs-00010-d5d | same | jobs-00009-kck |
| PROD | bridge `mw-grafana-events` | `00015-qcs` (recorded telemetry rollout; not re-read) | `keep-grafana-events-live` `9ba9b0f2...` | not recorded |

DEV applied about 09:43Z, PROD 10:17:44 to 10:18:21Z, both 17 October 2026 (plans 0/4/0, re-plan No changes). Reader and command run `services/production/business-server.mjs`; DEV uses `APP_ENV=dev`, database user `mw-credit-app-read-dev` for the reader, Cloud Run timeout 15 s (as PROD), startup CPU boost on reader and command. PROD workers pin `WORKER_CALLER_SUBJECTS_JSON`. PROD health 200, unauthenticated 401 and CORS verified. Rollback route: `dev.activation.before.tfvars` (DEV) and `production.activation.before.tfvars` (PROD) in the private R069 promotion folder. Records: [R069 follow-ups](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r069-w4-optional-follow-ups) (DEV), [R069 promotion](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r069-production-promotion) (PROD).

### Database schema

| Target | Database | Flyway version | Verified |
| --- | --- | --- | --- |
| DEV | `loan_manager_dev` | V95 | R068 DEV first, 17 October 2026 |
| PROD | `loan_manager_prod` | V95 (95 successful, 0 failed; `validate` 96 including baseline) | Migrated 93 to 95 at 04:09Z; read-only readback 12:03:26Z, 17 October 2026 ([R068](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r068-production-promotion), [R070](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r070-production-promotion)) |
| PROD agent database `mw_agent` | `mw_agent` | Agent migration V6 (`runtime.service_heartbeats`) | Applied 10:25:46Z, 17 October 2026 (R069). DEV agent version: not recorded |

### Debian agent host

| Item | Value |
| --- | --- |
| Host | `vm-mw-credit-agent` |
| Source checkout | `/opt/mw-integration-agent-src`, full clone of `welct0407/MW-Credit-App` `main`; HEAD read on the host at the 17 October 2026 deploy: equal to the deployed `code_version` |
| Deployed monorepo commit | `5b4e50dfa9be919321ac30160a4e0c1bfef548a8` (R071 agent component: catalogue validator accepts `audit_relay`) |
| Virtual environment | `/opt/mw-integration-agent/.venv`, installed from `<checkout>/integration-agent` at that commit with `pip install --no-deps`; dependencies equal `integration-agent/requirements.lock` (verified 16 October at the earlier deploy; not re-recorded for R069) |
| Installed package version | `0.1.0` (the package version is not bumped; `/ready` `code_version` is the identity) |
| Service catalogue revision | 28 live and in the repository since 17:39:54Z, 17 October 2026 (adds `audit_relay`; backup `/root/service-catalogue.json.pre-rev28` holds 27); the deploy refuses a mismatch |
| Verified | Activated 17:27:06Z, 17 October 2026: `/ready` 200, six timers resumed, no `mw-*` journal errors and all worker runs exit 0 in the first six minutes |
| Host monitor | `/opt/mw-resource-monitoring/debian-health.py` equals the repository copy as of the R063 Wave 3 deploy (`300aeb5`); later monitor updates: not recorded |
| Rollback | Catalogue first: restore `/root/service-catalogue.json.pre-rev28` by the config-only route (the `1feb6cd` validator rejects `audit_relay`). Then `deploy-runtime.py rollback --commit 5b4e50dfa9be919321ac30160a4e0c1bfef548a8` from `runtime-20261017T172649242280Z` (restores R069 `1feb6cd`). Earlier backups: `runtime-20261017T102501647216Z` (R069 deploy, holds R068 `679a76c`), `runtime-20261017T041230734761Z` (R068 deploy) |
| Records | [Validator deploy](../../integration-agent/Change%20Logs/CHANGE_NOTES_AUDIT_RELAY_VALIDATOR_2026-10-17.md), [R069 promotion](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r069-production-promotion), [Wave 2 deployment](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/integration-agent/Change%20Logs/CHANGE_NOTES_W2_AGENT_DEPLOYMENT_2026-10-16.md#deployment-16-october-2026), [Wave 3 record](../../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md) |

Host state: IAM sign-in is active since 16 October 2026 (ALL-ARCH-03): proxy listener `127.0.0.1:5433` (`auto-iam-authn`), its own unit `cloud-sql-auth-proxy-iam.service` so token sign-in on 5432 (cloud-session read route) works ([read-route fix](../../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#read-route-fix-16-october-2026)); worker, relay, reporting and monitor connections log in as `mw-integration-agent@…iam` and `SET ROLE`. Reviewer DML and receipt projector switched to IAM at 04:13Z, 17 October (config backup `/root/config.json.pre-arch03-2b`); their two password files and logins remain until the quiet-week reminder of 24 October 2026 10:05 Bangkok (then `NOLOGIN` both roles and shred the files and the offline copy `/root/arch03-offline-20261017`). Config key `native_delete_enabled` replaced `reviewer_delete_enabled`. IAM rollback first: `/root/config.json.pre-arch03-retry`, remove the proxy drop-in and `cloud-sql-auth-proxy-iam.service`. See the [ALL-ARCH-03 record](../../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#all-arch-03-retry-16-october-2026).

### Other

| Component | Pin / evidence |
| --- | --- |
| Repository | Single repository `welct0407/MW-Credit-App` (since 15 October 2026): `project/` (former AppSheet-Loan-Project), root (PWA/API/SQL/infrastructure), `integration-agent/` (former MW-Integration-Agent). DEV/PROD deploy identity unchanged |
| Grafana | Dashboard versions Performance 41, Cost 15, PWA Platform 2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source `808cdf5` records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by the integration-agent service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

R060 corrected the confirmed production-store mode veto for main offline-dataset reads. [Recovery and evidence](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r060-production-offline-dataset-recovery).

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; once applied, a GCP-to-Azure federated credential lets the cloud environment act as that UAMI on demand through `scripts/azure-cloud-session.sh`, which mints a temporary token per command (no stored Azure secret, no session hooks); VM-01 power uses the wrapper `scripts/vm01-power.sh start|deallocate|restart`; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory. The Claude Code cloud environment is the primary executor for GCP, Cloudflare, Tailscale and Grafana work: it signs in as `codex-cloud` (project Owner) from the environment key `GCP_SA_KEY_B64` and runs every non-Azure Terraform stack through MW-Credit-App `scripts/Invoke-Terraform.ps1`, whose activation variables live under `activation/` in the state buckets (verified no-change plans, 15 October 2026). Azure stacks and the parked `production-bootstrap` state still require VM-01. Database access from the cloud environment uses an IAP SSH tunnel to `vm-mw-credit-agent`'s loopback Cloud SQL Auth Proxy (`codex-cloud` instance key in Secret Manager `mw-credit-cloud-operator-ssh-key`); migrations still run as `postgres`, and routine reads use IAM database user `codex-cloud-read@clever-oasis-508610-n7.iam` (`pg_read_all_data` and, since 17 October 2026, `pg_read_all_stats` for instance-wide `monitoring.pg_stat_statements` query text on `mw-credit-pg-20261017`); `codex-cloud@…iam` (member of `postgres`) is for the guarded runner and writing scripts only. Since the ALL-ARCH-03 IAM switch the shared Debian host proxy on 5432 presents the agent identity, so the `cloud-db-tunnel.sh` route fails IAM login for `codex-cloud-read`; R063 used a temporary `--auto-iam-authn` proxy as `codex-cloud` on host port 5439 instead (see the [R063 record](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r063-production-promotion)). Backups (`Backup-ProductionPromotion.py`, as `codex-cloud-read`, which needs the prepared PROD CONNECT grant) and promotion receipts are kept in private bucket `gs://mw-credit-operator-private-737787224638`; PROD Hosting promotion acts as `mw-credit-unattended-admin` through `codex-cloud`'s Token Creator grant. Debian administration and MW-Integration-Agent deploys use `mw-debian-ssh` (IAP, pinned host key).

## DEV composition and access (R063 Wave 3, 16 October 2026)

- DEV services: the reader and command services run `services/production/business-server.mjs` with `APP_ENV=dev`, DEV origins and the DEV capability policy secret `mw-credit-app-dev-capability-policy` (version 1, owner only, all four capabilities; evidence sha256 `175831e3eef5b2608d4dec34a1c58178ba342c473a34b63bee0d0f864030abcc`). Notify and jobs use the same image. The foundation API service `mw-credit-app-api-dev`, its service account `mw-credit-app-dev@` and `dev-server.mjs`/`dev-read-server.mjs` are retired. The workers module is `infrastructure/modules/workers`.
- Troubleshooting key (R072, owner decision 18 October 2026): Secret Manager `mw-credit-app-troubleshooting-private-key` in `clever-oasis-508610-n7`, shared by DEV and PROD, version 1, automatic replication, container in the DEV stack (`infrastructure/dev/troubleshooting-key.tf`, `prevent_destroy`), payload added out of band. keyId `77c23e74520a272b6b43d872d7bcf6d88cbae219db8c447e921479abe5783dd6`. Access only via project `roles/owner` (`codex-cloud`, `mw-credit-unattended-admin`, the owner user); no runtime identity; organization-level IAM is not inspectable by this identity. The public key is embedded in both builds.
- DEV schedulers `mw-credit-app-dev-notifications`, `-daily-charges` and `-recent-analytics` stay paused.
- Accepted design (APP-AUTH-04): DEV and PROD share Firebase project `clever-oasis-508610-n7` (issuer `securetoken.google.com/<project>`). Authorization is per environment: capability policy secret plus origin allowlist.
- Cloud SQL IAM users in DEV: dropped `mw-credit-app-dev@clever-oasis-508610-n7.iam`; kept `mw-credit-app-read-dev` (the DEV reader uses it), `-command-dev`, `-jobs-dev`, `-notify-dev`, `codex-cloud`. New: `codex-cloud-read@` (`pg_read_all_data`, plus `pg_read_all_stats` since 17 October 2026 on the new instance, CONNECT on `loan_manager_dev`, `loan_manager_prod` and `mw_agent`) and `mw-integration-agent@` (instance user role only; no database roles yet, prepared for the agent deploy).
- Grant state (16 October 2026): `mw_reviewer_dml` keeps `LOGIN`, INSERT and UPDATE.
  - DEV: no DELETE on the nine tables.
  - PROD: no DELETE on the eight source tables. It keeps DELETE on `"Cash Ledger"` because the security-invoker cash-sync trigger `zz_cash_source` needs it on INSERT/UPDATE.
  - DEV reader: `Partners."Partner Role"` column SELECT added to match PROD.
  - Details are in the [W3 operations note](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_W3_OPS_2026-10-16.md).
- Firewall: three rules remain (IAP SSH `35.235.240.0/20` tcp:22, `default-allow-icmp`, `default-allow-internal`), all in Terraform. `default-allow-ssh` and `default-allow-rdp` were deleted.
- Debian VM: `deletion_protection = true`; snapshot policy `default-schedule-1` and its disk attachment, the uptime check `mw-webhook-external-health-*` (`GET https://hooks.mw-credit.com/instagram`, expects 403 `Forbidden`) and Cloud SQL IAM user `mw-integration-agent@` are in Terraform. Restore-to-new-VM rehearsed once (257 s); see the agent operations runbook.
- Service account keys: `codex-cloud` has one user-managed key, `37df51c6...`, bound to `GCP_SA_KEY_B64`. The older key `f6729ca0...` was deleted on 16 October 2026. Rotation every 2 years (owner decision, 16 October 2026; next due 15 October 2028); see [unattended-admin](../../infrastructure/unattended-admin/README.md#cloud-executor-identity-and-key-rotation). Terraform declares the project Owner bindings (`codex-cloud` and the human owner, `prevent_destroy`) and the custom role `codexCloudVmLookup`.
- Backups: bucket `mw-credit-operator-private-737787224638` deletes `prod-backups/` objects after 180 days. A restore rehearsal is recorded in the [recovery runbook](Rules/Release_Recovery_Runbook.md#restore-from-backup-rehearsal).
- Artifact Registry cleanup policy on the DEV, PROD and bridge repositories: keep the 20 most recent versions, keep tag prefix `keep`, delete versions older than 30 days. Pinned digests:

| Repository / image | KEEP tag | Digest |
| --- | --- | --- |
| mw-credit-app-prod/api | `keep-r069-runtime` | `3d152a44...` (current PROD reader, command, notify and jobs, R069) |
| mw-credit-app-prod/api | `keep-r068-runtime` | `808cc077...` (PROD rollback, R068) |
| mw-credit-app-prod/api | `keep-r067-runtime` | `2251f2ce10b0...` (earlier PROD image, R067) |
| mw-credit-app-prod/api | `keep-r064-sync-runtime` | `88b4dbad...` (previous PROD image, R064 sync correction; rollback) |
| mw-credit-app-prod/api | `keep-r064-runtime` | `8611c23d...` (previous PROD image, R064 Wave 4; rollback) |
| mw-credit-app-prod/api | `keep-r063-runtime` | `86d172de...` (rollback PROD runtime, R063) |
| mw-credit-app-prod/api | `keep-r062-command` | `3191a0ec...` (rollback PROD command) |
| mw-credit-app-prod/api | `keep-r059-read` | `105e8157...` (rollback PROD reader) |
| mw-credit-app-prod/api | `keep-r059-notify` | `b4f528bc...` (rollback PROD notify) |
| mw-credit-app-prod/api | `keep-r059-jobs` | `11c149f7...` (rollback PROD jobs) |
| mw-monitoring/grafana-mcp-bridge | `keep-grafana-events-live` | `9ba9b0f2...` |
| DEV api | `keep-dev-20261017-1fb9d763` | `1fb9d763451c...` (current DEV image, R069) |
| DEV api | `keep-dev-20261017-2857d7ce` | `2857d7ce...` (previous DEV image, R068; DEV rollback) |
| DEV api | `keep-dev-20261016-6a3effe4` | `6a3effe4...` (previous DEV image, R067) |
| DEV api | `keep-dev-20261016-4689ce78` | `4689ce78...` (previous DEV image, R064 sync correction) |
| DEV api | `keep-dev-20261016-ec4ffe05` | `ec4ffe05...` (previous DEV image, R064 Wave 4) |
| DEV api | `keep-dev-20261016-a86ce85d` | `a86ce85d...` (previous DEV image, R063; W4 rollback) |
| DEV api | `keep-dev-20261016-d35ff75e` | `d35ff75e...` (previous DEV image) |
| DEV api | `keep-dev-20261016-91ce1c28` | first W3 DEV image |
| DEV api | `keep-dev-20261016-abe73330` | previous DEV reader and command |
| DEV api | `keep-dev-20261016-ccb475d6` | previous DEV workers |

Pending owner items:

| Item | State |
| --- | --- |
| ALL-MON-03 Metabase and Railway checks | Owner-performed and pending: public sharing off, strong authentication, Railway backup scheduled |
| ALL-COST-01 GCP budget | Owner creates one budget: monthly average plus 50 percent, alerts at 50/90/100 percent |
| Grafana revamp (ALL-MON lines) | Deferred; every ALL-MON item becomes a line of that entry (see [Development changes](Development_Changes.md)) |
| ALL-ARCH-04 database tier | Tier raised to `db-g1-small` (16 October 2026). W4 found 0 stored receipt images in PROD `mw_agent` (1,742 MB at first readback, almost all `audit.*` and `runtime` heartbeat rows). Moved to SSD on 17 October 2026 (new instance `mw-credit-pg-20261017`, PD_SSD 10 GB; [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#shared-cloud-sql-move-to-ssd-17-october-2026)) |
| V93 migration (R064 Wave 4) | Done: DEV 16 October 2026 21:13 Bangkok, PROD 22:17 Bangkok (tunnel identity rule owner-approved 16 October). Run book for any repeat: `owner-authority-cli.mjs role`, `prepare` (PROD: ledger owner only; DEV also the notify, jobs and journal owners for the post-migrate hook), `Invoke-Flyway.ps1 migrate`, DEV only `application-role-cli.mjs --action post-migrate`, `restore`, `validate`; private records under `~/.mw-private/AppSheet-Loan-Project/flyway` |
| Cloud SQL flags (DB-PERF-03) | Done 16 October 2026 (see above); `owned.tf` matches the live instance |
| `mw_agent` maintenance (DB-PERF-01) | Agent V5 applied in PROD (17 October 00:47 Bangkok): retention role held by the agent IAM user, purge function, append-only gate, foreign-key indexes. 7-day purge done inside the SSD move freeze (17 October 02:30–02:34 Bangkok, `--rewrite`): 682,595 exported operations removed, `mw_agent` 1,877 MB to 435 MB, export `424cf0f8…` in `agent-audit-archive/`. `mw-audit-retention.timer` enabled (daily 03:40 Bangkok, 7 days, IAM `mw_agent_retention` through the purge function) |
| PROD command capacity (R064 sync fix) | Applied in PROD and DEV 16 October 2026 (9420c85): command max instances 1 to 2 (PROD), command pool 4 connections (others 2), startup CPU boost on reader and command; capacity effect under real use not yet observed |
| R063 signed-in proof | Owner's next normal sign-in on https://lm.mw-credit.com (no PROD test identity) |

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.
