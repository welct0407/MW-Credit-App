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
Authority: the owner's "approve 1" and "merge when green and proceed with the promotion" of 25 October 2026, for the DEV then PROD promotion of the #163 and #164 lint changes and the dependency update. [Template](../project/scripts/releases/templates/promotion-checklist.md). Results are PENDING until each step runs.

### Plan (Forge)
- API image rebuild and PWA Hosting, DEV first and then PROD, through the R100 kind of `scripts/promotion/deploy-business-hosting.mjs` (baseline `e040373`, manifest `schemaVersion` 31).
- Runtime plan 0 add, 3 change, 0 destroy (read, command, chat); notify and jobs stay on their pinned images.
- No SQL, so no backup or owner window; PROD stays at migration 111. No VM deploy; the agent change is the operator-only `backup_journals` and needs none.

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | PENDING |
| Required affected checks passed | PENDING (pull request run on the merge commit) |
| Tested package captured; freeze pinned in this record | PENDING |
| DEV images and Hosting deployed and verified | PENDING |
| PROD images and Hosting deployed and verified | PENDING |
| Final tag created; outcome recorded; closure pull request published once | PENDING |
