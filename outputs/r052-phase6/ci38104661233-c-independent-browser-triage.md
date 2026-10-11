# Independent browser checkpoint triage

Agent C, 11 October 2026. Starting canceled checkpoint source: `4cbb9695f97557e9484fe16c73acfd82ca166b6e`. [Failure inventory](ci38104661233-e2e-failure-inventory.md) is dated failed evidence, not a green checkpoint. B owns the other borrower/final-UI/loan/persistence/payment/receiving groups. Root/D own consolidated source publication and final CI. No deployment, live data mutation or production action occurred here.

## Reproduced diagnoses and corrections

| Group | Reproduced failure | Correction preserving the behavior |
| --- | --- | --- |
| Cash tree | Unscoped tree matched both desktop and mobile subtrees; old generic New record captions no longer exist | Select visible desktop tree at desktop width for exact source metric/null/bold/plain assertions, retain mobile compact account assertions and ledger mouse/Enter/Space, paging and Back; test current Add cash holder/account captions and fit |
| Grouped reads and responsive gaps | Back is now in the shared header, while old assertions required it below the header inside detail | Require visible Back fully inside header, retain independent pane scroll and detail identity/pagination checks; return to root Borrowers before testing menu focus trapping because subject routes expose header Back |
| SDK/worker fixture | `setVersion` produced nonhexadecimal fixture labels, rejected by the existing24hex startup guard | Use deterministic24hex SHA256 fixture versions in worker and metadata; production guard remains unchanged |
| Canonical two tabs | Update was introduced before the second tab completed startup; startup auto-upgrade invalidated the explicit waiting-worker premise | Require both tabs to finish startup before publishing the synthetic update, retaining failed-post retry, initiating-tab-only reload, retained other tab and explicit other-tab reload |
| Startup Back and generations | Old `output` selector no longer matches the Closing amount summary | Assert the exact final `dd` in the Closing amount region; retain source CAS, pending UUID, held metadata, failed asset install, retry,3 builds, retained edited tab and cache-exclusion assertions |

At this initial correction stage, only C's test/fixture code changed. No assertion was skipped or timeout increased. Existing explicitly single-desktop-only worker cases retain their pre-existing mobile skips. Synthetic temporary builds/profiles use existing finally cleanup. Ordinary regenerated screenshots and test-results are excluded from intended publication. Pre-existing source changes were preserved; prior dirty screenshot bytes were not independently captured before the initial workspace tests, so their exact preservation is not established.

## Focused evidence

Initial short reproduction:7 desktop executions,3 passed/4 failed. After corrections, Cash/grouped passed6/7; the remaining responsive route-state error was corrected and its focused retest passed1/1.

Initial worker/SDK reproduction:5 executions,1 passed/4 failed. After fixture and Close-markup corrections, real SDK offline/reconnect/update/signout plus both startup Back cases and3-generation recovery passed4/5; the remaining canonical startup race was corrected and canonical focused retest passed1/1.

The earlier original-workspace affected cross-project run used:

```text
node node_modules/@playwright/test/cli.js test tests/e2e/grouped-read.spec.ts tests/e2e/cash-two-workspaces-independent.spec.ts tests/e2e/responsive-gaps.spec.ts tests/e2e/pwa-canonical.spec.ts tests/e2e/startup-back-independent.spec.ts tests/e2e/startup-generations-independent.spec.ts tests/e2e/phase5-offline-sdk-independent.spec.ts --workers=2 --reporter=list --output=test-results-c-checkpoint-finalaffected
```

This earlier run completed15 passed,3 pre-existing mobile skips,6 mobile failures. All12 desktop scenarios passed. Four mobile Cash failures exposed synthetic HTML without viewport metadata (browser980CSS width at440); source-equivalent viewport metadata and explicit `innerWidth` assertions corrected the fixture premise. Grouped mobile language changes occurred on a subject route exposing Back and were corrected with the controlled-resize helper. Mobile3-generation retry remained in Checking version while the new asset was held; later frozen-candidate results below resolve these pending observations.

