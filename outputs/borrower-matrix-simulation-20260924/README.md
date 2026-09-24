# Borrower value and reliability matrix — simulation for owner review

**24 September 2026. Simulation only. No production, DEV, AppSheet or dashboard definitions changed.**

The owner paused the Risks redesign to establish a correct shared borrower reliability/overdue foundation, and then requested a closer review of reliability logic and weights. This report is the final proposal from that simulation. It supersedes the interim recommendation to retain the corrected original weights.

## Recommendation and result

Repair the two independent axes first, then use **45% recent punctuality, 15% older punctuality, 15% average delay severity and 25% current arrears condition**. Keep the original high-reliability boundary at **80**. Use the previous **30 completed Bangkok dates** for economic contribution, with the original equal-share boundary calculated correctly.

This produces the following result from one read-only production snapshot captured **24 September 2026, 20:00:12 Bangkok**:

| Category | Current production | Corrected original weights | Recommended refined model | Established history | Provisional history |
| --- | ---: | ---: | ---: | ---: | ---: |
| Star | 11 | 4 | **5** | 2 | 3 |
| Cash Cow | 0 | 9 | **10** | 3 | 7 |
| Question Mark | 11 | 4 | **3** | 2 | 1 |
| Dog | 0 | 5 | **4** | 3 | 1 |
| Total active borrowers | 22 | 22 | **22** | **10** | **12** |

Eighteen borrowers change category from the live model. Compared with the corrected original model, the refined weights/average-delay calculation move only two borrowers, both provisional, from a lower-reliability quadrant to its higher-reliability counterpart. The ten established-history borrowers keep their corrected category. All currently overdue borrowers remain on the lower-reliability side in this snapshot.

**No quota, percentile split, or requirement to populate all four categories was used.** Four categories appear naturally after fixing the logic. An empty quadrant at another date would be a valid result. These are the project's adapted value/reliability quadrants, not standard BCG market-growth/share measurements. Low economic contribution is not synonymous with bad payment behavior; the business labels can later be made more neutral without changing the calculation.

The private named review is stored outside Git:

- `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/OWNER_REVIEW.html` — matrix, named borrower movements, confidence and all component scores.
- Same folder, `borrower-review.csv` — complete named review table.
- Same folder, `simulation.json` and `reliability-comparison-private.json` — detailed calculations and alternative models.

Only sanitized aggregate evidence is published here: [final simulation summary](simulation-summary.json) and [five reliability alternatives](reliability-comparison.json).

## 1. Why the original matrix failed

Live V39 PostgreSQL definitions were read and captured, not inferred solely from old documents. The retained original [2 September design/change record](../../Change%20Logs/CHANGE_NOTES_BORROWER_VALUE_STABILITY_MATRIX_2026-09-02.md) and [V22 SQL](../../database/migrations/V22__olap_analytics_views.sql) supply the intended versus recorded comparison.

| Finding in the live calculation | Consequence | Proposed correction |
| --- | --- | --- |
| `1 / active_borrowers` uses integer division | The equal-share benchmark is **0 for every active borrower** in this snapshot | Decimal `1.0 / N`; with 22 active borrowers, **4.54545%** |
| Quadrant compares economic share and **scaled economic share**, not stability | Both classification axes are economic. Reliability cannot determine the quadrant | X = contribution relative to equal share; Y = reliability score |
| Contribution uses ten completed days, rounds shares to 0.01, and clips scaled contribution at 1 | Coarse boundaries and loss of visual separation; differs from the original 30-day intent | 30 completed days, unrounded calculation, unclipped relative contribution |
| History-sufficient test is effectively first-history age ≥3 days; empty history can pass | Sparse/new borrowers appear established | At least three distinct matured due dates and at least 30 days since first matured positive obligation |
| Recent history is included again in the 180-day history component | Recent behavior is counted in both components | Recent = days 1–30; older = days 31–180 |
| Current condition penalizes an unpaid/partial charge due today | Reliability changes during the day before an obligation is late | Due today is not overdue; use positive remaining balances dated before today |
| Worst delay controls the whole 90-day delay component | One resolved late charge can dominate months of otherwise regular payment | Average per-obligation delay grades; retain a separate current-arrears component and severe-risk cap |
| Integer/truncated ratios and scores | Unnecessary precision loss at classification boundaries | Full decimal calculation; round only presentation |

The current category calculation was independently reproduced from the captured raw interest rows for **all 22 active borrowers**. This is an arithmetic/axis defect, not evidence that the portfolio truly contains only two borrower types.

