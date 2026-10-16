# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R065 — Open** |
| Next unused number | **R066**, only opened when authorized R065 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R065 | Open | New product work. Carries nothing from R064. |
| R064 | Frozen 16 October 2026 21:49 Bangkok | Wave 4 scope applied and verified in PROD on 16 October 2026 (owner: "Go ahead to execute all the steps until wave 4 is fully done"): V93 (22:16 Bangkok), runtime image `8611c23d…` and Hosting `2b6c25c065f1a45a`, Cloud SQL tier/flags. Package: SQL `claude/review-w4-db` `9eee10e56974f04c464c70b1a815f70be9809c6c`, manifest SHA256 `033b10fc…bea9c`, V93 `d4e7e547…7013`; runtime/frontend `claude/r064-promotion` `355f3a3`. `mw_agent` 7-day purge in progress, agent V5 and agent deploy pending; sync correction pending. **Not yet Released**; no tag. [Record](Development_Changes.md#r064-production-promotion) |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

R063 runtime, workers and frontend is Released: source `main` `37f62121e9b04a163ebfa014e3240841b46d9a96`, one PROD image `86d172de…` on reader `00006-9dl`, command `00010-4s8`, notify `00004-q8t` and jobs `00004-p9t`, PROD Hosting `8154effa824f58e9` (CSP headers), V92 unchanged; DEV first, verified 16 October 2026 18:15 Bangkok; [record](Development_Changes.md#r063-production-promotion). R064 is Open; next R065.

R062 editable settings is Released, DEV/PROD V92, command API and Hosting verified15October2026 10:02:59Bangkok; [record](Development_Changes.md#r062-production-promotion). R064 is Open; next R065.

R061 directLoanDelete/sharedsubmitted-action frontend is Released: app/artifact `1e0dd73ae856ef55fdcdd6fc1e8097d5d9335817`, tool `5e8237917a5f54c59d281fedccd0651d4fe59194`, PRODHostingadaa39161d4af455 verified15October2026 03:27:42Bangkok; [existing record](Development_Changes.md#r061-prod-frontend-record-preparation). R064 is Open; next R065.

R060 command-only offline-dataset recovery is Released: source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`, PRODcommand00008-qb7 verified15October2026 at00:19:59Bangkok; [existing record](Development_Changes.md#r060-production-offline-dataset-recovery). R064 is Open; next R065.

R059 cumulative PWA package is Released: source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, DEV-first and PROD verified14October2026 at23:55:51Bangkok; [existing promotion record](Development_Changes.md#r059-pwa-production-preparation). R064 is Open; next R065.

R058 strict Instagram-first delivery is Released: Debian source `a8cf94999aee33e9762614241b31904a967b7cac` verified on 14 October at 14:53 Bangkok; [existing promotion record](../../integration-agent/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026). R057 technical retirement is Released. Owner license revocation is outside technical closure. Current versions/recovery evidence belong in the environment inventory and owning records. Completed release history remains in Git; no duplicate historical table is maintained here.

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
