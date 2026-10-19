# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R078 — Open** |
| Next unused number | **R079**, only opened when authorized R078 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R077 | Frozen 19 October 2026, about 08:09Z; promotion in progress | Package: source `683cfceed724778151e1e305adaea50b9ab20c94` (PR #79): receipt recognition timeouts (slip downscaled to 1600 px, recognizer limits 42/40/36 s, command route 45 s, PWA deadline 60 s, command Cloud Run request timeout 55 s in DEV and PROD). Runtime image on reader, command, notify and jobs, Hosting, PROD Terraform (timeout) and agent redeploy; no SQL. Owner instruction "yes, merge and push to dev and production once checks pass" (19 October 2026) is the scoped approval, recorded in the [R077 change note](../../Change%20Logs/CHANGE_NOTES_R077_RECOGNITION_TIMEOUTS_2026-10-19.md#promotion-authority). Closure: Released row, inventory pins, Release tag |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

## Released releases

Status and records only; deployment pins are in the [environment inventory](Environment_Inventory.md). Records link a commit permalink, because each release closure deletes its sections from Development Changes.

| Release | Scope | Released | Record | Tag |
| --- | --- | --- | --- | --- |
| R076 | Receipt recognition account hotfix: the slip's matched account overrides a preselected default, unmatched or ambiguous slip note, no warning without recipient numbers, messages above the preview. New image on the four services plus PROD Hosting, no SQL. Applied and verified in PROD; owner acceptance is the owner's production instruction, and the owner's PROD slip re-check is pending | 18 October 2026 (Bangkok) | [record](../../Change%20Logs/CHANGE_NOTES_R076_RECEIPT_ACCOUNT_HOTFIX_2026-10-18.md) | `R076` |
| R075 | Receipt recognition for manual payments (recognizer on the Debian agent, command route, manual payment command v7 with V96, Vertex and VPC infrastructure, fill-and-warn form) and the 23-operation agent audit closure. Applied and verified in PROD; owner acceptance is the owner's production instruction, and no PROD owner check with a real slip has happened yet | 18 October 2026 (Bangkok) | [record](../../Change%20Logs/CHANGE_NOTES_RECEIPT_RECOGNITION_PWA_2026-10-18.md) | `R075` |
| R074 | Release number and delivery tooling: per-job/stage-hash promotion gate, stage-hash CI evidence (PROD Hosting only) | 18 October 2026 (Bangkok) | [record](https://github.com/welct0407/MW-Credit-App/blob/2c28911c1cbd7dc292364fabf22bb6ceaec1b328/project/Documents/Development_Changes.md#r074-production-promotion) | `R074` |
| R073 | Offline refresh joins the running cycle between records segments (PROD Hosting only) | 18 October 2026 (Bangkok) | [record](https://github.com/welct0407/MW-Credit-App/blob/69c0a37dbdb4ed3ca759d477132291dd326d327e/project/Documents/Development_Changes.md#r073-production-promotion) | `R073` |
| R072 | About screen, encrypted troubleshooting file, service worker cache pruning, PROD theme colour, browser-tab icon and offline wording, payment review alignment (PROD Hosting only) | 18 October 2026 (Bangkok) | [record](https://github.com/welct0407/MW-Credit-App/blob/c8257ae68e082901fc28ab393be5c532b0526236/project/Documents/Development_Changes.md#r072-production-promotion) | `R072` |
| R071 | One refresh icon, style decisions and Thai pending-sync note (PROD Hosting only) | 18 October 2026 (Bangkok) | [record](https://github.com/welct0407/MW-Credit-App/blob/c9247c590bcfddd3b6f018cecc6c51cbc22ee881/project/Documents/Development_Changes.md#r071-production-promotion) | `R071` |
| R070 | IndexedDB reconnect hotfix, Review payment button, UX-HOLD-03/08 | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r070-production-promotion) | `R070` |
| R069 | W4 optional follow-ups and Referrer fixes | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r069-production-promotion) | `R069` |
| R068 | W4 follow-ups, Wave 5 UX and ALL-ARCH-03 2b | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r068-production-promotion) | `R068` |
| R067 | Tidy-ups after the old instance deletion | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r067-tidy-ups-after-the-old-instance-deletion) | `R067` |
| R066 | Offline receipts | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r066-offline-receipts-30-day-window) | `R066` |
| R065 | Pending-flash fix | 17 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r065-pending-flash-fix) | `R065` |
| R064 | Wave 4 and sync correction | 16 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r064-production-promotion) | `R064` |
| R063 | Runtime, workers and frontend | 16 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r063-production-promotion) | `R063` |
| R062 | Editable settings | 15 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r062-production-promotion) | `R062` |
| R061 | Direct loan delete and submitted-action feedback (frontend) | 15 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r061-prod-frontend-record-preparation) | `R061` |
| R060 | Command-only offline-dataset recovery | 15 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r060-production-offline-dataset-recovery) | `R060` |
| R059 | Cumulative PWA package | 14 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r059-pwa-production-preparation) | `R059` |
| R058 | Strict Instagram-first delivery (Debian) | 14 October 2026 | [record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md) | none |

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
