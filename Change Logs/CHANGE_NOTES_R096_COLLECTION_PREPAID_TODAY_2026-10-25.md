# Change notes — R096 Collection shows charges paid in advance, 25 October 2026

## Purpose
The owner reported that a borrower's payment for today's charge was missing from the Collection page because she paid the day before. Owner request, verbatim: "In the collection page, Pe's payment for today's charge was not shown. She paid yesterday. I want to include all charges for today in collection page, even if the payment was already made on previous days." Root cause (Archie, A): the collection query included a paid charge only when its Payment Date was today, so a charge dated today and paid on an earlier day was excluded. Designed by Archie (A) and Echo (E); Byte (B) implements, Chase (C) checks, Dewey (D) records, Forge (F) deploys. No borrower name is recorded here.

## Changes
- `services/api/collection-read-contract.mjs`: the collection query gains an `OR Charge Date = today` arm (today only, independent of status), so a charge dated today is always listed.
- `services/agent-conversations/virtuals.mjs`: the mirrored `Collection Today` virtual gets the same arm. The chat service imports this file (live); the VM agent does not use it, so no VM deploy.
- `apps/pwa/src/CollectionRecords.tsx`: a charge row paid on an earlier day shows the caption "Paid in advance · date" (Thai "ชำระล่วงหน้า · date"), Echo item COLL-UX-02; the caption style is in `apps/pwa/src/live-style.css`.
- Tests under `tests/`: an integration case with six cases in the collection Postgres test, and e2e fixtures plus a caption assertion in `collection-read.spec`.
- `scripts/promotion/deploy-business-hosting.mjs` and its README: an R096 promotion kind (baseline `14c4a40`, no migration, read-only SQL readback at version 111; plan change 3: read, command and chat images; notify and jobs stay pinned).
- `project/Documents/PWA_Data_Model_Overview.md`: one sentence states the Collection membership rule (it did not state the rule before).
- `project/Documents/Development_Changes.md`: R096 entry. Tracker freeze text is prepared below, not applied.
- Deferred: COLL-UX-01 (a status line on the board) needs a new API field; not part of R096.
- No SQL migration, no new table or column, no financial write.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte, tree `e194249` plus the batch, uncommitted) |
| `npm run typecheck` | Pass, exit 0 (same tree) |
| `npm test` | Pass: 910 pass, 0 fail, 1 skip (same tree) |
| Integration `collection-postgres` on a disposable PostgreSQL 16 | Pass, 20 of 20 (same tree) |
| e2e `collection-read.spec` | Pass, 2 passed (mobile and desktop) |
| Chase adversarial review | No defects |
| Chase real-SQL check of the `Collection Today` virtual on PostgreSQL 16 | Pass |
| `npm run check:docs` | Pass, 0 failures (Byte on the batch; Dewey re-run after the note was filled) |
| Pull request `Development checks` | Pass, run 40169749071 (PR #150, merge `328acc3c`) |
| `Database migrations` | Pass, run 40169736097 (same PR) |

## Not run
- The local wide browser suite: the pull request run is the one broad run (lean check routine).
- Receipts real-SQL check with a prepaid charge: not run. The visible change is intended: a charge dated today and prepaid earlier now lists its earlier receipt.
- Echo's device check: pending on DEV after the DEV deploy.

## Recovery
Git: revert the R096 merge commit on `main`. Deployment: redeploy the previous Cloud Run images and Hosting version listed in the [Environment inventory](../project/Documents/Environment_Inventory.md). No database change, so no backup restore is involved.

## Open questions
None blocking. Follow-ups, not part of R096: the Metabase and OLAP "Daily Collection Status" object (V22) keeps the old rule and needs a migration, so it is out of this no-SQL release; the `Days Outstanding` virtual is negative for a prepaid charge (existing behavior); COLL-UX-01 (board status line, needs an API field) stays deferred. The owner decides whether to schedule them.

## Remaining work
The pull request and its `Development checks` run (placeholder), Echo's DEV device check, then promotion under the record below.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No borrower names appear here. Status: **frozen, promotion not started** (PLACEHOLDER fields below are filled at promotion).

### Continue here
- Outcome/scope and affected components: R096 to DEV and PROD: read, command and chat Cloud Run images (plan change 3; notify and jobs stay pinned) and PWA Hosting, in DEV then PROD. No SQL, so no backup, owner window or runner. VM: none (the agent does not use `virtuals.mjs`).
- State and next action or actual blocker: frozen at 06:47Z; next, DEV images and Hosting (Forge). No blocker.
- Source/artifact/configuration pins; runner manifest link: PR #150 (`claude/r096-collection-prepaid-today`), squash-merged as `328acc3c3344b6eafbb027fb79f588f8d0fde468` on `main` (baseline `e194249`). No SQL manifest.
- Existing owner authority and any explicit hands-on checkpoint: the owner's request of 25 October 2026, verbatim "Get the team work on it and push all the way to production". It covers the merge, DEV and PROD images and Hosting for this scope. It does not cover a financial write, a forced notification or an unrelated correction. No hands-on checkpoint.
- Previous deployed baseline and recovery: PROD and DEV as recorded in the Environment inventory after R095 (tag `R095`); recovery per Recovery above.
- Scope freeze/next-number handoff: at promotion start one tracker update marks R096 Frozen, opens R097 and advances the next unused number to R098. No `release.ts` bump; the PROD build takes `MW_RELEASE_NUMBER=R096`.
- Checks: Byte and Chase results in Checks above; `Development checks` run 40169749071 and `Database migrations` run 40169736097, both green.

### Tracker freeze text (prepared, not applied)
In `project/Documents/Release_Tracker.md` "Current development release" table:
- `| New product work | **R097 — Open** |`
- `| Next unused number | **R098**, only opened when authorized R097 promotion starts |`
- Add a paragraph before the R095 one: "R096 (Collection lists every charge dated today, including one paid on an earlier day, with a paid-in-advance caption; no SQL; promotion record link `../../Change%20Logs/CHANGE_NOTES_R096_COLLECTION_PREPAID_TODAY_2026-10-25.md#promotion-record`) is Frozen for promotion on <date and time, PLACEHOLDER> under the owner's instruction "Get the team work on it and push all the way to production"."
- Add the R096 row to the releases table (Frozen, then Released at closure) and change `**R096 is Open**` in Development Changes to `**R097 is Open**`.

### Promotion
| Step | Identity | Commands and exact route | Verification | Recovery | Evidence |
| --- | --- | --- | --- | --- | --- |
| 0. Merge and freeze | the session's GitHub tools (`mcp__github__*`) | merge the pull request; one tracker commit (R096 Frozen, R097 Open, counter R098) | `main` head equals the pinned commit; `Development checks` run cited | revert commit | PR #150 squash-merged as `328acc3c`; `Development checks` run 40169749071 and `Database migrations` run 40169736097 green; tracker frozen 25 October 2026 06:47Z (R096 Frozen, R097 Open, counter R098) |
| 1. DEV images and Hosting | PLACEHOLDER (Forge) | build the changed images from a `git archive` of the merge commit (`cloudbuild-command.yaml` or the DEV config as Forge confirms), Terraform digests, then the live-dev Hosting route | `build-version.json` carries `R096`; the Collection page lists a synthetic charge dated today and paid yesterday as paid in advance | previous digests and Hosting version from the inventory | PLACEHOLDER |
| 2. PROD images and Hosting | PLACEHOLDER (Forge) | `cloudbuild-business.yaml`, `runtime_image_overrides` as needed, then `deploy-business-hosting.mjs` with `MW_RELEASE_NUMBER=R096` (the R096 kind exists in the script) | marker and entry bundle carry `R096`; read-only PROD check with no financial write | previous digests and Hosting version | PLACEHOLDER |
| 3. Records, tag | `codex-cloud`; the Release tag workflow | update the Environment inventory (pins), tracker (Released), Development Changes, this note; tag `R096` on the deployed `main` commit | tag exists; `npm run check:docs` passes | never move an existing tag | PLACEHOLDER |

### Close
- Outcome: PLACEHOLDER.
- Recovery reference: Recovery above.
- Changed documents: this note, `PWA_Data_Model_Overview.md`, Development Changes; at closure the Environment inventory and Release tracker.
- Published evidence/tag: PLACEHOLDER.
