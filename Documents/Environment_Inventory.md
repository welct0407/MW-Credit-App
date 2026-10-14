# Current environment inventory

Updated 14 October 2026 from existing deployment evidence and the bounded R058 DEV deployment checks. This document lists current bindings and latest verified state; no unrelated live audit was performed.

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
| DEV frontend | source `8aeaaa28f9aca3436c5b6b024d35e63389e7a343`, Hosting `7a5caa74e4a59435`, release `1791973934353000`, marker `cf6c59b50507d3bf91798c57`, entry `index-CkgJbBXm.js`; live-dev build, verified 14 October 2026 17:32 ICT; [R058 record](Development_Changes.md#r058-borrower-upcoming-batch) |
| DEV reader | `mw-credit-app-read-dev-00020-m9t`, Ready and 100% traffic; digest `sha256:60c9f6c7cfe701264a5add48de2934fa18db8b418652e5622b054a2a40eb0958`, source `2ef73db`; DEV database/IAM/origins preserved; [R058 record](Development_Changes.md#r058-borrower-upcoming-batch) |
| DEV command | `mw-credit-app-command-dev-00025-7qx`, Ready and 100% traffic; digest `sha256:bf6fb9137be02e7afcb9677b783a6fd8a71ae46b57ae710d3c248e22d12479ab`, source `6a3cf8cd`; existing DEV command bindings and notification enablement preserved; [R058 record](Development_Changes.md#r058-borrower-upcoming-batch) |
| PROD frontend | source c07ada0, Hosting 218943a0966051ca, release 1791825659922000; [actual record](../outputs/r054-production/promotion-actual.json) |
| PROD command / notify | revisions 00006-lrd / 00003-bj4, digest b4f528bc8ac48008ed0951e227089d3d0802a7a6c2dbaa826ada5e021e156aea; [V91 fix](../outputs/r056-apple-push/README.md) |
| PROD reader / jobs | unchanged by V91; [R053 actual package](../outputs/r053-notifications-jobs/promotion-actual.json) |
| Debian | vm-mw-credit-agent, deployed a8568e385051a20a3b7efd3374bade6c193d6882, catalogue27; [current retirement/agent proof](../outputs/r057-appsheet-retirement/README.md) |
| Grafana | Performance41, Cost15, PWA Platform2; [monitoring record](../outputs/r055-grafana/continuation.md) |
| Infrastructure | [Adoption and unattended-access matrix](../outputs/r057-infrastructure-adoption/README.md); source808cdf5 records completed network retirement |

Native schedules: notifications every minute for recovery; daily charges 00:05; recent analytics hourly. Immediate push is post-commit. Existing agent timers/cutoffs/routes are governed by MW-Integration-Agent's service catalogue.

The separate `mw_agent` database holds integration journals/audit state. Metabase remains on Railway, using governed PostgreSQL reporting sources and its own application database. The Debian-hosted borrower chart remains separately owned.

## Infrastructure and credentials

Terraform owns the adopted GCP/Grafana/Debian/DNS/Azure VM-01/network/backup, Cloudflare tunnel and Tailscale metadata within the completion matrix. Shared SQL contents, receipt objects and the Azure VM controller are outside that adoption. Preserve remote-state and resource deletion guards.

Dedicated VM-01 UAMI and Azure-to-GCP federation provide unattended administration; existing SystemAssigned identity/controller remain unchanged. Use the matrix and owning infrastructure runbooks for exact references. Credentials belong in Secret Manager; never copy values into this inventory.

## Retirement and remaining follow-ups

AppSheet's four retained cloud definitions are paused, all24 bots and API/key access disabled, account/team Sources and Integration Stores empty, weekly updates off. Seventy-three AppSheet-only SQL network entries were removed; the workstation/native routes remain. No AppSheet editor checks or reactivation are part of PWA delivery.

License revocation remains owner-controlled and unconfirmed. Lisa's post-V91 enrollment retry remains pending in its evidence. Paused credential migration remains unfinished. Temporary SSH cleanup was blocked by automatic review; its expiry and exact limitation remain in the retirement record. These facts are not claims of new tests.

Use [release tracker](Release_Tracker.md) for current release status; do not append old release checkpoints here.