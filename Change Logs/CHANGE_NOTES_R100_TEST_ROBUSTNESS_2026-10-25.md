# Change notes — R100 test robustness and promotion, 25 October 2026

## Purpose
Make two e2e specs robust against timing flakes before R100, and record R100. R100 carries the PWA and test lint changes merged in #163 and #164 and the dependency update; they were not deployed by R099 (bridge only). Owner decisions of 25 October 2026: "approve 1" (promote R100 to DEV and then PROD, covering those changes) and "merge when green and proceed with the promotion".

## Changes
- `tests/e2e/startup-generations-independent.spec.ts` (Byte): two fixes, no app bug.
  - Version check: under load the check fails after the saved workspace has restored, so the R083 inline banner "Couldn't check the app version. Changes are paused." with Retry shows instead of the full-screen card (`live-main.tsx:581-584`). `checkFailed(page)` now accepts either presentation for the visible and gone-after-Retry assertions; no timeout change.
  - R083 warm launch (line 71): the `repo()` read raced the page's navigation ("Execution context was destroyed", then "__syntheticRepo is not a function"). The read is tolerant, retries up to 5 times on those two errors only and waits for load and the bundle.
- `tests/e2e/phase5-final-ui-independent.spec.ts` (Chase): CI run 40187252614, shard 3, flaky at line 284 with `InvalidStateError: Cannot finish Animation with an infinite target effect end`; reproduced 8 of 15 locally. Both `finish()` loops now skip infinite animations.
- `scripts/promotion/deploy-business-hosting.mjs` and `scripts/promotion/README.md` (Byte): new R100 promotion kind, baseline `e040373`, no migration (PROD stays at 111), runtime plan 0 add, 3 change, 0 destroy (read, command, chat) with notify and jobs on pinned images (minimal scope, as R096 and R097), manifest `schemaVersion` 31, 3 unit tests, README R100 section.
- `integration-agent/` `backup_journals` (operator-only, from the lint batch) rides along; its note is `integration-agent/Change Logs/CHANGE_NOTES_TEST_RESOURCE_WARNINGS_2026-10-25.md`.
- `project/Documents/Development_Changes.md`: the R099 follow-up about the four bridge 400s is closed (Google-network requests to the default `run.app` host, rejected by design).

## Checks
| Command | Result |
| --- | --- |
| `startup-generations-independent.spec.ts` | Version check: about 1 failure in 30 before, 44/44 load runs after; forced-banner path 3/3. Warm launch: 16/16 alone at 4 workers; whole spec 18 pass, 6 project skips at 2 workers, 6 times (Byte) |
| `phase5-final-ui-independent.spec.ts` | 15/15 at 4 workers and 15/15 at 2 after the fix (Chase, reproduction and fix) |
| `business-hosting-delivery` unit tests | Test file 107 pass, 3 new for R100 (Byte) |
| Chase verification | Retry helpers rethrow on any other error, are bounded at 5 and read-only, so they cannot mask assertions; `checkFailed` requires exactly one of the two designed presentations (`StartupStatus.tsx:4` heading or `live-main.tsx:605` banner); the R100 runner kind mirrors R097 except the intended release fields and widens no deployable scope. One defect found and fixed by Byte: `--apply` never called `verifyR100LivePackage`, so it would have fallen through to the generic app-only live check and skipped the chat-runtime verification (fixed at `deploy-business-hosting.mjs:1101`); Byte audited all five R097 sites in the main block and R100 is now handled in each. No cheap CLI-path unit test exists for any release (noted). Unit file 107 pass (Chase) |
| Review of the changed flows | Not applicable: tests and tooling only, no UI change |
| `npm run check:docs` | 0 failures, 0 warnings |
| Development checks (pull request) | The pull request's run on this commit |

## Not run
No deployment in this batch; the promotion is recorded below once it happens.

## Recovery
Revert the batch commit. Promotion recovery is in the promotion record.

## Open questions
None. Owner decisions of 25 October 2026: the default bridge `run.app` URL stays enabled (`default_uri_disabled` not adopted), and the remaining apt-mirror stall risk on Playwright cache hits is accepted with no further CI change.

## Remaining work
The R100 promotion to DEV, then PROD, and its closure records.

## Promotion record
Authority: the owner's "approve 1" and "merge when green and proceed with the promotion" of 25 October 2026, for the DEV then PROD promotion of the #163 and #164 lint changes and the dependency update. [Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No borrower names appear here.

### Continue here
- Outcome/scope and affected components: R100 to DEV and PROD: read, command and chat Cloud Run images (one image) and PWA Hosting. No SQL, so no backup, owner window or runner. No VM: the only agent source change is the operator-only `backup_journals`. Notify and jobs stay on their pinned images.
- State and next action or actual blocker: applied and verified in DEV and PROD; tag `R100` on `c7ea78d` through the Release tag workflow, then the closure pull request. No blocker.
- Source/artifact/configuration pins; runner manifest link: PR #166, squash-merged as `c7ea78d15d65fd082d592fd459f1e315cb2770ca` on `main` (baseline `e040373`, the R097 package); the R100 runner kind is in the same commit, so the delivery-tool source equals the package source. No SQL manifest. Private package `promotion-packages/r100/` in the operator bucket (sha256 `e9d2a80f…5ce8`).
- Existing owner authority and any explicit hands-on checkpoint: as above. It does not cover a financial write, a forced notification or job execution. No hands-on checkpoint.
- Previous deployed baseline and recovery: DEV activation `1792914522201294` (R097 image, Hosting `fca3176cfe22e0db`); PROD activation `1792914793112585` (R097 overrides, Hosting `76c2910785f3b6e9`); recovery per Recovery below.
- Scope freeze/next-number handoff: in the closure pull request (R100 Released, R101 opened, counter R102). `MW_RELEASE_NUMBER=R100` for both builds.
- Checks: the runner's per-job CI gate accepted, with no dispatch: `Development checks` run 40207397614 (PR head `e7ae936`; check and the three e2e shards by stage-hash evidence artifacts for `c7ea78d`), run 40192545686 (terraform, by evidence artifact), `Database migrations` run 40189937613 (guards, input-equivalent ancestor `540855c`) and run 40181243362 (the four rebuild groups, by evidence artifact). The main push run 40208152409 on `c7ea78d` passed with jobs reused.

