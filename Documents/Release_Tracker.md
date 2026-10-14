# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R061 — Open** |
| Next unused number | **R062**, only opened when authorized R061 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R061 | Open | Unfinished integration deployment tooling: reload the active webhook receiver and verify readiness before workers resume; excluded from R060 API hotfix. Existing integration owning record below. |
| R060 | Frozen — 15 October 2026 00:17:38 Bangkok / 14 October 17:17:38 UTC | Owner approved command-only offline-dataset recovery: source `a2f683eb74f3c3c5dc027520642a07a07f4c1558`, PROD image SHA256 `327e4b2023ab19b59f4df5af38e382039c65168373e6a74db185c544bd5eff58`, reviewed0/1/0 plan. DEV verified; PROD apply pending; [existing record](Development_Changes.md#r060-production-offline-dataset-recovery). |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

R059 cumulative PWA package is Released: source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, DEV-first and PROD verified14October2026 at23:55:51Bangkok; [existing promotion record](Development_Changes.md#r059-pwa-production-preparation). R061 is Open; nextR062.

R058 strict Instagram-first delivery is Released: Debian source `a8cf94999aee33e9762614241b31904a967b7cac` verified on 14 October at 14:53 Bangkok; [existing promotion record](https://github.com/welct0407/MW-Integration-Agent/blob/codex/pwa-documentation-cleanup/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026). R057 technical retirement is Released. Owner license revocation is outside technical closure. Current versions/recovery evidence belong in the environment inventory and owning records. Completed release history remains in Git; no duplicate historical table is maintained here.

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
