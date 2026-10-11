# Agent E — iPad UX review

Owner-requested whole-PWA review, 11 October 2026. Agent E, user experience officer, Astra low. The owner authorized implementing tablet-specific recommendations during this batch; B implements, C verifies, E reviews the resulting experience. Final verdict: all three observed tablet findings below are resolved. No further confirmed tablet defect remains in the examined states; the coverage limits below remain explicit.

## Scope and evidence

Portrait 820×1180 and landscape 1180×820 represent iPad browser viewports. Scope includes Dashboard, Collection, Payments, Borrowers, Expenses, Upcoming Charges, Cash and all seven visible Management sections, plus their record/form/review/recovery components. External Reporting opens a separate AppSheet application and is outside this PWA layout change.

Final source: [tablet-source.json](tablet-source.json), baseline `d3f2ff1`, build `index-CoDiTIfp.js`; source hashes are pinned there. Actual app-shell captures use synthetic authentication and controlled data. Linked captures use actual components and CSS in a `.live-shell` harness; synthetic route headings and toolbar positioning are excluded from product findings. Initial landscape captures include an actual desktop-to-tablet resize with expanded navigation carried forward. Final ordinary captures mount at tablet width; focused checks separately exercise resizing and navigation.

No live financial operations, uploads, saves, recalculations or notifications were performed. These are browser captures, not physical-iPad, Safari, native keyboard, camera, installed-PWA or full language/device acceptance. A fixed bottom bar within a full-page screenshot is not itself evidence that content is unreachable.

## Recommendations and resolution

| Code / page | Observation and user impact | Recommendation | Status |
| --- | --- | --- | --- |
| **IPAD-ACTION-001 — Collection — High** | At both widths, “Receive selected charges” was constrained to a narrow control and spilled outside the header. Users could not clearly read the action or its touch area. [Before](ux-tablet-before-collection-detail-820.png). | Allow the complete tablet icon and caption to fit; wrap the header group if necessary. Keep the action visible. Tablet reproduction of PIN-ACTION-001. | **Resolved.** E rechecked both orientations: caption and control fit. [Portrait](ux-tablet-collection-detail-820.png), [landscape](ux-tablet-collection-detail-1180.png). |
| **IPAD-NAV-001 — Shared navigation — Medium** | Desktop-expanded navigation carried into landscape tablet covered headings, dates and left-pane content. Selecting another destination left it covering that page. [Before](ux-tablet-before-overlay-1180.png). | Collapse the overlay after choosing a tablet destination and on entering the tablet layout from wide desktop; retain an explicit visible expand control and preserve the current record/form. Keep Reporting's collapsed symbol and expanded caption consistent with the other links. | **Resolved.** E inspected clear collapsed-rail layouts; C's final focused check passed entry/destination collapse, explicit expansion, Escape/focus return and Reporting icon/caption behavior. |
| **IPAD-DASH-001 — Dashboard — Medium** | Tablet overview remained about 2300 pixels tall in a single column despite available width; Income MTD and Business Cash Held required multiple scrolls. [Before](ux-tablet-before-dashboard-root-1180.png). | Use readable tablet summary columns while preserving metric order, definitions and colors. Tablet instance of PIN-DASH-001; do not extend into unrelated financial redesign. | **Resolved.** E rechecked both orientations: compact metric pairs and side-by-side Income/Cash cards remain readable. [Portrait](ux-tablet-dashboard-root-820.png), [landscape](ux-tablet-dashboard-root-1180.png). |

Visible header actions remain required: no hidden or three-dot action menu. The previous seven general recommendations are not blanket implementation scope. CASH-POS-002 remains intentionally excluded; compact date-and-colored-amount payment rows are retained.

## Coverage record

The final inventory contains **82 captures / 41 states**, plus three retained before images. Exact paths and hashes: [coverage manifest](ux-tablet-coverage.json). C's focused verification: [evidence](ux-tablet-evidence.md). E inspected both orientations across the root and component families, then rechecked affected final layouts and corrected fixture states.

| Page family | Rendered coverage at both tablet orientations | Remaining visual limits |
| --- | --- | --- |
| Dashboard, Collection, Payments, Borrowers | Roots; Collection borrower charges; expanded Payments; borrower summary/edit/new | Conditional history, chooser, saved-note and final confirmation variants are source-only or reuse earlier phone/desktop evidence; no tablet acceptance claimed for those variants. |
| Loans, charges and receiving | Loan detail/new/edit/close preview; charge detail/new/edit; payment detail/correction; receiving entry; Unknown recovery | Final review/confirmation, receipt media, move-interest and full recovery/error permutations were not newly rendered at tablet widths. |
| Expenses and Upcoming | Expense root/detail/form; Upcoming root | Upcoming date/event variants and OS attachment picker not newly rendered at tablet widths. |
| Cash and Management | Cash statement workspace; all seven Management roots; holder detail/form, contribution detail/form, partner/account forms, settlement/movement forms, opening preview | Selected Cash account results and expanded account variants are not separately evidenced by this tablet set. Ordinary pie layout is rendered; repeated pie fixtures in other Analytics tabs do not validate time-series, bar or table layouts. Other generic record and conditional financial variants remain source-only. |

Corrected partner/account forms and opening preview now contain their ordinary controls; E inspected both orientations. Fields and visible actions fit, and C's document-width checks passed. The payment action panel's synthetic toolbar overlap is excluded from product findings.

C's focused checks passed: an edited Thai Loan Arrangement retained its exact value and DOM identity across both orientations and ten additional boundary/phone/desktop widths; the last textarea was reachable, tablet textarea font was at least 16px, immediate-parent Back occurred once, and Unknown Back stayed disabled. These checks support state retention and browser scrolling, not native keyboard or every-form acceptance. Existing financial/API/auth/service-worker evidence is reused unchanged, not rerun as part of this UX review.

## Final disposition

The three scoped recommendations are implemented and reverified; this review is ready for D's publication with the final source pins. There are no additional confirmed tablet findings to implement from this review. Physical iPad/Safari, native keyboard/safe-area behavior, installed-PWA operation, actual receipt media, full Thai locale and the unrendered variants above remain unverified. This is a bounded whole-PWA responsive review, not exhaustive device or workflow acceptance.
