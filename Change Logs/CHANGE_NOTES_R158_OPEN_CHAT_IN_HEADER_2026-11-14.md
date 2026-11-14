# Change notes — Open chat link in the Collection header (R158), 14 November 2026

## Purpose
Owner request of 14 November 2026: "i want the link to the group to be moved out of the summary card. maybe just next to the borrower's name. i want to open the group even there's no conversation, so it's easier for daily communication. do it in the next release". The owner chose "Collection page header (Recommended)" for the place and "Yes, straight to PROD (Recommended)", which approves the release to PROD.

## Changes
As built (Byte), following Archie's accepted design. No SQL, grant, migration or agent change; the reader grants for both link columns already exist.
- D1 Collection items carry `chatUrl` and `chatInviteUrl`, each present only when the column is readable and the value valid. A new `markGroupLinks(client, items)` reuses `readIgGroupLinks` and runs in `readCollection` beside `markChatSummary` (list page) and on the detail's borrower. No new offline key or patch: every borrower row delta already re-reads the collection `items` whole.
- D2 The links leave the summary: `withGroupChatLinks` is deleted from `readGroupChat` and `projectGroupChatRows`, `url` and `inviteUrl` leave the `GroupChat` type, and the card heading loses the link. `readIgGroupLinks`, its guards and `ig-group-url.ts` stay.
- D3 Header: an `<a>` after the borrower name and before the payment history in the Collection page header row (`CollectionRecords.tsx`): `href` from `chooseChatLink` with the device choice, `target="_blank"`, `rel="noopener noreferrer"`, the chat icon and "Open chat" / "เปิดแชท", the link colour and underline as today; nothing when there is no valid link; read-only users see it.
- D4 Narrow screens: at least 44 by 44 px; up to 480px icon-only with `aria-label` and `title` carrying the text; the name keeps `flex:1 1 160px; min-width:0; overflow-wrap:anywhere`; the link is `flex:0 0 auto`; class `collection-header-chat`; the card-scoped rule at `live-style.css` line 345 is dropped.
- D5 The chat seen mark is unchanged (opening the link does not mark seen).
- D6 Offline dataset shape v11 to v12 (`offline-dataset-delta.mjs`); the R155 stamp makes every device walk once. Deploy the command and read services before Hosting, DEV then PROD (Forge). No database step.
- As built: `markGroupLinks` in `services/api/collection-read-contract.mjs` gives the board items and the detail borrower `chatUrl` and `chatInviteUrl` (one read per guard and column per page); `withGroupChatLinks` and `withGroupChatUrl` are deleted, and `readGroupChat` and `projectGroupChatRows` read no link. Offline `business-offline-v12` (stamp `5a9e000c`) in `services/business/offline-dataset-chunks.mjs` and `offline-dataset-delta.mjs`. The header link `.collection-header-chat` sits after the name in `.collection-context` (`apps/pwa/src/CollectionRecords.tsx`, `live-style.css`): "Open chat" / "เปิดแชท", icon-only up to 480px with `aria-label` and `title`, at least 44×44, shown for read-only and command access; the card link is removed (`CollectionChatSummary.tsx`); the seen mark is unchanged. Tests changed: unit `collection-read`, `collection-receiving-display`, `offline-dataset-delta`; e2e `collection-chat-summary`, `dataset-replay-independent`.
- Review fixes (Echo), as built: UX-HDR-CHAT-01 the link sits directly after the name in read-only and command access, with Payment history next on the same row (a `:has()` rule sizes the name to its content with a reserved width; rows without a link are unchanged); UX-HDR-CHAT-02 up to 480px the icon sits in a 44px bordered frame like Payment history, with `aria-label` and `title` "Open group chat in Instagram" / "เปิดแชทกลุ่มใน Instagram"; UX-HDR-CHAT-03 on desktop the visible text "Open chat" / "เปิดแชท" has no `aria-label` and the same title. Chase: an unused `_client` argument was removed, so `projectGroupChatRows` is a plain one-argument function.
- Planned tests (run as listed under Checks): unit (items carry the keys with no summary row; keys absent when null, invalid or unreadable; `groupChat` has no `url` or `inviteUrl`; v12 and the stamp); e2e `collection-chat-summary.spec.ts` on desktop and mobile chromium and mobile-webkit (header link with `href`, `target`, `rel`; the card has no link; no links, no element; device choice; read-only sees it; offline from the bundle; 320 and 390px long Thai name without overflow, link at least 44×44). Smoke in PROD: a borrower with links and no recent chat shows the header link, and the owner confirms it opens the group on the iPhone.
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `Development_Changes.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `docs/Development_Read_Service.md`.
- Data rules: tests use invented links only; no real link, username or chat text is recorded.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| e2e `collection-chat-summary` and `dataset-replay-independent`, desktop-chromium, mobile-chromium and mobile-webkit | 70 passed, 2 skipped (final, after the review fixes) |
| `offline-dataset-delta` unit | 22/22 |
| `npm test` | 1365 tests (1364 pass, 1 skipped) |
| Width harness, 71 rows at 320, 390, 440 and 1440 px, English and Thai, both modes | No sideways scroll; the link 10px after the name and Payment history 10px after the link |
| `npm run typecheck`, `npm run lint` | Typecheck clean; lint 1 pre-existing warning and 1 info (both on base) |
| Chase's review | `npm test` 1365; `collection-chat-summary` and `dataset-replay-independent` on desktop-chromium and mobile-webkit 46 pass, 2 skipped; collection-cash lab on a fresh lab 4 pass, 1 skipped (faketime); no blocking or high findings |
| Echo's review | Must-fix UX-HDR-CHAT-01 and the two others applied |

Limitations (Chase, low): invite links are now visible for borrowers without a summary to anyone who can read the collection (intended, the owner's request; the guards are unchanged). There is no end-to-end lab step for a link-only edit on a borrower without a summary; unit tests and the shared R153 scope path cover it.

## Not run
The pull request's `Development checks` is not yet recorded; the PROD smoke (the header link on a borrower with links and no recent chat, and the owner's iPhone check) follows the promotion. Services deploy before Hosting.

## Recovery
Git baseline `34736f4e` (R157 closure). No SQL or data change: redeploy the R157 services image (the R155 image) and Hosting version recorded in the environment inventory; the services roll back before Hosting is needed.

## Open questions
None.

## Remaining work
Build and review, the pull request, the PROD promotion record (Forge) and owner acceptance.
