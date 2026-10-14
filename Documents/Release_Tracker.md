# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R062 — Open** |
| Next unused number | **R063**, only opened when authorized R062 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R062 | Open | Editable Borrower/Partner flags and delivery Email, immediate persisted language and explicit saved cash-view defaults; [existing record](Development_Changes.md#r062-editable-settings), candidate `327aa25d58867d280d148aee3991cf386c4be244`/PR9, focused checks passed and canonical completed by segment recovery; appCI passed/database rebuildCI pending, DEVV91/V92pending after rolled-back migrate, two private-record approvals pending. Also carries unfinished integration deployment tooling: reload the active webhook receiver and verify readiness before workers resume. Excluded from R061frontend promotion; existing integration owning record below. |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

R061 directLoanDelete/sharedsubmitted-action frontend is Released: app/artifact `1e0dd73ae856ef55fdcdd6fc1e8097d5d9335817`, tool `5e8237917a5f54c59d281fedccd0651d4fe59194`, PRODHostingadaa39161d4af455 verified15October2026 03:27:42Bangkok; [existing record](Development_Changes.md#r061-prod-frontend-record-preparation). R062Open,nextR063.

R060 command-only offline-dataset recovery is Released: source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`, PRODcommand00008-qb7 verified15October2026 at00:19:59Bangkok; [existing record](Development_Changes.md#r060-production-offline-dataset-recovery). R062 is Open; nextR063.

R059 cumulative PWA package is Released: source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, DEV-first and PROD verified14October2026 at23:55:51Bangkok; [existing promotion record](Development_Changes.md#r059-pwa-production-preparation). R062 is Open; nextR063.

R058 strict Instagram-first delivery is Released: Debian source `a8cf94999aee33e9762614241b31904a967b7cac` verified on 14 October at 14:53 Bangkok; [existing promotion record](https://github.com/welct0407/MW-Integration-Agent/blob/codex/pwa-documentation-cleanup/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026). R057 technical retirement is Released. Owner license revocation is outside technical closure. Current versions/recovery evidence belong in the environment inventory and owning records. Completed release history remains in Git; no duplicate historical table is maintained here.

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
