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

## Open questions
None. The owner decides after acceptance whether the iPhone Instagram app opens the stored link directly (untested; the owner tries one borrower first).

## Remaining work
DEV then PROD promotion by Forge in this order: restore-verified backup, V148 by the guarded runner, then the reader column grant (it must follow V148; the grant script fails before the column exists), command and read services, Hosting, agent deploy, one `--mark-all`), the PROD promotion record, the dictionary, inventory and tag at closure, and owner acceptance.
