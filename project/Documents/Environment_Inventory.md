# Current environment inventory

Updated 16 October 2026 from existing deployment evidence, bounded R062 DEV verification and the R063 Wave 3 live changes. PROD R062 settings delivery was verified at 10:02:59 Bangkok. This document lists current bindings and latest verified state; no unrelated live audit was performed.

| Component | DEV | PROD |
| --- | --- | --- |
| Origin | https://dev-lm.mw-credit.com | https://lm.mw-credit.com |
| Firebase Hosting site | mw-credit-app-dev-737787224638 | mw-credit-prod-737787224638 |
| Business database | loan_manager_dev | loan_manager_prod |
| Flyway | V92; 93 migrations validated, role reconciliation clean and temporary authority restored | V92; 93 migrations validated, temporary authority restored |
| Cloud Run workers | mw-credit-app-notify-dev / mw-credit-app-jobs-dev | mw-credit-app-notify-prod / mw-credit-app-jobs-prod |
| Worker time zone | Asia/Bangkok | Asia/Bangkok |

Google project: `clever-oasis-508610-n7` (737787224638), region `asia-southeast1`. Shared Cloud SQL: `appsheet-pg-prod-20260914`, public host `34.21.174.215:5432`. Preserve that resource name. Verify the complete project/instance/database tuple for any operation.

Private receipts: `gs://mw-payment-receipts-prod-508610-n7`. Agent originals and manual uploads retain their existing validated paths. Public access is not enabled. AppSheet connection records are removed; current service identities own access. Do not restore old store keys.

## Latest verified deployments

