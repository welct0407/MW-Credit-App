# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R072 — Open** |
| Next unused number | **R073**, only opened when authorized R072 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R071 | Frozen 18 October 2026 (Bangkok); PROD Hosting promotion in progress ([record](Development_Changes.md#r071-production-promotion)); on DEV | One refresh icon: syncs saved changes and every local dataset domain, with progress then the updated time or failed sections beside it, no offline red flash ([record](Development_Changes.md#r071-one-refresh-icon)); owner style decisions: Upcoming headings 20 px, coloured Collection group status labels, tablet dashboard heading spacing, brown Save and white Cancel on the borrower edit bar, check icon on Confirm payment, unused CSS removed, Thai pending-sync note (PR #55) (UI-only, branch `claude/r071-style-decisions`, on DEV; [record](Development_Changes.md#r071-style-decisions)); DEV web builds switch to the MW Credit DEV web app `appId` from `mw-credit-app-dev-firebase-web` (owner decision 17 October 2026; in effect on DEV; PROD unchanged); [rule](../../docs/Development.md#credentials-and-terraform); Debian agent 5b4e50d (audit_relay validator, 17:27:06Z) and live catalogue revision 28 (17:39:54Z), owner go 18 October 2026 |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

## Released releases

Status and records only; deployment pins are in the [environment inventory](Environment_Inventory.md). Records link a commit permalink, because each release closure deletes its sections from Development Changes.

| Release | Scope | Released | Record | Tag |
| --- | --- | --- | --- | --- |
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
