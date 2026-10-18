# Change notes — receipt recognition account hotfix (R076), 18 October 2026

## Purpose
The owner's first PROD check after R075 found the receiving account not filled from the slip and the recognition messages out of view. Matching itself worked: the owner's slip recipient number (shown as `xxx-x-x0386-x`) matched exactly the SCB account. Source only; not deployed.

## Changes
- Cause: the form filled the account only when it was empty, and PROD preselects the preferred account. The mismatch note and banner sat below the receipt preview, and an unmatched or ambiguous slip had no note.
- Owner decisions, 18 October 2026: the slip's matched account overrides a default or preselected account; a choice the person made by hand in the session stays, with the mismatch note and a "Use slip account" button; recognition messages appear above the receipt preview.
- `apps/pwa/src/SelectedCharges.tsx`: account override, notes for unmatched and ambiguous slips, message placement.
- `services/receipts/recognizer-rules.mjs`: a slip with no recipient numbers gives no account warning.
- Tests: `tests/unit/receipt-recognition-rules.test.mjs`, `tests/e2e/receipt-recognition-independent.spec.ts`, `tests/e2e/unified-receiving-independent.spec.ts`.
- Commit `62770c47` (Byte). No SQL, infrastructure or agent change. The owner's design doc is unchanged.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass (Byte) |
| `npm run typecheck` | Pass (Byte) |
| `npm test` | 656 of 656 (Byte) |
| `vite build` (synthetic) | Pass (Byte) |
| 7 affected e2e specs, desktop and mobile Chromium | 178 passed (Byte) |
| `npm run check:docs` | Pass, 0 failures |

## Not run
- The full wide browser suite: the lean check routine runs it once on the pull request.
- A PROD check with a real slip: not deployed.

## Recovery
Revert `62770c47`. The previous behaviour (fill an empty account only) returns; nothing in the database or infrastructure changes.

## Open questions
None.

## Remaining work
Pull request checks, owner-authorized R076 promotion (command service image for `services/receipts/recognizer-rules.mjs` plus Hosting; no SQL, no infrastructure or agent change), then the owner's real-slip check in PROD.
