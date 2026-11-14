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

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: the owner's request quoted in Purpose and "Yes, straight to PROD (Recommended)". Scope: PWA Hosting only; no SQL, backup, Terraform, service image or agent change. Freeze 19:54:12Z, package `c6fb7849` (merge of PR #330), baseline R159 `5b887d09`. `component-versions.mjs derive` at `c6fb7849`: only the PWA changed (R160); read, command, notify, jobs and chat stay R159, schema R154 at V149, agent R153. Both bundles were built from a clean export (git archive) of `c6fb7849` with its own `npm ci`.

| Step | Result |
| --- | --- |
| Baseline | PROD Hosting `e4db27ab3089d925` (release `1794675395356000`, R158); services R159 (read `00063-hqc`, command `00068-dlr`, chat `00047-zrt`, notify `00031-mzf`, jobs `00031-dmq`, image `56f17745…`). DEV Hosting `bcf41b819de6acb0` (release `1794675091245000`, R158) |
| DEV | `build:live-dev` with `MW_RELEASE_NUMBER=R160`; the env file was written from `mw-credit-app-dev-firebase-web` and the settings of the live DEV bundle (read, command and chat DEV origins, `dev-owner-testing`, notifications on; the bundle carries the DEV web app) and deleted after the build. `deploy-hosting.mjs --live-dev --check` (17 files) then apply 19:53:12Z to 19:53:21Z: version `77358df71286bbc4`, release `1794686001041000`, build R160 `67e2ff5fdbd2b34536eb416a`. Smoke: three origins R160, index and entry 200, `sw.js` no-store, the stylesheet carries `collection-tile-actions`, unauthenticated 401 |
| Hosting | The generic runner, frontend-only, from `buildProductionBusinessCandidate` (R158's pinned public config, PROD origins and web app only). Receipts: `Development checks` run 43632954086 on `9630ec5b` (check, lint, 3 Chromium and 3 iPhone WebKit e2e), the terraform job of run 43567610544 and the database groups of run 43624874290 (no infrastructure or database input changed since). The SQL readback in the package is the last live one, R158's at 16:53:27Z (V149, clean): this session's sandbox refuses direct database connections, and no SQL ran since (R159 and R160 carry none). `--check` passed (18 files, services on their R159 pins); `--apply` 19:55:50Z to 19:56:28Z: version `13239bb8272ff153`, release `1794686180967000`, build R160 `5497f352d672def931339df5` |
| Smoke | Three origins R160 (`lm.mw-credit.com`, `web.app`, `firebaseapp.com`), index and entry 200, `sw.js` no-store, the stylesheet carries `collection-tile-actions`; unauthenticated 401; the services' `/health` R159 `5b887d09` (unchanged); no ERROR logs on any PROD service after 19:50Z (checked 19:56:42Z) |
| Tag | `R160` on `c6fb7849` (Release tag run [43634817133](https://github.com/welct0407/MW-Credit-App/actions/runs/43634817133), 19:56:48Z to 19:57:12Z; tag object `aa8a49c3…` peels to `c6fb7849`) |
| Closure | Components: PWA R160; read, command, notify, jobs and chat R159; schema R154 at V149; agent R153. `render --write` updated the inventory block to R160 (`render --check` ok). Drift 19:58Z (`--env all`; notify and jobs facts from the R159 readback, unchanged since): 0 drift, 5 unverified (schema DEV and PROD, agent, Grafana, Metabase); PWA DEV and PROD match R160, every API service matches R159 `5b887d09`. No dictionary capture |

Rollback: Hosting `e4db27ab3089d925` (R158; PROD) and `bcf41b819de6acb0` (DEV). No database or service step.

Limitations: the owner checks on an iPhone that the list button opens the group for a borrower with an invite link.

## Open questions
None.

## Remaining work
Build and checks (Byte, Chase, Echo), DEV and PROD Hosting (Forge), owner acceptance.