`git diff --check` passed for the seven intended test/fixture files. Root/B coordinate the authorized broader local E2E check to expose canceled/unreached cases before corrected consolidated CI. Further tests use D's isolated frozen candidate to prevent historical capture overwrites. The initial workspace runs regenerated existing screenshot paths; their pre-run bytes were not independently captured, so exact restoration of those prior dirty captures is not established. No cleanup or blanket restore was performed.

B subsequently changed frontend auth-observer revision handling after independently reproducing same-User-object403 recovery. The current batch is therefore not wholly test-only; C's scoped edits remain tests/fixture/evidence. Fresh candidate proof for that change is recorded below. This evidence does not establish green full CI, DEV deployment closure or physical-device owner acceptance.

## Frozen isolated full run

D exported starting source plus15 intended overlays to `outputs/.tmp/checkpoint-candidate-20261011`, with exact inputs in `checkpoint-source-manifest.json`. Fresh synthetic/live-dev type and build checks passed. The isolated280-execution run finished with252 passed,19 failed and9 existing skips in15.2 minutes. Runtime JSON is `outputs/.tmp/checkpoint-candidate-20261011/outputs/r052-phase6/local-final-e2e.json`; error contexts are under that candidate's `test-results-final-checkpoint`. This is failed local evidence, not a green CI claim.

Corrected Cash mobile viewport, grouped mobile language handling, SDK/worker startup and both-project startup Back tests passed. Mobile three-generation recovery also passed, including held asset, failed install, retry and retained edited tab; the earlier Checking-versus-Upgrading anomaly did not recur on the fresh frozen candidate. No startup product change is justified by that earlier observation.

The pinned frontend auth-observer change passed both-project persistence boundaries: identical-User-object403 re-sign-in triggers a fresh read; token-network retry, invalid-token/401 clearing, failed sign-out and stale callbacks, offline late identity/reconnect, delayed expiry/logout and loading-header behavior remain covered. Real SDK offline/reconnect/update/sign-out and canonical two-tab reload ownership also passed. This proof applies to the candidate manifest inputs; later frontend changes require their affected verification.

The19 failures group into empty analytics chart rendering (B confirmed product defect), missing synthetic viewport metadata, moved header Back geometry, removed payment action dropdown/Clear-draft selectors, and language/sign-out helpers invoked on active child routes. The additional mobile borrower summary/history timeout still used the ordinary language helper on the active borrower summary; B owns its correction and focused proof. C saved three additional original-only corrections for Upcoming header/menu behavior and the preserving language helper in Upcoming, Collection and unified Receiving. The running candidate stayed unchanged throughout. D will refresh explicit agreed files and hashes only, then affected checks will run in the candidate; no original-workspace captures will be regenerated.

| Failed executions | Repair and affected proof |
| --- | --- |
| Back consumers held assessment/analytics/cash, desktop+mobile (2) | B bounds empty-series date tick indices; retain late-response Back behavior and assert nine empty charts/no page error. Also rerun populated, signed and zero-series chart checks. |
| Back consumers caption/target geometry, mobile (1) | Add source-equivalent viewport metadata and actual CSS viewport assertion; retain captions and touch targets. |
| Final UI F13 routes and Page7 Dashboard, desktop+mobile (4) | Use current direct Correct/Delete payment actions; retain geometry, deletion refresh, financial values, source order and held synchronization. |
| Final UI Page12 borrower/history, mobile (1) | Preserve active summary during real-control language resize; retain ten loan metrics/classes, bilingual geometry, lazy history and no POST. Rerun both projects. |
| Receiving UX Clear draft, desktop+mobile (2) | Use current direct Clear draft action; retain queued-edit cancellation and offline no-revival checks. |
| Upcoming read, desktop+mobile (2) | Assert Back inside shared header; test menu on root then restore selection; preserve active-child language changes, request counts, dates, paging and partial failure. |
| Unified Receiving compact geometry390/320, desktop+mobile (4) | Preserve active form while using actual language controls; retain scrolling/summary geometry and exact payload assertions. |
| Collection read, mobile (1) | Preserve child route during real-control language change; retain financial displays, rollover, errors and logout races. Rerun both projects. |
| Payment command pending/auth loss and Phase4 delayed old-owner draft, mobile (2) | Real desktop resize Sign out on the same active child/request then restore viewport; retain storage refusal, late-owner isolation and financial assertions. Rerun both projects. |

