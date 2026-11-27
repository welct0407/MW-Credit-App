# Change notes — R188 Payments moves to the menu, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim): "I hardly use the payment page in the bottom buttons. Let's move it to menu, leave only 4 at the bottom". On a phone the bottom tab bar becomes Dashboard, Collection, Borrowers and Chat, and Payments moves into the menu drawer. The desktop sidebar and the tablet rail are unchanged. Status: Open, implemented and verified locally; promotion authorized, nothing deployed yet.

Production instruction: the owner, 27 November 2026: "Push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set: PWA Hosting only (`frontend-only`); the services stay on R187; no SQL, no backup.

Team: Byte (implementation), Echo (a quick visual check), Chase (a light review), Dewey (records). Archie: not applicable (a straightforward navigation change). Forge: applicable for the deployment only (DEV and PROD Hosting).

## Changes
Baseline `0178d511` (`main`, R187 closed). Scope:
- Phone bottom tab bar: Dashboard, Collection, Borrowers, Chat; the Payments tab leaves it.
- Menu drawer: a Payments entry.
- Unchanged: the desktop sidebar and the tablet rail (they list every route); no API, SQL or service change. The drawer order is Payments, Referrers, Expenses, Upcoming, Cash, Management; the `aria-current` logic is unchanged.
- Files: `apps/pwa/src/live/LiveHeader.tsx` (one flag: `frequent:false` for payments); the `openPayments` helper in `tests/e2e/live-controls.ts`; the specs `phase5-final-ui-independent`, `rebate-offset-independent` and `chat.spec`.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, live-dev build | Pass | `796e62a6` |
| Byte | `npm test` | 1,447 passed, 1 skipped | `796e62a6` |
| Byte | desktop-chromium and mobile-chromium specs, including the Thai bottom-bar fit at 320, 375 and 412 px; the mobile-webkit drawer path | 10/10; drawer path passes | `796e62a6` |
| Chase | review: one flag changed (`frequent:false` for payments in `LiveHeader.tsx`); the desktop sidebar and tablet rail list every route; the drawer order is Payments, Referrers, Expenses, Upcoming, Cash, Management; the `aria-current` logic is unchanged | Pass, no defects | `796e62a6` |
| Echo | iPhone visual check | Pending | – |
| CI | pull request `Development checks` | Pending | – |

## Not run
- Real iPhone and the iPhone Home Screen app; the PROD bottom bar is seen only after deployment.
- Database and service groups: no SQL or service input changed.

## Recovery
Git baseline `0178d511` (R187 closed). A frontend-only revert restores the five bottom tabs. No SQL, no backup.

## Open questions
- None on authority: promotion is authorized (see Purpose).

## Remaining work
Echo's iPhone visual check, the pull request and its Development checks, the merge, the DEV deploy, the PROD promotion (Hosting only), the R188 tag and the closure pull request.
