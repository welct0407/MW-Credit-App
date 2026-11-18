# Change notes — R176 "copy and open" reminder on the Collection chat buttons, 18 November 2026

## Purpose
Owner, 18 November 2026: "now the feature i want to add the most is to automate the daily payment message to be sent to borrowers (group chat)". Meta's API has no group send and Instagram browser automation is prohibited, so the owner chose: "Ok, update the existing buttons in collection page to be 'copy and open'. Take a look at recent payment request messages from borrower across different chat groups, and propose a format for my review".

## Changes
- Evidence (orchestrator, read-only): one read of the group conversations through the agent's official API on `vm-mw-credit-agent` as `mwagent` (two conversation-list requests, the summary service's own query; no state written, no send; message text kept out of Git). 38 group conversations listed; 17 had a 📌 reminder in the last 4 days; 46 reminders, all from one partner account. 37 read `📌วันนี้มีส่งยอด <amount> นะคะ`, 5 are the bare `📌<amount>`, 3 show a sum such as `200+150=350`, 1 ends `นะ`. They are sent once a day in one burst of about 6 minutes (15 to 18 November: 12:00, 15:08, 11:05, 12:50 Bangkok). Only counts and patterns are recorded here.
- Design: Archie (a synchronous, unawaited `navigator.clipboard.writeText` in the link's own click, no `preventDefault`, no `execCommand` fallback; a stale amount is accepted; no access change). Echo, source review only (UX-R176-COPY-01 to 09: visible text unchanged, new accessible names, failure line must-fix, return status; a tick for "already copied", a preview and a state mark not done). Forge not applicable (no infrastructure).
- `apps/pwa/src/reminder-message.ts` (Byte, `acce8ec`, new): `reminderAmount` and `reminderMessage` build `📌วันนี้มีส่งยอด 3,600 นะคะ` (Thai only) from `amountRemaining`; null for a missing, zero or negative amount.
- `apps/pwa/src/CollectionRecords.tsx`: the Collection tile and header chat links copy the reminder as they open the chat. Names: "Copy reminder and open group chat in Instagram" and a direct-message variant, English and Thai. One `role="status"` line on return: "Reminder copied: 3,600", or in red "Reminder not copied. Type the amount in the chat." Group and direct-message links both copy (the agent sends borrowers no automatic reminder). The Borrower page chat buttons and `chatPurpose` are unchanged.
- `apps/pwa/src/live-style.css`: one selector. `tests/unit/reminder-message.test.mjs`: new unit test.
- `tests/e2e/collection-chat-summary.spec.ts` and the replay spec chat tests (Chase, `5b0856f`, `dcffce4`): chat button names updated and five new R176 tests (tile copy and open, with the clear on a new selection; rejected copy; missing clipboard API; zero amount, with no stale line after an earlier copy; header link).
- `7801458` (Byte, fix for Chase's Low 1): a tap on a chat link with nothing to collect returned before the status was cleared, so an earlier "Reminder copied" line could show again on return. Every chat tap now clears the status and invalidates a pending write.
- Chase's review of `acce8ec`: no defect above Low. Low 1 fixed in `7801458`. Low 2 accepted, not fixed: the copy status and the late-charge toast share a position and would overlap if both showed. Checked with no defect: no unhandled rejection, the link always opens, a late write cannot show on a newly selected borrower, the idle status element has no layout or focus effect, read-only and offline users copy the same way.
- Docs: `project/Documents/Release_Tracker.md` (R176 row), `project/Documents/Development_Changes.md` (R176 outstanding row), `project/Documents/Solution_Design.md` (R176 paragraph beside the Collection chat button entries).
- Unaffected: the integration agent (unchanged, no agent change note), `PWA_Data_Model_Overview.md` and the dictionary (no data, SQL or offline shape change), `docs/`, Environment Inventory (no deployment).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte, `7801458`) |
| `npm run typecheck` | Pass, exit 0 (Byte, `7801458`) |
| `node --test tests/unit/reminder-message.test.mjs tests/unit/group-chat-refresh.test.mjs` | Pass, 15 of 15 (Byte, `7801458`) |
| `tests/e2e/collection-chat-summary.spec.ts` on `desktop-chromium` and `mobile-chromium` | Pass, 39 passed, 3 skipped (phone-width only); Chase, code `7801458`, spec `dcffce4` |
| `tests/e2e/dataset-replay-independent.spec.ts` (whole file) on both projects | Pass, 32 passed; Chase, code `7801458`, spec `dcffce4` |
| `borrower-chat-button.spec.ts` and the replay spec filtered to chat tests | Pass, 10 passed; Chase, `acce8ec` with `5b0856f` |
| Chase's review of `acce8ec` | No defect above Low (see Changes) |

## Not run
- No pull request, so no `Development checks` run yet; the owner has not asked for one.
- Not deployed to DEV or PROD.
- The clipboard copy before the Instagram hand-off on a real iPhone cannot be shown in Playwright; it needs one owner tap in DEV.
- `mobile-webkit` and the iPad WebKit projects: WebKit is not installed in this cloud container; left to the pull request's CI, and no pull request exists yet.
- The wide e2e suite.

## Recovery
Revert the R176 commits. PWA Hosting only: no SQL, service, agent or data change, so nothing else to restore.

## Open questions
- The reminder wording and format are under owner review (`📌วันนี้มีส่งยอด <amount> นะคะ`).

## Remaining work
- Low 2 (copy status and late-charge toast overlap) is accepted; revisit only if the owner sees it.
- Owner review of the wording, then a DEV deploy and one iPhone tap to confirm the copy.
- Possible follow-ups, not started: a "sent" tick driven by the agent's poll; a breakdown of arrears plus today in the text.
