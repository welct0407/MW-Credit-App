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
| Echo UI check on the local build (e2e prepaid fixture, Chromium 428x926, English and Thai) | Pass: the caption "Paid in advance · 06-Oct" / "ชำระล่วงหน้า · 06-ต.ค." sits on its own grey line, aligned, no overlap, no horizontal scroll. Not WebKit, not a real device |
| PROD read-only data check (`codex-cloud-read`) | 30 charges dated today, 1 of them paid on an earlier day (0 under the old rule); 20 borrowers on the board (19 under the old rule) |
| `npm run check:docs` | Pass, 0 failures (closure commit) |
| Pull request `Development checks` | Pass, run 40169749071 (PR #150, merge `328acc3c`) |
| `Database migrations` | Pass, run 40169736097 (same PR) |

## Not run
- The local wide browser suite: the pull request run is the one broad run (lean check routine).
- Receipts real-SQL check with a prepaid charge: not run. The visible change is intended: a charge dated today and prepaid earlier now lists its earlier receipt.
- The owner's real-device view: done; the owner confirmed on 25 October 2026 that it works on their phone. Echo's check used Chromium, not a device.

## Recovery
Git: revert the R096 merge commit on `main`. Deployment: redeploy the previous Cloud Run images and Hosting version listed in the [Environment inventory](../project/Documents/Environment_Inventory.md). No database change, so no backup restore is involved.

## Open questions
None blocking. Follow-ups, not part of R096: the Metabase and OLAP "Daily Collection Status" object (V22) keeps the old rule and needs a migration, so it is out of this no-SQL release; the `Days Outstanding` virtual is negative for a prepaid charge (existing behavior); COLL-UX-01 (board status line, needs an API field) stays deferred. The owner decides whether to schedule them.

## Remaining work
R096 is promoted. Left: the owner's real-device view of the caption and the tag `R096` through the Release tag workflow.

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md). Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No borrower names appear here. Status: **applied and verified** in DEV and PROD (25 October 2026); the owner's real-device check is pending.

### Continue here
- Outcome/scope and affected components: R096 to DEV and PROD: read, command and chat Cloud Run images (plan change 3; notify and jobs stay pinned) and PWA Hosting, in DEV then PROD. No SQL, so no backup, owner window or runner. VM: none (the agent does not use `virtuals.mjs`).
- State and next action or actual blocker: applied and verified; tag `R096` on `3cbbcea` through the Release tag workflow (pending). No blocker.
- Source/artifact/configuration pins; runner manifest link: PR #150 (`claude/r096-collection-prepaid-today`), squash-merged as `328acc3c3344b6eafbb027fb79f588f8d0fde468` on `main` (baseline `e194249`). No SQL manifest.
- Existing owner authority and any explicit hands-on checkpoint: the owner's request of 25 October 2026, verbatim "Get the team work on it and push all the way to production". It covers the merge, DEV and PROD images and Hosting for this scope. It does not cover a financial write, a forced notification or an unrelated correction. No hands-on checkpoint.
- Previous deployed baseline and recovery: DEV activation `1792866314091706` (read `4c836cdb…`, command and chat `5bc4ff6c…`, Hosting `7223178fb12cdf7f`); PROD activation `1792866464021093` (overrides `{chat, command} = adc8effc…`, read on `business_image`, Hosting `aec933275ac46ece`); recovery per Recovery above.
- Scope freeze/next-number handoff: at promotion start one tracker update marks R096 Frozen, opens R097 and advances the next unused number to R098. No `release.ts` bump; the PROD build takes `MW_RELEASE_NUMBER=R096`.
- Checks: Byte and Chase results in Checks above; `Development checks` run 40169749071 and `Database migrations` run 40169736097, both green.

### Tracker freeze text (applied 25 October 2026 06:47Z)
In `project/Documents/Release_Tracker.md` "Current development release" table:
- `| New product work | **R097 — Open** |`
- `| Next unused number | **R098**, only opened when authorized R097 promotion starts |`
- Add a paragraph before the R095 one: "R096 (Collection lists every charge dated today, including one paid on an earlier day, with a paid-in-advance caption; no SQL; promotion record link `../../Change%20Logs/CHANGE_NOTES_R096_COLLECTION_PREPAID_TODAY_2026-10-25.md#promotion-record`) is Frozen for promotion on 25 October 2026 at 06:47Z under the owner's instruction "Get the team work on it and push all the way to production"."
- Add the R096 row to the releases table (Frozen, then Released at closure) and change `**R096 is Open**` in Development Changes to `**R097 is Open**`.

