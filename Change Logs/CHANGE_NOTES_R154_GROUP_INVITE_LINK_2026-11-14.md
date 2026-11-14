# Change notes — Group invite link and per-device Open chat (R154), 14 November 2026

## Purpose
Owner decisions of 14 November 2026 after testing R153: "the link does open ig app on iPhone, but it doesn't open the group chat directly. it's the main page of the ig app. i want that group to be opened", and "the invite link opens the group, go ahead with R154". A second borrower column holds the Instagram invite link, and the card picks the link per device. The owner's words authorize the new column (V149) and the release to PROD from this session.

## Changes
As built (Byte).
- `database/migrations/V149__borrower_ig_group_invite_link.sql`: nullable `"Borrowers"."IG Group Invite Link"` and `borrowers_ig_group_invite_link_check` (`^https://ig\.me/j/[A-Za-z0-9._~%/?=&+-]{1,255}$`); `pwa_submit_operation_v2` and `pwa_borrower_version_v2` patched by counted replacement (marker `R154`); optional input `igGroupInviteLink` right after `igGroupUrl` (kept when absent; null clears; the server refuses an empty string and the PWA sends blank as null). `"IG Group URL"` and its rule are unchanged.
- Command, read and offline code: `services/**` (`groupChat.inviteUrl` only when a summary exists, the column exists and is granted, and the value is valid; offline dataset v11), reader column grant in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py`, `database/current/public-functions.sql`, `services/chat/assets/schema-digest.json`.
- PWA: a field "IG Group Invite Link (mobile)" / "ลิงก์เชิญกลุ่ม IG (มือถือ)" ("mobile", not "phone", so the F2 privacy check that no textbox name matches /phone|document/i stays unchanged) after "IG Group URL (computer)" / "ลิงก์กลุ่มแชท IG (คอมพิวเตอร์)" (the labels name the device) (sent only on create or when the record carries the key), updated help for "IG Group URL" (opens the chat on a computer), and the card's "Open chat" choice in `ig-group-url.ts`: a phone or tablet (iPhone, iPad including an iPadOS desktop user agent with touch, Android) prefers the invite link, a computer prefers the instagram.com address, either falls back to any valid link, none gives no link. Same label, icon and styling as R153; the borrower view shows the stored invite link as a link.
- Documents (Dewey): `project/Documents/Release_Tracker.md`, `Development_Changes.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `docs/Development_Read_Service.md`.
- Not changed: the integration agent (no agent change), the Data Dictionary and `Environment_Inventory.md` (updated from PROD observations at closure), `"IG Group URL"`, OLAP views, command catalogue.
- Details as built: the V149 preflight requires V148; the self-check probes 2 good and 7 bad links; the privacy wording is also in the V149 column comment; the placeholder in the form is `https://ig.me/j/…`; the invite help is "Opens the group on a phone. In the Instagram app: open the group, tap its name, then Invite link, and copy it." / "ใช้เปิดกลุ่มบนโทรศัพท์ ในแอป Instagram: เปิดกลุ่ม แตะชื่อกลุ่ม แล้วแตะลิงก์เชิญ และคัดลอก"; the "IG Group URL" help says it opens the chat on a computer, and its error is now "Use an instagram.com chat link (https://www.instagram.com/direct/…), or leave it blank." / "ใช้ลิงก์แชท instagram.com (https://www.instagram.com/direct/…) หรือเว้นว่าง" (the rule is unchanged and still accepts ig.me). After a refused Save the focused field is scrolled into view by its label (also for the rebate terms). Card rule: phones (iPhone, iPod, iPad including an iPadOS desktop user agent via touch points, Android) take the invite link, else the group URL; computers take an instagram.com link, else any valid group URL, else the invite link. A reader granted only the old column still returns `url` alone.
- Privacy: an invite link lets anyone who holds it join the group. It is stored only in MW Credit and the owner can reset it in Instagram. It is a deliberate deviation from R146 (no Instagram identifiers in the application database), by owner decision, as in R153.
- Data rules: tests use invented links only (for example `https://ig.me/j/AbCdEfGh12345678/`); no real link, username or chat text is recorded.

## Checks
| Command | Result |
| --- | --- |
| `Test-RebateOffset.sql` section 7 via `Test-MigrationsCloud.py --sql-only` | Pass at 149 migrations; `public-functions.sql` matches. Cases: set, keep, both links in order, clear, create, 10 bad inputs (including an instagram.com link and http), CHECK 255 accepted and 256 refused, version equals the Node mirror (section 6's pasted mirror updated, since V149 changes every version) |
| `mw-db-ci -Group migrations` | Exit 0 (local C collation; CI covers en_US) |
| `chat-schema-digest` test | 4/4 against a V149 rebuild |
| Node unit tests (targeted) | 67 (66 pass, 1 skipped) |
| `npm test` | 1362 tests, 1361 pass, 1 skipped |
| `Run-Phase5` borrower family | 13/13 |
| Two e2e specs (`collection-chat-summary`, `phase5-borrower-independent`), mobile-chromium, desktop-chromium and mobile-webkit | 216 passed |
| `npm run typecheck`, `npm run lint`, `npm run check:docs` | Clean |
| Chase's independent re-run | 59 unit (58 pass, 1 skipped); `Test-RebateOffset` via `Test-MigrationsCloud.py --sql-only` passed at 149 migrations; no blocking, high or medium findings |
| Echo's review | One must-fix (the focused field could scroll above the header after a refused Save), fixed by scrolling the label into view, also for the rebate terms; the optional copy and device-naming labels applied |
| Byte's re-run after the review fixes: the two e2e specs on mobile-chromium, desktop-chromium and mobile-webkit | 219 passed, 0 failed (F2 9/9, and a new 390px test that the focused field is visible below the header after a refused Save) |
| Byte's re-run: units, typecheck, lint | Units 45/45; typecheck clean; lint 1 pre-existing info |

Limitations (Chase, low): Chrome on Android with "Desktop site" on sends a Linux user agent and counts as a computer (the web link first, the invite link only as a fallback). There is no automated test of `readBorrowerRecord` or `versionSql` before V149 (the same as V135 and V148).

## Not run
The pull request's `Development checks` run is not yet recorded; DEV and PROD smoke follow the promotion. The owner checks on an iPhone after the deploy that the invite link opens the group.

## Recovery
Git baseline `0eef98f6` (R153 closure). V149 is a nullable column: the code is safe before it (key absent, invite link omitted); dropping the column needs owner authority and a later migration. PROD needs a restore-verified backup before V149 (Forge records it in the promotion record).

## Open questions
None. The owner decides after acceptance whether the invite link opens the group on the iPhone (the owner's stated expectation; untested until deployed).

## Remaining work
DEV then PROD promotion by Forge in this order: restore-verified backup, V149 by the guarded runner (six-owner window including the journal owner), the images right after V149, the reader grant (after V149; the script fails before the column exists), Hosting. Then the PROD promotion record, the dictionary, inventory and tag at closure, and owner acceptance.
