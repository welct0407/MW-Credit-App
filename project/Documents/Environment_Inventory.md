# Current environment inventory

Updated 16 October 2026 from existing deployment evidence, the R063 Wave 3 live changes and the R063 PROD promotion (DEV first; PROD verified 18:15 Bangkok). R064 Wave 4: DEV is at V93 (verified 16 October 2026, 21:13 Bangkok); PROD is still V92. This document lists current bindings and latest verified state; no unrelated live audit was performed.

| Component | DEV | PROD |
| --- | --- | --- |
| Origin | https://dev-lm.mw-credit.com | https://lm.mw-credit.com |
| Firebase Hosting site | mw-credit-app-dev-737787224638 | mw-credit-prod-737787224638 |
| Business database | loan_manager_dev | loan_manager_prod |
| Flyway | V93; 94 migrations validated (Flyway 13.6.0), post-migrate role reconciliation 0 violations, temporary owner authority restored exactly (ledger, notify, jobs and journal owners closed again). `mw_ledger_owner_dev` provisioned closed (NOLOGIN, no other members); `sync_cash_ledger` is a definer owned by it; `mw_app_dev` has SELECT only on "Cash Ledger"; `pg_stat_statements` 1.12 in schema `monitoring` | V92; 93 migrations validated, temporary authority restored. V93 is not authorized; `mw_ledger_owner_prod` is to be provisioned at promotion |
| Cloud Run workers | mw-credit-app-notify-dev / mw-credit-app-jobs-dev | mw-credit-app-notify-prod / mw-credit-app-jobs-prod |
| Worker time zone | Asia/Bangkok | Asia/Bangkok |

Google project: `clever-oasis-508610-n7` (737787224638), region `asia-southeast1`. Shared Cloud SQL: `appsheet-pg-prod-20260914`, public host `34.21.174.215:5432`. Preserve that resource name. Tier db-g1-small, disk PD_HDD 10 GB, `max_connections` 200, Query Insights on (16 October 2026). Verify the complete project/instance/database tuple for any operation.

Private receipts: `gs://mw-payment-receipts-prod-508610-n7`. Agent originals and manual uploads retain their existing validated paths. Public access is not enabled. AppSheet connection records are removed; current service identities own access. Do not restore old store keys.

## Latest verified deployments

