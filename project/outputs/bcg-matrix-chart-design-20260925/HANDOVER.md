# Borrower BCG matrix — chart redesign and implementation handover

Status: **proposed presentation design, not deployed**. Owner accepts the R028 categories and requests four equal-size quadrants. This handover changes how classifications are displayed; it does not retune them. Prepared 25 September 2026 against repository commit `8fb56e19e4c7b11333336d8d6fdbb16dbbda3ae8`. No live system was changed or production data queried for this document.

## 1. Recommendation

Use a fixed square, four-quadrant **Borrower portfolio matrix**, with a centered cross and category names inside the quadrants. Transform the display coordinates into a bounded 0–100 space. Do not change the actual payment rating, contribution calculation, schedule gate or category.

Use the familiar BCG category arrangement, adapting the dimensions to this business:

| | Stronger payment health ← | → Lower / modified payment health |
| --- | --- | --- |
| Higher contribution ↑ | **STAR** | **QUESTION MARK** |
| Lower contribution ↓ | **CASH COW** | **DOG** |

The horizontal axis is **Payment health**, strongest on the left. The vertical axis is **Relative interest contribution**, highest at the top. This swaps the current axes so the four names occupy familiar BCG positions. This is a borrower-management adaptation, not a market-growth/market-share analysis. Label it accordingly.

All quadrants have equal area regardless of how many borrowers they contain. Equal area must never mean forcing equal borrower counts. Keep the existing accepted category distribution.

Visual specification shows the proposed arrangement with synthetic points; it is a design illustration, not a production screenshot.

## 2. Why a different scale alone is insufficient

Current saved question **266**, `Payment behaviour vs contribution · automatic categories`, on dashboard **3**, tab **31**, plots raw relative contribution horizontally and payment score vertically. The Y range is 0–100 with a goal at 80. Consequently, its top region occupies only 20% of the height. The X extent is data-dependent and a 1× contribution boundary is not a fixed central divider. These settings are recorded in `Documents/Data Dictionary/systems/metabase/questions/borrower-health-scatter.yaml`.

More significantly, `reporting_borrower_matrix_v3` can classify a borrower as Question Mark/Dog because of a modified schedule while retaining a payment score above 80. A monotonic transformation of the payment score alone cannot put that borrower in the correct lower-health category region. Logarithmic axes alone do not solve this, either. The chart needs an explicitly named **display position** incorporating the existing schedule gate; it must not pretend that position is a revised credit/payment score.

## 3. Source contract — preserve accepted logic

Authoritative source: `public.reporting_borrower_matrix_v3`. One row per active borrower. Category always comes from its `quadrant` field, never reconstructed in Metabase.

Retain `borrower_id`, `quadrant`, `payment_only_quadrant`, `category_adjusted`, `arrangement_gate`, `arrangement_status`, `modified_schedule_loan_count`, `reliability_score`, `relative_contribution`, `contribution_30d`, `outstanding_principal`, `confidence`, `classification_reason`, `reporting_date`, `calculated_at` and `method_version`. Borrower description comes from the existing governed borrower source with a unique-key join.

Existing boundaries remain score **80** and contribution **1×**; the automatic schedule gate remains exactly R028. Existing contribution denominator is the entire active-borrower cohort, including unrated borrowers. Filtering the visual must not recompute its denominator, rescale its axes or move remaining points. Do not reinterpret contribution as portfolio growth or principal exposure.

Reference result, from R028 verification on 25 September: 23 active borrowers, 4 Stars / 8 Cash Cows / 5 Question Marks / 6 Dogs. This is dated evidence, not a required future live count. Gift is Dog; Oum, Pond Admin and Puifai are Question Marks in that evidence. No names appear in calculation logic or automated fixtures.

## 4. Exact coordinate specification

The plot uses fixed linear **display axes** from 0 to 100, with dividers at 50. Original measures are transformed first. The displayed index is not an extra rating and should not be shown as a payment score.

### 4.1 Horizontal payment-health coordinate

For a valid raw score `s` in [0,100], first calculate:

```text
health_position =
  50 * s / 80                     when s < 80
  50 + 50 * (s - 80) / 20         when s >= 80

base_x = 100 - health_position
```

This places the 80 threshold at the middle, stretches the 80–100 upper band to half the width, and puts stronger health to the left.

