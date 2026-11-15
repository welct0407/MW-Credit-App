# Change notes — Direct-message chat button (R161), 15 November 2026

## Purpose
Owner request of 15 November 2026, after confirming that https://ig.me/m/<username> opens the DM on iPhone ("Yes it works."): "I want you to implement this feature: For all the borrowers, if they're AI collection enabled, and if there's no group url filled in (both links are blank), create the similar chat button like other group chat (in collection list and in collection details) and link to their chat using the url you mentioned above (based on their ig username in their borrower profile) Keep the same icon but change to another color to indicate it's DM not group chat. And also add the same buttons in borrower list (put on the left of new loan) and borrower details (put on the left of new loan)". The owner chose "Stop at DEV first": PROD needs the owner's later go-ahead, and the PROD promotion includes reader column grants, which need a verified backup.

## Changes
Design (Archie, accepted). Base `origin/main` `90df4d2c`. Needs the read image, two reader column grants and Hosting. The offline dataset stays v12 (owner decision: no shape bump, no device re-download). No migration and no new column.

Decisions:
- D1 Handle rule `igDmUrl(username)` (pure, `apps/pwa/src/ig-group-url.ts` and the same in `services/api/collection-read-contract.mjs`): trim; drop one leading `@`; accept `https://(www.)instagram.com/<handle>` and `https://ig.me/m/<handle>`; the handle must match `^[A-Za-z0-9._]{1,30}$` and, when taken from a URL, must not be a reserved path (`direct`, `p`, `reel`, `reels`, `explore`, `accounts`, `stories`, `tv`); a handle made only of dots is rejected (review, Chase Should 1). Result `https://ig.me/m/<handle>` or null; stored data is not changed.
- D2 Precedence: `chooseChat({url,inviteUrl,dmUrl},device)` returns `{kind:'group'|'dm',href}` or null; `chooseChatLink` first, and only when it returns null a valid `dmUrl`. "Both links blank" is implemented as "no usable group link".
- D3 Server field `chatDmUrl` from `markGroupLinks`, when both columns are readable (same per-column guard as the group links), `"AI Collection Enabled" IS TRUE` and D1 gives a link. No username or flag leaves the server on list rows.
- D4 Surfaces: the online read service responses carry `chatDmUrl` on Collection items and `chatUrl`, `chatInviteUrl` and `chatDmUrl` on Borrower list rows (gated by the two reader grants). Every member's offline bundle (per actor; `principalAllowed` comes from the membership policy in `services/production/business-policy.mjs` and `business-runtime.mjs`, the partner included) already holds the full borrower records (username, AI flag and both group links), so the PWA builds the link on the fly from them with `igDmUrl` and `chooseChat`; no offline chunk changes. The borrower details derive the link from the record, falling back to the list row for a read-only user; the button is hidden while editing.
- D5 No shape bump (owner decision, replaces the planned v13): the offline dataset stays v12, so no device re-downloads. The offline bundle rows are not changed; the PWA derives the buttons from the stored borrower records, and the read service adds the fields online only.
- D6 Reader grants (owner authority needed with the promotion): `Instagram Username` and `AI Collection Enabled` on `Borrowers` in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py`, applied by the operator as for R153 and R154 (no migration; verified backup before the PROD grant). Until granted the read service leaves `chatDmUrl` out and nothing else changes. Services deploy before Hosting.
- D7 Look: the same chat icon and the R160 box (44 by 44, white, 1px `#dedede`, 5px radius, 24px icon); group stays `#0b57d0`, DM is teal `#00695c` (review: UX-R161-CLR-01; the first design's magenta `#c2185b` read as the unpaid or delete red and sat close to the paid green under deuteranopia); one shared modifier class (`chat-link-dm`). Names: group "Open group chat in Instagram" / "เปิดแชทกลุ่มใน Instagram" (unchanged), DM "Open Instagram direct message" / "เปิดแชทส่วนตัวใน Instagram"; list buttons add the borrower name to `aria-label`; the Collection header above 480px keeps the text link in the DM colour, with the desktop label "Open DM" / "เปิดแชทส่วนตัว" (UX-R161-TXT-01).
- D8 Placement, no nesting: every button is an `<a target="_blank" rel="noopener noreferrer">` and a sibling of the tile's main button. Collection list and header use the existing slot; the borrower list tile gets a `borrower-tile-actions` row between the main button and New loan; the borrower details put it first in `borrower-direct-actions`, left of New loan. Read-only users have the button alone in the same place. Tab order: tile, chat, action.
- D9 Heights and widths: the button is 44px like New loan and Receive, so tiles with and without it are equally tall (the borrower tile main button gets `min-height:44px` if it has none); the reserved width grows by 52px on borrower tiles and the name wraps.
- D10 Unchanged: opening a link never marks a summary seen; offline the button shows from the bundle; a borrower created or edited offline shows the button after the next sync.

