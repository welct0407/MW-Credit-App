# Current environment inventory

Updated 18 October 2026 from existing deployment evidence (R075 promotion to PROD and DEV: runtime, V96, Hosting and agent; R076 and R077 images and Hosting). This is the only document that holds deployment pins (Hosting versions, Cloud Run revisions and image digests, Debian commit, Flyway version). Other documents link here. No unrelated live audit was performed; use [release tracker](Release_Tracker.md) for release status.

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
| DEV | `1327b568aaba6a6e` | release `1792397402732000`; `build-version.json` version `aeff6fbd2bde4cb1d8437842`, release label `R078` | Main `683cfceed724778151e1e305adaea50b9ab20c94` (R077 package), 19 October 2026; the DEV build stamps the Open release; built from Secret Manager `mw-credit-app-dev-firebase-web` | `12e15685af434882` (main `55c5be6`, release `1792391576618000`); earlier `1b74b8911b8bb098` (R075) | [R077 change note](../../Change%20Logs/CHANGE_NOTES_R077_RECOGNITION_TIMEOUTS_2026-10-19.md) |
| PROD | `9557401447db56b6` | release `1792397801569000`; `build-version.json` version `c22ec66cdf457b58597770a8`, release `R077` | R077, source `683cfceed724778151e1e305adaea50b9ab20c94`, 19 October 2026; `build-version.json` reads R077. Package sha256 `782993195d1069e194fd3bd64caf144d65bde1818ef99f0421e7506c56bdc624`, receipt in the private promotion bucket | `3579d07b8d5a53c9` (R076, release `1792354865987000`, marker `986a0c1630c5dd39fcda577f`); earlier `c0b7a7e28d82b325` (R075) | [R077 change note](../../Change%20Logs/CHANGE_NOTES_R077_RECOGNITION_TIMEOUTS_2026-10-19.md) |

Headers on both: CSP (PROD API origins only on PROD), `X-Frame-Options: DENY`, immutable `/assets/**`, `no-store` for `/`, `sw.js`, `build-version.json`, manifest and `offline.html`; viewport zoom lock kept (accepted design, W5 R068).

### Cloud Run (one image shared by four services per environment)

| Target | Service | Revision (100%) | Image digest | Rollback revision and image |
| --- | --- | --- | --- | --- |
| DEV | reader | read-00031-wkl | `api@sha256:1fb9d763451c...` (R069, source `ba52508`) | read-00030-8sl on `2857d7ce...` (R068) |
| DEV | command | command-00043-gf9 | `api@sha256:0c9a04f53928e0fc860b848fcdf198100e7f810653660cafad3ad43080399d7f` (R077, source `683cfce`, Cloud Build `c7cf6545-6ca9-457e-819a-71075e84e4b7`; request timeout 55 s) | command-00042-wt8 on `api@sha256:0b54fa14c30863d797e2e267223c866f074ccae508a4db921725fb4dff764fd3`; earlier 00041-528 (R075) |
| DEV | notify | notify-00011-lxg | same | notify-00010-8nq |
| DEV | jobs | jobs-00011-7t7 | same | jobs-00010-rnl |
| PROD | reader | read-00015-6xw | `api@sha256:3343d0b50bdd425c92cd6f3977737da81f0e0811d34224e830c0f9f7a15a1e50` (R077, source `683cfce`, Cloud Build `328365f5-5326-4dbf-8cfa-94886aad704a`, source generation `1792397388528483`; request timeout 15 s) | read-00014-lc8 on `api@sha256:864c1e14196dafac262dada759c4b97a73dd0f7ff6f8e328982829a74c4839bf` (R076) |
| PROD | command | command-00019-xtc (request timeout 55 s) | same | command-00018-xbf (15 s) |
| PROD | notify | notify-00013-2xd (120 s) | same | notify-00012-h59 |
| PROD | jobs | jobs-00013-vgd (120 s) | same | jobs-00012-2p6 |
| PROD | bridge `mw-grafana-events` | `00015-qcs` (recorded telemetry rollout; not re-read) | `keep-grafana-events-live` `9ba9b0f2...` | not recorded |

DEV applied about 09:43Z, PROD 10:17:44 to 10:18:21Z, both 17 October 2026 (plans 0/4/0, re-plan No changes). Reader and command run `services/production/business-server.mjs`; DEV uses `APP_ENV=dev`, database user `mw-credit-app-read-dev` for the reader, Cloud Run request timeout 15 s on the reader and 55 s on the command service from R077 (DEV and PROD), startup CPU boost on reader and command. PROD workers pin `WORKER_CALLER_SUBJECTS_JSON`. PROD health 200, unauthenticated 401 and CORS verified. Rollback route: `dev.activation.before.tfvars` (DEV) and `production.activation.before.tfvars` (PROD) in the private R069 promotion folder. Records: [R069 follow-ups](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r069-w4-optional-follow-ups) (DEV), [R069 promotion](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r069-production-promotion) (PROD).

