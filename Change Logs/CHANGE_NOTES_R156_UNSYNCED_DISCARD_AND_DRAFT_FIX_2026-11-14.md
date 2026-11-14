# Change notes — Discard unsynced changes, Edit draft fix and e2e classifier (R156), 14 November 2026

## Purpose
Owner instructions of 14 November 2026: "i also want to handle sync failure issue in the future. there should be a way to drop the not-yet-synced changes in the client, either through a button, or through a full sync. include this also into R156", and "yes, push R156 to prod once it passes". The owner added a fourth item: "i also want to add one more thing in R156: in web browser, send troubleshooting file triggers share screen while i just want to save it through the browser." The release also fixes the borrower Edit draft (a stale draft restored after a Full sync caused the owner's `source_conflict` on one borrower) and the CI classifier gap that skipped R155's e2e.

## Changes
As built (Byte). No SQL, server or agent change.
- Discard (`apps/pwa/src/owner-offline.ts`, `offline-sync.ts`, `OfflinePayments.tsx`, `live-style.css` if needed):
  - D1 `discardSavedRequest(access, requestId)`: a change never sent is discarded, online or offline. A change sent at least once is always checked with the server before it is discarded, under a non-exclusive claim (nothing is mid-send): (`GET <path>/<requestId>`): applied or posted means it is settled as synced and not discarded, with a message; rejected or unresolved means it is discarded; offline, an active lease or an unreadable status keeps it, with the reason. This replaces the owner's 16 October "remove anyway" decision with check-the-server-first (AGENTS.md: reconcile an unknown outcome before retrying); the owner was told and answered "yes, push R156 to prod once it passes".
  - D2 `discardPending(id, owner?)`: one transaction; refuses a row under another active lease; deletes it and every row whose `notePredecessor.requestId` chain points at it (a collection-note orphan would otherwise stay queued); bumps the read revision; fires `mw-offline-saved` and `mw-read-invalidated`, never `mw-offline-synced`.
  - D3 Drafts: a per-item discard also removes the matching draft; discard all removes every draft, and the confirmation names the count.
  - D4 A "Discard" button on every saved-change card (failed and waiting) and in the failure details, replacing "Remove saved change"; disabled while syncing; hidden for read-only access. The saved-change card now wraps: Discard and "View failure details" were off-screen on phones.
  - D5 Full sync with saved changes opens a dialog (replacing `window.confirm`) with Cancel, "Send saved changes, then re-download" / "ส่งรายการที่บันทึก แล้วดาวน์โหลดใหม่" (as today) and "Discard unsynced changes and re-download", then a summary. Discard all runs D1 per row, removes drafts, then starts the full walk; it needs a connection. With no saved changes the single confirmation stays.
  - D6 After a discard, `mw-offline-sync-outcome` (and the BroadcastChannel) reports kind `blocked`, code `request_discarded`, with a message.
  - D7 Accessibility: a native dialog with `aria-labelledby`, initial focus on Cancel, the destructive option last; results in `role="status"`; focus moves to the next card or the page heading; the Discard label names the item.
- Copy (EN / TH): "Discard" / "ทิ้งรายการนี้"; results "Discarded. Nothing was applied." / "ทิ้งแล้ว ไม่มีการบันทึกรายการ", "This change was already applied, so it was not discarded." / "รายการนี้ถูกนำไปใช้แล้ว จึงไม่ได้ทิ้ง", "Could not check this change with the server. It is kept. Connect and try again." / "ตรวจสอบรายการนี้กับเซิร์ฟเวอร์ไม่ได้ จึงเก็บไว้ เชื่อมต่อแล้วลองอีกครั้ง", "This change is being sent. Try again in a minute." / "กำลังส่งรายการนี้ ลองอีกครั้งในอีกสักครู่"; Full sync option "Discard unsynced changes and re-download" / "ทิ้งรายการที่ยังไม่ซิงค์แล้วดาวน์โหลดใหม่" with a summary "Discarded {a}. Already applied {b}. Kept {c} (could not be checked)."; `request_discarded`: "This saved change was discarded on this device." / "รายการที่บันทึกนี้ถูกทิ้งบนอุปกรณ์นี้แล้ว"; the chained-note line is singular for one: "1 later note change that depends on it is discarded too." Other strings are as in the plan.
- Borrower Edit draft (`apps/pwa/src/BorrowerRecord.tsx`): tapping Edit autosaved a draft holding the old record, and a later open restored it (hiding the invite field and, after a Full sync, causing the `source_conflict`). Now a draft is saved only for a real change; Cancel clears it; a restored draft with no real edits is dropped and the current record is shown; a draft with real edits keeps its base version and goes through the existing conflict path if the record changed. Byte's draft patch from R155 is superseded.
- Registry and classifier (`scripts/promotion/components.json`, `scripts/ci/stages.json`, `.github/workflows/ci.yml`): PWA-bundled `services/lib` modules count as PWA changes, so the e2e job runs and the components render shows the right PWA release (R155's e2e was skipped and the Hosting runner used R154's receipt). A guard test, `tests/unit/pwa-services-imports.test.mjs`, walks the PWA import graph and checks the `components.json` pwa paths, the `stages.json` e2e include and the `ci.yml` grep. Forge adds two `.d.mts` files the guard flagged.
- Tests: `tests/e2e/saved-change-discard-independent.spec.ts` (rewritten), `full-sync-independent.spec.ts`, `dataset-replay-independent.spec.ts`, `back-consumers-independent.spec.ts` and its harness; cases: a failed row discarded from the card; a never-sent row discarded offline; a sent row found applied is settled, not discarded; a sent row with status 503 or offline is kept; a leased row's button disabled; a note predecessor discards its dependant; a matching draft removed; Cancel leaves everything; Full sync with saved changes opens the dialog (Send as today; Discard shows the summary, empties the queue and drafts and starts the walk); Full sync without saved changes keeps the single confirmation; a mobile-webkit receipt row discards without the R132 blob error.
- About troubleshooting file (`apps/pwa/src/About.tsx`): on a computer the button "Save troubleshooting file" / "บันทึกไฟล์ข้อมูลแก้ปัญหา" always saves through the browser download, and shows "Saved. Send the file to the owner by LINE or email." / "บันทึกแล้ว ส่งไฟล์ให้เจ้าของทาง LINE หรืออีเมล"; phones keep the share sheet with a download fallback (`chatDevice()`; an iPad with touch counts as a phone).
- Review fixes (Chase, Echo), as built: an applied change whose claim fails removes only that row (chained notes stay queued); Discard all keeps the drafts of kept (unchecked) changes; the flaky draft-conflict test was a harness double switch on WebKit (1 of 72) and is fixed with a `reopenBorrower` helper (180/180 after). Echo's must-fixes: the Full sync warning is per choice, and focus goes to the Saved changes heading after Discard all. Optional items applied: Send is the primary style, buttons stack below 480px, the summary shows only non-zero parts plus drafts removed, the Thai Send label is "ส่งรายการที่บันทึกก่อน แล้วดาวน์โหลดใหม่", a chained-notes result line, the Thai result "ทิ้งแล้ว ไม่มีการนำไปใช้", a red Discard on cards, and the recorded-rejection confirmation "It was not applied." / "รายการนี้ไม่ได้ถูกนำไปใช้". Final copy: warning "Send tries to apply them first; any that fail stay saved here. Discard removes them{, and m unfinished draft(s),} from this device; changes already applied are kept." / "ส่ง: ระบบจะลองนำไปใช้ก่อน รายการที่ไม่สำเร็จจะยังเก็บไว้ ทิ้ง: รายการเหล่านี้{และแบบร่าง m รายการ}จะถูกลบจากอุปกรณ์นี้ รายการที่ถูกนำไปใช้แล้วยังคงอยู่"; summary parts "Discarded {a} saved change(s)." / "ทิ้งรายการที่บันทึก {a} รายการ", "{b} already applied." / "ถูกนำไปใช้แล้ว {b} รายการ", "Kept {c} (could not be checked)." / "เก็บไว้ {c} รายการ (ตรวจสอบไม่ได้)", "Removed {d} draft(s)." / "ลบแบบร่าง {d} รายการ", and when all are zero "Nothing was discarded." / "ไม่มีรายการที่ถูกทิ้ง".
- Documents (Dewey): this note, `project/Documents/Solution_Design.md` (the offline queue paragraph), `Release_Tracker.md`, `Development_Changes.md`.
- Risk: an orphan slip on the server when it was uploaded but the command was never recorded (unreferenced, no cleanup). A tab that dies mid-send is covered by the lease; nothing is re-sent after a discard.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey) | Pass |
| `npm test` | 1366 tests (1365 pass, 1 skipped); the guard test passes after Forge's two `.d.mts` additions (guard, ci-reuse-evidence and component-versions 22/22) |
| e2e `saved-change-discard`, `full-sync`, `live-signout`, `back-consumers`, `dataset-replay` and `about`, on desktop-chromium, mobile-chromium and mobile-webkit | 282 passed, 0 failed |
| `npm run typecheck`, `npm run lint` | Typecheck clean; lint 1 pre-existing info |
| `Development checks` run 43567610544, `Database migrations` run 43567594376 and `Agent tests` run 43567610571 on `8d0f2f85` | Green (e2e ran: 3 Chromium and 3 iPhone WebKit) |
| PROD verification | Pass, see the PROD promotion record |
| Chase's review | Data safety passes; the findings above are fixed (draft-conflict test 180/180 after) |
| Echo's review | Two must-fixes and the optional items applied |

