# OLTP performance tuning — measured test report

**13 September 2026 · Results for review · No production implementation**

## Decision

No tested structural change produced a large speedup. The strongest small-change candidates are **P01a, skipping eligibility scans for Posted receipts**, and **P04a, replacing nested allocation-order calculations with direct snapshot comparisons**. Their observed median reductions were approximately **1.35 seconds / 8.87%** and **1.00 second / 6.42%**, respectively, against relevant controls. Samples are small and timing ranges overlap; these are candidates for review, not guaranteed gains or accepted production changes. They were tested separately; their percentages must not be added.

The more substantial **materialized-balance design did not improve performance**. Its first implementation left balances stale despite receipts reaching Posted. A corrected implementation reconciled in the tested path but was **14.06% slower than the preceding control and 20.87% slower than the subsequent reversal control**.

The test app is now at **1.000038**. Original receipt formulas, the original five-step receipt sequence, reporting availability and original isolation sync settings are restored. Experimental cache columns and hidden helper actions remain as unused lab evidence. The initializer is disabled and its button is hidden.

## Environment and method

| Item | Verified scope |
|---|---|
| Test app | LoanMgr Perf TEST 20260912; 8a96763c-d453-450b-ac00-a8dfb7dbb8a4 |
| Test database | Money Perf TEST 20260912; aWCGib003O4AyK85Q4_KZc |
| Isolation | All ten OLTP table connections verified against the copied database before synthetic writes; four additional copied native tables remain outside OLTP |
| Production | Source snapshot was 3.000045 before copying; this work made no production changes |
| Access | UI only; API remains disabled |
| Automation isolation | Three notification bots and scheduled daily-charge generation disabled; receipt processing retained |
| Original inventory | 212 columns, including 112 virtual columns; Charges originally had 25 columns, including 18 VCs |
| Synthetic workload | One borrower and loan; reusable large charge, followed by five older charges for six-charge allocation tests |
| Evidence volume | 31 server Add timing records, 20 idle sync records, 13 further new-GUI receipt observations; 44 synthetic receipts total, including one repaired failed receipt |

Each receipt paid 100, using a fixed Payment Date of 12 September 2026. The first workload used Single Partial against one eligible charge. The later Lump Sum workload had six eligible charges: the newest received all 100, while five older charges retained zero allocations. This controls allocation shape; it is not a representative distribution of loan values or a load/concurrency test.

Two distinct receipt metrics are reported:
- **Server Add Payments duration:** read from Performance Analyzer for the earlier experiments. This excludes parts of the user experience and can show Success even when the receipt finishes in Error.
- **New-GUI Save-to-visible-Posted:** measured from the Save click to the matching receipt becoming visibly Posted. It includes submission, processing and client propagation. The last observed Processing time is retained as a lower bound in the CSV.

Do not compare or combine these two metrics. New-GUI observation intervals were typically a few seconds; the decimals preserve recorded observations, not millisecond-level certainty about the actual posting instant. Two early new-GUI observations had gaps and were excluded.

**GUI correction:** the bot Test command opened the older Table Data page, which I incorrectly used for cache initialization. Five Success dialogs were observed; a sixth execution was unconfirmed. That page was closed when the owner reiterated the new-GUI-only rule. Subsequent initialization, receipt execution and verification used the new app/editor/database interfaces. Those legacy initialization runs are not new-GUI performance benchmarks. The rule is now recorded in AGENTS.md.

## Small expression and reporting experiments

All successful comparison groups below have three receipt samples.

| Experiment | Relevant control median (s) | Candidate median (s) | Observed change | Assessment |
|---|---:|---:|---:|---|
| P01a: skip eligibility calculation once receipt is Posted | 15.181, restored control | 13.834 | 1.347s / 8.87% faster | Most promising small change; review broader workflows |
| P01c: reuse stored allocation helpers only after Posted | 15.181 | 14.516 | 0.665s / 4.38% faster | Small and inconclusive |
| P02a: Posted Amount uses existing Related Repayments list | 15.181 | 14.932 | 0.249s / 1.64% faster | No dependable gain established |
| P03a: Statistics row filter FALSE | 15.181 | 16.064 | 0.883s / 5.82% slower | Do not adopt for speed |
| P04a: direct snapshot predecessor comparison | 15.582, six-charge control | 14.582 | 1.000s / 6.42% faster | Promising allocation simplification |
| P03b: remove Statistics definition and dependent views | 16.467, fresh control | 15.365 | 1.102s / 6.69% faster | Modest diagnostic result, not a complete reporting migration |

P01a was also 16.50% faster than the earlier initial baseline of 16.568 seconds. Both comparisons are retained because the control itself changed over time. The more conservative restored-control comparison is the main figure above.

### P01a — avoid work on completed receipts

The candidate wraps the original Payments Eligible Charges expression with:

    IF([Status] = "Posted", LIST(), <original SELECT>)