### Database schema

| Target | Database | Flyway version | Verified |
| --- | --- | --- | --- |
| DEV | `loan_manager_dev` | V96 (0 failed; `validate` 97, 0 invalid) | R075, 18 October 2026; backup and restore test before apply, dump sha256 `56d6297309f7d253c44e8e6e387e1b08038512ea100e9c30a504d3f43a03954c`, reference in the private recovery folder; temporary owner authority prepared and restored (ledger, notify, jobs and journal owners, V93 repeat runbook) |
| PROD | `loan_manager_prod` | V96 (96 successful history rows, 0 failed) | R075, V96 applied 19:28:52Z (2.1 s), 18 October 2026; read-only readback after the apply. Backup `prod-promotion-cee9d1d522e949ec9d067ef290cde642`, dump sha256 `1393fcbf4d82b1580d3ca677b59f8d5a9ce18d74e69decb0be7a9e2bdc02a58a`, isolated restore passed (32 tables, fingerprints match). Release manifest sha256 `5d5fd758e795f56ed456963494a01b22abca1ba04f33f1d5c51419d03ec5cbbc`. Earlier: V95 migrated 93 to 95 on 17 October 2026 ([R068](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Documents/Development_Changes.md#r068-production-promotion)). R076 added no SQL; readback at 20:16:57Z: V96, 96 rows |
| PROD agent database `mw_agent` | `mw_agent` | Agent migration V6 (`runtime.service_heartbeats`) | Applied 10:25:46Z, 17 October 2026 (R069). DEV agent version: not recorded; 18 October 2026 (R075 closure): 23 stuck `receipt_payment` operations closed append-only 19:24:27Z to 19:24:34Z after backup `mw_agent-before-r075-closure-20261018.dump` (sha256 `0a4adc4f3a7cbd47123b227c2de52183356a643b367f60ee06abd71ca6263450`, restore verified 33 tables and 941,025 rows, kept in `/root/mw_agent-backups/` on the VM); plan 23, apply 23, re-plan 0, no business writes |

### Debian agent host

| Item | Value |
| --- | --- |
| Host | `vm-mw-credit-agent` |
| Source checkout | `/opt/mw-integration-agent-src`, full clone of `welct0407/MW-Credit-App` `main`; HEAD read on the host at the 17 October 2026 deploy: equal to the deployed `code_version` |
| Deployed monorepo commit | `683cfceed724778151e1e305adaea50b9ab20c94` (R077 agent component: recognizer limits 42/40/36 s, slip downscale to 1600 px), activated 08:16:21Z, 19 October 2026; freeze backup `runtime-20261019T081613805861Z`; rollback restores `a57fc7e65799c7a944d11cba764528924f435531` (activated 02:01:29Z, freeze backup `runtime-20261019T020122284096Z`). Earlier: `96b0a0b120be60fbe9a229d1004eabce35598a0d` (R075 agent), `2c2175513ee0033825a63881d6bf033c687251b3` (PR #70), `131b43a4`, `5b4e50dfa9be919321ac30160a4e0c1bfef548a8` (before R075) |
| Virtual environment | `/opt/mw-integration-agent/.venv`, installed from `<checkout>/integration-agent` at that commit with `pip install --no-deps`; dependencies equal `integration-agent/requirements.lock` (verified 16 October at the earlier deploy; not re-recorded for R069) |
| Installed package version | `0.1.0` (the package version is not bumped; `/ready` `code_version` is the identity) |
| Service catalogue revision | 29 live (adds `receipt_recognition_api`, enabled); backup `/root/service-catalogue.json.pre-rev29` holds 28; the deploy refuses a mismatch |
| Verified | 18 October 2026: `mw-receipt-recognition.service` enabled 18:03:39Z on `10.148.0.2:8790`, `healthz` `enabled: true`, no token 401, bad token 403; only caller `mw-credit-app-command-dev`; model `gemini-3.8-flash` on `global`; Instagram receipt cycle still on Codex. Earlier: activated 17:27:06Z, 17 October 2026 (rev 28), `/ready` 200. PROD caller added after that (config backup `/root/config.json.pre-prod-caller`): callers `mw-credit-app-command-dev` and the PROD command service; receipt cycle provider: Codex until 19 October 2026 02:02:42Z, then Gemini (`receipt_extraction_provider` `gemini`, switched 02:02:42Z to 02:02:44Z; config backup `/root/config.json.pre-gemini-cycle-2` holds Codex; cycle bounds 25 s per attempt, 60 s total). A first switch at 20:34:56Z on 18 October was rolled back at 20:36:51Z (byte-identical) after one of six synthetic slips timed out under the recognizer's bounds. 11 receipt runs clean to 02:07Z; the first live cycle audit row (provider `gemini`, route `internal`) is still to be confirmed. 19 October 2026 (R077): cycle bounds 25 s per attempt and 60 s total stay on Gemini; a synthetic 4000 px cycle slip became a 1600 by 1440 JPEG of 88 KB and extracted validly in 7.07 s |
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

## R075 receipt recognition (DEV and PROD, Released 18 October 2026)

Owner-authorized on 18 October 2026: DEV rollout, then the production instruction "merge it and push to production". PROD pins are in the tables above (Hosting, Cloud Run, schema, Debian agent host); this table holds the rest.

| Item | State |
| --- | --- |
| Vertex AI API | `aiplatform.googleapis.com` enabled, owned by `infrastructure/dev/main.tf` (`local.services`) |
| VM identity | `roles/aiplatform.user` for `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com` (`infrastructure/ecosystem-debian/receipt-recognizer.tf`); plan SHA256 `5417d34a05daaf957668ad34788a9d9e4d2cf5bc2b36e06f07564f2ec8f67c45` |
| Firewall | `allow-receipt-recognizer-run-egress`, INGRESS priority 1000, source `10.148.0.0/20`, target the VM identity, TCP 8790 |
| DEV command service | `mw-credit-app-command-dev`: Direct VPC egress (network and subnet `default`, private ranges only); `DEV_RECEIPT_RECOGNITION=enabled`, `DEV_RECEIPT_RECOGNITION_URL=http://10.148.0.2:8790/v1/receipt-recognition` (also the ID-token audience); Ready, 100% traffic, `/health` 200. Plans: infrastructure first apply `c028ec5428091545fdf432b9f6640b1d0ca48b59ce07be2ef0d72971c80ab417`, image `08ce3fef0ac32023ee53cd97b5f31236f7bc9b757ba95e11647fa301a15471e2`, enable `4535dc6223838f8472dba255919e3aed758a67817fb63fdd234df823ac045853`. 19 October 2026: image-only plan `ce4eac599f44488ac22974535e1520322e8c007fff0f8557f2522e68bdf4ab4b` (0 add, 1 change, 0 destroy), revision 00042-wt8 Ready 100%; recognition wiring unchanged. R077, 19 October 2026: image build `c7cf6545…`, plan `a0b1471708aa797ed8d35efee6a83ede511587e91c179470b9237c020134201a` (0 add, 1 change, 0 destroy), revision 00043-gf9 with request timeout 55 s; recognition wiring unchanged |
| DEV activation tfvars | Private `activation/dev.activation.tfvars`, generation `1792397557965593`; rollback generations `1792391699950933` (revision 00042-wt8), `1792347299798067` and earlier |
| Previous DEV image | `sha256:1fb9d763451ca5c67b67d54bf8c93df8ece99e99928a32f6efcd207c8228dfcd` (R069) |
| Recognizer address | Pinned ephemeral VM internal IP `10.148.0.2`, port 8790; one shared URL and token audience; DEV and PROD are told apart by caller identity. VM Vertex egress uses external IP `136.85.96.197`, unchanged |
| PROD command service | Direct VPC egress `PRIVATE_RANGES_ONLY`, `PROD_RECEIPT_RECOGNITION=enabled` and `PROD_RECEIPT_RECOGNITION_URL` (the shared recognizer URL and audience). Plan sha256 `90807aced2ed91a2f69c6554173ab37e2d778189547d697ae5d4f426e03f7f58` (0 add, 4 change, 0 destroy) applied 19:31:02Z to 19:31:28Z. PROD activation tfvars generation `1792351902282633`; rollback generation `1792232347760054`. R076 (images only, plan sha256 `59320e58ca86b5c31286aaef9e73fc8e00efdfa4835a90efebd1e52ae31b48ad`, 0 add, 4 change, 0 destroy, applied 20:18:26Z to 20:19:02Z): recognition wiring unchanged; activation tfvars generation `1792354748092600`, rollback `1792351902282633`. R077 (4 images and the command request timeout 55 s, plan sha256 `9ecbb69b522f9efaa2906346b8284fa7b78c2fc1993f45277bf7a7be40c7742d`, 0 add, 4 change, 0 destroy, applied 08:13:52Z to 08:14:28Z on 19 October 2026): activation tfvars generation `1792397673917349`, rollback `1792354748092600` (R076 pins); V96 readback at 08:10:24Z, no SQL |
| PROD promotion package | Private `promotion-packages/r075/` in the operator bucket: package sha256 `0b3db664…`, receipt, plan, frontend tar, SQL release, CONNECT preflight (19:27:25Z) and authority record. Cloud Build source storage generation `1792351005968484` |


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
