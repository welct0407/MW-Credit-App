# Release tracker

## Current development release

| Item | Current value |
| --- | --- |
| New product work | **R060 — Open** |
| Next unused number | **R061**, only opened when authorized R060 promotion starts |
| Current runtime baseline | [Environment inventory](Environment_Inventory.md) |

All new features/fixes use the sole Open release. Freeze only at authorized promotion start, pin the package, then publish the next Open number in the same update. Frozen corrections stay with their release; new features use the successor. Do not reserve a second Open release or reuse a number. Documentation/governance changes do not allocate releases.

## Releases requiring action

| Release | Status | Remaining action / owning record |
| --- | --- | --- |
| R060 | Open | Unfinished integration deployment tooling: reload the active webhook receiver and verify readiness before workers resume. Excluded from the frozen PWA package; existing integration owning record below. |
| R056 | Frozen; V91 deployed | Lisa enrollment retry/closure; [record](../outputs/r056-apple-push/README.md) |
| R055 | Frozen; monitoring delivered | Carried credential work unfinished; [record](../outputs/r055-grafana/continuation.md) |
| R016 | Owner-accepted reporting; administrative follow-up | Migration-key retirement evidence/final tag unresolved; do not reopen product development |

R059 cumulative PWA package is Released: source `7aecf695789fee3ca3b1fd1f2bece4c4a4bc8ba6`, DEV-first and PROD verified14October2026 at23:55:51Bangkok; [existing promotion record](Development_Changes.md#r059-pwa-production-preparation). R060 remains Open; nextR061.

R058 strict Instagram-first delivery is Released: Debian source `a8cf94999aee33e9762614241b31904a967b7cac` verified on 14 October at 14:53 Bangkok; [existing promotion record](https://github.com/welct0407/MW-Integration-Agent/blob/codex/pwa-documentation-cleanup/Change%20Logs/CHANGE_NOTES_RECEIPT_NOTIFICATION_ISOLATION_2026-10-02.md#r058-strict-instagram-fallback-candidate--14-october-2026). R057 technical retirement is Released. Owner license revocation is outside technical closure. Current versions/recovery evidence belong in the environment inventory and owning records. Completed release history remains in Git; no duplicate historical table is maintained here.

Follow [freeze/promotion](Rules/Release_Workflow.md#release-scope-freeze-and-number-handoff). The promotion record and delivery manifest carry authority, package pins, checks and recovery.
