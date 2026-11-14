# Change notes — Chat mark badge (R157), 14 November 2026

## Purpose
Owner request of 14 November 2026: "the new summary icon is not obvious enough. let's update it's color, and maybe size as well, so it can be visible easily." The owner chose Echo's variant B ("B: blue circle badge") and said "Yes, straight to PROD", which approves the release to PROD.

## Changes
As built (Byte): CSS only, in `apps/pwa/src/live-style.css` (line 350) and `apps/pwa/src/style.css` (line 1281), exactly as planned. PWA Hosting only: no SQL, services, agent or data change.
- The Collection list's new-summary mark goes from a 16px grey (`#555`) outline chat icon to a 22px filled blue (`#0b57d0`) circle with a white chat icon (stroke 2.5). The blue is the same as the card's Open chat link. Tile heights are unchanged, contrast is 6.4:1 and the screen-reader text is unchanged. The mark's rule is unchanged.
- Variants considered: A (a 20px blue outline icon) and C (the badge plus a Thai "new" pill; rejected because it adds a line on long names and misaligns the Thai baseline).
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `Development_Changes.md`, `Solution_Design.md` (the R150 statement that the list mark colour is unchanged is superseded).
- Not changed: SQL, services, the agent, the Data Dictionary and the inventory (pins at closure).

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| e2e `collection-chat-summary` and `collection-chat-seen-sync`, desktop-chromium, mobile-chromium and mobile-webkit | 24 passed, 0 failed. New asserts: background `rgb(11,87,208)`, white icon, 50% radius, 2.5px stroke, 4px padding, 22×22 size, tile height unchanged within 1px against a tile without the mark. The "mark on the last word's line" check now uses the icon's vertical centre within the word's line, because the 22px circle overhangs the text box by 1px (accepted by the orchestrator) |
| `npm run typecheck`, `npm run lint` | Typecheck clean; lint 1 pre-existing info |
| Review | Echo designed the variant and reviewed screenshots; no separate review round, and Chase is not needed for a CSS-only change |

## Not run
The pull request's `Development checks` and the PROD smoke follow the promotion.

## Recovery
Git baseline `ec0812da` (R156 closure). PWA only: redeploy the R156 Hosting version recorded in the environment inventory.

## Open questions
None.

## Remaining work
Byte's results, the pull request, the PROD promotion record (Forge) and owner acceptance.
