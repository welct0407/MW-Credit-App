# Change notes — R172 follow-ups, 18 November 2026

## Purpose
Owner request, 18 November 2026: "go for follow-up actions 1,2,3, and 5, and for 3, follow your recommendation. push all the way to prod". Four follow-ups left open at the R171 closure. PWA Hosting and Grafana only; PROD promotion is approved.

## Changes
- Item 1, draft flush: `apps/pwa/src/domain-draft.ts` saved a draft 400 ms after the last change and dropped a pending save on close, so closing a draft form quickly lost the last edit (found through the loan-rollover e2e flake, 3 of 5 runs on main). The draft is now saved once on close or unmount unless the form was submitted or discarded, and the spec's fixed 700 ms wait is removed (a stricter test).
- Item 2, notification-transport unit test: the VAPID key is regenerated until it is 32 bytes (the test failed about 1 time in 217).
- Item 3, poll table: Forge's PROD measurement of 18 November 02:57Z: `runtime.conversation_poll_messages` 3,701 rows, 46 conversations, 2.3 MB, about 100 to 150 new rows a day (about 55,000 a year), only the `message_id` primary key; the R170 first-page predicate ran in 0.69 to 0.99 ms (a sequential scan). Decision: no index and no purge now. A purge is rejected: the table is the poll's dedupe ledger and is used by receipt identity and `poll-reprocess`, and the worker role has no DELETE. Revisit an `(event_time, conversation_id)` index (an agent migration) when the table passes about 500,000 rows or the predicate exceeds about 50 ms. Documented in `integration-agent/docs/POSTGRESQL_OPERATIONS.md`. No code or migration.
- Item 5, Grafana: the `mw-agent` error words gain `INSTAGRAM_HTTP_*` "IG error", `INSTAGRAM_TIMEOUT` "IG timeout", `INSTAGRAM_UNREACHABLE` "IG offline" and `POLL_*` "Chat read error"; panel 26's text says the timer runs every minute (it said every 2); `DASHBOARD_RELEASE` R172, so all five dashboards are regenerated (tag `release:R172`).
- Echo's review additions (accepted): UX-DRAFT-01, the "Clear draft" link of the expense form becomes the shared `DraftRestored.tsx` ("Restored unsaved draft · Clear draft") on all four forms: the expense form, New loan, charge, and the Management record and account openings (settled as all four); the flush saves the last commit's value and label, including on a key change; UX-DRAFT-02, a spec checks restore, Clear draft, then an empty next New loan, and a unit test proves borrower scoping (the fixture has one borrower); UX-GRAF-01, the tile words are "IG error" (`INSTAGRAM_HTTP_*`), "IG timeout", "IG offline" and "Chat read error" (`POLL_*`), matching the "Model …" words. With the flush, closing a form right after editing and reopening it restores the edit, as a slower close already did.
- Echo's rendered check: on mobile-chromium a New loan form was typed in, closed and reopened and the edit was restored, with nothing sent to the server. Not checked: Grafana was not rendered and iPhone WebKit was not run.
- Not in scope: the 00:01 receipts 409 (`selection_changed`), still carried over.
- Code and tests (Byte, not edited here): `apps/pwa/src/domain-draft.ts`, the loan-rollover spec, the notification-transport test and `project/scripts/monitoring/`.
- Docs: `project/Documents/Resource_Monitoring_Dashboard_Guide.md`, `project/scripts/monitoring/README.md`, `project/Documents/Resource_Monitoring.md`, `integration-agent/docs/POSTGRESQL_OPERATIONS.md`, `project/Documents/Solution_Design.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md` (the done R171 carry-overs removed).
- Promotion plan: PWA Hosting to DEV first, then PROD as R172 (`MW_RELEASE_NUMBER=R172`), then the Grafana apply and read-back of the words and the `release:R172` tag. No agent deploy, no SQL, no Cloud Run change.