Files:
- Code (Byte): `services/api/collection-read-contract.mjs`, `services/api/borrower-read-store.mjs`, `apps/pwa/src/ig-group-url.ts`, `apps/pwa/src/CollectionRecords.tsx`, `apps/pwa/src/live-main.tsx`, `apps/pwa/src/BorrowerRecord.tsx`, `apps/pwa/src/live-style.css`, `scripts/production/reader-capability-contract.json`, `scripts/configure-dev-read-role.py`, and their tests.
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `project/Documents/PWA_Data_Model_Overview.md`, `docs/Development_Read_Service.md`. `Environment_Inventory.md` records the reader grants once Forge applies them. The data dictionary is unchanged: no column, constraint or routine changes (the dictionary does not list reader grants), so no rebuild.
- Data rules: tests use invented usernames and links only.

Risks (Archie): the reader grants widen what the read login can select (a username and a flag) while the service still sends only the link, and read-only users see no DM button until the grants exist; the link trusts the stored handle, so a mistyped but well-formed handle opens someone else's DM; the handle rule is deliberately loose, so a handle Instagram rejects opens an Instagram error page; the teal replaces the magenta that Echo found too close to the unpaid red and the paid green; the borrower tile name column narrows on 320px phones.

Review decisions (Echo, Chase; the orchestrator accepted them and Byte applies them):
- UX-R161-BRD-01 (Echo, must-fix): at 480px and below the borrower-details action buttons move to their own row under the name.
- UX-R161-CLR-01: the DM colour is teal `#00695c`, not magenta.
- UX-R161-RO-01: for a read-only user the details chat button sits on the name's line.
- UX-R161-COL-01: the actions are right-aligned in the reserved column on the Collection and Borrowers lists, which fixes R160's zigzag.
- UX-R161-TXT-01: the desktop header label for a DM is "Open DM" / "เปิดแชทส่วนตัว".
- Chase Should 1: dots-only handles are rejected (D1).
- Chase Should 2: a held-records fallback spec is added.
- Chase Should 3 accepted as is: a stale held bundle can show a DM briefly until the next records sync.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pending |
| `igDmUrl` table (PWA and server mirror equal), `chooseChat`, collection and reader-capability column units, borrower list rows (Byte; no offline chunk or shape change) | Pending |
| `npm test`, `npm run typecheck`, `npm run lint` (Byte) | Pending |
| Lab on a disposable PostgreSQL at head: `offline-delta-v4-equality-lab`, `offline-delta-v4-collection-cash-lab` still equal (offline chunks unchanged) | Pending |
| e2e `collection-chat-summary.spec.ts` and the borrower page spec, locally (Byte) | Pending |
| `Development checks` of the pull request (the one broad run) | Pending |
| Chase's verification and Echo's review (colour on a phone) | Pending |
| DEV after deploy (synthetic data) | Pending, see the DEV deployment record |
| PROD verification | Not started: the owner chose DEV first |

## Not run
No local wide browser suite; the pull request's `Development checks` is the one broad run. The owner's iPhone check of a DM button follows the PROD deploy, if the owner approves it.

## Recovery
Git baseline `90df4d2c`. No migration. Redeploy the previous read image (and any other image the component derive lists) and Hosting version recorded in the environment inventory (roll back Hosting first, then the images). The two reader column grants may stay (harmless) or be revoked by the operator; revoking is not needed to roll back.

## DEV deployment record (Forge, to be filled)
Authority: the owner's request quoted in Purpose and "Stop at DEV first". Scope: DEV reader column grants, the read image (other images only as the component derive lists them), then Hosting. No Flyway step.

| Step | Result |
| --- | --- |
| Baseline | To fill |
| Reader grants | To fill |
| Images | To fill |
| Hosting | To fill |
| Smoke | To fill |

## PROD promotion record (Forge, to be filled only on the owner's later go-ahead)
Authority: to be recorded when the owner approves the promotion. Scope: verified restorable backup, the two reader column grants in one guarded transaction (as R154), the read image (other images only as the component derive lists them), then Hosting. No Flyway step.

| Step | Result |
| --- | --- |
| Baseline | To fill |
| Backup | To fill |
| Reader grants | To fill |
| Images | To fill |
| Hosting | To fill |
| Smoke | To fill |
| Tag | To fill |
| Closure | To fill |

## Open questions
Whether to promote R161 to PROD (the owner's later go-ahead; the grants and a verified backup are part of it).

## Remaining work
Build and checks (Byte, Chase, Echo), DEV deploy (Forge), the owner's PROD decision, owner acceptance.
