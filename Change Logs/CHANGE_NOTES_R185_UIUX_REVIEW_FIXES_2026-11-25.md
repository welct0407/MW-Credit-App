# Change notes — R185 DEV UI/UX review fixes, 25 November 2026

## Purpose
Echo reviewed the whole PWA on DEV (iPhone WebKit, desktop Chromium, iPad layout checks) and proposed 25 changes, each with a `UXR-` code. The owner approved all of them on 25 November 2026 (Asia/Bangkok): "Go for all the changes and follow your recommendations". Status: Released to DEV and PROD on 25 November 2026 (PR #388, package `fc7c4515`, tag `R185`); owner acceptance pending.

Production instruction: the owner, 25 November 2026 (Asia/Bangkok): "Push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge to main; the DEV deploy, then the PROD promotion of the R185 package (Hosting plus the rebuilt shared business service image, as in R183; no SQL and no backup); the R185 tag through the Release tag workflow; and the records-only closure pull request. It does not cover financial writes, forced notifications or unrelated changes.

Authority: this is a frontend batch. No new table or column, no migration, no financial write, no forced notification. UXR-PAY-01 adds three read-only fields to `readPaymentGroups` (`services/business/record-lists.mjs`): `lastPaymentDate`, `latestMonth` and `latestMonthAmount`, with an offline mirror in `apps/pwa/src/offline-dataset.ts`. No SQL, view, function, migration or dataset shape change; the deploy set is Hosting plus the rebuilt shared business service image (as in R183), with no backup.

Team: Archie (design and the read addition), Byte (implementation), Chase (verification), Dewey (records), Echo (the review and the later UI pass), Forge (DEV deploy and PROD promotion; no infrastructure code change).

Decisions settled before implementation:
- Archie's brief (R185): the rate reads "N% per day" for every loan type; the interval reads "Every day" or "Every N days" for Daily interest and Daily instalment and "—" for Fixed due date; the R182 payment-history month heading ("September 2026", owner-accepted) stays; at 768 px and wider the Dashboard columns swap (Business cash held left, Income MTD right), accepted; the skip link uses a click handler and focus, not a `#main` fragment, so Back is unaffected.
- UXR-LOAN-02: Option A, a native confirm before the loan delete request. Together with the labelled, separated buttons of UXR-REC-01 this amounts to Option C of the review. The direct send, session recovery and server refusal of R061 stay after the confirm; a recovery of a stored delete request does not ask again.
- COPY-01 #6: sentence case for headings, buttons and navigation labels, in Archie's bounded set of about 35 strings in about 15 files (navigation and page titles, section headings, Default loan, Undo default loan, Generate charges, Close loan, a few phrases). Field labels that mirror the data dictionary stay Title Case.
- COPY-01 #7: show only the current language's half of a stored "EN / TH" value, through a display helper that splits on " / ". No data change.
- UXR-DASH-02: the class approach (`dashboard-wide`, `grid-column` per breakpoint in CSS), not an `!important` override of the inline style.
- Thai strings use Echo's drafts and need the owner's or Lisa's wording check before promotion.

## Changes
Baseline `8374c998` (`origin/main`, R184 closed) on branch `claude/jolly-brahmagupta-csy64t`. Review report and mock-up CSS: session scratchpad only (see Privacy). Code batch complete at `08aecf34` (69 files under `apps`, `services` and `tests`, 425 insertions and 191 deletions against the baseline).

| Code | Priority | Change |
| --- | --- | --- |
| UXR-BTN-01 | High | Un-classed form buttons (Save, Review, Confirm, Save as defaults, delete recovery, borrower "New loan") get a real button style; submit and Confirm buttons use the primary style |
| UXR-REC-01 | High | Record actions show their captions on iPhone in a three-column grid; Delete in red; the borrower's Instagram link gets a caption |
| UXR-LOAN-02 | High | Native confirm before the loan delete request (Option A; not asked when recovering) |
| UXR-NAV-01 | Medium | Page title in the iPhone header may use two 18 px lines instead of being cut off |
| UXR-COLL-01 | Medium | Charge rows label the two amounts "Remaining" and "Paid" |
| UXR-FORM-02 | Medium | Payment form says why Review is disabled (amount not allocated, no receiving account, or both) |
| UXR-FORM-03 | Medium | Messages with `role="alert"` get an error box (red border and tint) |
| UXR-MGMT-01 | Medium | Analytics actions show captions on iPhone, so the two recalculations can be told apart |
| UXR-MGMT-04 | Medium | The Generate Charges confirmation says which charges are created and up to which date |
| UXR-DASH-01 | Medium | iPhone Dashboard KPIs in two columns (400 to 767 px); the two cash-pool figures keep full rows |
| UXR-FORM-01 | Medium | Text fields get a 1 px border, 8/12 px padding, a visible focus ring and an accent colour on checkboxes |
| UXR-PAY-01 | Medium | Payments list shows "Last payment dd-Mon · ฿X in Mon" per borrower and "Oct 2026" on the month row; three read-only fields added to `readPaymentGroups` and its offline mirror; the line is hidden when a cached response lacks them |
| UXR-DATE-01 | Medium | One date rule (`dd-Mon`, `dd-Mon-yyyy`, `Mon yyyy`) in Referrers, Expenses, Rollover and its statement, and the Payments month group; native date inputs stay native; the R182 payment-history heading stays; the rollover arrangement generator takes the language per line, never the ambient UI language |
| UXR-MGMT-02 | Low | Contributions and Settlements rows: amount right-aligned, rows about 60 px |
| UXR-MGMT-03 | Low | Cash statement with no transactions shows "No transactions on this date."; empty charge-record sections show "None yet." |
| UXR-PAY-02 | Low | Pager shows "Page N" and "Next" ("Next 25" dropped: the cursor cannot know the count) |
| UXR-LOAN-03 | Low | Loan record and Edit loan show units: "N% per day" for all loan types; interval "Every day" or "Every N days" for Daily interest and Daily instalment, "—" for Fixed due date; "฿270" |
| UXR-NAV-02 | Low | Desktop sidebar is 220 px and labels do not wrap |
| UXR-DASH-02 | Low | Desktop Dashboard first card in four columns, with a class instead of the inline style |
| UXR-NAV-04 | Low | "All synced" is drawn at full opacity and reads "Saved changes: none" |
| UXR-PWA-01 | Low | Installation help explains Share, Add to Home Screen on iPhone and iPad, and that notifications work only from the icon |
| UXR-AUTH-01 | Low | "Continue with Google" uses the primary button style, at least 48 px high |
| UXR-A11Y-01 | Low | Five text colours raised to at least 4.5:1 contrast |
| UXR-A11Y-02 | Low | Skip link (click handler and focus, no fragment), Dashboard DOM order made to match the visual order (columns swap at 768 px and wider), "Income MTD" as `h2` |
| UXR-COPY-01 | Low | Seven copy fixes: assessment type separator, "—" for an empty Address, chat footer wording, payments month row spacing for screen readers, hide WebKit's own search clear button, sentence-case labels, single-language display of stored "EN / TH" values |

Files, from `git diff --stat 8374c998 08aecf34 -- apps services tests`:
- Styles: `apps/pwa/src/live-style.css`, `apps/pwa/src/chat/chat.css` (BTN-01, FORM-01, FORM-03, REC-01, NAV-01, NAV-02, MGMT-01, MGMT-02, DASH-01, DASH-02, A11Y-01).
- Buttons, actions and forms: `OperationConfirm.tsx`, `live-main.tsx` (BTN-01, AUTH-01, PWA-01, A11Y-02 skip link), `BorrowerRecord.tsx` (REC-01), `LoanRecord.tsx` (LOAN-02, LOAN-03, MGMT-04), `LoanForm.tsx`, `loan-form-values.ts` (LOAN-03), `SelectedCharges.tsx` (FORM-02), `CollectionRecords.tsx` (COLL-01).
- Payments and dates: new `bilingual-text.ts`, `display-date.ts`, `PaymentGroups.tsx`, `CompactPager.tsx`, `offline-dataset.ts`, `services/business/record-lists.mjs` (PAY-01, PAY-02, DATE-01, COPY-01 #4 and #7), `ReferrerRecords.tsx`, `ExpenseRecords.tsx`, `LoanRollover.tsx`, `rollover-statement.ts`, `ChargeForm.tsx`, `PaymentCorrectionForm.tsx`.
- Layout and labels: `Dashboard.tsx`, `live/LiveHeader.tsx`, `WaitingToSyncButton.tsx`, `CashWorkspace.tsx`, `ChargeRecord.tsx` (MGMT-03), `ManagementAssessments.tsx`, the other Management and loan screens, `chat/ChatProposalCard.tsx`, `chat/ChatThreads.tsx`, `chat/chat-text.ts` (COPY-01 #1 to #7).
- Tests: new `tests/unit/r185-ux-review.test.mjs`; `tests/unit/r136-rollover.test.mjs`; 31 e2e specs updated for the new labels and the delete-loan confirm (`page.once('dialog', ...)`), with new cases in `receiving-ux-independent.spec.ts`.

Deviations and decisions made during implementation:
- UXR-PAY-01: the borrower line reads "in Oct" without the year; month rows read "Oct 2026".
- UXR-REC-01 is scoped to the borrower and loan records (`record-captioned-actions`).
- UXR-A11Y-02: the skip link keeps its `href` so it can take focus, and a click handler prevents the jump.
- UXR-DATE-01: the date hints sit outside the label on the Loan, Expense, Correct payment, Rollover and Charge forms.
- Messages that name an action follow the new labels.
- `ExpenseRecords.tsx` no longer disables "Clear filter" while the list is loading (a CI fix for the race above); clearing already cancels the read in flight.
- The main live-dev chunk is 1,001.5 kB against the 1,000 kB warning limit. This is a warning only; nothing gates on it.

Records updated in this preparation step (Dewey):
- [Release tracker](../project/Documents/Release_Tracker.md): R185 row added.
- [Development Changes](../project/Documents/Development_Changes.md): R185 entry added.
- [Read service notes](../docs/Development_Read_Service.md) and the PWA API dictionary (`systems/pwa/human-api.yaml`): the three payment-groups fields. [Solution design](../project/Documents/Solution_Design.md): an R185 paragraph and the Direct Loan Delete sentence; [PWA system guide](../project/Documents/Data%20Dictionary/systems/pwa/application.yaml), `direct_loan_delete.submission`; [Project README](../project/README.md), the R061 row: each now says the loan delete asks once first (R185, Open).

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, `npm run build`, `npx vite build --mode live-dev`, `npm test` | Pass; `npm test` 1,443 passed, 1 skipped | final `08aecf34` tree, uncommitted at the time |
| Byte | targeted Playwright on desktop-chromium: LOAN-02 direct delete (4), FORM-02, phase5-final-ui (5), loan-form-defaults (4); after the fixes 20 targeted including the new skip-link test, borrower-search (3), Correct payment (2) | Pass | – |
| Byte | targeted Playwright on mobile-webkit: rollover, expense (2); 5 tests | Pass | `08aecf34` |
| Byte | PAY-01 SQL on a throwaway local PostgreSQL | Pass | – |
| Chase | PAY-01 SQL on disposable PostgreSQL 16 | Pass | `b5dc8be7` |
| Chase | first round: desktop-chromium 68 pass, 4 fail; mobile-webkit 38 pass, 2 fail, 10 skipped | Findings D1 to D4, all fixed in `08aecf34` | `b5dc8be7` |
| Chase | adversarial diff review | Clean apart from D1 to D4 | `b5dc8be7` |
| Echo | local-build visual check, iPhone WebKit, desktop, iPad | 20 OK; 6 follow-ups (PAY-02-R1, BTN-01-R1, MGMT-03-R1, DATE-01-R1 and R2, COPY-01-R1), all fixed | `b5dc8be7` |
| Chase | fix-delta re-check: phase5-borrower `:406` and `:474`, upcoming-read `:75`, loan-rollover `:42` on desktop-chromium | Pass, 4/4 | `08aecf34` |
| CI | pull request `Development checks`, [run 45511306647](https://github.com/welct0407/MW-Credit-App/actions/runs/45511306647) | Failed on 3 tests, fixed in the next commit: (1) `borrower-chat-button.spec.ts:136` pinned the old "New loan" class list (spec updated); Byte also found a product bug there, the REC-01 phone grid had overridden the borrower chat link's pink and blue border, now restored; (2) the W5 Delete margin on phones: below 768 px the spec checks the red border, the grid and a gap of at least 6 px, and the 12 px margin check stays from 768 px up; (3) R182 `payment-history.spec.ts:35` on mobile-webkit: FORM-01's 8 px padding made the Collection note textarea 4 px taller, fixed with `.collection-note textarea{padding:2px 8px}` and confirmed against `8374c998` | `88203156` |
| CI | rerun, [run 45514069330](https://github.com/welct0407/MW-Credit-App/actions/runs/45514069330) | 14 of 15 jobs passed; one test failed: `phase5-borrower-independent.spec.ts:442` (R141 owed expenses, clearing the filter after switching to Thai) on desktop-chromium. Root cause: a race that already existed and that R185's timing exposed (3 of 13 runs on R185, 0 of 18 at `8374c998`): the Expenses "Clear filter" button was disabled while a background re-read of the filtered list was in flight, and a tap landing as it became disabled was dropped. Fixed by Byte (see below) | `e69304bb` |
| Byte | after the Clear filter fix: a probe copy of the test 10/10; all R141 tests x5 on desktop-chromium, 20 passed; the owed-expenses test x3 on mobile-webkit, passed; lint and type check | Pass | – |
| CI | pull request `Development checks`, [run 45516470958](https://github.com/welct0407/MW-Credit-App/actions/runs/45516470958) (the one broad run on the head `6d49c64b`, merged as `fc7c4515` with an equal tree) | Success, all 17 jobs | `6d49c64b` |
| Forge | PROD runner reused evidence: Terraform run 44874582128 and database run 45506845022 | Reused (on `639c0f2f`; no `infrastructure/**` or SQL change) | `639c0f2f` |
| Dewey | `npm run check:docs`, `component-versions.mjs render --check` at closure | 0 failures, 0 warnings; render check ok (R185) | – |
| Dewey | `npm run check:docs` | 0 failures, 0 warnings (before the final line of this note) | – |

## Not run
- UXR-PAY-01 against the real service: DEV is on R184, so one DEV read after the deploy.
- UXR-LOAN-03 on a Fixed due date loan.
- Nothing after a submit, and no real-iPhone check: the iPhone Home Screen app (installation, safe areas, on-screen keyboard, the delete confirm as a standalone app), VoiceOver, Dynamic Type and real Thai typography are not covered by Playwright WebKit on Linux.

Known flaky test: `collection-read.spec.ts:228` on mobile-webkit fails intermittently on `8374c998` (1 of 6 runs) and on R185 (2 of 6). It predates this batch and is not caused by it.

## Recovery
Git baseline `8374c998` (R184 closed; baseline tag R184 `f14ddaca`). Images and Hosting: the pins and the rollback files in the DEV and PROD records below. A frontend-only revert restores the previous behaviour. UXR-PAY-01's read addition is additive; a rollback of its service image leaves the PWA without the new line, which the PWA hides when the fields are missing. No SQL, no backup needed.

## Open questions
- Thai wording: every string marked "Thai draft" in Echo's review needs the owner's or Lisa's check before promotion (FORM-02, NAV-04, COLL-01, PAY-01, LOAN-02, LOAN-03, MGMT-03, MGMT-04, PWA-01, A11Y-02, COPY-01 #3).
- Known: `collection-read.spec.ts:228` on mobile-webkit is flaky and predates R185 (see Checks); the main live-dev chunk is 1,001.5 kB against the 1,000 kB warning limit (warning only).
- UXR-COPY-01 #5: the double clear button was seen in Playwright WebKit; confirm on the owner's iPhone whether it appears there.
- iPhone Home Screen checks Playwright cannot cover: the confirm dialog, safe areas, keyboard, the new Installation help text read on the device, and the two-line title with a real Thai title.
- Owner acceptance of R185 in PROD, written into the next release's closure or product pull request.
- No real-iPhone check was made (see Not run).

## Remaining work
Owner acceptance of R185 and the Thai wording check by the owner or Lisa (every "Thai draft" string shipped as drafted). Follow-ups: the real-iPhone checks above, the first real use of the Payments "Last payment" line on PROD (the DEV read after deploy returned the three fields; no authenticated PROD read was made), the known `collection-read:228` flake and the 1,001.5 kB chunk warning.

## DEV deployment record (Forge, 25 November 2026 UTC)
Authority: the owner's "Push all the way to prod" (DEV first). Package: `main` `fc7c451514022d861b863ba6327c3f7fbd9ededf` (PR #388); its tree equals the tested head `6d49c64b`; CI run 45516470958 passed all 17 jobs. No SQL.

| Step | Result |
| --- | --- |
| Image | `api@sha256:590e1ccf4d1821c0fa9c841f7e8600969bcbf478690a24dae77623a337cfcbdb`; Cloud Build `81121ec5-8e33-44c5-b8be-5fe0ef28292f`, 00:27:04Z to 00:27:42Z |
| Cloud Run | `dev` plan 0 add, 3 change, 0 destroy, image only (plan sha `ae40a837…755c`, JSON `9fbb848e…d5b6`); applied 00:29:06Z to 00:29:43Z; re-plan clean. Revisions: read `mw-credit-app-read-dev-00106-nsg`, command `mw-credit-app-command-dev-00123-qgt`, chat `mw-credit-app-chat-dev-00075-4ts`; notify and jobs unchanged (`06c6ba44…`). Activation generation `1795566589514271` (previous `1795519117060526`) |
| Hosting | Build `b5774774f0d0e33840d581dd`; version `74b5946fad92ead6`, release `1795566724658000`; applied 00:31:53Z to 00:32:05Z; check covered 17 files |
| Verified, read-only | `/health` of all three services reports R185 `fc7c451`; unauthenticated requests get 401; all three origins serve `build-version.json` R185 and `sw.js` is no-store; authenticated `GET /api/payment-records?limit=5` returned 200 with 5 rows, all three new fields present with the right types; no ERROR, 42501 or 5xx from 00:29Z to 00:32:34Z |

Rollback: `dev.activation.before-r185.tfvars` (image `8b83c1b9…`; read `00105-t5k`, command `00122-wkq`, chat `00074-6sz`); Hosting back to `cdc7cf000b2d0215` (release `1795519137884000`).

## PROD promotion record (Forge, 25 November 2026 UTC)
Authority: the owner, 25 November 2026 (Asia/Bangkok): "Push all the way to prod". Scope: the R185 package (Hosting and the rebuilt shared business service image); no SQL, no backup, no authenticated PROD read, financial write or notification.

Freeze (pinned here): package `main` `fc7c451514022d861b863ba6327c3f7fbd9ededf` (PR #388, tree equal to the tested head `6d49c64b`); baseline tag R184 `f14ddaca`; frozen 2026-11-25T00:33:54Z; next unused number R186. The runner reused evidence: Terraform run 44874582128 and database run 45506845022 on `639c0f2f`. Targets verified: Flyway 155, 0 failed, 0 pending; the history row count (155) was read afterwards at 00:46:37Z by a read-only query, and the manifest's `verifiedAt` is 00:34:59Z. Package manifest (outside Git): `/root/.mw-private/MW-Credit-App/promotion/r185/promotion-package.json`, sha256 `a6675cff2230a0fe33fa9eca28a14f870881d6c976890d8f51c0cc7022a5ebdd`, copied to `gs://mw-credit-operator-private-737787224638/promotion-packages/r185/`; Hosting receipt `promotion-receipts/r185-hosting-receipt.json`. Revisions, digests and the Hosting version are in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Image | `mw-credit-app-prod/api@sha256:687dcfae3834b25aefc26277ce2b3af06e0ed65ef00c9cc8032a961ddccae87c`; Cloud Build `7a3a82d7-69ad-4807-8333-9b36661ab471` (`cloudbuild-business.yaml`, `_MW_RELEASE=R185`, git archive of `fc7c4515`), 00:35:08Z to 00:35:44Z |
| Cloud Run | Plan 0 add, 3 change, 0 destroy, image only (plan `bf152803…d5a1`, JSON `dadeae10…b9e9`); applied 00:44:13Z to 00:44:49Z; re-plan clean. Revisions: read `00072-v7c`, command `00077-wsf`, chat `00056-8c5`; notify `00032-khj` and jobs `00032-9nr` unchanged. Activation generation `1795567500372172` (previous `1795520286480533`) |
| Hosting | Candidate `5b2728bf…`, 18 files; runner check, then apply 00:47:29Z to 00:48:19Z; version `dde9a59785592cb7`, release `1795567692041000` |
| Verified, read-only (00:48Z) | All three PROD origins serve R185 (index and entry 200, the entry contains `fc7c451`, `sw.js` no-store); `/health` of read, command and chat reports R185 `fc7c451`; unauthenticated requests get 401; no ERROR, 42501 or response of 409 or higher from 00:33:54Z to 00:48:42Z; no authenticated PROD read, financial write or notification |

Rollback: `production.activation.before-r185.tfvars` (image `fe56cef2…`; read `00071-zpn`, command `00076-gqx`, chat `00055-kxt`); Hosting back to `c98044b4308753cd` (release `1795520460114000`). SQL unchanged, so no database restore applies.

## Tag record (Dewey, 25 November 2026)
Annotated tag `R185` (object `e3bfe527fd91983621078722e8aca5d151268117`) on `main` `fc7c451514022d861b863ba6327c3f7fbd9ededf`, created by the Release tag workflow, run [45521085734](https://github.com/welct0407/MW-Credit-App/actions/runs/45521085734), which succeeded at 00:49:59Z and published the GitHub Release R185.

## Closure records (Dewey)
- Component versions (`derive --release R185 --commit fc7c4515`): changed in R185 are the PWA frontend and the API read, command and chat services; unchanged: notification and jobs workers (R175), database schema (R184, V155), integration agent (R181, revision 47), Grafana dashboards (R180), Metabase reports (R144). `render --write` and `render --check` pass (R185). `scripts/promotion/components.json` was not changed by the tool. Drift (`drift --env all`) is run by Forge; its result is forwarded by the coordinator and not yet recorded here.
- Environment inventory: the R185 Hosting and Cloud Run rows for DEV and PROD (the R184 rows are now previous) and the component versions regenerated. Flyway rows unchanged (no SQL).
- Released wording: Solution design, read service notes, the PWA API dictionary and the PWA system guide no longer say "Open" for R185; the project README R061 row notes the confirm.
- Pruned at closure (Open R186 has no note, plus the three newest Released: R185, R184, R183): `Change Logs/CHANGE_NOTES_R182_COLLECTION_CHAT_PAYMENT_HISTORY_2026-11-22.md`, with its links (release tracker, Development Changes, environment inventory, Solution design) repointed to permalinks at `fc7c4515`; and the three 10 November notes that no current document linked to, which cleared the three `check:docs` warnings: `CHANGE_NOTES_FABLE_5_2_TEAM_MODEL_2026-11-10.md`, `CHANGE_NOTES_MERGE_CHECKIN_PROMPT_2026-11-10.md` and `CHANGE_NOTES_PROD_ZERO_CHARGE_CLEANUP_2026-11-10.md`. R185's section of Development Changes became its follow-up row.

Privacy: the review screenshots, mock-ups and the write-guard audit stay in the session scratchpad and are not committed. They show borrower screens (masked by Echo) and are deleted after the owner's review.
