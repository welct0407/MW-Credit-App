# Current environment inventory

Updated 15 October 2026 from existing deployment evidence and bounded R062 DEV verification. PROD R062 settings delivery was verified at 10:02:59 Bangkok. This document lists current bindings and latest verified state; no unrelated live audit was performed.

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
| DEV frontend | source `ed835cd018f7219e54e8320362c84fa707a260cd`, Hosting `8b12e5b06d79592a`, release `1792032726068000`, marker `a5781725520d742d303d325a`, entry `index-BMDLDRQr.js`; bounded verification 15 October 2026 09:52:19 Bangkok; [R062 record](Development_Changes.md#r062-editable-settings) |
| DEV reader | `mw-credit-app-read-dev-00020-m9t`, Ready and 100% traffic; digest `sha256:60c9f6c7cfe701264a5add48de2934fa18db8b418652e5622b054a2a40eb0958`, source `2ef73db`; DEV database/IAM/origins preserved; [R058 record](Development_Changes.md#r058-borrower-upcoming-batch) |
| DEV command | `mw-credit-app-command-dev-00027-8sb`, digest `sha256:ec92f1dd7cdb0285626ddb99f81a3e6dc7a6ee30aee61a88df1d66beff9a1494`, source `ee079ed25a1a05c352dd5d2cd7b00c2d772d1aac`; health 200 and unauthenticated management/preferences 401 verified, no authenticated business-smoke claim; [R062 record](Development_Changes.md#r062-editable-settings) |
| PROD frontend | source `ed835cd018f7219e54e8320362c84fa707a260cd`, Hosting `45b1899bbd18ba3e`, release `1792033365993000`, marker `2217c9bbe74a92226b093c9c`, entry `index-h1RmjkW0.js`; exact-byte/no-store verification 15 October 2026 10:02:59 Bangkok; [R062 record](Development_Changes.md#r062-production-promotion) |
| PROD reader | preserved Ready100% `00005-v9z`, image SHA256 `105e815709717c381f3f6b85e9279aa5e30f2b601405b3d7c184ca1114ed1933`, source7aecf695; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| PROD command | `mw-credit-app-command-prod-00009-qf9`, Ready/100% traffic; source `ee079ed25a1a05c352dd5d2cd7b00c2d772d1aac`, digest `3191a0ec6d212f744d60dbe933181343b1f2ef6359b6bd987424350a699b9a89`; exact PROD bindings, health200 and unauthenticated preferences401 verified; [R062 record](Development_Changes.md#r062-production-promotion) |
| PROD notify / jobs | preserved revisions `00003-bj4` / `00003-q4h`, digests `b4f528bc8ac48008ed0951e227089d3d0802a7a6c2dbaa826ada5e021e156aea` / `11c149f746bceefc0b4c5d81dfce0295cdca533fa36d63c101f9971f3f643d56`; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| Repository | Single repository `welct0407/MW-Credit-App` (since 15 October 2026): `project/` (former AppSheet-Loan-Project), root (PWA/API/SQL/infrastructure), `integration-agent/` (former MW-Integration-Agent). DEV/PROD deploy identity unchanged. | Same |
| Debian | vm-mw-credit-agent, R058 deployed `a8cf94999aee33e9762614241b31904a967b7cac`, catalogue 27, verified 14 October 2026 at 14:53 Bangkok; webhook receiver reloaded at 18:43 Bangkok to repair inbound commands, public verification/authentication checks passed; genuine 18:50 review command captured and acknowledgment accepted by Instagram; [deployment and recovery record](../../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status). Debian source checkout `/opt/mw-integration-agent-src` cut over to `welct0407/MW-Credit-App` `main` (`1d5045ff`, `integration-agent/`) on 15 October 2026 with a new repo-scoped read-only deploy key; deployed package unchanged (`a8cf949`), verify service ok, units untouched; old `MW-Integration-Agent` deploy key removed by the owner and the previous checkout deleted on 15 October 2026 |
| Grafana | Performance41, Cost15, PWA Platform2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source808cdf5 records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by MW-Integration-Agent's service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

R060 corrected the confirmed production-store mode veto for main offline-dataset reads. Exacttarget/health/auth-gate verification passed; no authenticated traversal is claimed because the bounded natural-log query had no events. [Recovery and evidence](Development_Changes.md#r060-production-offline-dataset-recovery).

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory. The Claude Code cloud environment is the primary executor for GCP, Cloudflare, Tailscale and Grafana work: it signs in as `codex-cloud` (project Owner) from the environment key `GCP_SA_KEY_B64` and runs every non-Azure Terraform stack through MW-Credit-App `scripts/Invoke-Terraform.ps1`, whose activation variables live under `activation/` in the state buckets (verified no-change plans, 15 October 2026). Azure stacks and the parked `production-bootstrap` state still require VM-01. Database access from the cloud environment uses an IAP SSH tunnel to `vm-mw-credit-agent`'s loopback Cloud SQL Auth Proxy (`codex-cloud` instance key in Secret Manager `mw-credit-cloud-operator-ssh-key`); migrations still run as `postgres`, and IAM database user `codex-cloud@clever-oasis-508610-n7.iam` (member of `postgres`) serves ad hoc work. Guarded Flyway validate verified for DEV and PROD at V92. Backups (`Backup-ProductionPromotion.py`, as `codex-cloud` with read-only `pg_read_all_data`) and promotion receipts are kept in private bucket `gs://mw-credit-operator-private-737787224638`; PROD Hosting promotion acts as `mw-credit-unattended-admin` through `codex-cloud`'s Token Creator grant. Debian administration and MW-Integration-Agent deploys use `mw-debian-ssh` (IAP, pinned host key); deployed source verified `a8cf949`.

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.