| Component | Pin / evidence |
| --- | --- |
| DEV frontend | Hosting `e0ac761a1022e40e`, release `1792160410172000` (R064 Wave 4, 16 October 2026 21:20 Bangkok), marker `a1b31ef75151e9ffe0995d12`, entry `/assets/index-BxJIaVkl.js`; CSP, `X-Frame-Options: DENY`, immutable `/assets/**`; rollback `955fa49b579be5f9` (release `1792139161502000`, R063 Wave 3 final, app source `fbd1260`), earlier `ae32fb05bfc17a38`, `edf06b9da5841b1d`; [R063 Wave 3 record](Development_Changes.md#r063-wave-3) |
| DEV reader / command / notify / jobs | One image `api@sha256:ec4ffe05b35808698def22bbddcafe3b4149667188e85ad3ea0c1fb82bd4a014` (R064 Wave 4, source `claude/review-w4-app` `ba0a9d7`, Cloud Build `451f8ea6`, tag `keep-dev-20261016-ec4ffe05`), revisions read-00025-mmc, command-00032-dsw, notify-00005-cbx, jobs-00005-jbk, 100%; rollback image `a86ce85d93952e5a8c06460da1d311e09547d37705a685b17425ee20e163077e` (R063, revisions read-00024-wqc, command-00031-fcg, notify-00004-8w7, jobs-00004-qkd, via the private pre-W4 activation file); reader and command run `services/production/business-server.mjs` with `APP_ENV=dev`; database user `mw-credit-app-read-dev` for the reader; Cloud Run timeout 15 s (as PROD); previous image `keep-dev-20261016-d35ff75e`; [R063 promotion](Development_Changes.md#r063-production-promotion) |
| PROD frontend | source `37f62121e9b04a163ebfa014e3240841b46d9a96`, Hosting `8154effa824f58e9`, release `1792149184194000`, marker `656acf0b13d8a0697b3dba61`, entry `index-Bnc-Ow8T.js`; CSP with PROD API origins, `X-Frame-Options: DENY`, immutable `/assets/**`; exact-byte verification 16 October 2026 18:15 Bangkok; rollback Hosting `45b1899bbd18ba3e` / release `1792033365993000`; [R063 promotion](Development_Changes.md#r063-production-promotion) |
| PROD reader / command / notify / jobs | One image `api@sha256:86d172de6b158c42689a51c6b333eeb5951d7bbecbd7fbf82c503ea1a9c4f88f` (source `37f6212`, build `2ff60e49`, tag `keep-r063-runtime`), revisions read-00006-9dl, command-00010-4s8, notify-00004-q8t, jobs-00004-p9t, Ready/100%; workers pin `WORKER_CALLER_SUBJECTS_JSON` (notify: command and scheduler; jobs: scheduler); exact PROD bindings, health 200, unauthenticated 401 and CORS verified; rollback reader `00005-v9z`, command `00009-qf9`, notify `00003-bj4`, jobs `00003-q4h` (keep tags below); [R063 promotion](Development_Changes.md#r063-production-promotion) |
| Repository | Single repository `welct0407/MW-Credit-App` (since 15 October 2026): `project/` (former AppSheet-Loan-Project), root (PWA/API/SQL/infrastructure), `integration-agent/` (former MW-Integration-Agent). DEV/PROD deploy identity unchanged. | Same |
| Debian | vm-mw-credit-agent, R063 Waves 1–3 deployed from `main` `300aeb55bc110cd9ba28f305c262855dc5ac35d0` (`code_version`; IAM side-path fix PR #35 on top of `20b6849`), catalogue 27 unchanged, host monitor `/opt/mw-resource-monitoring/debian-health.py` = repository at `300aeb5`. Verified 16 October 2026 17:19–17:35 Bangkok (seven monitor runs all 1, no failed units): `/ready` 200 with that `code_version`; deps equal `integration-agent/requirements.lock`; config key `native_delete_enabled` (was `reviewer_delete_enabled`, same value); cloudflared unit AGT-HOST-03 installed; `codex-cloud` in `systemd-journal`. **IAM sign-in active (ALL-ARCH-03) since 17:20 Bangkok:** proxy listener `127.0.0.1:5433` (`auto-iam-authn`), its own unit `cloud-sql-auth-proxy-iam.service` since 18:49 Bangkok so token sign-in on 5432 (cloud-session read route) works ([read-route fix](../../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#read-route-fix-16-october-2026)); worker, relay, reporting and monitor connections log in as `mw-integration-agent@…iam` and `SET ROLE`; reviewer DML and receipt projector stay on password roles on 5432; the three old password files and LOGIN stay until the cleanup (earliest 17 October 2026 17:21 Bangkok). [W3 record](../../integration-agent/Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#all-arch-03-retry-16-october-2026). Rollback: IAM first (`/root/config.json.pre-arch03-retry`, remove the proxy drop-in and `cloud-sql-auth-proxy-iam.service`), then `deploy-runtime.py rollback --commit 300aeb55bc110cd9ba28f305c262855dc5ac35d0` from `/var/lib/mw-integration-agent/rollback/runtime-20261016T101917600024Z` (package `20b6849`) and monitor `/opt/mw-resource-monitoring/debian-health.before-r063w3-iam-20261016.py`; earlier backups `runtime-20261016T094408811323Z` (package `5d39db6`; original config `/root/config.json.pre-w3`), cloudflared `/root/mw-cloudflared-instagram.service.pre-w3`, W2 `runtime-20261016T061942514997Z` (R058 `a8cf949…`; monitor `debian-health.before-r063w2-20261016.py`). Source checkout `/opt/mw-integration-agent-src` is a full (unshallowed 16 October 2026) clone of `welct0407/MW-Credit-App` `main` at `300aeb5`, repo-scoped read-only deploy key |
| Grafana | Performance41, Cost15, PWA Platform2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source808cdf5 records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by MW-Integration-Agent's service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

R060 corrected the confirmed production-store mode veto for main offline-dataset reads. Exacttarget/health/auth-gate verification passed; no authenticated traversal is claimed because the bounded natural-log query had no events. [Recovery and evidence](Development_Changes.md#r060-production-offline-dataset-recovery).

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; once applied, a GCP-to-Azure federated credential lets the cloud environment act as that UAMI on demand through `scripts/azure-cloud-session.sh`, which mints a temporary token per command (no stored Azure secret, no session hooks); VM-01 power uses the wrapper `scripts/vm01-power.sh start|deallocate|restart`; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory. The Claude Code cloud environment is the primary executor for GCP, Cloudflare, Tailscale and Grafana work: it signs in as `codex-cloud` (project Owner) from the environment key `GCP_SA_KEY_B64` and runs every non-Azure Terraform stack through MW-Credit-App `scripts/Invoke-Terraform.ps1`, whose activation variables live under `activation/` in the state buckets (verified no-change plans, 15 October 2026). Azure stacks and the parked `production-bootstrap` state still require VM-01. Database access from the cloud environment uses an IAP SSH tunnel to `vm-mw-credit-agent`'s loopback Cloud SQL Auth Proxy (`codex-cloud` instance key in Secret Manager `mw-credit-cloud-operator-ssh-key`); migrations still run as `postgres`, and routine reads use IAM database user `codex-cloud-read@clever-oasis-508610-n7.iam`; `codex-cloud@…iam` (member of `postgres`) is for the guarded runner and writing scripts only. Guarded Flyway validate verified for DEV and PROD at V92; PROD V92 re-read as `codex-cloud-read` on 16 October 2026 (R063). Since the ALL-ARCH-03 IAM switch the shared Debian host proxy on 5432 presents the agent identity, so the `cloud-db-tunnel.sh` route fails IAM login for `codex-cloud-read`; R063 used a temporary `--auto-iam-authn` proxy as `codex-cloud` on host port 5439 instead (see the [R063 record](Development_Changes.md#r063-production-promotion)). Backups (`Backup-ProductionPromotion.py`, as `codex-cloud-read`, which needs the prepared PROD CONNECT grant) and promotion receipts are kept in private bucket `gs://mw-credit-operator-private-737787224638`; PROD Hosting promotion acts as `mw-credit-unattended-admin` through `codex-cloud`'s Token Creator grant. Debian administration and MW-Integration-Agent deploys use `mw-debian-ssh` (IAP, pinned host key); deployed source verified `300aeb5` (16 October 2026).

## DEV composition and access (R063 Wave 3, 16 October 2026)

- DEV services: the reader and command services run `services/production/business-server.mjs` with `APP_ENV=dev`, DEV origins and the DEV capability policy secret `mw-credit-app-dev-capability-policy` (version 1, owner only, all four capabilities; evidence sha256 `175831e3eef5b2608d4dec34a1c58178ba342c473a34b63bee0d0f864030abcc`). Notify and jobs use the same image. The foundation API service `mw-credit-app-api-dev`, its service account `mw-credit-app-dev@` and `dev-server.mjs`/`dev-read-server.mjs` are retired. The workers module is `infrastructure/modules/workers`.
- DEV schedulers `mw-credit-app-dev-notifications`, `-daily-charges` and `-recent-analytics` stay paused.
- Accepted design (APP-AUTH-04): DEV and PROD share Firebase project `clever-oasis-508610-n7` (issuer `securetoken.google.com/<project>`). Authorization is per environment: capability policy secret plus origin allowlist.
- Cloud SQL IAM users in DEV: dropped `mw-credit-app-dev@clever-oasis-508610-n7.iam`; kept `mw-credit-app-read-dev` (the DEV reader uses it), `-command-dev`, `-jobs-dev`, `-notify-dev`, `codex-cloud`. New: `codex-cloud-read@` (`pg_read_all_data`, CONNECT on `loan_manager_dev`, `loan_manager_prod` and `mw_agent`) and `mw-integration-agent@` (instance user role only; no database roles yet, prepared for the agent deploy).
- Grant state (16 October 2026): `mw_reviewer_dml` keeps `LOGIN`, INSERT and UPDATE.
  - DEV: no DELETE on the nine tables.
  - PROD: no DELETE on the eight source tables. It keeps DELETE on `"Cash Ledger"` because the security-invoker cash-sync trigger `zz_cash_source` needs it on INSERT/UPDATE.
  - DEV reader: `Partners."Partner Role"` column SELECT added to match PROD.
  - Details are in the [W3 operations note](../../Change%20Logs/CHANGE_NOTES_W3_OPS_2026-10-16.md).
- Firewall: three rules remain (IAP SSH `35.235.240.0/20` tcp:22, `default-allow-icmp`, `default-allow-internal`), all in Terraform. `default-allow-ssh` and `default-allow-rdp` were deleted.
- Debian VM: `deletion_protection = true`; snapshot policy `default-schedule-1` and its disk attachment, the uptime check `mw-webhook-external-health-*` (`GET https://hooks.mw-credit.com/instagram`, expects 403 `Forbidden`) and Cloud SQL IAM user `mw-integration-agent@` are in Terraform. Restore-to-new-VM rehearsed once (257 s); see the agent operations runbook.
- Service account keys: `codex-cloud` has one user-managed key, `37df51c6...`, bound to `GCP_SA_KEY_B64`. The older key `f6729ca0...` was deleted on 16 October 2026. Rotation every 2 years (owner decision, 16 October 2026; next due 15 October 2028); see [unattended-admin](../../infrastructure/unattended-admin/README.md#cloud-executor-identity-and-key-rotation). Terraform declares the project Owner bindings (`codex-cloud` and the human owner, `prevent_destroy`) and the custom role `codexCloudVmLookup`.
- Backups: bucket `mw-credit-operator-private-737787224638` deletes `prod-backups/` objects after 180 days. A restore rehearsal is recorded in the [recovery runbook](Rules/Release_Recovery_Runbook.md#restore-from-backup-rehearsal).
- Artifact Registry cleanup policy on the DEV, PROD and bridge repositories: keep the 20 most recent versions, keep tag prefix `keep`, delete versions older than 30 days. Pinned digests:

| Repository / image | KEEP tag | Digest |
| --- | --- | --- |
| mw-credit-app-prod/api | `keep-r063-runtime` | `86d172de...` (PROD reader, command, notify and jobs) |
| mw-credit-app-prod/api | `keep-r062-command` | `3191a0ec...` (rollback PROD command) |
| mw-credit-app-prod/api | `keep-r059-read` | `105e8157...` (rollback PROD reader) |
| mw-credit-app-prod/api | `keep-r059-notify` | `b4f528bc...` (rollback PROD notify) |
| mw-credit-app-prod/api | `keep-r059-jobs` | `11c149f7...` (rollback PROD jobs) |
| mw-monitoring/grafana-mcp-bridge | `keep-grafana-events-live` | `9ba9b0f2...` |
| DEV api | `keep-dev-20261016-ec4ffe05` | `ec4ffe05...` (current DEV image, R064 Wave 4) |
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
| ALL-ARCH-04 database tier | Applied 16 October 2026: db-g1-small on PD_HDD (SSD move planned 17 October after R064 is stable, new instance `mw-credit-pg-20261017`; HDD cannot change in place), Query Insights on, [R064 sync note](../../Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md). W4 found 0 stored receipt images in PROD `mw_agent` (1,742 MB, almost all `audit.*` and `runtime` heartbeat rows); the prepared maintenance below is the remaining work |
| V93 DEV migration (R064 Wave 4) | Done 16 October 2026 (tooling accepts the Auth Proxy tunnel identity, owner-approved 17 October). Run book for any repeat (also PROD): `owner-authority-cli.mjs role`, `prepare` (four owners), `Invoke-Flyway.ps1 migrate`, `application-role-cli.mjs --action post-migrate`, `restore`, `validate`; private records under `~/.mw-private/AppSheet-Loan-Project/flyway` |
| V93 PROD promotion | Not authorized; prepared as request (a) in the [W4 database note](../../Change%20Logs/CHANGE_NOTES_W4_DATABASE_2026-10-16.md). Release manifest for `9eee10e` exists (93 migrations). Provision `mw_ledger_owner_prod` (closed) at promotion; PROD drift check against the expected V92 schema, restore-verified backup, authority opened only for the ledger owner and restored. The PROD app promotion follows V93 |
| Cloud SQL flags and tier (DB-PERF-03) | Applied 16 October 2026 (owner): tier db-g1-small, `max_connections=200` (owner, over W4's 50), `cloudsql.iam_authentication=on`, no `cron.*` flags, settingsVersion 65, plan No changes (narrow patch used for the provider maintenance-window 400); backups 1792165191960 and 1792165979631 |
| PROD command capacity (R064 sync fix) | Max instances 1 to 2, command pool 4 connections (others 2), startup CPU boost on reader and command PROD and DEV: pending, takes effect on deploy; not deployed |
| `mw_agent` maintenance (DB-PERF-01) | Prepared (request (b)): 7-day audit retention (owner, 17 October), `agent-db-maintenance.py`, `vacuum-full-agent.sql`, disabled daily timer units; not run on PROD (`mw_agent` 1,830 MB). Two owner decisions open: retention identity (agent V5 role and purge function, recommended) and a create-only bucket binding on `agent-audit-archive/` |
| R063 signed-in proof | Owner's next normal sign-in on https://lm.mw-credit.com (no PROD test identity) |

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.
