# Change notes — R097 Collection row amount for prepaid charges, 25 October 2026

## Purpose
After viewing R096 the owner found that a borrower who paid today's charge on an earlier day showed a collected amount of 0. Owner follow-up of 25 October 2026, verbatim: "the collected amount shows 0 ... for this scenario, the amount should be shown as today's charge received amount instead of 0". The owner chose: show the amount on the row only (the "Collected" header and totals stay today's cash), build COLL-UX-01, and "Yes, to production". Designed by Archie (A) and Echo (E); Byte (B) implements, Chase (C) checks, Dewey (D) records, Forge (F) deploys. No borrower name is recorded here.

## Changes
- `services/api/collection-read-contract.mjs`: the Summary gains `prepaidToday` and `prepaidOnly`. `prepaidOnly` is true when at least one charge is dated today, all of them were paid earlier, and no unpaid eligible charge exists.
- `apps/pwa/src/CollectionRecords.tsx`: the borrower row's right amount is collected today plus `prepaidToday`; the status line reads "Paid in advance" / "ชำระล่วงหน้าแล้ว" when `prepaidOnly` (COLL-UX-01). Amounts, group totals and ranking are unchanged.
- `services/business/offline-dataset-delta.mjs`: the offline dataset tag moves to `business-offline-v5`, so installed clients rewalk once.
- `services/api/synthetic-read-adapter.mjs` and `.d.mts`, `apps/pwa/src/preview-session.ts`: synthetic data and preview support the new fields.
- `scripts/promotion/deploy-business-hosting.mjs` and README: an R097 promotion kind (baseline `3cbbcea`, no SQL, read, command and chat images plus Hosting).
- `docs/Development_Read_Service.md`: the read contract description.
- Tests: unit (`collection-read`, `collection-receiving-display`, `read-contract`, `production-business`, `business-hosting-delivery`), integration `collection-postgres`, e2e `collection-read.spec`.
- `project/Documents/PWA_Data_Model_Overview.md` and `project/Documents/Development_Changes.md`: the row-amount rule and the R097 entry; the R096 follow-up row drops COLL-UX-01.
- `tests/unit/worker-runtime.test.mjs` (test-only, added after Chase's review): VAPID keys are regenerated until they are 32 bytes. About 1 in 170 generated keys was 31 bytes and failed the 43-character config check, an intermittent unit failure.
- Board row sum (added after Chase's review): it returns null for a row with no amounts, and a row without `prepaidToday` shows `amountCollected` unchanged. Without it a fixture row with no `amountCollected` crashed the page and the phase5 native-pull e2e test failed (Byte reproduced it on `9517bf2`; it passed on `main`; after the fix that spec and collection-read passed).
- No SQL migration, no financial write, no VM.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte, uncommitted tree on `3cbbcea`) |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass, 913 pass |
| Integration `collection-postgres` | Pass, 21 of 21 |
| e2e `collection-read.spec` | Pass, 2 passed |
| `npm run check:docs` | Pass, 0 failures (Byte; Dewey re-run on the records) |
| Chase adversarial review | No defects. Covered SQL NULL handling, the decimal sum, unchanged amounts and ranking, completeness of the offline v5 bump, the own-write and delta paths, and the promotion kind. It predates the two later commits above; the row sum fix is covered by Byte's reproduction and CI |
| PROD read-only data check after the apply | 20 borrowers on the board, 1 with `prepaid_only` true, `prepaid_today` sum 200.00 THB |
| DEV signed-in `/api/collection` | 200; all 21 items carry `prepaidToday` and `prepaidOnly`, none `prepaidOnly` today |
| Echo UI check (local build of `e040373`, R097 fixture, Chromium 428 px, English and Thai) | Pass: "Paid in advance" / "ชำระล่วงหน้าแล้ว" aligns with the other status lines; the right amount (100 THB) is green and right-aligned; the group header still reads "Collected 0" / "รับแล้ว 0"; no horizontal scroll. Not WebKit, not a real device. Echo noted, without raising it, that a green row amount under a 0 header could look odd at first glance; the status label explains it |
| Phase5 native-pull e2e and collection-read e2e after the board row sum fix | Pass (Byte) |
| Pull request `Development checks` | Pass, run 40173388080 on head `3edc4d5` (PR #154, merge `71b31c66`) |
| `Database migrations` | Pass, run 40172628744 on `bedf46b`; no database-path changes since |

## Not run
- The local wide browser suite: the pull request run is the one broad run.
- The owner's real-device view of the row amount and status line: done; the owner confirmed on 25 October 2026 that it works on their phone.

## Recovery
Git: revert the R097 merge commit on `main`. Deployment: redeploy the R096 images and Hosting (rollback pins are in the [Environment inventory](../project/Documents/Environment_Inventory.md)). No database change. Installed clients rewalk the offline dataset once more on rollback.

## Open questions
None blocking. Accepted edge case (Chase, accepted by the orchestrator): a prepaid charge today plus cash today on an older charge still gives `prepaidOnly` true, and the row amount includes that cash. The R096 follow-ups remain: Metabase/OLAP "Daily Collection Status" (V22, needs a migration) and the negative `Days Outstanding` for a prepaid charge.

## Remaining work
R097 is promoted. Left: the owner's real-device view and the tag `R097` through the Release tag workflow.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No borrower names appear here. Status: **applied and verified** in DEV and PROD (25 October 2026); the owner's real-device check is pending.

### Continue here
- Outcome/scope and affected components: R097 to DEV and PROD: read, command and chat Cloud Run images and PWA Hosting. No SQL, so no backup, owner window or runner. No VM.
- State and next action or actual blocker: applied and verified; tag `R097` on `e040373` through the Release tag workflow (pending). No blocker.
- Source/artifact/configuration pins; runner manifest link: PR #154, squash-merged as `71b31c66133f581d0ff3f21661a61f9af1f2a4f2` on `main` (baseline `51287351`; R096 package `3cbbcea`). No SQL manifest.
- Existing owner authority and any explicit hands-on checkpoint: the owner's follow-up of 25 October 2026, answer "Yes, to production" (with R096's "push all the way to production" context). It covers the merge, DEV and PROD images and Hosting for this scope. It does not cover a financial write or a forced notification. No hands-on checkpoint.
- Previous deployed baseline and recovery: DEV activation `1792911159960955` (images `40e5c4c9…`, Hosting `b87c046552f15344`); PROD activation `1792911431958316` (overrides `86e42ed5…`, Hosting `16f8ba03723c0b21`); recovery per Recovery above.
- Scope freeze/next-number handoff: at promotion start one tracker update marks R097 Frozen, opens R098 and advances the counter to R099. `MW_RELEASE_NUMBER=R097` for the PROD build.
- Checks: `Development checks` run 40173388080 and `Database migrations` run 40172628744, both green.

### Promotion
| Step | Identity | Commands and exact route | Verification | Recovery | Evidence |
| --- | --- | --- | --- | --- | --- |
| 0. Merge and freeze | the session's GitHub tools | merge the pull request; one tracker commit (R097 Frozen, R098 Open, counter R099) | `main` head equals the pinned commit; checks cited | revert commit | PR #154 squash-merged as `71b31c66`; runs 40173388080 and 40172628744 green; tracker frozen 25 October 2026 07:45Z (R097 Frozen, R098 Open, counter R099) |
| 1. DEV images and Hosting | Forge (F) | Cloud Build `518de48a` from `71b31c6`; plan 0/3/0 (read, command, chat), applied 07:47:28Z to 07:48:07Z, re-plan clean; Hosting build with `MW_RELEASE_NUMBER=R097` | revisions read `00043-9wf`, command `00060-mq7`, chat `00011-45m`; `/health` 200 and 401; signed-in `/api/collection` 200, all 21 items carry the new fields; Hosting `fca3176cfe22e0db` (release `1792914559456000`, 07:49:11Z, `no-store`) | restore DEV activation `1792911159960955`; Hosting `b87c046552f15344` | activation generation `1792914522201294`; pins in the Environment inventory |
| 2. PROD images and Hosting | Forge (F); read-only checks as `codex-cloud-read` | Cloud Build `87eb3c7f` from `e040373` (tree-identical in code to `71b31c6`); read-only database readback 07:51:16Z; overrides `{ read, command, chat }`; plan 0/3/0, applied 07:52:06Z to 07:52:44Z, re-plan clean; `deploy-business-hosting.mjs` `--check` then apply 07:54:04Z to 07:54:49Z | readback: version 111, 111 rows ok; revisions read `00026-tz8`, command `00031-tl9`, chat `00009-xvw`; `/health` 200 and 401; notify `00022-4lt` and jobs `00022-42m` unchanged; no ERROR logs; Hosting `76c2910785f3b6e9`, R097 `no-store`, the live entry equals the build | restore PROD activation `1792911431958316`; Hosting `16f8ba03723c0b21` | activation generation `1792914793112585`; Hosting release `1792914882591000`, package sha256 `23e9443d…1a6b`; the receipt is private, outside Git |
| 3. Records, tag | `codex-cloud`; the Release tag workflow | done in the closure commit: Environment inventory, tracker (Released), Development Changes, this note; tag `R097` on `e040373` | tag exists; `npm run check:docs` passes | never move an existing tag | records in the closure commit; tag pending the workflow |

### Close
- Outcome: applied and verified in DEV and PROD (25 October 2026); no SQL, no VM. Package: DEV from `71b31c6`, PROD from `e040373` (tree-identical in code). Owner-accepted: the owner confirmed on 25 October 2026 that it works on their phone.
- Recovery reference: Recovery above.
- Changed documents: this note, `PWA_Data_Model_Overview.md`, Development Changes, Environment inventory (R097 pins) and Release tracker.
- Published evidence/tag: tag `R097` on `e040373` through the Release tag workflow (pending). Receipts are private, outside Git.

### Closure pruning (release workflow, 25 October 2026)
- Inbound links repointed first to the commit permalink of `e0403731` (the last commit where the target exists): the R094 row and the R094 paragraph in `project/Documents/Release_Tracker.md`.
- Change note deleted (R094 left the retention window of R097, R096 and R095): `Change Logs/CHANGE_NOTES_R094_FOLLOW_UPS_2026-10-24.md`.
- Development Changes: the R097 Frozen row is replaced by one R097 follow-up row.
- Evidence deleted: none.