Processing and Error receipts retain their original eligibility logic. The hidden Eligible Outstanding dependent becomes zero for Posted receipts. Three single-charge receipts Posted with expected amounts. Original expression restored at 1.000005.

Before production consideration, verify that every action/view consuming eligibility on a Posted receipt tolerates an empty list, and test full, partial, loan-close and retry paths. No combined P01a/P04a benchmark or concurrent-user test was performed.

### P04a — remove a nested calculation from allocation ordering

Inside Calculated Amount, the candidate replaces:

    [Calculated Order] < [_THISROW].[Calculated Order]

with the equivalent immutable snapshot comparison:

    OR(
      [Charge Date Snapshot] > [_THISROW].[Charge Date Snapshot],
      AND(
        [Charge Date Snapshot] = [_THISROW].[Charge Date Snapshot],
        [Charge Row Number Snapshot] > [_THISROW].[Charge Row Number Snapshot]
      )
    )

The six-charge population, zero allocations, posting guards and reconciliation rules remain intact. The original formula was restored. A local correctness script passed 114 ordering/amount equivalence checks, including ties and cross-payment separation; this is not a substitute for live timing or concurrency testing.

### Rejected P01b — freezing too early

Using Allocation Order > 0 as the signal to reuse stored calculated values produced a 12.306-second Add operation but a failed receipt: order was 1 while stored allocated components were zero, and no repayment was posted. This is not a speedup.

The original formulas were restored. Only the unposted synthetic allocation marker was reset, then the existing Retry action recovered the receipt to Posted with one repayment of 100 and both differences zero. The separate recovery Edit took 10.575 seconds and is excluded from Add medians. This regression was introduced by the experiment; it is not evidence that the original production formula has this failure.

### Reporting separation

Removing only Statistics rows showed no benefit. Removing the complete Statistics app definition removed 26 columns, including 23 VCs, but initially made the app non-runnable because two views still referenced it. No receipt was submitted in that invalid version.

After removing those views, three receipts Posted. Associated format rules and two table-bound actions were also affected, including the manual charge-generation entry point. The complete original definition was restored through version history, producing 1.000022. Therefore the 6.69% result is a cost diagnostic, not a deployable migration. Heavy calculations elsewhere in Borrowers, Loans and Charges remained; this experiment does not quantify complete analytics separation.

## Sync settings

Five explicit non-preview idle syncs per condition; P04a remained unchanged across these comparisons.

| Configuration | Median server sync (s) | Comparison |
|---|---:|---|
| Cache OFF; delta OFF; quick ON | 1.428 | Control |
| Cache ON; delta OFF; quick ON | 1.268 | 0.160s / 11.20% faster |
| Cache ON; delta ON; quick ON | 1.352 | 6.62% slower than cache-ON control |
| Cache ON; delta OFF; quick OFF | 1.312 | 3.47% slower than cache-ON control |

Server caching was already ON in the reviewed production snapshot, while the copy initially had it OFF. The measured caching difference is therefore not an additional unimplemented production gain. Neither delta ON nor quick OFF demonstrated a speed advantage. One uncertain cache-on click was excluded and replaced by another confirmed observation.

