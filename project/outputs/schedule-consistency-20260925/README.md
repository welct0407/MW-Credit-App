# Schedule consistency simulation — 25 September 2026

Discussion evidence only. No DB objects/data, AppSheet configuration or Metabase questions were changed. This does not authorize implementation or production promotion. No release was allocated or frozen; R028 remains the current development release.

## Scope and captured result

Snapshot: **2026-09-25 00:26:07 Bangkok**, reporting date 25 September, from verified `appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_prod`. One repeatable-read, read-only transaction captured the minimum inputs. A separate read-only follow-up at 00:28:28 Bangkok checked loaded future plans for the four candidates.

- 23 active matrix borrowers, 52 active loans. Every included loan uses the daily-interest product; the runner deliberately rejects other types instead of assuming their rules.
- 20 borrowers have at least one loan with sufficient observation for the candidate screen; three have limited history. Limited observation is not evidence of a normal schedule.
- Current matrix: 6 Star / 9 Cash Cow / 3 Question Mark / 5 Dog.
- All three owner-confirmed settlement cases are identified, plus one unconfirmed candidate.
- All four candidates have auto-generation disabled. Auto-off alone identifies exactly the same four in this snapshot: greater predictive accuracy of the combined rule is **not demonstrated** by this sample.
- When only owner-confirmed settlements are prevented from occupying the upper-reliability quadrants: **4 Star / 9 Cash Cow / 5 Question Mark / 5 Dog**.
- If all four candidates were treated as settlements (unconfirmed what-if): **4 Star / 8 Cash Cow / 5 Question Mark / 6 Dog**.

No desired category distribution was imposed. Base payment scores, current overdue calculations and contribution values were held fixed within the snapshot. No score was multiplied by the charge coverage ratio.

## Candidate methodology

1. Build a counterfactual regular charge schedule using current daily interest, loan start, payment interval and any explicit schedule anchor. Ignore auto-off in the counterfactual; otherwise stopping generation would incorrectly remove the expected baseline.
2. Compare actual interest charged with interest expected to become due over completed dates. First-day transfer fees are excluded; principal obligations remain separate. Payments received are not the numerator.
3. For later explicit anchors, exclude history through the anchor from comparison. Initialize subsequent accrual using the last recorded pre-anchor charge date, matching the generator's accrual rule. Do not assume the current interval applied before the recorded transition.
4. Primary window: 26 August–24 September, clipped to loan inception and supported anchor history. Due today and interest not yet due are excluded. Additional windows: 7, 14, 60 and 90 completed days; threshold sensitivity focuses on 7/14/30 days.
5. Candidate loan: at least seven completed observation days, at least two expected due dates, actual/expected interest **below 80%**. Combined candidate additionally requires auto-off.
6. Flag the borrower if any included loan qualifies. Show loan detail as well as aggregated borrower coverage so a surplus on one loan cannot hide another loan's discrepancy. Borrower aggregate coverage is descriptive, not the exact flag trigger.
7. Simulate a classification gate: an affected Star/Cash Cow becomes Question Mark when existing relative contribution >=1, otherwise Dog. Existing lower categories stay unchanged. This is a scenario, not an implemented rule.

The 80% cutoff and seven-day/two-date minimum are exploratory screening choices, not validated predictive thresholds. Owner-confirmed labels are only simulation ground truth from the conversation, never a permanent name-based production rule.

## Robustness and false-positive investigation

| Coverage cutoff | 7d schedule-only / combined | 14d schedule-only / combined | 30d schedule-only / combined |
|---|---:|---:|---:|
| <70% | 4 / 4 | 4 / 4 | 4 / 4 |
| <80% | 4 / 4 | 4 / 4 | 4 / 4 |
| <90% | 5 / 4 | 5 / 4 | 5 / 4 |

The same four combined candidates appear in all nine combinations. With the 90% schedule-only cutoff, a borrower with missing first-day interest on newer loans is additionally flagged; this is not established settlement ground truth. One newer loan is below the minimum observation age.

A naive backward application of a later schedule anchor produced an additional 14-day schedule-only flag. Restricting comparison to supported post-anchor history removed that artifact. Both naive and adjusted sensitivity outputs are retained privately.

## What future-plan inspection changed

Low recent interest coverage does not necessarily mean interest was waived. Future entries distinguish deferred lump sums, longer installment schedules and reduced interest components. One unconfirmed candidate's future interest exactly equals its current daily rate multiplied by the gap between recorded due dates: this is apparent deferral without an interest-amount concession. Another owner-confirmed case has future lump-sum interest exceeding a simple unchanged-rate calculation over its gap.

Accordingly, call the inferred signal **schedule departure / possible arrangement**, not confirmed hardship or lost income. An explicit reviewed arrangement status remains more reliable than inference alone. Maintain independent facts for payment compliance, deferral, interest concession and principal recovery.

## Validation and limits

- Verified read-only transaction and full configured target identity; captured live charging function bodies match maintained V6/V8 implementations. No mutating generator was invoked.
- Reconciled snapshot grouped charge counts, principal and interest against independent SQL aggregates.
- Checked active borrower/loan coverage and supported positive daily-interest inputs.
- Four synthetic boundary checks cover cadence, exclusion of due-today obligations, anchor transition and preservation of pre-anchor accrual.
- Replay runs use the original immutable private snapshot. Results are deterministic for that snapshot and inputs.
- Three known positive examples and no reviewed negative set do not establish precision, specificity or an optimal threshold. The unconfirmed case must not be silently treated as a true positive.
- Current setup is not verified immutable original terms. Unrecorded historical rate/interval changes, legitimate adjustments and operational generation failures can produce differences. Coverage above 100% does not indicate superior reliability.
- Counterfactual amounts are analytical comparisons, not amounts legally/operationally due, additional overdue debt, financial losses or permission to restore charges.
- This simulation does not change the separate sparse-history/weighting limitations of the existing payment score.
- Ordinary auto-enabled loans may have no future charges yet. That absence is not used as an adverse signal.

## Artifacts and reproduction

Maintained runner: [simulate_schedule_consistency.py](../../scripts/analysis/simulate_schedule_consistency.py).

Identifiable snapshot, full 23-borrower Markdown report, per-loan results and future-plan evidence are retained outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/schedule-consistency-20260925/`. The owner was given a direct local link to `REPORT.md`. Identifiable data is not part of repository publication.

Run with the bundled Python and `--private-directory` pointing under the approved external private root. Use `--capture` only to capture a new snapshot into a new directory. Omit it to replay. `--confirmed-names` accepts the owner's separately confirmed scenario labels. The runner rejects an existing snapshot on capture, unsupported loan types and changed charging function bodies.

Repository starting commit: `db3e77ce3a3bff84041b4b3a61537c3316907a10`. No live rollback is needed; only analysis code and sanitized documentation were added. Existing unrelated untracked work was preserved.