For a borrower with `arrangement_gate = true`, set **x = 75**, the center of the lower-health half. This is a categorical placement for a modified schedule, not a 25/100 payment rating. Use the same location for every gated borrower; do not invent a severity ordering from coverage ratios. Their original score remains available in the tooltip/detail. The source category still determines their upper/lower contribution row.

For unrestricted borrowers, use `base_x`. Different within-half scales are intentional; distances across the boundary are not comparable units of risk. The chart explains category position, not a probability of default.

### 4.2 Vertical contribution coordinate

For valid relative contribution `r >= 0`:

```text
y = 100 * r / (1 + r)
```

This bounded monotonic transformation centers the existing 1× boundary without allowing a few high contributors to stretch the plot. It does not depend on the current cohort minimum/maximum.

| Raw contribution | Display Y |
| --- | --- |
| 0× | 0 |
| 0.25× | 20 |
| 0.5× | 33.3333 |
| 1× | 50 |
| 2× | 66.6667 |
| 4× | 80 |
| 9× | 90 |

For a finite negative contribution, plot at the bottom edge (`y = 0`) and set `contribution_clipped = true`; disclose the signed actual value in the tooltip. Never apply the rational formula to negative values. This is an explicit display floor, not removal of reversals or a change to contribution. Null/invalid values cannot be plotted as zero.

### 4.3 Boundary and edge handling

Keep mathematical coordinates separately from rendered positions. Use 2-point inner padding to keep markers inside the axes. Assign boundary markers visibly inside their source category:

```text
left side  (Star, Cash Cow):      plot_x = clamp(x, 2, 49.5)
right side (Question Mark, Dog): plot_x = clamp(x, 50.5, 98)
upper row  (Star, Question Mark): plot_y = clamp(y, 50.5, 98)
lower row  (Cash Cow, Dog):       plot_y = clamp(y, 2, 49.5)
```

The 0.5-point center clearance and 2-point outer padding are rendering conventions only. Do not use these values for any business calculation. Near-boundary points may share a position; do not introduce random jitter to separate them.

Before rendering, independently assert that unrestricted score/category and contribution/category agree with V3. Do not let clamping conceal a source inconsistency. A classified row with invalid score/contribution is a visible data issue and an acceptance-test failure, not silently coerced into a quadrant. Future unknown categories are also explicit errors.

`Unclassified` is excluded from the four quadrants and shown in a separate count/list, with reason. Never put unrated borrowers in Dog by default.

## 5. Visual and interaction specification

- One square plotting area, recommended 640–760 px on desktop, with the cross exactly at its horizontal/vertical midpoints. Larger dashboard card may contain surrounding explanation; equal size applies to the plotting rectangles themselves. Keep a 1:1 plot on narrower screens rather than elongating the axes.
- Four very light backgrounds: Star green `#EDF7F1`, Question Mark amber `#FFF6DF`, Cash Cow blue `#EDF4FD`, Dog rose `#FCEFED`. Divider `#8492A6`, thin outer border. Text remains dark and legible.
- Large category name in each corner; count immediately below it. Counts are derived from exactly the same filtered source rows as the points, not separately timed requests where avoidable. The plot should look like a matrix before a user reads its axes.
- Title: **Borrower portfolio matrix**. Subtitle: **Payment health × interest contribution · automatic categories**.
- Horizontal labels: **Stronger health** on the left, **Lower / modified health** on the right. Avoid numeric X tick labels: x=75 is a categorical location for modified schedules. Show a short threshold annotation: **Normal schedule: score 80 boundary**.
- Vertical labels retain original meaning: 0×, 0.25×, 0.5×, **1×**, 2×, 4×, 9× at transformed positions. If renderer cannot format transformed ticks, use only **Higher contribution / Lower contribution** and a center label **1× active-borrower average**; do not display the 0–100 position as contribution percent.
- Each borrower is a point. Default marker size is fixed, making the category legible and preventing principal concentration from hiding smaller borrowers. Keep principal in the tooltip/detail. Bubble sizing is optional future work, not required for this revision.
- Fill color follows category; modified schedules also have a dark outline and a diamond shape where supported. If shape is unavailable, use a distinct outline plus the literal **Modified schedule** in hover/detail. Color alone must not carry status.
- Hover/detail fields, in order: borrower; category; measured payment score /100; modified-schedule status and reason; relative contribution ×; 30-day interest received ฿; outstanding principal ฿; confidence; as-of date/query time. Do not show technical plot coordinates as a rating.
- Short chart note: **Positions are normalized for equal quadrants. Categories and payment scores are unchanged. Modified schedules are placed in the lower-health half automatically.**
- Exact-coordinate collisions show a grouped marker/count with every member available in a companion list or supported popover. No invisible borrower loss. Default fixed markers and selective labels reduce overlap; always retain a readable list grouped by category. No borrower disappears solely because its label collides.
- Mobile: retain a single square matrix with tappable details, then category lists below. Do not require hover as the only way to identify a borrower. Category text and counts remain readable at a 390 px viewport.

