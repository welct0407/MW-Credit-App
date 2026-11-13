# Change notes — Group chat summary fixes, PWA (R148), 13 November 2026

## Purpose
Owner report of 13 November 2026, with a screenshot: several group chat summary cards from different borrowers stack on one borrower's Collection detail in PROD. The partner account is not affected. Owner decision: "Yes, deploy to PROD" (Hosting, after CI). The agent half (hide groups with nothing collection-relevant) is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_RELEVANCE_2026-11-13.md). Nothing is deployed.

## Changes
As built.
- Cause: `apps/pwa/src/CollectionRecords.tsx` renders `CollectionChatSummary` and the owner-testing `CollectionNote` as siblings with the same React key (`selected.id`). With `ownerTesting` on, React leaves the previous borrowers' cards mounted. The e2e test ran without `ownerTesting`, so it did not see it.
- Fix (Byte): the card key is `'chat-summary:'+selected.id` and the note key `'note:'+selected.id` in `CollectionRecords.tsx`; the sample app card key in `main.tsx` is prefixed too. A new owner-shell e2e (`tests/e2e/collection-chat-summary.spec.ts`) opens five borrowers with `ownerTesting`: before the fix desktop failed (the headline locator resolved to 2 elements) and the phone showed the duplicate-key console warning; after the fix it passes, with one card per borrower, none for a borrower without a summary and no warning.
- Documents (Dewey): this note, the release tracker (R148 scope), `Solution_Design.md` and the application dictionary entry (no card when nothing is relevant; distinct keys).
- Not changed: SQL, the command service, the read path and infrastructure.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm run typecheck` and `npm run lint` | Clean |
| Byte's `collection-chat-summary`, `collection-read` and `collection-loading-shift` specs, mobile and desktop Chromium | 16 passed |
| Byte's chat-summary spec on real WebKit (`mobile-webkit`) | 3 passed |
| Byte's `npm run build` | ok |
| Chase's review | Pass: the only keyed siblings in the detail fragment are `'chat-summary:'+id` and `'note:'+id`, with no other collision; the e2e really runs with `ownerTesting` (it asserts one `.collection-note` per visit) and fails on any same-key warning |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request and the PROD Hosting verification | Pending |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- The agent lab and database CI: no SQL change.
- PROD steps: pending the deploy.

## Recovery
Revert the pull request; Hosting rollback to the previous PROD version (in the environment inventory).

## Open questions
None.

## Remaining work
Implementation, CI, PROD Hosting deploy (authorized by the owner on 13 November 2026), read-back, owner check.
