# Change notes — Chat button on the Collection borrowers list (R160), 14 November 2026

## Purpose
Owner request of 14 November 2026: "sync is faster now, i accept R159. i want to add that chat button (same blue color one in the collection details page) into the collection borrowers list page, put it next to the payment receiving button, on its left side. do it in R160". The owner chose "Yes, straight to PROD (Recommended)". R159 is owner-accepted on 14 November 2026.

## Changes
Design (Archie, accepted). Base `origin/main` `f6f4b3ba`. PWA only: Hosting only, no server image, SQL, migration or agent change; the offline dataset stays v12 (list rows already carry `chatUrl` and `chatInviteUrl` since R158).

Decisions:
- D1 In `.collection-tile-right` a new `<div class="collection-tile-actions">` (flex row, gap 8px as built, aligned right) sits under the paid amount: the chat link first, the existing Receive button second and unchanged. The wrapper renders only when at least one of the two exists.
- D2 Look: the phone header look at every width. `<a class="collection-tile-chat">` with the chat icon, 44 by 44, white, 1px `#dedede` border, 5px radius, icon 24px in `#0b57d0`, icon only also on desktop. The R157 list mark (22px blue circle badge) is unchanged. The header rule must not change behaviour.
- D3 Link from `chooseChatLink` with the row's `chatUrl`, `chatInviteUrl` and the device choice (`chatDevice()` once per render). No element when there is no usable link.
- D4 No nested target: the anchor is a sibling of the tile button, as Receive is, so tapping it never opens the borrower. Tab order: tile button, chat, Receive. It stays active while the page is busy (an anchor changes no app state).
- D5 Name: `title` "Open group chat in Instagram" / "เปิดแชทกลุ่มใน Instagram"; `aria-label` adds the borrower name; the icon is `aria-hidden`.
- D6 Read-only users see the button (R158 precedent); offline it shows from the stored bundle; opening it does not mark the summary seen.
- D7 (replaced as built, after the Echo and Chase review: UX-R160-01, UX-R160-02 and Chase's Should 1 accepted, no must-fix; Echo's two "could" items need no change) Heights: when any tile on the page has a chat link, every tile reserves the same right-column width (list classes `collection-list-chat` and `collection-list-command`): a 44px actions row, with a minimum width of 96px for command users. The name column is the same width on every tile, and a tile with a link is never taller than one without, for command and read-only users alike. The chat button and Receive sit 8px apart. The chat link stays enabled while the page is busy; the tile button and Receive are disabled. Remaining pre-existing effect (R157, unchanged): the new-summary mark can push a long name onto one more line, 20px.

Files:
- Code (Byte): `apps/pwa/src/CollectionRecords.tsx`, `apps/pwa/src/live-style.css`.
- Tests (Byte): `tests/e2e/collection-chat-summary.spec.ts` (ten cases: link and position, no link, device choice, no borrower opened, keyboard order, read-only, offline, widths 320 and 390 and desktop, R157 heights, Thai title); `collection-loading-shift.spec.ts` and `chat-pwa.test.mjs` only if they pin the tile markup.
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`. `PWA_Data_Model_Overview.md` and `docs/Development_Read_Service.md` are unchanged (no data, read or shape change).
- Data rules: tests use invented links and names only.

Risks (Archie): the reserved right column narrows the name column on every tile when any tile has a link (the width case guards overflow, not line count); in an installed iOS PWA `target=_blank` behaves as the header link already does.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| `npm run typecheck`, `npm run lint`, PWA collection and chat units (Byte) | Typecheck 0; lint 0 errors (2 warnings in untouched files); units 72/72 |
| e2e `collection-chat-summary.spec.ts` on desktop-chromium, mobile-chromium and mobile-webkit (Byte) | 40 passed, 2 skipped by design |
| e2e dataset-replay R158 offline (Byte) | 3/3 |
| `Development checks` of the pull request (the one broad run) | Pending |
| Chase's independent run of the four collection specs (before the fixes) | 49 passed, 2 skipped |
| Echo's and Chase's review | No must-fix; UX-R160-01, UX-R160-02 and Chase's Should 1 applied; Echo's two "could" items need no change |
| DEV after Hosting (synthetic data) | Pending |
| PROD verification | Pending, see the PROD promotion record |

## Not run
No local wide browser suite beyond the collection specs above and no new unit test (no new logic; `chooseChatLink` is covered); the pull request's `Development checks` is the one broad run. The owner's iPhone check follows the deploy.

## Recovery
Git baseline `f6f4b3ba`. No SQL, data or service change: redeploy the previous Hosting version recorded in the environment inventory.

## PROD promotion record (Forge, to be filled)
Authority: the owner's request quoted in Purpose and "Yes, straight to PROD (Recommended)". Scope: PWA Hosting only; no SQL, backup, Terraform, service image or agent change.

| Step | Result |
| --- | --- |
| Baseline | To fill: Hosting version before the deploy |
| DEV | To fill: Hosting version, smoke |
| Hosting | To fill: receipts, `--check`, `--apply`, version, build |
| Smoke | To fill: origins, `sw.js` no-store, no ERROR logs |
| Tag | To fill |
| Closure | To fill |

Limitations: the owner checks on an iPhone that the list button opens the group for a borrower with an invite link.

## Open questions
None.

## Remaining work
Build and checks (Byte, Chase, Echo), DEV and PROD Hosting (Forge), owner acceptance.
