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
| `Development checks` run 43550924310, `Database migrations` run 43550904046, `Agent tests` run 43550924323 on `2fc76d31` (tree equals `ff4de0d5`) | Green |
| PROD verification | Pass, see the PROD promotion record |
| Byte's re-run after the review fixes: the two e2e specs on mobile-chromium, desktop-chromium and mobile-webkit | 219 passed, 0 failed (F2 9/9, and a new 390px test that the focused field is visible below the header after a refused Save) |
| Byte's re-run: units, typecheck, lint | Units 45/45; typecheck clean; lint 1 pre-existing info |

Limitations (Chase, low): Chrome on Android with "Desktop site" on sends a Linux user agent and counts as a computer (the web link first, the invite link only as a fallback). There is no automated test of `readBorrowerRecord` or `versionSql` before V149 (the same as V135 and V148).

## Not run
The owner checks on an iPhone after the deploy that the invite link opens the group.

## Recovery
Git baseline `0eef98f6` (R153 closure). V149 is a nullable column: the code is safe before it (key absent, invite link omitted); dropping the column needs owner authority and a later migration. PROD needs a restore-verified backup before V149 (Forge records it in the promotion record).

## DEV deployment record (Forge, 14 November 2026 UTC)
Authority: owner "the invite link opens the group, go ahead with R154". Package `ff4de0d5b0d8acf20491b1ae17a06da63c155afe` (merge of PR #319), deployed from a clean worktree (git archive). CI: `Development checks` run 43550924310, `Database migrations` run 43550904046 and `Agent tests` run 43550924323 on `2fc76d31` (tree equals `ff4de0d5`).

| Item | Record |
| --- | --- |
| Backup | At V148, `dev-refresh-cd0bfdf625bb48bfb7f0dbb4e77741b5`, 03:32:07Z to 03:34:32Z; dump sha256 `f73db7e527aa39c4c0a88d1ac9666ec6e06df672bb3ceb306773f0873fdb0bc0`; listing and restore passed; 41 tables |
| Image | Cloud Build `5fd9ba1b-396c-4885-9ddb-5b526970d935`, 03:32:12Z to 03:32:47Z, digest `sha256:26aa1710f2d213ecb77b83cd9a1dc786d87550760ebaee96b2cb404fba2a4341` |
| Migration | Six-owner window 03:34:45Z to 03:42:46Z (restored); V149 installed 03:35:07Z (3.6 s, checksum -1899320093) by `Invoke-Flyway.ps1 development migrate`; reconcile 573 statements, 0 violations; validate clean, head 149; the column and `borrowers_ig_group_invite_link_check` present; both routines carry R154 |
| Terraform | 0 to add, 3 to change, 0 to destroy, image only; generation `1794627823033051` (previous `1794592967964765`), 03:43:46Z to 03:44:22Z; read `00094-9cb`, command `00111-5df`, chat `00063-n4s` |
| Reader grant | `configure-dev-read-role.py --apply` 03:45:08Z to 03:45:17Z, one `GRANT SELECT ("IG Group Invite Link")` |
| Hosting | Version `8123781109a724e9`, release `1794627940880000`, 03:45:31Z to 03:45:41Z, build R154 `fd91ede595835e9ba8998749`; three origins R154; `sw.js` no-store |
| Smoke | 03:46:00Z to 03:46:06Z on the synthetic borrower: an instagram.com URL, `http://ig.me/j/…`, `https://ig.me/m/…` and "" each gave 400; `https://ig.me/j/AbCdEfGh12345678/` gave 200; the collection read `groupChat.inviteUrl` matched; both links cleared afterwards (0 of each set in DEV). `/health` R154 `ff4de0d5`; unauthenticated 401; no ERROR logs |
| Agent | Not applicable (no DEV agent) |

Rollback: generation `1794592967964765` (R153 image `d6cb3f01…`) with Hosting `268a9f395457ed20`, and `REVOKE` the grant; V149 is forward-fix only.

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: owner "the invite link opens the group, go ahead with R154", which covers V149, its backup and the PROD promotion for this scope. Freeze 03:46:20Z. Package `ff4de0d5`, baseline R153 `025e8a51`. Changed: V149, read, command and chat services, Hosting. Unchanged: notify and jobs (R144) and the agent (R153).

| Step | Result |
| --- | --- |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod` |
| Baseline | Flyway 148; read `00059-l4m`, command `00064-ml2`, chat `00043-64b` (R153 image `90916cf6…`); generation `1794595766514290`; Hosting `5c44227a1f1b9901` |
| Backup | At V148, `prod-promotion-d7c1d8221a374e028a66034dde6598f3`, 03:46:49Z to 03:49:20Z; dump sha256 `f43ca8ea69532e5ebb25d34b4cf24b0bf9c7ab9f2ccbbedafcb875d1f91c3e0d`; listing and restore passed; 41 tables |
| Image | Cloud Build `28d3fcef-e056-40d1-ba40-6764b344648f`, 03:32:21Z to 03:33:00Z, digest `sha256:b35af792e20cd4013894616ae2d16dd757eff68a38e7c7c85e002491242daafc` |
| Migration | Manifest `release-r154-v149-ff4de0d5-prod.json`; preflight 03:49:31Z; six-owner window including `mw_app_prod_journal_owner` 03:49:39Z to 03:52:44Z (restored); apply 03:50:24Z to 03:51:39Z (V149 installed 03:51:03Z, 3.7 s, checksum -1899320093); 149 history rows; column and CHECK exist; the R153 check is unchanged; both routines carry R154 |
| Services | Terraform right after V149: 0 to add, 3 to change, 0 to destroy, image only, generation `1794628350409654`, 03:51:39Z to 03:52:16Z; read `00060-q7q`, command `00065-58s`, chat `00044-9p6` |
| Reader grant | `SELECT ("IG Group Invite Link")` to the PROD read login, 03:52:48Z to 03:52:51Z (after V149, as the grant script needs the column) |
| Hosting | Version `d1f03f398962da84`, release `1794628463876000`, 03:53:48Z to 03:54:29Z, build R154 `39d663e4f0a4ae011c1c256c` |
| Smoke | `/health` R154 `ff4de0d5`; origins R154; `sw.js` no-store; unauthenticated 401; no ERROR logs after 03:49Z (checked 03:55Z); 0 borrowers with an invite link; "IG Group URL" untouched (1 set by the owner) |
| Tag | `R154` on `ff4de0d5` (Release tag run [43554047144](https://github.com/welct0407/MW-Credit-App/actions/runs/43554047144), 03:55:15Z to 03:55:38Z; tag object `7be0ec1b…` peels to `ff4de0d5`) |
| Closure | Dictionary capture 03:55:22Z at schema 149 (metadata sha256 `5d730a93b5d604a165152d0668145b77476db9396cfdec70d7936f5c9176abe9`); 3 objects reconciled; Borrowers gains "IG Group Invite Link" (ordinal 28) and its CHECK; the "Borrower Name is mandatory" note was dropped again by the reconcile and restored (source `0fdf49a`; a follow-up to fix the reconcile tool is suggested separately); index and validate clean (502 documents). Component versions rendered R154 (agent R153, notify and jobs R144). Drift 03:56:19Z: 0 drift, 2 unverified (Grafana, Metabase) |
| Pruned | `integration-agent/Change Logs/CHANGE_NOTES_R151_RECEIPT_SENDER_FALLBACK_2026-11-13.md` and `integration-agent/Change Logs/CHANGE_NOTES_R151_GROUP_CHAT_SUMMARY_DIAGNOSTICS_2026-11-13.md` (R151 is outside the three most recent Released releases; inbound links in the tracker, inventory, catalogue and agent documents repointed to the permalink at `ff4de0d5`) |

Rollback: `production.activation.before-r154.tfvars` (generation `1794595766514290`, R153 image `90916cf6…`) together with Hosting `5c44227a1f1b9901`, and `REVOKE` the grant; the database is forward-fix only, with the V148 backup as the restore point.

Limitations: the owner verifies on an iPhone that the invite link opens the group, and enters one invite link per borrower. Android Chrome "Desktop site" counts as a computer (Chase, low).

## Open questions
None. The owner decides after acceptance whether the invite link opens the group on the iPhone (the owner's stated expectation; untested until deployed).

## Remaining work
Owner acceptance, the owner's iPhone check, and entering real invite links.