## 6. Database and report implementation boundary

Proposed new read-only view name: `public.reporting_borrower_matrix_plot_v1` (not currently created). A new migration must use the next available version at implementation time; do not reserve V43 in this document or edit immutable V41/V42. The view selects V3, carries original fields, and adds display-only fields:

| Proposed field | Meaning |
| --- | --- |
| `plot_status` | Plotted / Unclassified / Invalid plot input |
| `matrix_x`, `matrix_y` | Mathematical normalized coordinates |
| `plot_x`, `plot_y` | Padded/cleared render coordinates |
| `position_basis` | Measured score / Modified-schedule category placement |
| `contribution_clipped` | Negative amount floored for display |
| `plot_method_version` | `bcg-display-v1` |

Use PostgreSQL numeric arithmetic and explicit null handling. No stored operational fields, recalculation jobs or manual intervention. Metabase selects the view and presents it. Category counts use V3/the carried source category, not coordinates. Existing V3 consumers remain unchanged. Grant the existing reader SELECT only if a new view is created.

A light display projection does not require materialization. Compare runtime with current question 266; do not add infrastructure for an unmeasured issue. Exactly one source row per borrower before any deliberate collision aggregation.

## 7. Metabase feasibility and rendering decision

Repository inventory records **Metabase v0.63.18.1**. This design did not audit its live capabilities. Official current documentation supports scatter series, extra tooltip columns, a goal line and Y-axis range controls, but does not establish support for the complete fixed-X / vertical divider / quadrant-background / custom-label contract. Do not assume undocumented settings or that changing the axis scale produces this design.

**First implementation checkpoint:** use an isolated question/prototype with synthetic rows and prove fixed X and Y extents, centered vertical/horizontal lines, equal quadrant dimensions, labels, source-category colors and tooltip identity. Read installed-version settings/source as needed. Never call a single horizontal goal line a finished four-quadrant matrix.

Preferred delivery is one matrix within the existing Metabase dashboard. If the installed native scatter can satisfy the essential geometry and category mapping, use it; decorative background fills are optional if clear boundaries and labels remain. If it cannot, present the concrete limitation and renderer proposal before modifying hosting/licensing/security. Official custom visualization support is described for Pro/Enterprise; the inventory's v0 build does not establish that entitlement. **No purchase, edition upgrade, custom Metabase fork, new hosting, iframe exposure or public sharing is authorized by this design.**

An honest no-platform-change fallback for review is four equal-size category cards in a fixed 2×2 arrangement, with borrower lists and counts. It preserves classification and equal area but is not a continuous plot; do not silently substitute it for the requested chart. This is a renderer feasibility decision, not a reason to alter the accepted algorithm.

