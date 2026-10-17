# Open development changes

**R071 is Open** (on DEV since 17 October 2026; see the [release tracker](Release_Tracker.md#current-development-release)). Released releases have no section here: each tracker row links its record at a commit permalink, and the release tags mark the packages. Current runtime pins and recovery evidence live only in the [environment inventory](Environment_Inventory.md).

| Outstanding work | Owning reference |
| --- | --- |
| Deferred Collection Note concern | Unchanged by released R059; a separate owner-directed correction remains pending |
| Carried operational credential migration | R055 remains Frozen; paused work is unfinished |
| Apple push enrollment follow-up | R056 V91 deployed; Lisa retry/closure remains pending |
| Owner license action | AppSheet technical retirement complete; license revocation unconfirmed |
| Grafana revamp: alert coverage for PWA APIs, workers, Cloud SQL disk and backups; every ALL-MON item (including ALL-MON-03 checks) is a line of this entry | Pending future release (review ALL-MON-01); no alert rules applied in R063 |
| Agent migration V5 (indexes on `runtime.operation_state(last_event_id)` and `runtime.job_runs(operation_id)`) | Recommended, not written |
| Repository merge follow-ups (15 October 2026) | [Change note](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/Change%20Logs/CHANGE_NOTES_REPOSITORY_MERGE_2026-10-15.md) |

Use the [release tracker](Release_Tracker.md), including the carried R016 administrative follow-up. Current runtime versions belong in [environment inventory](Environment_Inventory.md). Update this page for actual outstanding work, not completed-release history.

## R071 one refresh icon

Owner requests 17 October 2026: the header refresh should also delta-sync the local dataset, then "one refresh icon does everything", with a status text left of it. Branch `claude/r071-style-decisions`, commits `6a48594`, `818f862`, `db77864`, `6e68103`, `32faf1b`; PWA only, no API or SQL change, deployed to DEV. Six-agent process: A Architect and E UX reviewed, B Coding implemented three passes, C Testing verified (including the header race checks), D documented; F not applicable (no infrastructure).

- **Found.** The refresh already sent `mw-offline-prepare`, but silently, and while any domain was failed it retried only that domain; a form open on screen skipped the sync. Offline reads also recorded a refresh failure, so the refresh icon turned red offline.
- **Refresh icon.** Refreshes the screen, sends `mw-offline-prepare` with `detail.all` (every domain is delta-checked, including domains that did not fail, joining a check already queued or in flight), then wakes the saved-change sync (`mw-offline-queued`, also without a screen read). It also runs beside an open edit, as the 30-second poll does.
- **Status (`SyncStatus.tsx`, text not a control, fixed 88 px cell beside the icon).** During the first download or a refresh-started check it shows the percentage (12 px) above a 60 x 6 px bar, until the queued domains are checked (`domainsPending` in the preparation state, false while sync is paused offline or unauthorized, so the bar ends); automatic polls stay quiet. Then "Updated HH:MM" ("Saved data from HH:MM" after 10 minutes). Failures: "<Borrowers|Collection|Cash|Management|Notifications> not updated", several "Update failed", "Download incomplete" before the first full download; at most two lines. One permanent hidden polite live region announces only transitions and clears after 5 s; the visible text has no role and a hidden detail replaces `title`. Known minor: before the language preference loads, the region can say the English "Syncing…" once.
- **Offline.** `read-cache.ts` no longer records a refresh failure for offline reads, so the icon is not red offline and does not flash red on reconnect; real online failures are still badged.
- **Removed.** The header Sync now, the "Updates paused … Retry" banner, the "Offline data preparation incomplete" strip and the "Preparing offline data… NN%" notice. The account-menu and saved-changes Sync now stay.
- **Checks.** C's full Playwright run on `6e68103`: 527 passed, 12 skipped, 1 failed (saved-change-discard-independent mobile, a pre-existing flake, 1 of 10 on `db77864`). Earlier full run on `db77864`: 526 passed, 2 failed (refresh-hold back-off timing test, pre-existing under load; the parent fails 7 of 8 under load). `npm run check` 576 of 576; payment-command and live-signout-blocked on `32faf1b` 38 of 38; tsc clean; biome 0 errors, warnings unchanged. The live-signout-blocked "header refresh also wakes the saved-change sync" test fails without the change.
- **DEV.** Owner instruction 17 October 2026 "merge to main and deploy to DEV"; merged to `main` as `222efc8`, CI Development checks run 39054910770 success; first DEV Hosting deploy 17:49:38Z (00:49 Bangkok 18 October). A second deploy from `94cbfa5` (PR #55, the Thai preference fix; only `apps/pwa/src/preference-save.ts` changed in the app; CI push run 39056423295 success) followed at 18:09:44Z (01:09 Bangkok). Pins in the [environment inventory](Environment_Inventory.md). Both: served files identical, `no-store`/immutable headers as R070, R071 markers (including the Thai text) present; the second also has the language-aware preference message in the bundle. Not verified: the headless service-worker update smoke (browser launch timed out in the container, twice) and a signed-in check.
- **Recovery.** `git revert` the commits; Hosting rollback to the prior version once deployed.

## R071 style decisions

Owner decisions 17 October 2026 on the R070 cascade audit ("Prepare these in R071"). Branch `claude/r071-style-decisions` from `main` `038b5c9`, commit `0b83989`; UI-only, no API or SQL change, deployed to DEV. The orchestrator's earlier solo work (R070 fixes `fdca59f` and `0a47f72`, `0b83989`, `6a48594`) was reviewed afterwards by A, C, E and D; only record corrections were needed.

- **Upcoming headings: 20 px at every width.** `.upcoming-directory h2,.upcoming-event h2` lost its never-applied `font-size:18px`.
- **Collection group headings: status colour.** The status label is red (not paid), purple (overdue), amber `#a05000` (partially paid; the tile amber `#b85c00` is 4.0:1 on the heading fill) or green (fully paid); the amount chip stays neutral. Contrast on the heading fill `#eef0f2`: 4.92, 7.18, 5.05 and 4.64 to 1.
- **Dashboard secondary heading (owner left to Claude).** Keeps its 1.5rem top margin on tablets (768 to 1199 px) as at other widths, instead of the general 18 px.
- **Unused CSS deleted.** 29 class names left the stylesheets (21 in `live-style.css`, 8 in `style.css`). 28 have no markup (20 and 8); `collection-grid` stays on its element, and only its dead descendant rule `.collection-grid .list-panel > .live-freshness` went. `fully-paid` was used only in `.collection-borrower.fully-paid`. 57 selectors (37 and 20) and one emptied media query removed; shared rules keep their other selectors. The dynamic `collection-status-*` and `payment-status-*` classes stay.
- **Owner additions (17 October).** Save on the borrower edit form's sticky bar is the brown primary button and Cancel the white secondary one (8 px gap at all widths, buttons 46 px); the Confirm payment button has a check icon.
- **Owner decisions.** Page titles stay as they are (the owner uses iPhone 16/18 Pro Max only; HDR-TITLE-01 closed). GEN-CRASH-01 (incomplete server data blanks the app; add an error boundary) is deferred to the [follow-up checklist](https://claude.ai/artifact/3usEvNVYZrsG4GDWV2RgyJ).
- **Checks.** `npm run check` 576 of 576. Full Playwright with the contrast and cascade auditors on `0b83989`: 521 passed, 12 skipped, 3 failed (the U10 1440 px sticky-summary flake twice and one native-transition animation test that passes 3 of 3 without the auditors); no low-contrast control; the Upcoming and dashboard overrides are gone; heading label colours read back in the browser.
- **Other R071 items (other sessions).** DEV web builds use the MW Credit DEV web app `appId` (see the [R070 promotion record](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/Documents/Development_Changes.md#r070-production-promotion)). Debian agent 5b4e50d (audit_relay validator, 17:27:06Z) and live catalogue revision 28 (17:39:54Z), owner go 18 October 2026. Thai pending-sync note: preference messages (e.g. 'Saved on this device. Waiting to sync.') now follow the current language after a switch to Thai; display only (`apps/pwa/src/preference-save.ts`, PR #55, `94cbfa5`); new assertion in `phase5-final-ui-independent` fails before and passes after; typecheck, lint 0 errors, unit 576/576, phase5-final-ui + cash-two-workspaces 76/76; recovery: git revert, UI only. Record: `Change Logs/CHANGE_NOTES_W5_UX_2026-10-17.md` (Remaining work).
- **Recovery.** `git revert` the commit; Hosting rollback to the prior version once deployed.
- **Documents updated.** Development Changes, Release Tracker, PWA Data Model Overview (header status, 30-second checks) and the PWA dictionary (`offline_datasets/incremental`, `offline_datasets/progress`, `hybrid_read_cache/behavior`); Solution Design needs no change; the W5 and R064 dated notes stay as written.

## R071 Wave 6 documentation cleanup

Wave 6 of the 15 October 2026 review (documentation and process, 30 backlog rows) on branch `claude/review-w6-docs`. `AGENTS.md` is a front page, deployment pins live only in the environment inventory, released sections left this page, and old change notes, uncited evidence and one-off scripts were deleted (Git keeps them). Release closure now prunes in the same session, and `npm run check:docs` runs in CI. The review's documentation rows (ALL-DOC-01 to 12, DB-DOC-01 to 06, AGT-DOC-01 to 10, AGT-TEST-04, ALL-STD-05) are closed: done, or not reproduced where already fixed. AGT-DOC-07 needed a validator change and catalogue revision 28, both deployed on Debian on 17 October 2026. Record: [Wave 6 change note](../../Change%20Logs/CHANGE_NOTES_W6_DOCUMENTATION_2026-10-17.md).

## Current operation

The owner accepted the core operational/management flows and subsequent UI release. Native PWA/API payment receiving, Debian agent API integration, receipts, notifications, scheduled jobs and monitoring are deployed. R058 agent delivery attempts authorized Instagram sends without a local window gate and permits automatic email only after an explicit provider messaging-window rejection. Production is https://lm.mw-credit.com and DEV is https://dev-lm.mw-credit.com. Runtime identities and verified versions belong in the [environment inventory](Environment_Inventory.md). AppSheet technical retirement is complete; the owner license action remains separate. Natural business observations and the Lisa push retry retain the limits in their owning release evidence; documentation cleanup does not establish fresh live acceptance.

## Delivery tooling status

Source inspected **14 October 2026**. This policy changes no product workflow or validator; implementation limits remain explicit:

| Tool | Actual constraint |
| --- | --- |
| App `ci.yml` | Since 16 October 2026 a `changes` job routes each run: PRs run typecheck/unit/build when app files change, Terraform validation when `infrastructure/**` changes, and the full Playwright suite (three parallel shards, one CI retry with trace, artifacts kept 7 days) when the PWA, specs, Playwright/Vite config or lockfile change. Main pushes are classified the same way from the pushed commit range (a first push or an unreadable range runs everything); manual dispatch runs every stage. Documentation-only PRs and merges post the `Development checks result` status without running stages; that status is required on `main` since 16 October 2026. The `ci:checkpoint` label is retired. |
| `database.yml` | Push-only trigger (one run per head commit, visible on the PR); `guards` on Linux, then the four `Test-CI.ps1` groups as parallel jobs on ubuntu-latest (manual dispatch can choose windows-latest). Triggered also by `services/**`, `tests/integration/**` and `scripts/rehearsal/**`. |
| `agent-tests.yml` | Integration agent tests (formerly the agent repository's `ci.yml`); path-filtered to `integration-agent/**`. |
| `grafana-mcp-bridge.yml` | Path-filtered to `project/scripts/monitoring/...`. |
| Integration shared deployment helper | Receiver lifecycle/readiness correction is source tooling for R059; the existing R058 receiver was repaired by restart on 14 October at 18:43 Bangkok. No new runtime package was deployed for this repair. |
| Legacy foundation/business/R053 validators | Retain historical full-browser/manual-dispatch receipt requirements; they do not implement general proportional check selection. |

Required checks/guards remain effective. Report a concrete conflict once; update the owning tool through a scoped tested change rather than bypass it or fabricate receipts. Useful future tooling work is affected-input routing, duplicate-run suppression and deployment consuming existing evidence. These tooling gaps do not add another documentation gate.
