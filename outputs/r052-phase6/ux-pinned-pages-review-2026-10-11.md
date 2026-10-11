# Agent E — Pinned pages and linked workflows

Owner-requested review, 11 October 2026. Agent E, user experience officer, Astra low. Recommendations only; no implementation or operational action is authorized by this report.

## Scope and confidence

The four pinned pages are **Dashboard, Collection, Payments and Borrowers**. This is confirmed by `workspaceViews` entries with `frequent:true` in `apps/pwa/src/live-main.tsx`, not inferred from earlier Cash work. This review follows their content links into borrower, loan, charge and payment workflows, including forms, confirmations and recovery states. Shared navigation alone does not extend this review into every other workspace. Expenses, the separate Upcoming workspace, Cash, Management and external Reporting are therefore outside this content-link scope. The prior [Cash review](ux-cash-review-2026-10-11.md) remains separate; CASH-POS-002 is still intentionally excluded by the owner and is not raised again.

Baseline reported by delivery: repository `af4f195`, application source `b83f65a`, deployed frontend `BMt4jSMn`. Current source inspection is combined with C's fresh synthetic rendering of the actual components at desktop 1440×956 and mobile 440×956 (representative iPhone Pro Max viewport). Some mobile images are full-page captures taller than the viewport; a fixed bottom bar appearing within such an image is not itself an overlap defect. There was no authenticated live review or physical-device test. No payment, save, delete, note autosave, upload, recalculation or other business operation was performed for this review.

## Recommended order

1. PIN-LOAN-001 — distinguish mobile loan actions.
2. PIN-PAY-001 — retain loan identity when reviewing/correcting allocations.
3. PIN-ACTION-001 — fix desktop action captions that escape their buttons.
4. PIN-LOAN-002 — explain the close-loan total before confirmation.
5. PIN-LIST-001, PIN-DASH-001 and PIN-PAY-002 — improve interpretation and scanning without adding unnecessary rows.

## Loan pages

### PIN-LOAN-001 — Give different loan operations different mobile symbols

**High priority. Evidence: [mobile loan detail](ux-pinned-loan-detail-440.png), [desktop loan detail](ux-pinned-loan-detail-1440.png), and current `LoanRecord` / `RecordAction` source.** Close Loan, Default Loan, Generate Charges and Delete loan display the same arrow icon. With intentional icon-only mobile actions, users cannot reliably distinguish these operations before tapping. Desktop captions distinguish them, so the main impact is on mobile.

**Suggestion:** Keep the owner's icon-only mobile design, but use unmistakably different symbols for close, default, generate and delete. Keep actions visible in the header; distinguish destructive actions through styling or spacing, and wrap the action group if needed. Do not introduce a hidden or three-dot action menu. Keep existing accessible names and desktop captions. This does not request changing the financial operations themselves.

### PIN-LOAN-002 — Explain the amount required to close a loan

**Medium priority. Evidence: [mobile close preview](ux-pinned-loan-close-preview-440.png), [desktop close preview](ux-pinned-loan-close-preview-1440.png), and `LoanClose` source.** The close screen presents one amount followed by receiving account and payment fields. It does not visibly explain the principal/interest components or effective date behind that amount. A user cannot readily check why the close amount differs from a balance remembered from the prior page.

**Suggestion:** Add a concise “Closing amount as of [date]” summary with principal, interest and total from the same authoritative preview. Keep the total prominent and detailed calculation optional. If the preview lacks a component, show that limitation rather than derive a competing figure in the UI.

## Payment pages

### PIN-PAY-001 — Keep the loan identity beside allocations through review and correction

**High priority. Evidence: [mobile correction](ux-pinned-payment-correction-440.png), [desktop correction](ux-pinned-payment-correction-1440.png), payment-detail, receiving-review and correction-review captures at both widths, and source review of `SelectedCharges`, `PaymentCorrectionForm` and `PaymentRecord`; multi-loan ambiguity is an inference.** Entry rows identify a loan, but the receiving review lists only charge date and principal/interest. Correction allocation rows and payment-detail allocations also use the date without a loan identifier. Two loans for one borrower can have charges on the same date, making the user-facing entries indistinguishable even though their internal IDs differ.