Sources checked for design feasibility: [Metabase scatter documentation](https://www.metabase.com/docs/latest/questions/visualizations/scatterplot-or-bubble-chart), [visualization overview and custom-chart availability](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results). Installed-version validation takes precedence over latest documentation.

## 8. Ordered implementation handover

1. Read current AGENTS, current Open release and affected release record. At design time R029 is Open; re-read before development. Record starting Git commit and preserve unrelated files. User has requested design/handover only in this turn; do not treat this document as live deployment authorization.
2. Re-read question 266, dashboard3/tab31 placement, V3 definition and source columns. Reuse correct account/API identity; use the service-account browser mapping for any GUI. Inspect only affected consumers.
3. Build the synthetic rendering proof from section7. Resolve the rendering route before SQL deployment or production report changes. Save the result/capability limitations with the release evidence.
4. Establish scoped rollback: fresh private dashboard layout, complete question definitions and dependent placement references. A copied dashboard sharing questions is insufficient alone. Create an independent new matrix question so the old scatter remains available for comparison/rollback. No cutover of original Borrowers tab6 or Risks tab8.
5. Add the proposed display view in a new migration after checking current numbering and dependencies. Keep V3 entirely unchanged. Use the established database procedure; snapshot/backup only for assets actually changed. Test in DEV with the maintained runner.
6. Run synthetic coordinate tests listed below, plus independent comparison of before/after V3 records. Produce a read-only live projection for owner review with counts, coordinate ranges and category-membership mismatches. Save sanitized summaries; borrower-level private evidence stays outside Git.
7. Build the new matrix question/renderer. Bind numeric coordinates, category, identity, raw metrics and freshness. Fixed axes cannot auto-fit after filtering. Implement companion details and collision access. Do not replay `ScheduleHealthReview.mjs --publish` because its R028 baseline and broader tab mutations are stale for this task.
8. Put the new independent matrix in the review tab as a comparison item or prepare a reviewable saved draft, according to scoped owner authorization. Retain question266 and its definition. Make surrounding category order agree with the new orientation if the local four-category summary block is reused; document those affected placements explicitly.
9. Validate saved definitions and real Metabase reader queries, desktop/mobile geometry, filter stability, modified-schedule placement and all borrower access. Compare coordinates/counts against the same source snapshot to avoid false mismatches during live changes.
10. Present the working matrix and verification to the owner. Once authorized, replace only the old scatter placement in tab31; preserve its recoverable definition. No original-tab cutover is implied. If SQL production changes are required, follow exact tested manifest promotion and the single release checklist.
11. Update the dictionary for the actual new view/question/placement, release log, relevant design/model explanation, and core release records when promotion applies. Document render transforms as display-only. Commit/push intended sanitized files; complete release capture/tagging only for an actual authorized promotion, not this design task.

## 9. Required tests and acceptance criteria

| Case | Expected |
| --- | --- |
| Score90, contribution2, unrestricted | Star, left/top; x25, y66.6667 before padding |
| Score90, contribution0.5, unrestricted | Cash Cow, left/bottom; x25, y33.3333 |
| Score60, contribution2, unrestricted | Question Mark, right/top; x62.5, y66.6667 |
| Score60, contribution0.5, unrestricted | Dog, right/bottom; x62.5, y33.3333 |
| Score90, contribution2, gated | Question Mark, x75/top; measured score remains90 |
| Score90, contribution0.5, gated | Dog, x75/bottom; measured score remains90 |
| Score80 and contribution1 | Star: render x49.5/y50.5; source thresholds unchanged |
| Values immediately below either boundary | Correct opposite side; no cross-line marker center |
| Score0/100; contribution0/very large | Finite positions, visible edges; no automatic range changes |
| Negative contribution with valid source category | Bottom edge and clipping flag; signed tooltip intact |
| Null score, Unclassified, invalid input | Outside quadrants with explicit reason; never invented zero |
| Two borrowers at identical coordinates | Both recoverable from marker/details; count correct |
| Apply borrower/category filters | Positions unchanged; only displayed membership/counts change |

Acceptance is **zero category changes, zero membership mismatches, no borrower loss, and four equal plotting regions**. At desktop/mobile, divider midpoint error must be <=1 CSS pixel and quadrant widths/heights must agree within 1 CSS pixel excluding divider strokes. Square plot aspect ratio within 1%; text outside the plot is not counted. Do not force today's counts to match historical R028 counts.

Validate method math independently of renderer and SQL using synthetic cases. Check raw payment scores, contributions and source category equality, not just aggregate totals. A green test on the transform alone does not prove the chart geometry.

## 10. Recovery and completion report

Restore only the prior tab31 scatter placement/question definitions if cutover fails. Leave any compatible unused display view in place; do not restore financial data to undo a visualization. If a different renderer introduces deployment/configuration assets, include its own scoped backup/recovery before changing them.

Completion report must identify actual renderer, view/migration/question IDs, unchanged categorization evidence, geometry/mobile checks, unsupported features, saved rollback and publication references. This handover's preview and formulas are a proposal; they are not evidence of a live implementation.
