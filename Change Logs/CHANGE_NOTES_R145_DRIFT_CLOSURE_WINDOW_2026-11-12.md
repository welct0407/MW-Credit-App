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
| Byte's checks (lint, typecheck, `component-versions` unit tests) | Pass, as run in the PR head `a357f7d5` |
| Verification report (Chase) | Pass: the window logic is sound; the blocker (tracker cell form) and one low finding were fixed in the PR |
| `npm run check:docs` (Dewey) | Pass, 0 failures, 0 warnings |
| CI on the pull request | Pass: `Development checks` run 43196242411 on `a357f7d5` (tree `e7e96404`, identical to merge `89e388d1`) |

## Not run
No image, Hosting, agent, SQL, Grafana or Metabase action: none changed. The live `drift` run in the tag-to-closure window is the promotion verification and is recorded at closure.

## Recovery
Revert the pull request; the previous behavior only refuses to run in the closure window.

## Open questions
None.

## Remaining work
Owner acceptance in PROD. Nothing else.

## PROD promotion record (Forge, 12 November 2026 UTC)
Authority: the owner's instruction of 12 November 2026, "Fix the drift check in R145 and promote to prod", relayed by the orchestrator. Tooling only, so nothing was deployed: no image, Hosting, agent, SQL, Grafana or Metabase change, and no live write. No secret value appears here.

| Step | Result |
| --- | --- |
| Package | `89e388d1128c9dcdc47013585a3b1d243ee28184` (merge of PR #295; tree `e7e96404` equal to the tested head `a357f7d5`, CI run 43196242411). Baseline R144 `51ba52d3` |
| Derive | `derive --release R145 --commit 89e388d1`: no component changed (every row keeps R144 or earlier; schema V145, agent revision 37) |
| Tag | `R145` on `89e388d1`, Release tag run [43196804487](https://github.com/welct0407/MW-Credit-App/actions/runs/43196804487) (success, 10:02:38Z to 10:03:06Z); the GitHub Release body carries "## Component versions" |
| Drift (the fix's verification) | After the tag, with the tracker still showing R145 Open: `drift --env all --observed <private file> --strict` printed the info line "closure pending: the tracker's Open release R145 is already tagged…", expected PROD = R145 tags, DEV = R145 at `89e388d1`; 0 drift, 0 unverified (16 match, 5 vendor info), exit 0. The credentialed facts were re-read read-only around 10:02Z and equal the R144 facts (notify `/health` with an identity token, jobs by digest, Flyway 145 on both databases as `codex-cloud-read`, agent `/ready` over IAP SSH, Grafana tags with the provisioning token held in process, Metabase stamp from `Stamp-Release.mjs --check`) |
| check-source | `ok (Open R146, since R145: 0 dashboard file(s) checked)`, exit 0 |
| Deployment | None. Pins unchanged in the [environment inventory](../project/Documents/Environment_Inventory.md) |

### Prune at closure
Deleted (inbound links repointed to commit `c88b16ee`): `integration-agent/Change Logs/CHANGE_NOTES_R142_RECEIPT_READER_OPUS_QR_2026-11-11.md`, outside the window of the three newest Released releases (R145, R144, R143). No Development Changes section existed for R145 and no evidence was removed.
