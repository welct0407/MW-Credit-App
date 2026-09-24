# R024 promotion checklist

Single master: scripts/releases/templates/promotion-checklist.md. Scope: dashboard3 tab order only. Owner authorization: Performance tab5, Borrowers tab6.

| Stage | Status | Evidence |
| --- | --- | --- |
| Readiness, rollback and package pin | Done | Private dashboard before-image; plan.json; manifest.json; checked preparation commit |
| Freeze and successor handoff | Done | Tracker R024 Frozen/R025 Open published before report mutation |
| Report publication | Done | Tab18 fifth and tab6 sixth; correction described in README.md |
| Validation | Done | verification.json and browser-verification.json; 189 placements and parameters retained |
| Documentation closure | Done | Tracker, inventory, development differences, solution design, dictionary and change log |
| RC, SQL, AppSheet, external operations | N/A | Report tab order only; no RC or other runtime changes |
| Git publication and final tag | Done | R024 tag on final evidence commit; remote verified |

Rollback uses the private dashboard before-image; restore only tab names/positions while preserving intervening changes. No known remaining work in this scope.