**Suggestion:** Carry a compact, human-readable loan label plus charge date into each allocation line, and show the changed allocation lines in correction review. Reuse the entry-page identifier. This improves the user's ability to verify the destination without exposing internal IDs or adding posting actions.

### PIN-PAY-002 — Preserve compact payment rows while adding a non-color status cue

**Medium priority, optional accessibility refinement. Evidence: [mobile expanded payments](ux-pinned-payments-expanded-440.png), [desktop expanded payments](ux-pinned-payments-expanded-1440.png), and `PaymentGroups` source.** The owner intentionally chose date plus colored amount. That layout is retained here. In the captured rows, a green and a red amount carry different statuses; their explanatory status exists in accessible labels and hover titles, but a sighted phone user who cannot distinguish those colors has no equally direct cue.

**Suggestion:** If the owner wants this refinement, add a tiny status-specific shape/icon beside the colored amount and a compact legend, preserving the single row. Keep the existing accessible label. Do not restore status lines or a separate Posted amount field.

## Shared actions and list readability

### PIN-ACTION-001 — Let desktop action captions fit their controls

**High priority. Evidence: [Payments desktop](ux-pinned-payments-root-1440.png), [Collection detail desktop](ux-pinned-collection-detail-1440.png), [Borrowers desktop](ux-pinned-borrowers-root-1440.png), and [charge detail desktop](ux-pinned-charge-detail-1440.png).** “Receive payment” wraps almost character by character outside its narrow button; “Receive selected charges,” “Add borrower” and “Edit charge” also spill beyond their controls. Users have difficulty identifying the action and its actual clickable area.

**Suggestion:** Give desktop captioned buttons enough width for their label or wrap the action group onto another line. Preserve compact icons on mobile. Apply the sizing consistently to these affected actions, including narrow desktop detail panes. The already-resolved Cash captions do not need to be reopened.

### PIN-LIST-001 — Make compact amounts understandable without hovering

**Medium priority. Evidence: both-size Borrowers and Collection root captures, borrower summary/related-loan rendering, and current list source.** Borrower rows show an outstanding amount and interest earned; Collection rows show remaining and collected amounts; related loans add an interest-recovery percentage. Several values rely on position, color or a hover title to explain their meaning. A new mobile user can confuse what is owed with what has already been collected.

**Suggestion:** Add a short column legend at each list header, or concise labels beside the relevant amounts. Keep the compact rows and existing colors. Name the related-loan percentage explicitly as interest covering principal, so it is not read as the loan interest rate.

## Dashboard

### PIN-DASH-001 — Use desktop space to surface the main summaries sooner

**Medium priority. Evidence: [desktop Dashboard](ux-pinned-dashboard-root-1440.png), [mobile Dashboard](ux-pinned-dashboard-root-440.png).** Desktop renders the KPI, Collection, forecast and portfolio sections as one long column with a large unused area to the right. Income MTD and Business Cash Held sit below the first viewport. Mobile naturally needs a longer page, but the most useful overview still requires considerable scrolling.

**Suggestion:** Use a small desktop grid for the existing summary sections, with a concise first-screen overview. On mobile, keep today's collection and key balances first and allow secondary forecast/monthly detail to expand. Preserve existing metric definitions and colors; this is a layout recommendation, not a request for new calculations.

## Reachable-page inventory and coverage

