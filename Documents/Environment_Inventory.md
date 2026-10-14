# Current environment inventory

Updated 14 October 2026 from existing deployment evidence and the bounded R059 DEV-first/PROD deployment checks. This document lists current bindings and latest verified state; no unrelated live audit was performed.

| Component | DEV | PROD |
| --- | --- | --- |
| Origin | https://dev-lm.mw-credit.com | https://lm.mw-credit.com |
| Firebase Hosting site | mw-credit-app-dev-737787224638 | mw-credit-prod-737787224638 |
| Business database | loan_manager_dev | loan_manager_prod |
| Flyway | V91 | V91 |
| Cloud Run workers | mw-credit-app-notify-dev / mw-credit-app-jobs-dev | mw-credit-app-notify-prod / mw-credit-app-jobs-prod |
| Worker time zone | Asia/Bangkok | Asia/Bangkok |

Google project: `clever-oasis-508610-n7` (737787224638), region `asia-southeast1`. Shared Cloud SQL: `appsheet-pg-prod-20260914`, public host `34.21.174.215:5432`. Preserve that resource name. Verify the complete project/instance/database tuple for any operation.

Private receipts: `gs://mw-payment-receipts-prod-508610-n7`. Agent originals and manual uploads retain their existing validated paths. Public access is not enabled. AppSheet connection records are removed; current service identities own access. Do not restore old store keys.

## Latest verified deployments

| Component | Pin / evidence |
| --- | --- |
| DEV frontend | exactsource `1e0dd73ae856ef55fdcdd6fc1e8097d5d9335817`, Hosting `248bea737cd1b078`, release `1792009142170000`, marker `b149131325ea45049ea7f884`, entry `index-DP4yhwdV.js`; verified15October2026 03:19:24Bangkok, API/SQL/PROD unchanged; [R061 record](Development_Changes.md#r061-direct-loan-delete-and-submitted-action-feedback) |
| DEV reader | `mw-credit-app-read-dev-00020-m9t`, Ready and 100% traffic; digest `sha256:60c9f6c7cfe701264a5add48de2934fa18db8b418652e5622b054a2a40eb0958`, source `2ef73db`; DEV database/IAM/origins preserved; [R058 record](Development_Changes.md#r058-borrower-upcoming-batch) |
| DEV command | `mw-credit-app-command-dev-00026-7lj`, Ready100%; digest `sha256:303c77cc8af3184ac13ffb58a4459d25b3ac8544db1873652acdc99801e4823a`, source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`; exactDEVbindings/health/auth-gate verified; [R060 record](Development_Changes.md#r060-production-offline-dataset-recovery) |
| PROD frontend | exact source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, Hosting `ca22762299e518df`, release `1791996880225000`, marker `63b8bc2e99685b0109f5dc90`, entry `index-CRty4uhK.js`; verified14October2026 23:55:51Bangkok checkpoint; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| PROD reader | preserved Ready100% `00005-v9z`, image SHA256 `105e815709717c381f3f6b85e9279aa5e30f2b601405b3d7c184ca1114ed1933`, source7aecf695; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| PROD command | `mw-credit-app-command-prod-00008-qb7`, Ready100%; source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`, image SHA256 `327e4b2023ab19b59f4df5af38e382039c65168373e6a74db185c544bd5eff58`; exactPRODbindings/health/auth-gate verified15October2026 00:19:59Bangkok checkpoint; [R060 record](Development_Changes.md#r060-production-offline-dataset-recovery) |
| PROD notify / jobs | preserved revisions `00003-bj4` / `00003-q4h`, digests `b4f528bc8ac48008ed0951e227089d3d0802a7a6c2dbaa826ada5e021e156aea` / `11c149f746bceefc0b4c5d81dfce0295cdca533fa36d63c101f9971f3f643d56`; [R059 record](Development_Changes.md#r059-pwa-production-preparation) |
| Debian | vm-mw-credit-agent, R058 deployed `a8cf94999aee33e9762614241b31904a967b7cac`, catalogue 27, verified 14 October 2026 at 14:53 Bangkok; webhook receiver reloaded at 18:43 Bangkok to repair inbound commands, public verification/authentication checks passed; genuine 18:50 review command captured and acknowledgment accepted by Instagram; [deployment and recovery record](https://github.com/welct0407/MW-Integration-Agent/blob/codex/pwa-documentation-cleanup/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-promotion-status) |
| Grafana | Performance41, Cost15, PWA Platform2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source808cdf5 records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by MW-Integration-Agent's service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

R060 corrected the confirmed production-store mode veto for main offline-dataset reads. Exacttarget/health/auth-gate verification passed; no authenticated traversal is claimed because the bounded natural-log query had no events. [Recovery and evidence](Development_Changes.md#r060-production-offline-dataset-recovery).

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory.

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.
