# Change notes — R185 DEV UI/UX review fixes, 25 November 2026

## Purpose
Echo reviewed the whole PWA on DEV (iPhone WebKit, desktop Chromium, iPad layout checks) and proposed 25 changes, each with a `UXR-` code. The owner approved all of them on 25 November 2026 (Asia/Bangkok): "Go for all the changes and follow your recommendations". Status: Open, in implementation; nothing is deployed yet.

Production instruction: the owner, 25 November 2026 (Asia/Bangkok): "Push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge to main; the DEV deploy, then the PROD promotion of the R185 package (Hosting, plus a read service image only if Archie confirms UXR-PAY-01 needs one); the R185 tag through the Release tag workflow; and the records-only closure pull request. It does not cover financial writes, forced notifications or unrelated changes.

Authority: this is a frontend batch. No new table or column, no migration, no financial write, no forced notification. UXR-PAY-01 adds read-only fields to an existing read response (no schema change); Archie is confirming which service serves it, because that service image may need a redeploy at DEV and PROD promotion time.

Team: Archie (design and the read addition), Byte (implementation), Chase (verification), Dewey (records), Echo (the review and the later UI pass), Forge (DEV deploy and PROD promotion; no infrastructure code change).

Decisions settled before implementation:
- UXR-LOAN-02: Option A, a native confirm before the loan delete request. Together with the labelled, separated buttons of UXR-REC-01 this amounts to Option C of the review. The direct send, session recovery and server refusal of R061 stay after the confirm; a recovery of a stored delete request does not ask again.
- COPY-01 #6: sentence case for headings, buttons and navigation labels; Title Case only for data-dictionary field labels.
- COPY-01 #7: show only the current language's half of a stored "EN / TH" value, through a display helper that splits on " / ". No data change.
- UXR-DASH-02: the class approach (`dashboard-wide`, `grid-column` per breakpoint in CSS), not an `!important` override of the inline style.
- Thai strings use Echo's drafts and need the owner's or Lisa's wording check before promotion.

## Changes
Baseline `8374c998` (`origin/main`, R184 closed) on branch `claude/jolly-brahmagupta-csy64t`. Review report and mock-up CSS: session scratchpad only (see Privacy). The files are Byte's; the list below is the scope, and Dewey fills in the actual files from the diff.

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
| UXR-PAY-01 | Medium | Payments list shows "Last payment dd-Mon · ฿X in Mon" per borrower and "Oct 2026" on the month row; read-only fields added to the payment-groups read |
| UXR-DATE-01 | Medium | One date rule (`dd-Mon`, `dd-Mon-yyyy`, `Mon yyyy`) in Referrers, Expenses, Rollover and its statement, and the Payments month group; native date inputs stay native |
| UXR-MGMT-02 | Low | Contributions and Settlements rows: amount right-aligned, rows about 60 px |
| UXR-MGMT-03 | Low | Cash statement with no transactions shows "No transactions on this date."; empty charge-record sections show "None yet." |
| UXR-PAY-02 | Low | Pager shows the page number and the next page size |
| UXR-LOAN-03 | Low | Loan record and Edit loan show units: "9% per day", "Every day" or "Every N days", "฿270" |
| UXR-NAV-02 | Low | Desktop sidebar is 220 px and labels do not wrap |
| UXR-DASH-02 | Low | Desktop Dashboard first card in four columns, with a class instead of the inline style |
| UXR-NAV-04 | Low | "All synced" is drawn at full opacity and reads "Saved changes: none" |
| UXR-PWA-01 | Low | Installation help explains Share, Add to Home Screen on iPhone and iPad, and that notifications work only from the icon |
| UXR-AUTH-01 | Low | "Continue with Google" uses the primary button style, at least 48 px high |
| UXR-A11Y-01 | Low | Five text colours raised to at least 4.5:1 contrast |
| UXR-A11Y-02 | Low | Skip link, `id="main"` on the main area, Dashboard DOM order made to match the visual order, "Income MTD" as `h2` |
| UXR-COPY-01 | Low | Seven copy fixes: assessment type separator, "—" for an empty Address, chat footer wording, payments month row spacing for screen readers, hide WebKit's own search clear button, sentence-case labels, single-language display of stored "EN / TH" values |

Records updated in this preparation step (Dewey):
- [Release tracker](../project/Documents/Release_Tracker.md): R185 row added.
- [Development Changes](../project/Documents/Development_Changes.md): R185 entry added.
- [Solution design](../project/Documents/Solution_Design.md), the Direct Loan Delete sentence; [PWA system guide](../project/Documents/Data%20Dictionary/systems/pwa/application.yaml), `direct_loan_delete.submission`; [Project README](../project/README.md), the R061 row: each now says the loan delete asks once first (R185, Open).

## Checks
| Command | Result |
| --- | --- |
| (to be filled by Byte and Chase, each check once, with the commit or CI run) | – |

## Not run
Nothing has been run for this batch yet. Known gaps already: the iPhone Home Screen app (installation, safe areas, on-screen keyboard, the loan delete confirm dialog as a standalone app), VoiceOver and Dynamic Type, and real Thai typography are not covered by Playwright WebKit on Linux.

## Recovery
Git baseline `8374c998` (R184 closed). A frontend-only revert restores the previous behaviour. UXR-PAY-01's read addition is additive; a rollback of its service image leaves the PWA without the new line, which the PWA hides when the fields are missing. No SQL, no backup needed.

## Open questions
- Thai wording: every string marked "Thai draft" in Echo's review needs the owner's or Lisa's check before promotion (FORM-02, NAV-04, COLL-01, PAY-01, LOAN-02, LOAN-03, MGMT-03, MGMT-04, PWA-01, A11Y-02, COPY-01 #3).
- UXR-LOAN-03: confirm that "per day" is right for the Fixed due date loan type; if not, show only "%".
- UXR-COPY-01 #5: the double clear button was seen in Playwright WebKit; confirm on the owner's iPhone whether it appears there.
- iPhone Home Screen checks Playwright cannot cover: the confirm dialog, safe areas, keyboard, the new Installation help text read on the device, and the two-line title with a real Thai title.
- None on authority: promotion is authorized (see Purpose). Open only: the Thai wording check, which the owner's or Lisa's review must settle before or after promotion as the owner decides.

## Remaining work
Implementation (Byte), verification (Chase), Echo's pass on the result, the documentation pass against the final diff (Dewey), then DEV deploy, PROD promotion, the R185 tag and the closure pull request, and the owner's wording check.

Privacy: the review screenshots, mock-ups and the write-guard audit stay in the session scratchpad and are not committed. They show borrower screens (masked by Echo) and are deleted after the owner's review.
