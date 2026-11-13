# Change notes — Group chat card style (R150), 13 November 2026

## Purpose
Owner requests of 13 November 2026 on the group chat summary card: (1) a different colour for each speaker role on the tags, (2) the "Last message" role colour-coded too, and all card times in the browser's local time zone instead of Bangkok time, (3) no "Show more / Show less": the card always shows the whole summary. Owner authorization: "Yes, deploy to PROD" (Hosting, after CI). PWA only; nothing is deployed.

## Changes
As built.
- `apps/pwa/src/CollectionChatSummary.tsx`, `CollectionRecords.tsx`, `main.tsx`, `live-style.css`, `style.css` and the e2e spec (Byte): speaker tags are outline pills coloured per role through custom properties on `.collection-chat-summary` (classes `chat-role chat-role-<role>`): borrower `#1d5fa8` blue, other borrower `#4a4fb0` indigo, partner `#6a6200` olive, referrer `#a3336f` magenta, MW Credit `#0b6b7a` teal, other `#666666` grey, all at least 5.7:1 on white, payment-status colours avoided; the last-message role is the same colour at weight 600. The expander (Show more / Show less) and its state are removed: the card always shows the headline, up to four points and the last-message line. All card times (Updated, the last-message time, the stale "Last conversation <date>" and the today test) use the browser's local time zone; the rest of the app still shows Bangkok business time. The list mark colour is unchanged; light theme only.
- Rule change: R146 said tags are neutral and never reuse the payment-status colours, and UX-CHAT-01 kept the expander. Now tags take role colours and there is no expander; the payment-status colours stay off-limits.
- Echo's visual review (real WebKit iPhone 17 Pro Max and desktop Chromium, English and Thai): UX-CHAT-10 taken (the Borrower and Partner colours were too close, ΔE 10.6, now 51.4); UX-CHAT-11 (distance from the status colours fine), 13 (card height 341 px worst case on a phone, accepted) and 14 (Thai tags fine) need no change; UX-CHAT-12 (stale tags keep full colour) not taken, because the owner asked for role colours.
- Documents (Dewey): this note, the release tracker (R150 scope), `Solution_Design.md` (card rules) and `application.yaml` (the card entry).
- Not changed: SQL, the agent, the command and read services.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm run typecheck` and `npm run lint` | Clean (before the colour swap) |
| Byte's `npm test` | 1355 pass, 1 skipped (before the swap) |
| Byte's `npm run build` | ok |
| Byte's `collection-chat-summary`, `chat-seen-sync` and `collection-read` specs, mobile and desktop Chromium | 18 passed (before the swap) |
| Byte's chat-summary spec on real WebKit (`mobile-webkit`), including Los Angeles and Tokyo time-zone tests | 5 passed (before the swap) |
| Byte's chat-summary spec rerun after the colour swap | Pending |
| Echo's visual review | Done, see Changes |
| Chase | Not applicable: a text, style and layout change, covered by Byte's checks and Echo's visual pass under the proportional validation |
| CI on the pull request and the PROD Hosting verification | Pending |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- A dark theme: the card is light theme only.
- PROD Hosting deploy: pending.

## Recovery
Revert the pull request; Hosting rollback to the previous PROD version (in the environment inventory).

## Open questions
None.

## Remaining work
Implementation, verification, CI, PROD Hosting deploy (authorized by the owner on 13 November 2026), owner check.
