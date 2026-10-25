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
| Chase review | PLACEHOLDER (pending) |
| Pull request `Development checks` | PLACEHOLDER (run id) |

## Not run
- The local wide browser suite: the pull request run is the one broad run.
- Echo's UI check of the new row and status line: PLACEHOLDER.
- The owner's real-device view: pending.

## Recovery
Git: revert the R097 merge commit on `main`. Deployment: redeploy the R096 images and Hosting (rollback pins are in the [Environment inventory](../project/Documents/Environment_Inventory.md)). No database change. Installed clients rewalk the offline dataset once more on rollback.

## Open questions
None blocking. The R096 follow-ups remain: Metabase/OLAP "Daily Collection Status" (V22, needs a migration) and the negative `Days Outstanding` for a prepaid charge.

## Remaining work
Chase's review, the pull request and CI, then promotion under the record below.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No borrower names appear here. Status: **not started**.

### Continue here
- Outcome/scope and affected components: R097 to DEV and PROD: read, command and chat Cloud Run images and PWA Hosting. No SQL, so no backup, owner window or runner. No VM.
- State and next action or actual blocker: not started; Chase's review pending.
- Source/artifact/configuration pins; runner manifest link: PLACEHOLDER (pull request, merge commit). No SQL manifest.
- Existing owner authority and any explicit hands-on checkpoint: the owner's follow-up of 25 October 2026, answer "Yes, to production" (with R096's "push all the way to production" context). It covers the merge, DEV and PROD images and Hosting for this scope. It does not cover a financial write or a forced notification. No hands-on checkpoint.
- Previous deployed baseline and recovery: R096 as recorded in the Environment inventory (activations and Hosting versions there); recovery per Recovery above.
- Scope freeze/next-number handoff: at promotion start one tracker update marks R097 Frozen, opens R098 and advances the counter to R099. `MW_RELEASE_NUMBER=R097` for the PROD build.
- Checks: PLACEHOLDER (run ids).

### Promotion
| Step | Identity | Commands and exact route | Verification | Recovery | Evidence |
| --- | --- | --- | --- | --- | --- |
| 0. Merge and freeze | the session's GitHub tools | merge the pull request; one tracker commit (R097 Frozen, R098 Open, counter R099) | `main` head equals the pinned commit; checks cited | revert commit | PLACEHOLDER |
| 1. DEV images and Hosting | Forge (F) | PLACEHOLDER (as R096: Cloud Build, plan 0/3/0, Hosting) | PLACEHOLDER (a prepaid-only row shows the amount and "Paid in advance") | previous DEV activation | PLACEHOLDER |
| 2. PROD images and Hosting | Forge (F) | PLACEHOLDER (`cloudbuild-business.yaml`, overrides, `deploy-business-hosting.mjs` R097 kind) | PLACEHOLDER | previous PROD activation | PLACEHOLDER |
| 3. Records, tag | `codex-cloud`; the Release tag workflow | inventory pins, tracker, Development Changes, this note; tag `R097` | tag exists; `npm run check:docs` passes | never move an existing tag | PLACEHOLDER |

### Close
- Outcome: PLACEHOLDER.
- Recovery reference: Recovery above.
- Changed documents: this note, `PWA_Data_Model_Overview.md`, Development Changes; at closure the Environment inventory and Release tracker.
- Published evidence/tag: PLACEHOLDER.
