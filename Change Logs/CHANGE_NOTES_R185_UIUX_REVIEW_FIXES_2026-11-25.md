# Change notes — R185 DEV UI/UX review fixes, 25 November 2026

## Purpose
Echo reviewed the whole PWA on DEV (iPhone WebKit, desktop Chromium, iPad layout checks) and proposed 25 changes, each with a `UXR-` code. The owner approved all of them on 25 November 2026 (Asia/Bangkok): "Go for all the changes and follow your recommendations". Status: Open, in implementation; nothing is deployed yet.

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
| CI | rerun on the fixed commit | Pending | – |
| Dewey | `npm run check:docs` | 0 failures, 0 warnings (before the final line of this note) | – |

## Not run
- UXR-PAY-01 against the real service: DEV is on R184, so one DEV read after the deploy.
- UXR-LOAN-03 on a Fixed due date loan.
- Nothing after a submit, and no real-iPhone check: the iPhone Home Screen app (installation, safe areas, on-screen keyboard, the delete confirm as a standalone app), VoiceOver, Dynamic Type and real Thai typography are not covered by Playwright WebKit on Linux.

Known flaky test: `collection-read.spec.ts:228` on mobile-webkit fails intermittently on `8374c998` (1 of 6 runs) and on R185 (2 of 6). It predates this batch and is not caused by it.

## Recovery
Git baseline `8374c998` (R184 closed). A frontend-only revert restores the previous behaviour. UXR-PAY-01's read addition is additive; a rollback of its service image leaves the PWA without the new line, which the PWA hides when the fields are missing. No SQL, no backup needed.

## Open questions
- Thai wording: every string marked "Thai draft" in Echo's review needs the owner's or Lisa's check before promotion (FORM-02, NAV-04, COLL-01, PAY-01, LOAN-02, LOAN-03, MGMT-03, MGMT-04, PWA-01, A11Y-02, COPY-01 #3).
- UXR-COPY-01 #5: the double clear button was seen in Playwright WebKit; confirm on the owner's iPhone whether it appears there.
- iPhone Home Screen checks Playwright cannot cover: the confirm dialog, safe areas, keyboard, the new Installation help text read on the device, and the two-line title with a real Thai title.
- None on authority: promotion is authorized (see Purpose). Open only: the Thai wording check, which the owner's or Lisa's review must settle before or after promotion as the owner decides.

## Remaining work
Implementation (Byte), verification (Chase), Echo's pass on the result, the documentation pass against the final diff (Dewey), then DEV deploy, PROD promotion, the R185 tag and the closure pull request, and the owner's wording check.

Privacy: the review screenshots, mock-ups and the write-guard audit stay in the session scratchpad and are not committed. They show borrower screens (masked by Echo) and are deleted after the owner's review.