## 2. Economic contribution axis

Let D be the Bangkok reporting date. Include active borrowers using the current governed active flag, without excluding Hidden borrowers from the cohort or denominator. Use immutable Borrower ID throughout; do not group by display name.

```text
Contribution(b) = signed sum of repayment Interest Paid for b
                  where D − 30 ≤ Payment Date < D
Portfolio contribution = sum Contribution(b) over the active cohort
Share(b) = Contribution(b) / Portfolio contribution
Relative value(b) = Share(b) × active borrower count
High contribution = Relative value ≥ 1
```

Use signed entries rather than positive-only sums. The snapshot has three negative-interest repayment rows: two linked to defaulted loans and one other signed adjustment. Retain their accounting effects; do not silently remove negative rows or subtract recorded losses a second time. In this project, some loss postings are recorded as negative interest. Therefore this axis is **signed recognized interest contribution**, not cash receipts, net business profit, ROI or loss probability.

Portfolio contribution must be positive for a meaningful equal-share comparison; otherwise show Unclassified. Preserve negative borrower contributions on the low side. A zero contribution does not prove unreliability. Contribution is relative: a change in another borrower or the active cohort can move the X boundary.

Use an unclipped X axis with reference **1× equal share**, a Y axis from 0 to 100 with reference 80, and outstanding principal as bubble area. Draw one point per Borrower ID. Labels and confidence must agree with the actual axis calculations.

## 3. Proposed reliability methodology

### Common obligation and payment foundation

Eligible history consists of charges with nonnegative principal/interest due, a positive combined obligation and Charge Date before D. Ignore future and due-today charges for historical lateness. Zero-value and negative-component default-accounting charges are not successful repayment observations.

Determine payment from the signed repayment ledger linked by Charge ID. Track principal and interest separately. A charge is on time only if both components were fully covered by the end of its due date; one overpaid component cannot cover an unpaid other component. Partial payment is not full on-time settlement. Net same-date entries together. A later reversal can reopen the current balance. Amount tolerance in the simulation is half a cent; no whole-baht rounding determines classification.

For historical delay, use the final uninterrupted full-settlement date known before D; if unpaid, use D minus Charge Date. For current condition, include payments posted on D through the captured snapshot, but still exclude dues dated D from overdue obligations. Thus receiving a payment today can improve current condition without erasing the past late-payment event.

Do not infer repayment quality merely from Loan Status = Closed, Charge Payment Status = Paid, a payment row's existence or the last payment timestamp. The current cache has a closed-loan status override. All sampled mature positive charges nevertheless agreed with the ledger-based on-time check in this snapshot; the safer explicit foundation is required for future edge cases.

### Weights and meanings

| Component | Weight | Definition | Why this weight |
| --- | ---: | --- | --- |
| Recent punctuality | **45%** | Percentage of eligible obligations due in `[D−30,D)` fully paid on time | Recent repeated behavior should have the strongest influence |
| Older punctuality | **15%** | Same rate for due dates in `[D−180,D−30)` | Keep historical context without duplicating recent observations or overpowering current behavior |
| Delay severity | **15%** | Average delay grade across eligible obligations due in `[D−90,D)` | Distinguish one-day and prolonged delays; average avoids letting one resolved outlier determine this entire component |
| Current arrears condition | **25%** | Score based on oldest currently unpaid positive obligation before D | Current unresolved debt deserves more influence than the old model's 15% |

Delay grade per historical obligation: **0 days →100; 1 →90; 2–3 →70; 4–7 →40; 8+ →10**. Average these grades, including on-time obligations. This intentionally captures frequency and severity, while the punctuality components measure the simpler yes/no outcome. The components are related; they are not independent statistical predictors.

Current-condition grade: **no past-due balance →100; oldest unpaid 1 day →60; 2–3 days →40; 4+ days →20; an active default state →0**. An older loan is not necessarily an overdue loan. Today's unpaid charge alone leaves current condition at 100.

```text
Raw reliability = Σ(component score × available weight) / Σ(available weights)
```

Missing historical components remain unavailable and are omitted, never replaced with a perfect or zero score. With no older history, available weights total 85%; effective weights become recent 52.94%, severity 17.65%, current 29.41%. Show this availability in detail. A borrower with no eligible recent obligations is Unclassified rather than rated from current condition alone.

**Proposed severe-risk guard:** if an obligation remains unpaid for more than seven days, a default occurred in the past 90 days, or an active default state exists, cap the displayed final reliability at **60**. This prevents old debt outside the historical windows from being hidden by a good average. It is a transparent policy guard, not a learned probability; owner review applies to the cap as well as the weights. No category in the present snapshot changes solely because of this cap. The displayed Y coordinate must be the capped final score, so it agrees with the quadrant.

