# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R068 — Open** |
| Next unused number | **R069**, only opened when authorized R068 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R068 | Open | New product work. Carries V94 (DB-LOCK-02 lease columns retired, DB-LOCK-03 shared lock key in SQL, reviewer 42501 reason; applied in DEV 17 October 2026, PROD still V93), the 30 s and on-focus dataset refresh, and the Linux agent backup script tooling. Nothing frozen; [record](../../Change%20Logs/CHANGE_NOTES_W4_DATABASE_2026-10-16.md#w4-follow-ups-17-october-2026). |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

R067 tidy-ups after the old instance deletion is Released: runtime `7d14078` (identity accepts only `mw-credit-pg-20261017`; branch `claude/r067-tidy` `7f8ef53`, PR #50) and IAM condition narrowing `009d9f2` (applied 16 October 20:38 to 20:40Z); no migration; PROD image `2251f2ce10b0…` on reader `00010-d7g`, command `00014-f6g`, notify `00008-x7w`, jobs `00008-pbq` (applied 17 October 2026 03:55 Bangkok, smoke 0 errors); CI Development checks 38964946002 and Database migrations 38963769276; annotated tag `R067` on `7f8ef53` (Release tag workflow, after PR #50 merges); [record](../../Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r067-tidy-ups-after-the-old-instance-deletion).

R066 offline receipts is Released: UI-only, Hosting-only on the unchanged R064 runtime; source `claude/offline-receipts` `229295b` (change `81e5fa4`, UX fixes in `229295b`, runner contract `3e1bffd`, PR #45); receipts stored once and kept offline for the last 30 days; DEV Hosting `0f181d5d61573ebf`, PROD Hosting `bc7b87e2ff693780` (release `1792174449402000`, applied 17 October 2026 01:13 to 01:14 Bangkok, smoke 15 of 15 files byte-identical, 0 errors); CI `ci.yml` 38944832577 green; annotated tag `R066` on `229295b` (Release tag workflow); [record](../../Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r066-offline-receipts-30-day-window).

R065 pending-flash fix is Released: UI-only, Hosting-only on the unchanged R064 runtime; source `claude/sync-pending-flash` `74ad26b` (fix `8926fe8`, runner contract `7e0225e`); DEV Hosting `bd0be642edfb653b` (owner: "tested on DEV, the flash is gone"), PROD Hosting `c24c62260e8723d9` (release `1792171753846000`, applied 17 October 2026 00:28 to 00:29 Bangkok, smoke 15 of 15 files byte-identical, 0 errors); CI `ci.yml` 38939174238 green; git annotated tag `R065` on `74ad26b` (Release tag workflow run 38941067405); [record](../../Change%20Logs/CHANGE_NOTES_R064_SYNC_2026-10-16.md#r065-pending-flash-fix).

R064 Wave 4 and sync correction is Released: V93 in PROD (16 October 2026 22:16 Bangkok, SQL `9eee10e`, manifest `033b10fc…`), Wave 4 runtime `8611c23d…` and Hosting `2b6c25c065f1a45a` (source `7c11863`, runner `355f3a3`), then the sync correction from `9420c85` (image `88b4dbad…`, reader `00008-xp4`, command `00012-67j`, notify `00006-rnq`, jobs `00006-rzs`, Hosting `7664add62c41bce6`), Cloud SQL `db-g1-small` with Query Insights and `max_connections` 200; verified 16 October 2026 23:57 Bangkok; annotated tag `R064` on `9420c85`; [record](Development_Changes.md#r064-production-promotion). Integration-agent follow-up (agent V5, Debian deploy, `mw_agent` purge) is tracked in [Development Changes](Development_Changes.md#r064-wave-4), not in this release. R066 is Open; next R067.

R063 runtime, workers and frontend is Released: source `main` `37f62121e9b04a163ebfa014e3240841b46d9a96`, one PROD image `86d172de…` on reader `00006-9dl`, command `00010-4s8`, notify `00004-q8t` and jobs `00004-p9t`, PROD Hosting `8154effa824f58e9` (CSP headers), V92 unchanged; DEV first, verified 16 October 2026 18:15 Bangkok; [record](Development_Changes.md#r063-production-promotion). R064 is Open; next R065.

R062 editable settings is Released, DEV/PROD V92, command API and Hosting verified15October2026 10:02:59Bangkok; [record](Development_Changes.md#r062-production-promotion). R064 is Open; next R065.

R061 directLoanDelete/sharedsubmitted-action frontend is Released: app/artifact `1e0dd73ae856ef55fdcdd6fc1e8097d5d9335817`, tool `5e8237917a5f54c59d281fedccd0651d4fe59194`, PRODHostingadaa39161d4af455 verified15October2026 03:27:42Bangkok; [existing record](Development_Changes.md#r061-prod-frontend-record-preparation). R064 is Open; next R065.

R060 command-only offline-dataset recovery is Released: source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`, PRODcommand00008-qb7 verified15October2026 at00:19:59Bangkok; [existing record](Development_Changes.md#r060-production-offline-dataset-recovery). R064 is Open; next R065.

R059 cumulative PWA package is Released: source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, DEV-first and PROD verified14October2026 at23:55:51Bangkok; [existing promotion record](Development_Changes.md#r059-pwa-production-preparation). R064 is Open; next R065.

R058 strict Instagram-first delivery is Released: Debian source `a8cf94999aee33e9762614241b31904a967b7cac` verified on 14 October at 14:53 Bangkok; [existing promotion record](../../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026). R057 technical retirement is Released. Owner license revocation is outside technical closure. Current versions/recovery evidence belong in the environment inventory and owning records. Completed release history remains in Git; no duplicate historical table is maintained here.

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