The252 passes are reusable only for their recorded manifest inputs and unchanged dependencies/fixture assumptions. The final repair changes frontend analytics empty-series handling and affected test helpers; the focused batch must cover all19 failed executions, helper consumers and populated/signed/zero chart behavior. Passing unaffected worker/auth cases remain labeled reused proof rather than a second full run. Final remote checkpoint CI and configured DEV frontend delivery remain separate pending steps.

All nine skips predate this batch: desktop Thai-mobile screenshot (`foundation:56`); mobile desktop multi-width readability (`foundation:102`); mobile single-run actual SDK/offline (`payment-offline-sdk:8`, `persistence:16`, `phase5-offline-sdk-independent:8`); mobile single-run worker lifecycle/two-tab (`payment-sw-independent:5`, `pwa-canonical:4`, `pwa-worker:9`); and mobile single-run three-width reflow (`responsive-gaps:18`). These are explicit coverage limits, not new skips. No timeout was increased.

## Final affected verification

D refreshed20 explicitly agreed source/test overlays and their manifest hashes after the full run, including the bounded empty-series chart guard and Page12 language correction. Fresh synthetic/live-dev TypeScript and build checks passed. C then ran the eight affected spec files in both browser projects with two workers: `back-consumers-independent`, `collection-read`, `payment-command`, `payment-phase4-independent`, `phase5-final-ui-independent`, `receiving-ux-independent`, `unified-receiving-independent` and `upcoming-read`.

Result: **126 passed, zero failed, zero skipped in4.1 minutes**. Every one of the19 previously failed executions passed, along with related financial/authentication cases and signed/unavailable analytics. JSON: `outputs/.tmp/checkpoint-candidate-20261011/outputs/r052-phase6/local-final-affected-e2e.json`. No source changed during that run.

The existing review recipe `remaining-approved-capture-source.ts` was copied only inside the candidate to temporary `tests/e2e/ux-pinned-review.spec.ts`. Only “approved Analytics exact legend signed zero axes and distinct actions” ran: **1 passed**, covering440/820/1180/1440 widths,25 exact slices plus Other legend and palette, separate paged values, signed bars, all-zero bars, date/zero axes, finite SVG geometry and distinct action icons. JSON: `outputs/.tmp/checkpoint-candidate-20261011/outputs/r052-phase6/local-final-analytics-e2e.json`. An initially anchored title filter selected no tests; the distinctive title filter then selected exactly this case. The temporary recipe and runtime captures are excluded from publication.

All20 overlay file hashes were checked against the refreshed manifest after verification, with zero mismatches. Manifest SHA256: `5a9ed5e2a21ba91cbd9d81a5b00190c9b9bc7b216015a1e4fcdb1402ad9f6196`. Relevant exact source pins: auth `live-main.tsx` `b8d37e4fe8fb8131df8dbcd5186934b7b5b47cad2266044e239367f0b1cb1aff`; chart `ManagementAnalytics.tsx` `6ab0ba3b353861d4662e632e9a5eed1c8ca65356b165ba87ac0c37dafc671295`; final-UI proof `277407cbfb0da924cf40706b02cde4bca18c9bd659cfbeffe52d9bfa9d4a9a8c`. The252 initial passes are retained only under the reuse conditions above; affected checks supersede their failed counterparts. Local repair verification is complete. Consolidated remote CI, configured DEV frontend deployment and owner/device acceptance remain outside this result and under root/D coordination.

## Intended publication and recovery

Ten C-owned changed test/fixture files: `tests/e2e/cash-two-workspaces-independent.spec.ts`, `tests/e2e/grouped-read.spec.ts`, `tests/e2e/responsive-gaps.spec.ts`, `tests/e2e/fixtures/canonical-server.ts`, `tests/e2e/startup-back-independent.spec.ts`, `tests/e2e/startup-generations-independent.spec.ts`, `tests/e2e/pwa-canonical.spec.ts`, `tests/e2e/upcoming-read.spec.ts`, `tests/e2e/unified-receiving-independent.spec.ts`, `tests/e2e/collection-read.spec.ts`, plus this concise evidence. Rollback is reverting these scoped test/fixture corrections to their starting source. Root/D maintain the coherent existing change log and publication.