### Promotion
| Step | Identity | Commands and exact route | Verification | Recovery | Evidence |
| --- | --- | --- | --- | --- | --- |
| 0. Merge and pin | the session's GitHub tools | PR #166 squash-merged; `main` pinned at `c7ea78d` | `main` head equals the pinned commit, checked before the builds | revert commit | checks above |
| 1. DEV images | Forge (F); builder `mw-credit-app-build` | Cloud Build `be997c96` (`cloudbuild-command.yaml`) from a clean clone at `c7ea78d`; new DEV activation (three image keys); plan 0/3/0, images only, applied 15:51:12Z to 15:51:48Z; re-plan clean | revisions read `00044-jkk`, command `00061-lhq`, chat `00012-hfb` at 100%; notify and jobs unchanged; `/health` 200; unauthenticated 401 on read, command and chat; signed-in `/api/collection` 200 with 21 items (Claude test account); no ERROR logs | restore DEV activation `1792914522201294` and apply | activation generation `1792943468979008`; pins in the inventory |
| 2. DEV Hosting | Forge (F); `codex-cloud` | `.env.live-dev` written from Secret Manager `mw-credit-app-dev-firebase-web` plus the live bundle's settings, `MW_RELEASE_NUMBER=R100 npm run build:live-dev`, file deleted; `deploy-hosting.mjs --live-dev --check`, then deploy 15:54:42Z to 15:54:50Z | compiled configuration equals the R097 live bundle; live `build-version.json` release `R100`; `no-store` | redeploy Hosting `fca3176cfe22e0db` | release `1792943689556000` |
| 3. PROD images | Forge (F); builder `mw-credit-app-build-prod`; read-only check as `codex-cloud-read` | read-only `Invoke-CloudFlyway.py verify --target prod` 15:58:23Z; Cloud Build `98123319` (`cloudbuild-business.yaml`) of a git archive of `c7ea78d`, tag `keep-r100-runtime`; overrides `{ read, command, chat }`; plan 0/3/0 (sha256 `a75bcfd4…1fb5`), applied 15:59:54Z to 16:00:33Z, re-plan clean | readback: version 111, 111 history rows, validation successful, 0 writes; revisions read `00027-v2d`, command `00032-zmt`, chat `00010-mzg` at 100%; notify `00022-4lt` and jobs `00022-42m` unchanged; `/health` 200, unauthenticated 401; no ERROR logs | restore PROD activation `1792914793112585` and apply | activation generation `1792943991291907` |
| 4. PROD Hosting | Forge (F); operator `mw-credit-unattended-admin` | `buildProductionBusinessCandidate` (release `R100`, the R097 public config input); `deploy-business-hosting.mjs --check`, then `--apply` 16:02:33Z to 16:03:22Z (live readback of operator, CI and services inside the runner) | public config sha256 equals the live R097 file; live `build-version.json` release `R100`; `no-store` | redeploy Hosting `76c2910785f3b6e9` | release `1792944194749000`; receipt `promotion-receipts/R100-HOSTING-RECEIPT.json`, private |
| 5. Records, tag | `codex-cloud`; the Release tag workflow | tag `R100` on `c7ea78d` first (Release tag workflow), then the closure pull request: inventory, tracker (Released, R101 opened), Development Changes, this note, prune | tag exists; `npm run check:docs` passes | never move an existing tag | tag `R100` on `c7ea78d`; records in the closure pull request |

### Close
- Outcome: applied and verified in DEV and PROD (25 October 2026); no SQL, no VM. Package: `c7ea78d` for both environments.
- Recovery reference: Recovery above and the inventory rollback pins.
- Changed documents: this note and the Environment inventory (R100 pins); the tracker (R100 Released, R101 Open, counter R102) and Development Changes in the closure pull request.
- Published evidence/tag: tag `R100` on `c7ea78d` through the Release tag workflow. Package and receipt are private, outside Git.
- Outstanding owner action, if any: none. Acceptance is recorded in the next closure or product pull request.

### Closure pruning (release workflow, 25 October 2026)
- Inbound links repointed first to the commit permalink of `45b65ae` (the last commit where the target exists): the R097 paragraph and the R097 row in `project/Documents/Release_Tracker.md`.
- Change note deleted (R097 left the retention window of R100, R099 and R098): `Change Logs/CHANGE_NOTES_R097_COLLECTION_PREPAID_AMOUNT_2026-10-25.md`.
- Development Changes: one R100 follow-up row added; the R099 follow-up text updated; no section to delete.
- Evidence deleted: none.