High reliability means final score **≥80**. Equality belongs on the high side. The thresholds/weights are interpretable prototype choices evaluated against the data, not statistically estimated default-risk coefficients.

### Confidence remains separate from quadrant

Established history requires **at least three distinct due dates** and **at least 30 days elapsed since the first eligible matured obligation**. Multiple loans due on one day do not manufacture three days of evidence. Otherwise label the placement **Provisional** and use a different point outline.

This is a modest eligibility gate, not strong statistical assurance: show observation count and actual history span alongside it. Twelve of the 22 current borrowers are provisional. The oldest available active-borrower history is only 50 days, so the nominal 90/180-day windows are not fully observed. Do not claim a long-term validated rating.

## 4. Why these refinements, rather than other weights

Each candidate used the same captured production data, 30-day contribution window, reliability boundary 80, maturity rules and severe-risk guard. Candidates were compared on interpretability, handling of unresolved arrears, sensitivity and retrospective payment behavior—not on equal category sizes.

| Candidate | Recent / older / delay / current | Delay treatment | Star / Cow / Question / Dog | High-reliability borrowers currently overdue |
| --- | --- | --- | --- | ---: |
| A: corrected original | 45 / 20 / 20 / 15 | Worst delay | 4 / 9 / 4 / 5 | 0 |
| B: softer severity only | 45 / 20 / 20 / 15 | Average grade | 5 / 11 / 3 / 3 | 1 |
| C: more recent weight | 50 / 20 / 15 / 15 | Average grade | 5 / 10 / 3 / 4 | 1 |
| **D: recommended** | **45 / 15 / 15 / 25** | **Average grade** | **5 / 10 / 3 / 4** | **0** |
| E: D with equal due-day weight | 45 / 15 / 15 / 25 | Average per day | 5 / 11 / 3 / 3 | 1 |

B/C remove the excessive worst-event penalty but can let stronger history compensate too much for a current multi-day arrear. D gives current condition more influence. E was tested to reduce the effect of multiple obligations on one date, but it softens a repeated multi-obligation payment pattern in this sample. Retain one obligation as one contractual observation for now; keep day-count confidence separate.

D and C have the same aggregate counts but **different borrowers** in the groups. Counts alone are not sufficient evidence to choose a model. See the private comparison for individual movements.

The D result differs from A only for two provisional borrowers whose resolved past delays had disproportionately lowered the worst-delay component. Their current obligations are not overdue. The established-history distribution is unchanged.

### Sensitivity, with the recommended calculation

| Reliability boundary | Star | Cash Cow | Question Mark | Dog |
| --- | ---: | ---: | ---: | ---: |
| 75 | 5 | 11 | 3 | 3 |
| **80** | **5** | **10** | **3** | **4** |
| 85 | 4 | 9 | 4 | 5 |

Three borrowers are within five score points of 80; two are within 10% of the equal-share value boundary. Preserve full precision and expose near-boundary scores rather than displaying categories as absolute truths. At 80, changing the contribution window to 10 days gives 8/7/3/4; 60 days gives 4/11/1/6. Keep 30 days because it matches the original intent and avoids both the more volatile ten-day view and a sixty-day view longer than the observed history.

Do not automatically recalibrate boundaries to portfolio percentiles: one borrower's reliability should not deteriorate merely because everyone else improved. The economic axis remains explicitly relative; the reliability axis remains an absolute documented rule.

## 5. Validation performed and its limits

The private capture used a single **repeatable-read, read-only transaction** against the verified production instance/host/database tuple. It captured 30 borrower analytics rows, 79 loans, 1,056 charges, 888 repayments and 277 payment records, with only scoped fields. No financial writes or test borrowers were created. The eight inactive borrowers are outside the current matrix, not deleted from analysis/recovery.

**14 snapshot checks passed:** read-only/isolation identity; unique borrower keys; exact cohort/category coverage; shares summing to one; score bounds; all loan principal and charge remaining balances reconciled independently with raw repayment components; valid charge references and matching loan links; all 22 original classifications reproduced; due-today treatment; severe current arrears guard; and established/provisional reconciliation. Aggregate booleans are retained in [simulation-summary.json](simulation-summary.json).