A direct copied-database Notes change appeared after explicit delta sync, and its restoration also appeared. This checks basic propagation only, not all date-dependent or cross-table VC freshness. AppSheet documents restrictions around caching and delta/quick sync dependencies. [Official sync guidance](https://support.google.com/appsheet/answer/10107724?hl=en)

Idle sync timings were much shorter than receipt-processing timings in these tests. This suggests that sync toggles alone are unlikely to solve the observed receipt delay; it is not a precise decomposition of the receipt's execution time.

## Structural test: stored charge balances

The owner approved two test-only physical Price columns: Perf Cached Principal Paid and Perf Cached Interest Paid. All 25 original Charges column key/type/label/formula/qualifier definitions were checked after regeneration. The two additions are hidden and nonsearchable; they must remain writable for data-action assignments.

Initialization ultimately reconciled all copied Charges in the new GUI: zero missing and zero mismatched caches. The initial all-row client action had crashed its browser, so initialization was changed to bounded server batches. A new-app button updated a non-key Statistics marker to request a batch. The marker was subsequently restored to MAIN and the initializer disabled.

The candidate read populated caches, with original SUM fallback for blanks. It refreshed every charge for the receipt borrower before creating snapshots and again after posting, preserving the original freeze, posting, reconciliation and loan-closing guards. Thus maintenance cost is included.

| New-GUI workload | Observed durations (s) | Median (s) | Outcome |
|---|---|---:|---|
| Original path, before candidate | 23.102, 20.420, 23.457 | 23.102 | Posted |
| P09a: refresh from Related Repayments | 23.338, 26.709 | Not a valid optimization result | Posted, but cache stale |
| P09b: refresh using direct Repayments SELECT sums | 27.909, 24.660, 26.350 | 26.350 | Tested receipts Posted and cache reconciled |
| Original path, restored afterward | 21.801, 22.216, 17.561 | 21.801 | Posted; latest financial reconciliation verified |

### Why P09a failed

After two receipts, native cached interest was 3700 while the expected ledger total was 3800; the independent GUI check showed one mismatch. The receipt itself still had one repayment, planned/posted 100 and both differences zero. The post-posting related-row list appears to have retained the earlier row population within the grouped sequence. This is an inference supported by the observed lag and the successful direct-table correction.

The preflight refresh did correct stale balances before allocation, but the form initially displayed the stale amount. Therefore a Posted status alone cannot certify either a cache's accuracy or the freshness of the amount shown to a user.

### P09b corrected the tested lag, but was slower

Refresh assignments were changed to:

    SUM(SELECT(Repayments[Principal Paid], [Ref Charges] = [_THISROW].[Row ID]))
    SUM(SELECT(Repayments[Interest Paid], [Ref Charges] = [_THISROW].[Row ID]))

The new-GUI independent check showed zero missing/zero mismatched caches after the first and final receipts. Intermediate next-form balances matched expected ledger progress. The final receipt had one repayment, planned/posted 100 and both differences zero.

The corrected median was 3.248 seconds / 14.06% slower than the preceding control, and 4.549 seconds / 20.87% slower than the subsequent control. **Do not adopt this implementation for performance on the measured workload.** This does not prove every possible materialization architecture is slower. External writers, interrupted refresh, concurrent posting and broader allocation modes remain uncertified.

## What has not been verified

These are unverified hypotheses or excluded workloads, not quantified improvement recommendations:

| Area | Limit of this round |
|---|---|
| Notification waiting | Notification bots remained disabled; no live email/SMS delivery benchmark |
| Scheduled generation/catch-up | Scheduled bulk workloads were not exercised |
| Complete operational working-set filtering | No history filter was accepted that could omit balances or break references |
| Full analytics/worker split | Only the Statistics-removal diagnostic was measured |
| SQL or transactional posting service | No provisioned test backend/integration; no AppSheet-to-SQL performance claim |
| Scale and contention | No multi-user load, concurrent receipt, large fan-out or representative mobile/offline test |
| Combined small changes | P01a and P04a tested separately; no additive or combined gain claimed |

The run crossed Bangkok midnight; fixed payment dates and reversal controls reduce but do not eliminate TODAY-based and time-of-run effects. Historical data was retained and synthetic receipt history grew. Samples were sequential, not randomized. These limits prevent a production-wide percentage guarantee.

## Review and next decision

1. Review P01a and P04a as the only small-change candidates with a useful measured signal in this round. They require broader workflow acceptance before any production implementation.
2. Reject P01b and P09a on correctness. Do not adopt P09b, Statistics row filtering, delta ON or quick OFF for speed on this evidence.
3. Do not justify a fundamental database migration from these results. No significant structural speedup has been demonstrated.
4. If accepting a candidate for a further test round, cover Single Full/Partial, Receive All/Lump Sum, Loan Close/First-day Auto, retry after interruption, duplicate/concurrent execution, zero allocations and mobile/offline freshness. This is still test-environment work; production implementation needs the owner's separate approval.

## Final state, rollback and evidence

At verified test version **1.000038**, the original two paid-component SUM formulas and original five-step receipt sequence are restored. Earlier P01/P02/P04 formulas and Statistics availability were already restored. Cache OFF, delta OFF and quick ON match the copy's isolation settings. API remains disabled. Notification and scheduled-generation isolation remain in place.

The copied database retains the synthetic evidence and two unused cache fields. Those cache values are historical experiment results and are no longer maintained or used as balances. Hidden cache helper actions remain; the initializer bot is disabled and its trigger button hidden. Statistics ID is MAIN. Final synthetic payment total **4400** was visible in the new client; the latest receipt had one repayment and both differences zero.

Useful rollback points: 1.000003 isolation baseline; 1.000022 pre-schema app definition; 1.000032 original-path control with unused cache schema; 1.000035 corrected cache candidate; 1.000038 restored final state. App-version restoration does not undo database rows or remove physical columns. Preserve synthetic evidence; do not restore or delete production objects.

Evidence files in this folder:
- receipt-timings.csv — 31 earlier server Add observations.
- sync-timings.csv — 20 explicit idle sync observations.
- new-gui-receipt-timings.csv — 13 new-GUI observations with exclusions and Processing lower bounds.
- benchmark-summary.json — recalculated counts, medians and comparisons.
- lab-config.json — exact experimental definitions and current state.
- MATERIALIZED_BALANCE_TEST_PROPOSAL.md — approved design and observed outcome.

The data-model overview and workbook's OLTP Performance Lab sheet document the clone separately from production. The dated Markdown change log records versions, failures, recovery and rollback details. Results are ready for review; no production change has been accepted or implemented.
