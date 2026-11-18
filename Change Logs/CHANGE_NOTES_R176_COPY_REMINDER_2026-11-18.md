# Change notes — R176 "copy and open" reminder on the Collection chat buttons, 18 November 2026

## Purpose
Owner, 18 November 2026: "now the feature i want to add the most is to automate the daily payment message to be sent to borrowers (group chat)". Meta's API has no group send and Instagram browser automation is prohibited, so the owner chose: "Ok, update the existing buttons in collection page to be 'copy and open'. Take a look at recent payment request messages from borrower across different chat groups, and propose a format for my review".

## Changes
- Evidence (orchestrator, read-only): one read of the group conversations through the agent's official API on `vm-mw-credit-agent` as `mwagent` (two conversation-list requests, the summary service's own query; no state written, no send; message text kept out of Git). 38 group conversations listed; 17 had a 📌 reminder in the last 4 days; 46 reminders, all from one partner account. 37 read `📌วันนี้มีส่งยอด <amount> นะคะ`, 5 are the bare `📌<amount>`, 3 show a sum such as `200+150=350`, 1 ends `นะ`. They are sent once a day in one burst of about 6 minutes (15 to 18 November: 12:00, 15:08, 11:05, 12:50 Bangkok). Only counts and patterns are recorded here.
- Design: Archie (a synchronous, unawaited `navigator.clipboard.writeText` in the link's own click, no `preventDefault`, no `execCommand` fallback; a stale amount is accepted; no access change). Echo, source review only (UX-R176-COPY-01 to 09: visible text unchanged, new accessible names, failure line must-fix, return status; a tick for "already copied", a preview and a state mark not done). Forge not applicable (no infrastructure).
- `apps/pwa/src/reminder-message.ts` (Byte, `acce8ec`, new): `reminderAmount` and `reminderMessage` build `📌วันนี้มีส่งยอด 3,600 นะคะ` (Thai only) from `amountRemaining`; null for a missing, zero or negative amount.
- `apps/pwa/src/CollectionRecords.tsx`: the Collection tile and header chat links copy the reminder as they open the chat. Names: "Copy reminder and open group chat in Instagram" and a direct-message variant, English and Thai. One `role="status"` line on return: "Reminder copied: 3,600", or in red "Reminder not copied. Type the amount in the chat." Group and direct-message links both copy (the agent sends borrowers no automatic reminder). The Borrower page chat buttons and `chatPurpose` are unchanged.
- `apps/pwa/src/live-style.css`: one selector. `tests/unit/reminder-message.test.mjs`: new unit test.
- `tests/e2e/collection-chat-summary.spec.ts` (Chase): spec updates in progress.
- Docs: `project/Documents/Release_Tracker.md` (R176 row), `project/Documents/Development_Changes.md` (R176 outstanding row), `project/Documents/Solution_Design.md` (R176 paragraph beside the Collection chat button entries).
- Unaffected: the integration agent (unchanged, no agent change note), `PWA_Data_Model_Overview.md` and the dictionary (no data, SQL or offline shape change), `docs/`, Environment Inventory (no deployment).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte, `acce8ec`) |
| `npm run typecheck` | Pass, exit 0 (Byte, `acce8ec`) |
| `node --test tests/unit/reminder-message.test.mjs tests/unit/group-chat-refresh.test.mjs` | Pass, 15 of 15 (Byte, `acce8ec`) |
| Chase review and e2e spec run | PENDING |

## Not run
- No pull request, so no `Development checks` run yet; the owner has not asked for one.
- Not deployed to DEV or PROD.
- The clipboard copy before the Instagram hand-off on a real iPhone cannot be shown in Playwright; it needs one owner tap in DEV.
- Chase's review and e2e results: PENDING.

## Recovery
Revert the R176 commits. PWA Hosting only: no SQL, service, agent or data change, so nothing else to restore.

## Open questions
- The reminder wording and format are under owner review (`📌วันนี้มีส่งยอด <amount> นะคะ`).

## Remaining work
- Chase's review and e2e rows (PENDING).
- Owner review of the wording, then a DEV deploy and one iPhone tap to confirm the copy.
- Possible follow-ups, not started: a "sent" tick driven by the agent's poll; a breakdown of arrears plus today in the text.