**28 synthetic tests passed:** all four quadrants/equality boundaries, missing-history weighting, maturity/history gates, early/on-time/partial/late/future payments, component-specific coverage, reversals, zero/non-cash charges, today-payment behavior, absent contribution, default/old-debt guards, weight totals, monotonic deterioration and resolved-outlier treatment. The [test suite](../../scripts/analysis/test_borrower_matrix.py) is executable without a database connection.

### Retrospective cross-check

Using the captured current ledger, reconstruct three earlier scoring dates and compare with obligations due over the following seven completed dates. Outcome rates below are the **mean of each included borrower's on-time-obligation rate**, giving borrowers equal weight. Exclude borrowers whose loans have default write-off histories, because original pre-write-off obligations cannot be assumed from current charge rows.

| Reconstructed scoring date | Higher reliability: next-7-day on-time rate | Borrowers | Lower reliability: next-7-day on-time rate | Borrowers |
| --- | ---: | ---: | ---: | ---: |
| 3 September | 89.9% | 12 | 42.9% | 2 |
| 10 September | 83.4% | 17 | 28.6% | 3 |
| 17 September | 71.5% | 15 | 31.4% | 5 |

These support directional usefulness but are **restated historical checks, not a true point-in-time backtest or out-of-sample validation**. Current rows can contain backdated entries or later corrections; some prior obligations are altered at default. The candidate was reviewed with these data, the groups are small, borrowers repeat between dates and the available history is short. No significance, default-probability accuracy or generalization claim is made.

### Known boundaries before production adoption

- No active borrower in this snapshot has a prior default. A returning borrower with default history needs explicit original-obligation treatment: current charges may have been reduced during write-off. Synthetic guards are tested, but production history reconstruction for that case is not established here. Preserve default flags/losses as distinct facts; do not treat write-off accounting as payment success.
- The snapshot includes one signed negative-interest adjustment outside the two defaulted loans; signed economic contribution retains it. Do not relabel every negative interest entry as default loss.
- Borrower completion categories are descriptive management segmentation. They do not approve/deny loans, set limits or trigger messages/actions. Economic contribution, payment reliability, current arrears, defaults and confidence remain separately inspectable.
- A future source implementation must reconcile effective Payment Date against available transaction timing and document late/backdated entry treatment. Today's simulation uses the project's governed Bangkok effective payment dates.
- Financial state can change after the recorded snapshot. Do not overwrite the review with an unannounced fresh dataset or present the static report as live.

## 6. Shared foundation and next implementation stage

After owner review, define reusable governed outputs for obligation on-time coverage, final settlement delay, current remaining balance, oldest unpaid age, borrower recent/older punctuality, delay score, current-condition score, final capped reliability, evidence counts and confidence. Portfolio Risks can consume overdue amounts/age independently of the matrix category. Collection Monitor can retain its operational statuses; BCG refinement does not automatically authorize changing those statuses.

Keep the first implementation additive and compare old/new outputs. Do not silently replace existing fields consumed by AppSheet, Metabase Borrowers/Risks/Borrower Insight and Data Studio. Inspect affected bindings and the original reporting definitions, document a compatibility plan, test in DEV and follow the current release/Flyway rules. Heavy shared financial reconstruction belongs in PostgreSQL, not duplicated chart expressions. No new physical table or column is assumed necessary; justify and obtain approval if a persistent schema addition becomes necessary.

Do not move forward with the Risks redesign or new borrower visuals until the owner reviews the method and borrower movements. The current Risks design files remain an unpublished paused draft. This simulation allocates no release number, creates no migration and advances no production/release status. R026 was the sole Open release at inspection; re-read the tracker for later implementation.

## 7. Reproduction and recovery

- [Read-only capture](../../scripts/analysis/borrower_matrix_capture.py) and [allowlisted fields](../../scripts/analysis/borrower_matrix_fields.json).
- [Offline simulation](../../scripts/analysis/borrower_matrix_simulate.py), [reliability comparison](../../scripts/analysis/borrower_reliability_compare.py), [private owner-review renderer](../../scripts/analysis/borrower_matrix_review.py).
- [Runner and privacy instructions](../../scripts/analysis/README.md).
- Snapshot SHA-256: `c8aafd919184a19cf0205ac7e12cd468c07fd7f1e17699dd417334ab42ece74a`.
- Starting repository commit: `9a623878d11a06b119e867e291340e60066bc894`, `master` / `origin/master`. Unrelated dictionary reconciliation and paused Risks drafts were preserved and excluded.

Rollback is file-only: revert this simulation/tooling publication while preserving later work. There is no live DB/app/report change to roll back. Private production evidence is outside Git and is not covered by repository publication.
