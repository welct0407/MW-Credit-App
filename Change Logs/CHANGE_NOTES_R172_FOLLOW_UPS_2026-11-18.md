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
| The pull request's `Development checks` run | PENDING: cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.

## Recovery
PWA: redeploy the previous Hosting version (recorded in the Environment Inventory at promotion). Grafana: the saved plan from the previous tag through the same runner. No agent, SQL or data change to undo.

## Open questions
None. The owner approved promotion on 18 November 2026.

## Remaining work
Check results; pull request CI, merge; promotion (PWA Hosting DEV then PROD, then the Grafana apply) and read-back; tag; closure. Carried over: the 00:01 receipts 409.