## Not run
The pull request's `Development checks` is not yet recorded; it must run e2e now that the classifier covers the shared modules.

## Recovery
Git baseline `44efb437` (R155 closure). The change is PWA and CI only: redeploy the R155 Hosting version `6becd9ab119af520`. A discarded saved change cannot be restored.

## DEV deployment record (Forge, 14 November 2026 UTC)
Authority: owner "yes, push R156 to prod once it passes". Package `04ae87b574c79ad6b10953ecf3de6b736e6e6de8` (merge of PR #322), deployed from a clean worktree (git archive). CI on `8d0f2f85`: `Development checks` run 43567610544 (check, lint, terraform, 3 Chromium and 3 iPhone WebKit e2e), `Database migrations` run 43567594376 (guards, four rebuilds) and `Agent tests` run 43567610571. No image was rebuilt (no `services/` change since R155 `44efb437`); DEV read, command and chat stay on the R155 image `e1a30fff…`.

| Item | Record |
| --- | --- |
| Hosting | Build R156 `cde21210008751742c991fd7`, version `8a1142ca2d1c548f`, release `1794639314851000`, 06:55:06Z to 06:55:15Z |
| Smoke | Three origins R156; `sw.js` no-store; unauthenticated 401 |

Rollback: Hosting `7ed477d4abc90d21` (R155).

## PROD promotion record (Forge, 14 November 2026 UTC)
Authority: owner "yes, push R156 to prod once it passes". Frontend only: no SQL, no backup (`database/README.md`), no image, no agent and no data write. Freeze 06:55:30Z, package `04ae87b5`, baseline R155 `44efb437`. Resulting versions: PWA R156; read, command and chat R155; notify and jobs R144; schema V149; agent R153.

| Step | Result |
| --- | --- |
| Baseline | Flyway 149 (read-only verify 06:56:20Z clean); read `00061-n4n`, command `00066-njp`, chat `00045-7gr` on the R155 image `9c14d2d6…`; notify `00030-285` and jobs `00030-29l` on `63e5b48f…` (R144); Hosting `6becd9ab119af520` (R155) |
| Hosting | The generic runner, frontend-only, as `mw-credit-unattended-admin`; `--check` passed (18 files); `--apply` 06:56:57Z to 06:57:30Z: version `91da4b928cdc9f62`, release `1794639443522000`, build R156 `f8cf7e48816cd44dddd71a39` |
| Smoke | Three origins R156; `sw.js` no-store; unauthenticated 401; the services' `/health` R155 `44efb437` (unchanged, as intended); no ERROR logs after 06:55Z |
| Tag | `R156` on `04ae87b5` (Release tag run [43568818762](https://github.com/welct0407/MW-Credit-App/actions/runs/43568818762), 06:57:42Z to 06:58:09Z; tag object `3257c3b0…` peels to `04ae87b5`) |
| Closure | Component versions rendered: PWA R156 (now derived correctly through the registry fix); read, command and chat R155; schema R154 at V149; agent R153; notify and jobs R144. Drift 06:58:15Z: 0 drift, 2 unverified (Grafana, Metabase). No dictionary capture |
| Pruned | `Change Logs/CHANGE_NOTES_R153_GROUP_CHAT_LINK_AND_PROMPT_2026-11-13.md` and `integration-agent/Change Logs/CHANGE_NOTES_R153_GROUP_CHAT_PROMPT_V4_2026-11-13.md` (R153 is outside the three most recent Released releases; inbound links repointed to the permalink at `04ae87b5`) |

Rollback: Hosting `6becd9ab119af520` (R155). No database or service step.

Limitations: a discarded saved change cannot be restored; the owner checks the Discard flow, Full sync dialog and the troubleshooting file save on the devices in use.

## Open questions
None.

## Remaining work
None. Owner-accepted in PROD on 14 November 2026 ("i accept R153 to R157, and i've done everything.").
