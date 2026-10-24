# Change notes — deterministic service-worker notification-click test, 24 October 2026

## Purpose
The case "the focused open tab handles the tap in place without navigation" in `tests/unit/sw-notification-click.test.mjs` raced a 5 ms stand-in for the 1.5 s acknowledgement timer against the MessageChannel reply. It failed 1 in 5 and 1 in 40 local runs with `apps/pwa/pwa/sw.js` unchanged.

## Changes
- `tests/unit/sw-notification-click.test.mjs`: the stubbed 1.5 s timer no longer runs on wall-clock time. In the acknowledging case it is held and can only be removed by the worker's `clearTimeout`, so the acknowledgement always wins; the test also asserts the timer was armed and cleared, and has a 5 s timeout so a regression fails instead of hanging. In the silent-tab case it expires on the next turn, which cannot race because that tab closes its port without replying.
- `apps/pwa/pwa/sw.js` is unchanged.

## Checks
| Command | Result |
| --- | --- |
| `node --test tests/unit/sw-notification-click.test.mjs`, 200 runs in a loop | Pass, 0 of 200 failed |
| `npm test` | Pass, 871 passed, 1 skipped, 0 failed |

## Not run
The broad run is the pull request's Development checks.

## Recovery
Revert this commit; test-only change.

## Open questions
None.

## Remaining work
None.