## Checks
| Command | Result |
| --- | --- |
| Byte (base `73057b3`, uncommitted): draft and VAPID unit tests | 13 pass |
| Byte: `npm run test:monitoring`, check-source, `npm run typecheck`, `npm run lint` | Pass; check-source ok (R172); typecheck 0 errors; lint pass (1 warning, 1 info, in untouched files) |
| Byte: `phase5-borrower`, loan rollover and `dataset-replay` specs, both projects | 174 passed, 2 skipped (2 intermittent, see Chase); the rollover spec passes 5 of 5 on mobile without the fixed wait |
| Chase: adversarial review, `draft-flush` unit, `phase5-final-ui` and `rebate-offset` specs (desktop and mobile) | First pass found one defect (the old key was overwritten on a key change); fixed and re-checked: pass, no defects. `draft-flush` 8 pass; 132 spec passes; the monitoring mapping is correct. Minor, not fixed: `ManagementOpenings` does not pass `busy`, so "Clear draft" is not disabled during a save (cosmetic). `phase5-borrower` :249 (R120 rebate language, mobile) is load-sensitive: 12 of 12 with one worker, fails with 4 workers on a 4-core container, also on unmodified HEAD; not caused by R172, CI decides. |
| Echo: rendered mobile-chromium check | New loan: type, close at once, reopen: restored, nothing sent. Findings UX-DRAFT-01, UX-DRAFT-02 and UX-GRAF-01 accepted and done. |
| `npm run check:docs` | 0 failures, 1 warning (a 3 November note past 14 days, cleared at closure) |
| PROD promotion and read-back | Pass: see the PROD promotion record below |
| `Development checks` run 44232400420 on the tested head `275c588` | Success after one re-run of three WebKit shards cancelled by a roughly 28-minute apt install on the runner (explained on PR #356); merged as `56a77afc`, tree identical |
| Release tag | `R172` on `56a77afc` (Release tag run 44239521585) |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.

## Recovery
PWA: redeploy the previous Hosting version (recorded in the Environment Inventory at promotion). Grafana: the saved plan from the previous tag through the same runner. No agent, SQL or data change to undo.

## Open questions
None. The owner approved promotion on 18 November 2026.

## Remaining work
Owner acceptance; observe the draft restore and Clear draft in real use. Everything else (pull request CI, merge, promotion, tag, closure) is done. Carried over: the 00:01 receipts 409.

## PROD promotion record (Forge, 18 November 2026 UTC)
Authority: owner, 18 November 2026, "go for follow-up actions 1,2,3, and 5, and for 3, follow your recommendation. push all the way to prod". Package `main` `56a77afc1c0e2cfe789a5fb66e5214436754666d` (merge of PR #356; tree `c6f7da33` identical to the tested head `275c588`; `Development checks` run 44232400420, success after one re-run of three WebKit shards). Baseline R171 `89bb33d8` (tag `R171`). Two components: PWA Hosting (frontend only) and the five Grafana dashboards. No agent, SQL, migration, backup, Cloud Run, IAM, alert-rule or other Terraform change. The poll table (`runtime.conversation_poll_messages`) needs nothing: Forge's read of 18 November 02:57Z found 3,701 rows, 46 conversations, 2,336 kB, about 100 to 150 new rows a day, only the primary key, and the R170 predicate at 0.69 to 0.99 ms (sequential scan, 135 shared buffers).

| Step | Result |
| --- | --- |
| Baseline (04:37Z) | PROD Hosting `e4c25a61ad6e1d47` (release `1794943465038000`, R171 build `a9111dddc9f9088f5a06fd5d`); DEV Hosting `6185306398cc573b` (release `1794942881738000`, R171). PROD read `00065-8xs`, command `00070-4vx`, chat `00049-vdq` (R165 image `e64810b2…`), notify `00031-mzf`, jobs `00031-dmq` (R159 image `56f17745…`); DEV services unchanged since R171. Flyway read-only as `codex-cloud-read`: `loan_manager_prod` schema 150, validation successful, nothing pending (04:41:11Z) |
| Grafana | Clean detached worktrees under the private root; `manage.py --secret-version 1`. Baseline plan from R171 `89bb33d8`: `check-baseline` no-change verified. Saved plan from `56a77afc`: 0 add, 5 change, 0 destroy (sha256 `c9ea5b47d17ab7a7ad5e2a67e773084462b565c08e2e25850f599f0f959570e3`). JSON review: only the five v1beta1 dashboards; UID and folder unchanged; metadata only the computed `annotations` and `version`; spec: the `release:` tag on all five, and on `mw-agent` also panel 26's description and the tile 28 error-word selector; no rule, folder, datasource or policy. Applied 04:36:46Z to 04:37:00Z; re-plan no changes |
| Grafana read-back | All five dashboards `release:R172`; `mw-agent` version 19; panel 26 says "every minute"; tile 28's selector maps `INSTAGRAM_HTTP_*` to "IG error", `INSTAGRAM_TIMEOUT` to "IG timeout", `INSTAGRAM_UNREACHABLE` to "IG offline" and `POLL_*` to "Chat read error"; all 21 alert rules inactive. No error was forced |
| DEV | Detached worktree at `56a77afc` with its own `npm ci`. `.env.live-dev` (0600) from Secret Manager `mw-credit-app-dev-firebase-web` plus the live DEV bundle's settings, shredded after the build. `build:live-dev` with `MW_RELEASE_NUMBER=R172`; `deploy-hosting.mjs --live-dev --check` (17 files); apply 04:38:42Z to 04:38:52Z as `mw-credit-unattended-admin`: version `a02a752cc0dd5716`, release `1794976732025000`, build R172 `8b6e57d9099f39c001bb3845`. Smoke: three DEV origins R172, index and entry 200, `sw.js` no-store, commit `56a77af` in the entry |
| DEV desktop check | Chromium 1440 x 900, signed in with the DEV test account (documented recipe), write guard on (probe blocked; no write attempted): the app loaded, the dataset sync completed ("Updated 04:40"), 62 read GETs; About: R172 (in development), build `8b6e57d9099f39c001bb3845`, commit `56a77af`, DEV, up to date, nothing waiting to sync. One `/api/payment-records/:id/receipt` GET returned 422 (a DEV record's receipt image, as in R171). The optional draft check (New loan type, close, reopen, Clear draft) was not run |
| PROD build | `buildProductionBusinessCandidate` with R158's pinned public config (sha `6eea01ac…`, identical to the live `production-public-config.json`; PROD origins and the Production web app only), `releaseNumber` R172: build `baca56701f7e4d76182abbe7`, entry `/assets/index-CyFrTiEw.js`, 18 files |
| Hosting | The generic runner (`generic-v1`, `frontend-only`). Receipts: `Development checks` run 44232400420 on `275c588` (check, the three e2e shards and terraform); database from `Database migrations` run 44146406058 on `f1f30147` (no database-relevant file changed since). `--check` passed (18 files, services on their R165 and R159 pins). `--apply` 04:42:11Z to 04:42:46Z: version `16e14b3233cf6ddd`, release `1794976960925000`, build R172 `baca56701f7e4d76182abbe7`, package sha256 `fd0a3c719d0a13a4082dd8365158e327e59ffa6c95edb4fd86bed864b4f83fcf`, receipt status applied |
| Smoke | Three PROD origins R172, index and entry 200, `sw.js` no-store, commit `56a77af` in the entry; unauthenticated read and command 401; read, command and chat `/health` 200 R165 `907650de`, notify 200 R159 `5b887d09`; Cloud Run revisions in DEV and PROD unchanged; no ERROR log entries on any `mw-credit-app-*` service after 04:30Z (checked 04:43Z) |

Drift (Forge, read-only, before the tag): `drift --env all --observed <private drift-observed.json> --strict` reported drift 2 and unverified 1 (Metabase, no credentialed read). The two drifts are the expected ones: PROD PWA R172 against the last tag's R171, and the Grafana dashboards R172 against R167; both match once `R172` is tagged. DEV PWA R172, agent R171 `89bb33d8` (catalogue 44), the API services and schema 150 match.

Rollback: PROD Hosting `sites/mw-credit-prod-737787224638/versions/e4c25a61ad6e1d47` (release `1794943465038000`, R171); DEV `6185306398cc573b` (release `1794942881738000`). Grafana: a saved plan from a clean worktree at R171 `89bb33d8` through the same runner (restores the R171 specs; the no-change baseline plan of this promotion is kept as evidence). No database or service step.

Limitations: no signed-in PROD session was used; the draft flush and Clear draft were not exercised live. Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r172/` (Hosting package, receipts, logs, the built `frontend-prod`, and `grafana/` with both saved plans, their JSON and the apply log); receipt `…/promotion-receipts/R172-HOSTING-RECEIPT.json` (not in Git).

Tag record: `R172` on `56a77afc1c0e2cfe789a5fb66e5214436754666d`, created at 04:45Z by Release tag run 44239521585 (which publishes the GitHub Release).

Component versions at this release (`component-versions.mjs derive --release R172 --commit R172`): the PWA frontend and the Grafana dashboards changed in R172; every other component keeps its earlier release (the integration agent R171, revision 44; read, command, chat and schema R165; notify and jobs R159; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact, as no observed file was supplied; the public PWA, read, command and chat builds match R172, R165, R165 and R165). Forge's pre-tag run with the credentialed facts gave drift 2 (the PROD PWA at R172 against the last tag's R171, and the Grafana dashboards at R172 against R167), which the tag clears; its unverified Metabase is untouched by R172. The credentialed run was not repeated after the tag.

Not yet observed: the draft restore and Clear draft in real use (the optional DEV draft check was not run; CI covers it). Carry-over: the 00:01 receipts 409 (`selection_changed`) only. Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R172 closure pull request. Pruned (outside the window of Open plus the three newest Released releases, and unlinked): the R169 change notes `Change Logs/CHANGE_NOTES_R169_GROUP_CHAT_REFRESH_FAST_2026-11-17.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_REFRESH_FAST_2026-11-17.md` (their links now point to commit `56a77afc`), and the unlinked `integration-agent/Change Logs/CHANGE_NOTES_REVIEW_RECHECK_OPTION_2026-11-03.md`.
