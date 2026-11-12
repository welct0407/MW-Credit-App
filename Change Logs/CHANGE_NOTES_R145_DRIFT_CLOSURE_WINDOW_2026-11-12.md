# Change notes — Drift check in the closure window (R145), 12 November 2026

## Purpose
Owner request of 12 November 2026: "Fix the drift check in R145 and promote to prod". After the R144 tag, `component-versions.mjs drift` refused to run until the closure pull request because it read the Open release from the tracker and found it already tagged. Tooling only.

## Changes
- `scripts/promotion/component-versions.mjs` (Byte): when the tracker's Open release is already tagged, `drift` and every subcommand that reads the Open release treat that tag as the latest released release and print that closure is pending.
- Defect found by Chase: the R144 closure (on `main` `2dd2223e`) wrote `| New product work | **R145 — Open** (no scope yet) |` in `Release_Tracker.md`, which `openRelease` in `scripts/build-live-dev.mjs` does not parse, so `build:live-dev`, `drift` and `check-source` threw "no Open release row". Fixed by restoring the canonical `| New product work | **R145 — Open** |` (the scope lives in the R145 paragraph); Byte adds a regression test that parses the real tracker.
- Records (Dewey): `Release_Tracker.md` (R145 scope), `Development_Changes.md` (the R144 follow-up row marked addressed), `scripts/promotion/README.md` and `Release_Workflow.md` (drift can run right after the tag, before closure), this note.
- Documents checked and unchanged: `Environment_Inventory.md` (no deployment pin or component change), Solution Design, data model and dictionary, monitoring documents.

## Checks
| Command | Result |
| --- | --- |
| Byte's checks (lint, typecheck, `component-versions` unit tests) | Pending |
| Verification report (Chase) | Pending |
| `npm run check:docs` (Dewey) | Pending |
| CI on the pull request | Pending (PR `Development checks`) |

## Not run
No image, Hosting, agent, SQL, Grafana or Metabase action: none changed. The live `drift` run in the tag-to-closure window is the promotion verification and is recorded at closure.

## Recovery
Revert the pull request; the previous behavior only refuses to run in the closure window.

## Open questions
None.

## Remaining work
Merge, Release tag R145, the live `drift` run before closure, then the closure pull request.
