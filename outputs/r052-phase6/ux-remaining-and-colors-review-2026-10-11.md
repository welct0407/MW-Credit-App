# Agent E — Remaining pages and conditional colors

Owner-requested review, 11 October 2026. Baseline `13cbd9b`, reviewed action-refinement build `DqWqgSXP` / CSS `wfkw17mC` as pinned in [C's manifest](ux-remaining-coverage.json). Agent E, user experience officer, Astra low. **Final review: seven new recommendations, none approved for implementation.** The earlier authorization to implement iPad recommendations does not apply to this review. B's separately requested creation/delete symbols and Payment action sizing are implemented and verified separately; they are excluded from these suggestions.

## Scope and reuse

This review reconciles the [pinned workflow review](ux-pinned-pages-review-2026-10-11.md), [Cash review](ux-cash-review-2026-10-11.md) and [tablet review](ux-ipad-review-2026-10-11.md). The seven PIN findings and three IPAD findings have implementation evidence; four Cash findings are resolved and CASH-POS-002 remains intentionally excluded. They are not reopened or renumbered here.

New work covers remaining ordinary pages/variants and whole-app color meaning at phone 440, tablet 820/1180 and desktop 1440 where appropriate. Existing actual-component synthetic captures are reused where source remains applicable; fresh captures will be identified separately. No authenticated live session, physical device or financial operation is implied.

Owner choices retained: orange DEV/pink PROD headers, white/grey working surfaces, grey closed/inactive records, red remaining/green received/black zero, icon-only phone actions and visible actions without a three-dot menu.

## Coverage reconciliation

| Area | Earlier coverage | New evidence and remaining limits |
| --- | --- | --- |
| Expenses, Cash statement | Tablet roots and representative forms/details | Fresh phone/desktop empty expense root, ordinary entry/detail, selected statement with signed movements and zero summary. E inspected the phone controls and representative desktop counterparts. No expense save or transaction link operation. |
| Management reference/financial records | Tablet roots/forms; Cash Accounts/Position phone/desktop | Fresh phone/desktop Partners, Contributions, Settlements, movements, partner/account/holder/contribution/settlement/movement forms and opening preview; representative details inspected. Account detail renders its field structure but several fixture values are absent. Movement detail still uses a generic Contribution/Pending fixture in E's readback, so ordinary movement metadata is not visually accepted. Settlement status omission is supported by one captured row/detail and source; mixed-status rendering remains unverified. |
| Analytics and Assessments | Tablet roots; Analytics previously used pie fixtures for time-series | Fresh ordinary pie, signed/zero dated bar/line and expanded Values at four widths; initial Analytics phone/desktop. Fresh assessment root and stale selected record at phone/desktop; current/awaiting results and Analytics Validation detail remain source-only. |
| Conditional pinned workflows | Core loan/payment/charge forms and reviews, including approved refinements | Prior valid evidence reused. Move interest/review, populated lookup/replacement, other loan-type fields, charge review, receipt gallery/media and complete restored note/draft variants remain source-only; this batch does not claim to render them. |
| All-page color rules | Normal-state and selected/closed Cash, loan and borrower captures | Fresh signed/zero Dashboard, borrower active/inactive/negative/zero/positive, Posted/Error payment and partial Collection states across four widths. Shared styles/source extend the mapping; Processing/unknown combinations, every selected inactive row, every error/loading variant and PROD theme are not freshly rendered. |

C's canonical package records 54 remaining-page images and 24 full-shell color images. Eight duplicate `-final` copies from an unsuccessful fixture reconciliation are excluded; the final manifest and evidence explicitly retain the account/movement/settlement limitations above. E reviewed representative views and all recommendation evidence; these counts are evidence inventory, not 78 completed workflows. [Capture evidence](ux-remaining-evidence.md), [exact hashes/source pins](ux-remaining-coverage.json), [source-color inventory](ux-color-source.json). Some desktop captures show a viewport or scrolled chart region rather than an entire long page; previous tablet evidence supplies reusable layout coverage, not proof of unseen desktop content.

The synthetic linked toolbar and route title are excluded from product findings. Full-shell color captures establish current navigation/chrome. Fixture missing metrics, repeated Active groups caused by intentionally interleaved sample rows, and statement summary/transaction sample inconsistencies are not live-data defects. No operations, recalculation, uploads, saves or live financial writes were performed.

## Recommendations

### Assessments

**REM-ASSESS-001 — Explain the rate input unit — High.** The editable Minimum Daily Profit Rate contains `0.01`, while the same record displays `1%` below. Neither the input label nor nearby help explains the decimal convention. A user accustomed to entering percentage points could submit a rate 100 times the intended value. [Phone](ux-remaining-assessment-stale-detail-440.png), [desktop](ux-remaining-assessment-stale-detail-1440.png); `ManagementAssessmentForm` passes the decimal through and formats the review as a percentage. **Suggestion:** explicitly label the current decimal input with an example (`0.01 = 1%`), or present a percentage input with a visible `%` suffix and deliberate conversion. Preserve the stored business meaning and show the interpreted percentage before review.

### Analytics

**REM-ANALYTICS-001 — Distinguish the three phone actions — High.** Daily Analytics Validation, Recalculate recent and Recalculate full history all use the same `▤` symbol. Desktop captions distinguish them; phone users see three identical buttons for materially different actions. [Phone](ux-remaining-analytics-440.png), [desktop](ux-remaining-analytics-1440.png). **Suggestion:** use distinct visible symbols for viewing validation, recent recalculation and full-history recalculation; keep their specific accessible names and confirmation descriptions. Preserve icon-only phone actions and do not add a hidden menu. This is an Analytics-specific occurrence, not a reopening of resolved PIN-LOAN-001.

**REM-ANALYTICS-002 — Give time-series charts a readable scale — Medium.** The dated bar/line captures lack visible date/value axes and a zero reference line. A negative bar and a positive bar are both green and float in blank space, so their direction and size are difficult to interpret without expanding Values. [Phone with Values](ux-remaining-analytics-values-440.png), [desktop with Values](ux-remaining-analytics-values-1440.png); tablet pairs confirm the same structure. **Suggestion:** add a small set of readable date ticks, currency/value ticks and a visible zero line; distinguish negative bars by direction plus sign/label, with color as a supporting cue. Retain the Values table and avoid changing calculations.

**COLOR-ANALYTICS-001 — Connect pie colors to borrower names — Medium.** Pie slices have several colors but no visible segment key. Even expanded Values lists names and amounts without matching swatches, so users must infer which borrower owns each slice from relative size; equal slices would remain ambiguous. [Portrait tablet](ux-remaining-analytics-values-820.png), [phone](ux-remaining-analytics-values-440.png). **Suggestion:** place a compact name/value legend with matching swatches beside or below each pie, using text labels so interpretation does not depend on distinguishing colors. Reuse the existing palette; keep an explicit Other category when present.

### Settlements

**REM-SETTLEMENT-001 — Show the settlement state before opening a row — Medium.** The list shows date, partner and amount; the selected record reveals Pending, which determines whether Complete or Reverse is relevant. Source applies the same list markup to Completed and Cancelled records. Users must open rows individually to find unfinished settlements. [Phone list](ux-remaining-settlements-440.png), [desktop list](ux-remaining-settlements-1440.png), [detail](ux-remaining-settlement-detail-440.png). **Suggestion:** add a short status label or compact labelled symbol to each settlement row. Keep it neutral unless a color adds useful meaning; do not change the intentionally compact Payments list.

### Dashboard and monetary colors

**COLOR-DASH-001 — Darken orange figures on white — Medium.** Total Cash Pool and low Profit Coverage are noticeably pale against their white cards across all four widths. [Phone](ux-colors-dashboard-root-440.png), [desktop](ux-colors-dashboard-root-1440.png). Source-color contrast calculates to 2.33:1 for cash-pool orange `#FF8C00` and 1.97:1 for named orange. **Suggestion:** use a darker orange/brown for these text values while retaining their meaning and the orange DEV header. The header pairs themselves calculate to 5.15:1 (DEV) and 4.95:1 (PROD), so this finding does not call for a theme redesign. These are arithmetic checks, not full accessibility certification.

**COLOR-AMOUNT-001 — Make zero and negative summary values consistent — Medium.** Dashboard renders negative Today’s Profit and Net Profit green, and Yesterday’s Profit `฿0` green; Cash Daily Summary renders zero Money In green and zero Money Out red. [Dashboard](ux-colors-dashboard-root-820.png), [Cash statement](ux-remaining-cash-report-440.png). These category colors can imply a positive result or movement when the number is negative or zero. **Suggestion:** in monetary summaries, apply black/neutral zero first, and distinguish negative profit from positive profit while preserving the minus sign. Keep nonzero inflow/received green and outflow/remaining red as intended. Do not silently apply this to the separately intentional payment-status colors: payment symbols and labels already distinguish status from amount.

## Conditional-formatting inventory

| Family | Source rule and non-color meaning | Review position |
| --- | --- | --- |
| Shared shell | DEV orange/dark text; PROD pink/white text; neutral body. Current navigation has weight/edge/background and `aria-current`. | DEV rendered across all four widths. PROD theme source and contrast arithmetic checked; no fresh authenticated PROD review. Preserve themes. |
| Borrowers and loans | Inactive/closed grey backgrounds; explicit status groups. Interest received uses green; negative borrower interest uses red; zero neutral. Recovery ratios use brown/gold/teal and a visible metric legend. | Fresh borrower sign/zero/inactive captures at all four widths agree with these meanings. Closed-loan/selection evidence reused from prior reviews; no exhaustive combination matrix. |
| Collection | Red remaining/green received on charge rows, black zero; named status groups and compact meaning legend. Directory status colors also distinguish partial/overdue groups. | Fresh partial-payment root/detail at four widths; prior zero/paid evidence and source reused. No reopening of PIN-LIST-001. Fixture Unavailable group total is not a live defect. |
| Payments | Posted green/check, Error red/exclamation, Processing amber/clock, unknown grey/question; accessible status label. | PIN-PAY-002 already adds the non-color cue. No duplicate recommendation. |
| Cash statement | Signed inflow green/outflow red, labelled summary; zero transaction amount neutral. Summary Money In/Out colors are unconditional. | Selected statement phone/desktop confirms readable signed movements and the zero-summary exception in COLOR-AMOUNT-001. |
| Dashboard | Metric/category colors; pending positive red; profit colors unconditional, recovery thresholds orange/gold/teal. | Fresh negative/zero/low-coverage captures at all four widths support COLOR-DASH-001 and COLOR-AMOUNT-001. |
| Management | Financial detail statuses are text. Account/holder inactive state uses grey; partner share has numeric percentage. Assessments name eligible/wait/stale/awaiting states. | No need to color every state; inspect whether directory rows supply enough status context. |
| Analytics | Pie segments use categorical palette; bar/line marks use green. Values table is available through disclosure. | Fresh ordinary pie and signed/zero dated bar/line captures plus Values at all four widths support the Analytics findings. |
| Error/loading/recovery | Text errors with alert/status semantics, retry/check controls, disabled states and request reference; global request activity. | Color alone is not required. Fixture absence or native controls are not product failures. |

## Coverage limits and disposition

Suggested order: REM-ASSESS-001 and REM-ANALYTICS-001 first, followed by chart interpretation (REM-ANALYTICS-002 / COLOR-ANALYTICS-001), settlement status, then the two monetary color refinements. All seven remain recommendations awaiting owner selection; no product edit follows automatically.

The audit maps shared and page-specific color rules across the whole PWA, with targeted rendered states at 440/820/1180/1440 and source/reused evidence for residual variants. It does not claim every page/state was rendered at every width. Physical iPhone/iPad, Safari, native keyboard/file picker, authenticated live DEV/PROD, complete Thai locale, all recovery/receipt/error paths and financial correctness remain outside this evidence. Color-ratio arithmetic uses specified foreground/background pairs; it does not assess all computed states, text sizes, opacity, focus behavior or establish accessibility conformance. Grey inactive/closed records and neutral error text are not defects merely because they lack another color.

This completes the requested review within the stated evidence boundaries. D owns publication; E awaits an explicit further review request.
