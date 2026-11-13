# Change notes — Group chat card link, latest point and prompt v4 (R153), 13 November 2026

## Purpose
Owner decisions of 13 November 2026: shorten the group chat summary text (prompt work), mark the latest topic in bold on the card, and open the group chat from the card through a new borrower column "IG Group URL" that the owner fills in by hand. The owner also authorized building and releasing it in this session, which covers V148 and the PROD promotion for this scope.

## Changes
As built (Byte).
- `database/migrations/V148__borrower_ig_group_url.sql`: nullable `"Borrowers"."IG Group URL"` and `borrowers_ig_group_url_check`; `pwa_submit_operation_v2` and `pwa_borrower_version_v2` patched by counted replacement (marker `R153`); optional input `igGroupUrl` after `referralRebateCap` (kept when absent; null clears; the server refuses an empty string and the PWA sends blank as null). The pattern is `^https://((www\.)?instagram\.com/direct/|ig\.me/)[A-Za-z0-9._~%/?=&+-]{1,255}$` (255 is the PostgreSQL repeat cap). The header notes the deliberate deviation from R146 (an Instagram thread URL is stored by owner decision).
- Command, read and offline code: `services/business/borrowers.mjs`, `services/api/collection-read-contract.mjs`, `services/business/offline-dataset-chunks.mjs`, `services/business/offline-dataset-delta.mjs` (dataset version v10), reader column grant in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py`, `database/current/public-functions.sql`, `services/chat/assets/schema-digest.json`.
- PWA: `BorrowerRecord.tsx` (optional field "IG Group URL" / "ลิงก์กลุ่มแชท IG" with help text "Copy the chat address from instagram.com in a browser, or the group's invite link (ig.me)." / "คัดลอกลิงก์แชทจาก instagram.com ในเบราว์เซอร์ หรือใช้ลิงก์เชิญกลุ่ม (ig.me)" and the inline error "Use an Instagram chat link (https://www.instagram.com/direct/… or https://ig.me/…), or leave it blank." / "ใช้ลิงก์แชท Instagram (https://www.instagram.com/direct/… หรือ https://ig.me/…) หรือเว้นว่าง"; the borrower view shows the link in link style, weight 600), `CollectionChatSummary.tsx` (latest point in bold with a 3px teal left bar (`--chat-role-business`) and a hidden "Latest: " / "ล่าสุด: " prefix, only on a current card with two or more points; "Open chat" / "เปิดแชท" link with a chat icon in link style (`#0b57d0`, underlined), shown only when a summary exists, the column is granted and the value is valid), `ig-group-url.ts`, `live-style.css`.
- Agent: prompt version 4 (see the integration-agent note of the same release).
- Documents (Dewey): `project/Documents/Release_Tracker.md`, `Development_Changes.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `docs/Development_Read_Service.md`.
- Not changed here: the Data Dictionary and `Environment_Inventory.md` (updated from PROD observations at closure, like R146 and R149), OLAP views, agent SQL, `native-manifest.json`, command catalogue.
- Known limitation (Chase, low): a row that `--mark-all` does not regenerate (no substantive message in the 3-day window) keeps its v3 point order; its last point is bolded only while the card is current, and this is cosmetic until that group next changes.
- CI fix in this batch (not caused by R153): PR #317 run 43476457745 on `539c8c5a` failed in e2e. `back-consumers-independent.spec.ts:240` and `payment-command.spec.ts:268` used a fixed `receiptAt` of 2026-10-14, which left the 30-day Bangkok-day receipt window at Bangkok midnight of 14 November (they fail identically on `origin/main` `cc22d763`); both now use the current time. `dataset-replay-independent.spec.ts:170` on WebKit was most likely a race in `apps/pwa/src/read-cache.ts` (a stale saved answer painted after the network answer); `onCached` now re-checks settled and aborted first (not reproducible locally; 4/4 on mobile-webkit afterwards). Local after the fix: `npm test` 1360 (1359 pass, 1 skipped); targeted specs pass; known load flakes noted. Follow-up: other e2e tests may fix dates inside rolling windows.
- Data rules: tests use invented URLs only; no real URL, username or chat text is recorded.

## Checks
| Command | Result |
| --- | --- |
| Byte's agent `unittest` | 69 OK |
| Byte's `ruff` | Clean |
| Byte's `npm test` | 1359 tests, 1358 pass, 1 skipped (first round) |
| Byte's round 2 after the review fixes: unit tests | 65 (64 pass, 1 skipped); a link-only borrower edit reaches offline clients on the next targeted delta (unit test added) |
| Chase's independent re-run | 39 + 17 unit, agent 69, `Test-RebateOffset` SQL passed; no blocking findings |
| Echo's review | Link styling must-fix applied; the app has no dark theme |
| Byte's `npm test` after the CI fix | 1360 tests, 1359 pass, 1 skipped |
| PR #317 run 43476457745 on `539c8c5a` | Failed in e2e (three specs, causes above); corrected head to be re-run |
| Byte's `chat-schema-digest` test | 4/4 against a V148 rebuild |
| `Test-RebateOffset.sql` via `Test-MigrationsCloud.py --sql` | Pass at 148 migrations |
| `mw-db-ci -Group migrations` | Exit 0 (local C collation; CI covers en_US) |
| `Run-Phase5` borrower family | 12/12 |
| Two e2e specs (`collection-chat-summary`, `phase5-borrower-independent`), mobile and desktop chromium | 134 passed (round 1 and again after the review fixes) |
| `npm run typecheck`, `npm run lint`, `npm run check:docs` | Clean |

## Not run
The owner checks on an iPhone after the deploy: whether the link hands off to the Instagram app, and the Thai bold on Thonburi. The broad PR `Development checks` run is not yet recorded. DEV and PROD smoke (invented URL on a DEV test borrower; owner sets one real URL in PROD) follow the promotion.

## Recovery
Git baseline `cc22d763` (R152 closure). V148 is a nullable column: the code is safe before it (key absent, link omitted); dropping the column needs owner authority and a later migration. PROD needs a restore-verified backup before V148 (Forge records it in the promotion record).

## DEV deployment record (Forge, 13 November 2026 UTC)
DEV was deployed from `539c8c5a` before the CI result above; DEV Hosting will be redeployed from the corrected head.

| Item | Record |
| --- | --- |
| Authority | Owner R153 authorization of 13 November 2026 ("you may do it as part of next release in this session itself"), DEV only |
| Package | `539c8c5a` (PR #317) |
| Backup | At V147, `dev-refresh-7b75842ffa764501be6fcab5074ac4f4`, 17:50:41Z to 17:53:06Z; dump sha256 `4ce6b622a3756ff8a8a3fedb4b615eaa4691d4521ea0d32f924ac1d3f4a4f554`; listing and restore passed; 41 tables matched |
| Image | Cloud Build `48ef01d1-7124-4894-b794-5502fbe748d8`, 17:50:51Z to 17:51:25Z, digest `sha256:d6cb3f01ee52b2596948280d9258386b9a7d9f49a31759512d1dc60b804e9924` |
| Migration | Six-owner window 17:53:30Z to 18:01:33Z (restored); V148 installed 17:53:54Z (3.6 s) by `Invoke-Flyway.ps1 -Environment development migrate`; reconcile 573 statements, 0 violations; validate clean 18:01:10Z at head 148; column and CHECK present, 0 of 88 borrowers set; both functions carry the R153 patch |
| Reader grant | `configure-dev-read-role.py --apply` 18:01:45Z to 18:01:55Z, one `GRANT SELECT ("IG Group URL")`, readback ok |
| Terraform | 0 to add, 3 to change, 0 to destroy, image only (read 00093-254, command 00110-kn5, chat 00062-d6r), generation 1794592967964765, 18:02:50Z to 18:03:16Z, re-plan clean |
| Hosting | Version `a10829b9bc2348f5` from a clean export of `539c8c5a`, 18:06:57Z to 18:07:06Z, all origins R153, `sw.js` no-store (supersedes `b6fed7170e6a3add`, built from a dirty tree) |
| Agent | No DEV agent; prompt v4 is a PROD step |
| Smoke | 18:05:25Z to 18:05:44Z on the synthetic borrower "R112 SYNTHETIC CHAT FORWARD G": http, other host, user information, space and empty string each gave 400 `invalid_request`; the invented `https://www.instagram.com/direct/t/100000000000001/` gave 200; the collection read returns `groupChat.url`; a borrower without a link has no `url` key; a direct bad value was refused by the CHECK (23514, rolled back) |
| Health | Read, command and chat report R153 `539c8c5a`; unauthenticated requests 401; no ERROR logs |

Rollback: settings generation 1794572198963944 (R149 image), Hosting `fe94daf3baea10c3`, and `REVOKE` the grant. V148 may stay, but roll the image back only together with Hosting.

Leftover: the invented link stays on the synthetic borrower (cleanup: PATCH `igGroupUrl` null).

## Open questions
None. The owner decides after acceptance whether the iPhone Instagram app opens the stored link directly (untested; the owner tries one borrower first).

## Remaining work
DEV then PROD promotion by Forge in this order: restore-verified backup, V148 by the guarded runner, then the reader column grant (it must follow V148; the grant script fails before the column exists), command and read services, Hosting, agent deploy, one `--mark-all`), the PROD promotion record, the dictionary, inventory and tag at closure, and owner acceptance.