### Promotion
| Step | Identity | Commands and exact route | Verification | Recovery | Evidence |
| --- | --- | --- | --- | --- | --- |
| 0. Merge and freeze | the session's GitHub tools (`mcp__github__*`) | merge the pull request; one tracker commit (R096 Frozen, R097 Open, counter R098) | `main` head equals the pinned commit; `Development checks` run cited | revert commit | PR #150 squash-merged as `328acc3c`; `Development checks` run 40169749071 and `Database migrations` run 40169736097 green; tracker frozen 25 October 2026 06:47Z (R096 Frozen, R097 Open, counter R098) |
| 1. DEV images and Hosting | Forge (F) | Cloud Build `7126e01a` from `328acc3`; Terraform plan 0/3/0 (read, command, chat), applied 06:51:29Z to 06:52:06Z, re-plan clean; Hosting build with `MW_RELEASE_NUMBER=R096` | revisions read `00042-x8w`, command `00059-6xn`, chat `00010-lgc`; `/health` 200 and 401; signed-in `/api/collection` 200 with 21 items; Hosting `b87c046552f15344` (release `1792911217384000`, 06:53:37Z, `no-store`) | restore DEV activation `1792866314091706`; Hosting `7223178fb12cdf7f` | activation generation `1792911159960955`; pins in the Environment inventory |
| 2. PROD images and Hosting | Forge (F); `codex-cloud-read` for the read-only checks | Cloud Build `019490f1` from `3cbbcea` (`cloudbuild-business.yaml`); read-only database readback 06:55:02Z; `runtime_image_overrides = { read, command, chat }`, `business_image` unchanged; plan 0/3/0 (plan sha `df49f34f…`), applied 06:56:07Z to 06:56:46Z, re-plan clean; `deploy-business-hosting.mjs` `--check` then apply 07:00:21Z to 07:01:05Z | readback: version 111, 111 rows successful; revisions read `00025-fxc`, command `00030-2wv`, chat `00008-nsm`; `/health` 200 and 401; notify `00022-4lt` and jobs `00022-42m` unchanged; no ERROR logs; Hosting `16f8ba03723c0b21`, `build-version.json` shows R096 `no-store`, the live entry equals the build | restore PROD activation `1792866464021093`; Hosting `aec933275ac46ece` | activation generation `1792911431958316`; Hosting release `1792911658478000`, package sha256 `6336f2ad…694b`; the receipt is private, outside Git |
| 3. Records, tag | `codex-cloud`; the Release tag workflow | done in the closure commit: Environment inventory (pins and Forge's corrections), tracker (Released), Development Changes, this note; tag `R096` on the deployed `main` commit | tag exists; `npm run check:docs` passes | never move an existing tag | records in the closure commit; tag pending the workflow |

### Close
- Outcome: applied and verified in DEV and PROD (25 October 2026); no SQL, no VM. Package: DEV from `328acc3`, PROD from `3cbbcea`; they differ only in three record files. Owner-accepted: the owner confirmed on 25 October 2026 that it works on their phone.
- Recovery reference: Recovery above.
- Changed documents: this note, `PWA_Data_Model_Overview.md`, Development Changes, Environment inventory (R096 pins; corrections: the DEV reader was on `00041-nkk`, DEV notify and jobs are on `ef7beb4b…`, and the committed `dev.tfvars` `read_image` is stale because the activation file overrides it) and Release tracker.
- Published evidence/tag: tag `R096` on `3cbbcea` through the Release tag workflow (pending). Receipts are private, outside Git.

### Closure pruning (release workflow, 25 October 2026)
- Inbound links repointed first to the commit permalink of `3df159e` (the last commit where the target exists): the R093 row in `project/Documents/Release_Tracker.md` and the R093 mention in the R094 paragraph.
- Change note deleted (R093 left the retention window of R096, R095 and R094): `Change Logs/CHANGE_NOTES_R093_CHAT_DASHBOARDS_2026-10-24.md`.
- Development Changes: the R096 Open row is replaced by one R096 follow-up row.
- Evidence deleted: none.
