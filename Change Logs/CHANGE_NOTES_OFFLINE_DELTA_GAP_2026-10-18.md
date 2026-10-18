# Change notes — offline refresh gap between segments, 18 October 2026

## Purpose
A focus or the 30 s poll landing between two records segments of a chunked refresh re-queued collection, cash, management and notifications that had already finished. The extra downloads made `tests/e2e/offline-delta-independent.spec.ts` fail about 1 run in 10. Open release: R073.

## Changes
- `apps/pwa/src/offline-dataset.ts`: new `walking()` counts a domain whose next segment is queued with a kept partial as still running; `check()` uses it instead of `domainRunning()`, so a focus or poll in that gap joins the running cycle. No data impact: the removed work was duplicate read-only refreshes.
- `tests/e2e/offline-delta-independent.spec.ts`: the focus loop also sends a focus in the gap between segments and expects no refetch.
- Existing documents (`docs/Development_Read_Service.md`, Solution Design) describe polling and focus checks only in general terms; no change needed.

## Checks
| Command | Result |
| --- | --- |
| `offline-delta-independent` spec, old code with the new test | Fails 10 of 10 |
| `offline-delta-independent` spec, fixed code, repeated under load | Pass 120 of 120 (old code with the old test failed 13 of 120) |
| `node scripts/check-docs.mjs` | Pass: 0 failures, 0 warnings |

## Not run
Broad e2e and unit suites: the pull request's `Development checks` run is the one broad run. Live checks: none needed (no deployment).

## Recovery
Revert the batch commit; Git baseline `6f643af` on `main`.

## Open questions
None.

## Remaining work
None.
