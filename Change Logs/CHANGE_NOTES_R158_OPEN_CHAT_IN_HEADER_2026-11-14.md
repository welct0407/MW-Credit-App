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
| `Development checks` run 43616314575 and `Database migrations` run 43616296968 on `649148a4` | Green (check, lint, 3 Chromium and 3 iPhone WebKit e2e) |
| PROD verification | Pass, see the PROD promotion record |
| Chase's review | `npm test` 1365; `collection-chat-summary` and `dataset-replay-independent` on desktop-chromium and mobile-webkit 46 pass, 2 skipped; collection-cash lab on a fresh lab 4 pass, 1 skipped (faketime); no blocking or high findings |
| Echo's review | Must-fix UX-HDR-CHAT-01 and the two others applied |

Limitations (Chase, low): invite links are now visible for borrowers without a summary to anyone who can read the collection (intended, the owner's request; the guards are unchanged). There is no end-to-end lab step for a link-only edit on a borrower without a summary; unit tests and the shared R153 scope path cover it.

## Not run
The owner's iPhone check of the header link follows the deploy.

## Recovery
Git baseline `34736f4e` (R157 closure). No SQL or data change: redeploy the R157 services image (the R155 image) and Hosting version recorded in the environment inventory; the services roll back before Hosting is needed.

## DEV deployment record (Forge, 14 November 2026 UTC)
Authority: the owner's request quoted in Purpose, "Collection page header (Recommended)" and "Yes, straight to PROD (Recommended)". Package `76b9f5ff67cedb163429f2d15eb7ba24ca17012f` (merge of PR #326), deployed from a clean worktree (git archive); images before Hosting. CI on `649148a4`: `Development checks` run 43616314575 (check, lint, 3 Chromium and 3 iPhone WebKit e2e; terraform skipped) and `Database migrations` run 43616296968.

| Item | Record |
| --- | --- |
| Image | Cloud Build `77a419c9-d584-42e4-b6a6-11901304628b`, 16:47:36Z to 16:48:14Z, digest `sha256:d6715ca26df8eb6de6c92a8c4c234a32e3e792f57dc867715cf1a47de2eba84d` |
| Terraform | 0 to add, 3 to change, 0 to destroy, image only; generation `1794674985628954` (previous `1794635890755694`), 16:49:48Z to 16:50:27Z; read `00096-dzq`, command `00113-cpg`, chat `00065-776` |
| Hosting | Build R158 `60f4f94d34af8933e0d5eee3`, version `bcf41b819de6acb0`, release `1794675091245000`, 16:51:22Z to 16:51:31Z; three origins R158; `sw.js` no-store |
| Smoke | Health R158 `76b9f5ff`; unauthenticated 401. Invented links on a synthetic borrower without a summary (16:52:08Z to 16:52:14Z): the collection list item and the detail carry `chatUrl` and `chatInviteUrl` and no `groupChat`; the links were cleared afterwards (DEV 0 of each); no ERROR logs after 16:49Z |

Rollback: generation `1794635890755694` (R155 image `e1a30fff…`) with Hosting `f0e4616d655e9b77` (R157).

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: the same owner request and approvals. No SQL, backup, grant, agent or data write; images before Hosting. Freeze 16:52:24Z, package `76b9f5ff`, baseline R157 `a4b27e0e`. Changed: read, command and chat services and the PWA (offline v12). Unchanged: notify and jobs (R144), schema V149, agent R153.

| Step | Result |
| --- | --- |
| Baseline | Flyway 149 (verify 16:53:27Z clean); read `00061-n4n`, command `00066-njp`, chat `00045-7gr` (R155 image `9c14d2d6…`); notify and jobs R144; generation `1794636233532039`; Hosting `d7d294ca31f8048a` (R157) |
| Image | Cloud Build `59b4cdb2-72d8-4357-b067-9bf3260b0c7f`, 16:47:47Z to 16:48:27Z, digest `sha256:0b99ddf86fe6893e1c3174f96cd3a646a7d46d3a7e41913a90a1e710105935d6` |
| Services | Terraform 0 to add, 3 to change, 0 to destroy, image only, generation `1794675284506672`, 16:54:00Z to 16:54:38Z; read `00062-9hs`, command `00067-f2s`, chat `00046-6xw` |
| Hosting | After the images, by the generic runner. Receipts: run 43616314575 (check, e2e), the terraform job of run 43567610544 and database run 43616296968; `--check` passed (18 files); `--apply` 16:55:55Z to 16:56:42Z: version `e4db27ab3089d925`, release `1794675395356000`, build R158 `79ba63ef5eb1449a686aa39e` |
| Smoke | Health R158 `76b9f5ff`; origins R158; `sw.js` no-store; unauthenticated 401; no ERROR logs after 16:53Z (checked 17:07Z) |
| Load | 16:56:42Z to 17:07Z: command 363 requests (293 offline-dataset), 0 5xx, p50 0.03 s, p95 6.0 s, max 22.6 s (the one-time v12 walk); 4xx: 2 × 409 on the offline-dataset reconcile POST and 1 × 409 on collection receipts (likely v11 to v12 conflicts, retried by the client), plus the smoke's 401; read 20 requests, 0 5xx, p95 0.92 s. Before the deploy: command 6 requests |
| Tag | `R158` on `76b9f5ff` (Release tag run [43618401043](https://github.com/welct0407/MW-Credit-App/actions/runs/43618401043), 16:57:13Z to 16:57:37Z; tag object `8a4e64f9…` peels to `76b9f5ff`) |
| Closure | Components: PWA, read, command and chat R158; schema R154 at V149; agent R153; notify and jobs R144. Drift 16:57:35Z: 0 drift, 2 unverified (Grafana, Metabase). No dictionary capture |
| Pruned | `Change Logs/CHANGE_NOTES_R155_IG_LINK_REFRESH_AND_DICTIONARY_NOTES_2026-11-14.md` (R155 is outside the three most recent Released releases; inbound links in the tracker and inventory repointed to the permalink at `76b9f5ff`) |

Rollback: `production.activation.before-r158.tfvars` (generation `1794636233532039`, R155 image `9c14d2d6…`) with Hosting `d7d294ca31f8048a`; no database step.

Limitations: the owner checks on an iPhone that the header link opens the group for a borrower with no recent chat. The 409 responses during the one-time v12 walk are an observation, not a failure.

## Open questions
None.

## Remaining work
Owner acceptance.