| Component | Pin / evidence |
| --- | --- |
| DEV frontend | Hosting `955fa49b579be5f9` (R063 Wave 3 final, app source `fbd1260`: CSP, `X-Frame-Options: DENY`, immutable `/assets/**`); rollback `ae32fb05bfc17a38` (first W3 deploy), before W3 `edf06b9da5841b1d`; [R063 Wave 3 record](Development_Changes.md#r063-wave-3) |
| DEV reader | Runs `services/production/business-server.mjs` with `APP_ENV=dev` from image `api@sha256:d35ff75e92fa7382df5520e63a51ba5e52f485a8c1c40303aa0f8ed6340084b6` (also notify and jobs; revisions read-00023, command-00030, notify-00003, jobs-00003); database user `mw-credit-app-read-dev`; [R063 Wave 3 record](Development_Changes.md#r063-wave-3) |
| DEV command | Same image and entry point as the reader with the DEV command identity; Cloud Run timeout 15 s (as PROD); previous image `keep-dev-20261016-abe73330`; [R063 Wave 3 record](Development_Changes.md#r063-wave-3) |
| PROD frontend | source `ed835cd018f7219e54e8320362c84fa707a260cd`, Hosting `45b1899bbd18ba3e`, release `1792033365993000`, marker `2217c9bbe74a92226b093c9c`, entry `index-h1RmjkW0.js`; exact-byte/no-store verification 15 October 2026 10:02:59 Bangkok; [R062 record](Development_Changes.md#r062-production-promotion) |
| PROD reader | preserved Ready100% `00005-v9z`, image SHA256 `105e815709717c381f3f6b85e9279aa5e30f2b601405b3d7c184ca1114ed1933`, source7aecf695; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| PROD command | `mw-credit-app-command-prod-00009-qf9`, Ready/100% traffic; source `ee079ed25a1a05c352dd5d2cd7b00c2d772d1aac`, digest `3191a0ec6d212f744d60dbe933181343b1f2ef6359b6bd987424350a699b9a89`; exact PROD bindings, health200 and unauthenticated preferences401 verified; [R062 record](Development_Changes.md#r062-production-promotion) |
| PROD notify / jobs | preserved revisions `00003-bj4` / `00003-q4h`, digests `b4f528bc8ac48008ed0951e227089d3d0802a7a6c2dbaa826ada5e021e156aea` / `11c149f746bceefc0b4c5d81dfce0295cdca533fa36d63c101f9971f3f643d56`; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| Repository | Single repository `welct0407/MW-Credit-App` (since 15 October 2026): `project/` (former AppSheet-Loan-Project), root (PWA/API/SQL/infrastructure), `integration-agent/` (former MW-Integration-Agent). DEV/PROD deploy identity unchanged. | Same |
| Debian | vm-mw-credit-agent, R063 Waves 1–2 deployed from `main` `5d39db6c613710859b6dcfa3236f7599d4db9b51` (`code_version`), catalogue 27 unchanged, verified 16 October 2026 13:20 Bangkok: `/ready` 200 with that `code_version`, receiver restarted once (InvocationID `5b59c66d…`), seven unit files updated, six worker timers resumed and first runs exit 0, host monitor `webhook_local=1` from `/ready`; [W2 record](../../integration-agent/Change%20Logs/CHANGE_NOTES_W2_AGENT_DEPLOYMENT_2026-10-16.md#deployment-16-october-2026). Rollback: `deploy-runtime.py rollback` from `/var/lib/mw-integration-agent/rollback/runtime-20261016T061942514997Z` (previous R058 package `a8cf94999aee33e9762614241b31904a967b7cac`, whose `.py` tree equals `main` `58929d7` plus the dead `appsheet.py`; previous monitor `/opt/mw-resource-monitoring/debian-health.before-r063w2-20261016.py`). Source checkout `/opt/mw-integration-agent-src` is a full (unshallowed 16 October 2026) clone of `welct0407/MW-Credit-App` `main` at `5d39db6`, repo-scoped read-only deploy key; [R058 record](../../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status) |
| Grafana | Performance41, Cost15, PWA Platform2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source808cdf5 records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by MW-Integration-Agent's service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

R060 corrected the confirmed production-store mode veto for main offline-dataset reads. Exacttarget/health/auth-gate verification passed; no authenticated traversal is claimed because the bounded natural-log query had no events. [Recovery and evidence](Development_Changes.md#r060-production-offline-dataset-recovery).

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; once applied, a GCP-to-Azure federated credential lets the cloud environment act as that UAMI on demand through `scripts/azure-cloud-session.sh`, which mints a temporary token per command (no stored Azure secret, no session hooks); VM-01 power uses the wrapper `scripts/vm01-power.sh start|deallocate|restart`; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory. The Claude Code cloud environment is the primary executor for GCP, Cloudflare, Tailscale and Grafana work: it signs in as `codex-cloud` (project Owner) from the environment key `GCP_SA_KEY_B64` and runs every non-Azure Terraform stack through MW-Credit-App `scripts/Invoke-Terraform.ps1`, whose activation variables live under `activation/` in the state buckets (verified no-change plans, 15 October 2026). Azure stacks and the parked `production-bootstrap` state still require VM-01. Database access from the cloud environment uses an IAP SSH tunnel to `vm-mw-credit-agent`'s loopback Cloud SQL Auth Proxy (`codex-cloud` instance key in Secret Manager `mw-credit-cloud-operator-ssh-key`); migrations still run as `postgres`, and routine reads use IAM database user `codex-cloud-read@clever-oasis-508610-n7.iam`; `codex-cloud@…iam` (member of `postgres`) is for the guarded runner and writing scripts only. Guarded Flyway validate verified for DEV and PROD at V92. Backups (`Backup-ProductionPromotion.py`, as `codex-cloud-read`, which needs the prepared PROD CONNECT grant) and promotion receipts are kept in private bucket `gs://mw-credit-operator-private-737787224638`; PROD Hosting promotion acts as `mw-credit-unattended-admin` through `codex-cloud`'s Token Creator grant. Debian administration and MW-Integration-Agent deploys use `mw-debian-ssh` (IAP, pinned host key); deployed source verified `5d39db6` (16 October 2026).

## DEV composition and access (R063 Wave 3, 16 October 2026)

- DEV services: the reader and command services run `services/production/business-server.mjs` with `APP_ENV=dev`, DEV origins and the DEV capability policy secret `mw-credit-app-dev-capability-policy` (version 1, owner only, all four capabilities; evidence sha256 `175831e3eef5b2608d4dec34a1c58178ba342c473a34b63bee0d0f864030abcc`). Notify and jobs use the same image. The foundation API service `mw-credit-app-api-dev`, its service account `mw-credit-app-dev@` and `dev-server.mjs`/`dev-read-server.mjs` are retired. The workers module is `infrastructure/modules/workers`.
- DEV schedulers `mw-credit-app-dev-notifications`, `-daily-charges` and `-recent-analytics` stay paused.
- Accepted design (APP-AUTH-04): DEV and PROD share Firebase project `clever-oasis-508610-n7` (issuer `securetoken.google.com/<project>`). Authorization is per environment: capability policy secret plus origin allowlist.
- Cloud SQL IAM users in DEV: dropped `mw-credit-app-dev@clever-oasis-508610-n7.iam`; kept `mw-credit-app-read-dev` (the DEV reader uses it), `-command-dev`, `-jobs-dev`, `-notify-dev`, `codex-cloud`. New: `codex-cloud-read@` (`pg_read_all_data`, CONNECT on `loan_manager_dev` only) and `mw-integration-agent@` (instance user role only; no database roles yet, prepared for the agent deploy).
- Grant state: `mw_reviewer_dml` has no DELETE on the nine tables in `loan_manager_dev` (reader `Partners."Partner Role"` column SELECT added to match PROD). PROD is unchanged pending the owner's go: DELETE grants, instance-wide `NOLOGIN`, and CONNECT for `codex-cloud-read` on `loan_manager_prod` and `mw_agent` are prepared in the [W3 operations note](../../Change%20Logs/CHANGE_NOTES_W3_OPS_2026-10-16.md).
- Firewall: three rules remain (IAP SSH `35.235.240.0/20` tcp:22, `default-allow-icmp`, `default-allow-internal`), all in Terraform. `default-allow-ssh` and `default-allow-rdp` were deleted.
- Debian VM: `deletion_protection = true`; snapshot policy `default-schedule-1` and its disk attachment, the uptime check `mw-webhook-external-health-*` and Cloud SQL IAM user `mw-integration-agent@` are in Terraform. Restore-to-new-VM rehearsed once (257 s); see the agent operations runbook.
- Service account keys: `codex-cloud` has one active key (bound to `GCP_SA_KEY_B64`) and one disabled key, pending an owner decision to delete it. Rotation every 90 days (next due 13 January 2027); see [unattended-admin](../../infrastructure/unattended-admin/README.md#cloud-executor-identity-and-key-rotation). Terraform declares the project Owner bindings (`codex-cloud` and the human owner, `prevent_destroy`) and the custom role `codexCloudVmLookup`.
- Backups: bucket `mw-credit-operator-private-737787224638` deletes `prod-backups/` objects after 180 days. A restore rehearsal is recorded in the [recovery runbook](Rules/Release_Recovery_Runbook.md#restore-from-backup-rehearsal).
- Artifact Registry cleanup policy on the DEV, PROD and bridge repositories: keep the 20 most recent versions, keep tag prefix `keep`, delete versions older than 30 days. Pinned digests:

| Repository / image | KEEP tag | Digest |
| --- | --- | --- |
| mw-credit-app-prod/api | `keep-r062-command` | `3191a0ec...` (PROD command) |
| mw-credit-app-prod/api | `keep-r059-read` | `105e8157...` (PROD reader) |
| mw-credit-app-prod/api | `keep-r059-notify` | `b4f528bc...` (PROD notify) |
| mw-credit-app-prod/api | `keep-r059-jobs` | `11c149f7...` (PROD jobs) |
| mw-monitoring/grafana-mcp-bridge | `keep-grafana-events-live` | `9ba9b0f2...` |
| DEV api | `keep-dev-20261016-d35ff75e` | `d35ff75e...` (current DEV image) |
| DEV api | `keep-dev-20261016-91ce1c28` | first W3 DEV image |
| DEV api | `keep-dev-20261016-abe73330` | previous DEV reader and command |
| DEV api | `keep-dev-20261016-ccb475d6` | previous DEV workers |

Pending owner items:

| Item | State |
| --- | --- |
| ALL-MON-03 Metabase and Railway checks | Owner-performed and pending: public sharing off, strong authentication, Railway backup scheduled |
| ALL-COST-01 GCP budget | Owner creates one budget: monthly average plus 50 percent, alerts at 50/90/100 percent |
| Grafana revamp (ALL-MON lines) | Deferred; every ALL-MON item becomes a line of that entry (see [Development changes](Development_Changes.md)) |
| ALL-ARCH-04 database tier | No instance change; pending until W4 moves receipt images out of the agent database |
| PROD promotion | Next promotion carries PROD Hosting CSP and `X-Frame-Options` (`scripts/hosting-headers.mjs`) and `WORKER_CALLER_SUBJECTS_JSON` for the PROD workers (they fail closed without it) |

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.