Every listed route/state is included in source review. A reused component is listed once with its parents. **Both** means E inspected desktop and mobile captures, not that all interactions or data variants passed. **Source only** means visual behavior at either viewport remains unverified. Root captures use the actual app shell with synthetic authentication/data. Linked-component captures use actual components and CSS inside a synthetic harness; its toolbar, parent-state text and missing app-shell positioning context are excluded from findings. [C's evidence](ux-pinned-evidence.md) and [capture manifest](ux-pinned-coverage.json) record exact files, hashes and coverage limits.

| Page or state | Reachable from | Current desktop/mobile coverage |
| --- | --- | --- |
| Dashboard: KPIs, Collection counts, forecast, active portfolio, Income MTD, Business Cash Held | Pinned Dashboard | Both: `dashboard-root`. No content links to further pages in current source. |
| Collection grouped borrower board | Pinned Collection | Both: `collection-root`. |
| Collection borrower summary, today's charges and inline note | Collection borrower row | Both: `collection-detail`; note text was not edited or saved. |
| Upcoming date list and dated charge projection | Collection borrower summary → Upcoming Charges date | Both: `collection-upcoming-summary`, `collection-upcoming-date`, including principal, interest and basis. Projection rows have no further content links. |
| Collection receipt gallery → payment record | Collection borrower summary → receipt | Source only for gallery/media; shared payment record captured separately. |
| Collection payment history panel → payment record/result | Collection borrower summary → history | Source only for the Collection-specific history wrapper; borrower-scoped month history and shared payment record captured separately. |
| Payments directory, borrower groups, month groups and compact payment rows | Pinned Payments | Both: `payments-root`, `payments-expanded`; Posted and Error sample rows. |
| Choose borrower for receiving | Payments → Receive payment | Both: `borrower-chooser`, initial search state; populated search results source only. |
| Receiving amount, charge allocation, method/account, note and receipt controls | Collection Receive / Payments borrower chooser | Both: `receiving-entry`; no upload or allocation action executed. |
| Receiving review, confirm and posted/result details | Receiving entry → Review / recorded outcome | Review both: `receiving-review`; synthetic read-only review response only. Posted/result details source only. No payment confirmation executed. |
| Payment record: metadata, allocations, repayments, cash movements | Payment row / Collection receipt/history / related loan or charge payment | Both: `payment-detail`; receipt media absent. Embedded cash movements and allocations are display rows, not links into Cash management. |
| Payment receipt source selector/manual or agent receipt | Payment record, if receipt exists | Source only; actual image/media behavior unverified. |
| Correct payment: fields and allocation components | Payment record → Correct payment | Both: `payment-correction`; one PWA-plan allocation. Legacy allocation-method variants, proposed-borrower replacement and prepared-close variants source only. |
| Correction borrower lookup/replacement preview and correction confirmation | Correct payment | Confirmation both: `correction-review`; borrower lookup/replacement source only. No replacement or confirm executed. |
| Move interest form, target selection and confirmation | Eligible Lump Sum payment → Move interest | Source only; conditional state not in the captured payment fixture. |
| Delete payment confirmation | Payment record → Delete payment | Source only; not invoked. |
| Borrower directory and selection | Pinned Borrowers | Both: `borrowers-root`. |
| Shared borrower summary, active/closed summaries, related loans and contact fields | Borrowers row / Collection borrower-name link | Both: `borrower-summary`. Same component shared across both parents. |
| Borrower edit / new borrower / deletion prompt | Borrower summary Edit / directory Add / borrower Delete | Edit and new form both: `borrower-edit`, `borrower-new`; native deletion prompt source only. No save/delete. |
| Borrower payment history grouped by month | Borrower summary → Payment history | Both: `borrower-history` month summary; expanded shared rows also rendered in `payments-expanded`. |
| Related loan list → full loan detail | Borrower summary / Collection loan link | Both: `borrower-summary`, `loan-detail`. |
| Loan new / edit terms | Borrower new-loan action / loan Edit | Both: `loan-new-form`, `loan-edit`; initial new form and daily-interest edit captured. Other loan-type field variants source only. |
| Close-loan preview, receiving fields and closing confirmation | Eligible loan → Close Loan | Preview and confirmation both: `loan-close-preview`, `loan-close-review`; Confirm not activated. |
| Default / Undo Default / Generate Charges / Delete loan confirmation | Conditional loan actions | Source only; no operation invoked. |
| Related charge/payment lists | Loan detail | Both within `loan-detail`; shared detail destinations listed separately. |
| Charge detail, related repayments and allocations → payment record | Collection charge tile / related loan charge | Both: `charge-detail`. |
| New/edit charge fields and review confirmation | Loan New charge / charge Edit | Forms both: `charge-new-form`, `charge-edit`; confirmation source only. |
| Charge deletion confirmation | Charge detail → Delete charge | Source only; not invoked. |
| Search overlay and filtered lists | Root header search | Source inspected; no fresh dedicated search-overlay capture. Search destinations reuse the listed roots. |
| Saved records/drafts: borrower, note, loan, close, charge and payment; read-only snapshots | Shared Saved payment drafts / interrupted workflow recovery | Both: `saved-note-list` and locked `saved-note` fixture state. The fixture lacks the full recovery envelope, so ordinary restored-note editing and other saved variants remain source only; this is not a product failure. Unrelated expense/management saved workspaces are not in this workflow scope. |
| Unknown/rejected/conflict/source-changed, retry, offline and storage-error states | Affected forms / `OperationConfirm` / `SelectedCharges` / saved recovery | Source only, including preservation of the original request and restricted retry. Not induced by sending operations. |

Source trace: `live-main.tsx`, `Dashboard.tsx`, `CollectionRecords.tsx`, `CollectionNote.tsx`, `CollectionReceipts.tsx`, `UpcomingCharges.tsx`, `StandaloneRecords.tsx`, `PaymentGroups.tsx`, `PaymentHistory.tsx`, `BorrowerPayments.tsx`, `SharedBorrowerDetail.tsx`, `BorrowerRecord.tsx`, `LoanRecords.tsx`, `LoanRecord.tsx`, `LoanRelated.tsx`, `LoanForm.tsx`, `LoanClose.tsx`, `ChargeRecord.tsx`, `ChargeForm.tsx`, `SelectedCharges.tsx`, `PaymentRecord.tsx`, `PaymentCorrectionForm.tsx`, `PaymentResult.tsx`, `OperationConfirm.tsx`, `OfflinePayments.tsx` and `OfflineViewedRecord.tsx` under `apps/pwa/src/`.

## Review limits and disposition

The evidence package contains 62 images / 31 states. E inspected the 56 images / 28 states within this workflow boundary, including two limited saved-note states; six supplementary standalone Upcoming images are outside scope. This is not 31 fully validated workflows. The table identifies remaining source-only coverage, notably receipt media, conditional Move-interest, charge review, transient recovery, search results and loan-type variants. Receiving review used an intercepted synthetic read-only POST response; no operational request was dispatched.

The review is not proof of financial correctness, end-to-end posting, live authentication, every data shape, all error paths, Thai-language layout or device-specific keyboard behavior. Synthetic fixture omissions (for example a missing group total shown as Unavailable) are not reported as live-data defects. No suggestions have been implemented. D owns the change log and publication of this artifact; E will undertake another review only when requested by the owner.

## Owner-approved implementation status — 11 October 2026
All seven recommendations above are implemented and deployed in DEV from source023945d: PIN-LOAN-001, PIN-LOAN-002, PIN-PAY-001, PIN-PAY-002, PIN-ACTION-001, PIN-LIST-001 and PIN-DASH-001. Original findings and review boundaries remain historical evidence. Loan action icons stay visible; no hidden/three-dot menu was introduced. C focused read/UI proof and65 synthetic captures are linked in [implementation evidence](pinned-approved-evidence.md); configured command00016-gc9 and frontendCON-hIdp/Hosting41c242f719db0cee were deployed with public marker verification. This is implementation verification, not a new E review or physical-device/owner acceptance claim. No additional recommendations were activated.