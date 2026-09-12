# OLTP performance laboratory

**Status: experiments in progress. No production changes or production acceptance.**

User requested a copied OLTP app/database, UI-only performance experiments, quantified results and review before any production implementation. This document retains unsuccessful experiments as well as promising ones. Results below are preliminary, not a completed evaluation of all earlier proposals.

## Environment and controls

- App: LoanMgr Perf TEST 20260912, `8a96763c-d453-450b-ac00-a8dfb7dbb8a4`.
- Separate native database: Money Perf TEST 20260912, `aWCGib003O4AyK85Q4_KZc`. All ten OLTP table connections verified before writes. Four additional copied tables remain outside OLTP.
- Source OLTP version 3.000045 remains unchanged. Clone isolation baseline 1.000003. Notifications and scheduled daily charge generation disabled; receipt bot retained. API disabled by the user's selection.
- Fixture PERF-UI-SINGLE-001: one synthetic borrower, one daily-interest loan, one charge with initial interest/principal due 100,000 each. Automatic charges off. Each benchmark receipt pays 100 interest using Single Partial, leaving one eligible charge throughout. This deliberately large reusable balance controls row shape; it is not a typical loan-value distribution.
- AppSheet Performance Analyzer Add Payments durations are server-operation timings. They are not tap-to-confirmed-Posted timings. The analyzer can report Success while the receipt itself ends in Error; receipt state and reconciliation must be checked separately.
- Small sequential samples, three runs per successful variant so far. Original history is retained; test receipts increment history. The run crossed Bangkok midnight, which can affect TODAY-based analytics even though all receipt Payment Dates were fixed at 12 September. Reversal controls after midnight reduce, but do not eliminate, temporal confounding.
- Clone server caching was OFF after copying (reviewed production was ON); delta OFF, quick ON, start sync ON, delayed ON, automatic updates ON. No claim that the baseline is an identical production configuration.

## Results recorded so far

| Experiment | Clone version | Server durations (s) | Median (s) | Outcome |
|---|---|---|---:|---|
| Initial baseline | 1.000003 | 16.166, 21.237, 16.568 | 16.568 | Three Posted receipts; expected balances |
| P01a: skip eligibility scans for Posted receipts | 1.000004 | 14.165, 13.834, 13.012 | 13.834 | Three Posted receipts; expected balances |
| Original eligibility restored | 1.000005 | 14.425, 15.181, 16.574 | 15.181 | Three Posted receipts; expected balances |
| P03a: Statistics row filter FALSE | 1.000006 | 16.064, 15.108, 17.278 | 16.064 | Three Posted receipts; no improvement shown |
| P01b: use frozen helpers when order > 0 | 1.000008 | 12.306 | Not a valid posting benchmark | Receipt Error, no repayment; rejected |
| P01c: use stored helpers only for Posted receipts | 1.000010 | 15.224, 13.461, 14.516 | 14.516 | Three Posted receipts totaling 300; broader tests pending |
| P02a: use existing Related Repayments list | 1.000012 | 13.818, 16.052, 14.932 | 14.932 | Three Posted receipts; original restored at 1.000013 |
| Six-charge Lump Sum baseline | 1.000013 | 17.355, 15.582, 14.097 | 15.582 | Three Posted; one positive and five zero allocations |
| P04a: direct snapshot predecessor comparison | 1.000014 | 15.876, 14.582, 14.435 | 14.582 | Three Posted; 6.42% lower median, overlapping ranges |
| Restored control for reporting removal | 1.000018 | 17.194, 13.699, 16.467 | 16.467 | Three Posted six-charge receipts |
| P03b: remove Statistics table and dependent views | 1.000020 | 17.262, 15.365, 15.341 | 15.365 | Three Posted; 6.69% lower median, overlapping ranges |

P01a reduced the median by **2.734 seconds (16.50%)** against the initial baseline, or **1.347 seconds (8.87%)** against the restored control. Both comparisons must be shown because the control itself varied. This is promising single-charge evidence, not a guarantee or proof across allocation modes and scale.

P03a was **0.883 seconds (5.82%) slower** than the preceding control. Filtering reporting rows did not establish a benefit. This diagnostic is narrower than removing reporting definitions and all historical dependencies; it does not establish that complete analytics separation would fail or succeed.

P01b must not be presented as a 12.306-second successful receipt. Its allocation had Order=1, stored interest/principal/amount all zero, and the payment was Error with both allocation and posting differences of 100. The proposed gate apparently becomes true before the freeze operation has populated the stored components. The original four formulas were restored at 1.000009. Only the unposted synthetic allocation marker was reset to zero; existing Retry then posted 100 with one repayment and both differences zero. This recovery took a separate 10.575-second Edit operation and is excluded from Add medians.

P01c uses a safer gate: reuse stored helpers only when the parent receipt is Posted, keeping original Processing/Error calculations. Its median was **0.665 seconds (4.38%) below** the earlier restored control. This small difference could include server variation and does not establish a dependable improvement. All three matched the unique test prefix, were Posted and totaled 300. Results from further experiments will be added as they complete.

## Review standard

### Synchronization settings: five explicit idle syncs per condition

| Configuration | Version | Median server sync (s) | Change versus relevant control |
|---|---|---:|---|
| Cache OFF, delta OFF, quick ON | 1.000014 | 1.428 | Control |
| Cache ON, delta OFF, quick ON | 1.000015 | 1.268 | 0.160s / 11.20% lower |
| Cache ON, delta ON, quick ON | 1.000016 | 1.352 | 0.084s / 6.62% slower than 1.000015 |
| Cache ON, delta OFF, quick OFF | 1.000017 | 1.312 | 0.044s / 3.47% slower than 1.000015 |

P04a was unchanged across these settings comparisons. Initialization, editor-preview syncs, and the uncertain CACHE-ON-02 click were excluded; five other cache-on observations were matched to explicit UI clicks. Raw timings are in sync-timings.csv. These small samples have overlapping ranges and measure idle server sync, not another user's propagation delay, mobile offline behavior, or receipt-bot execution. Server caching was already enabled in reviewed production, so the measured clone difference is not an unimplemented production gain. Neither delta ON nor quick OFF showed a speed advantage.

Under delta ON, a direct copied-database Notes edit on the synthetic charge became visible after explicit sync; its restoration also became visible. This basic probe does not certify date-driven or cross-table virtual-column freshness. AppSheet documents limits for delta/quick sync with some virtual-column dependencies, and limits server caching to rarely updated read-only data. [AppSheet sync documentation](https://support.google.com/appsheet/answer/10107724?hl=en)

At verified clone version 1.000018, server caching was restored OFF, delta remained OFF, Quick sync restored ON, and the original Calculated Amount expression restored. Other original expressions and Statistics availability remain intact at that rollback point.

P02a was 0.249 seconds (1.64%) below the earlier restored control. This does not establish a reliable speed gain. The third receipt had one repayment, planned and posted amounts 100, and both differences zero. All three were visible as Posted. Original expression restored and version 1.000013 verified.

The next workload adds five synthetic older charges (11 September, interest 100 and principal 0 each) to the same synthetic loan. Together with the original large 12 September charge, Lump Sum receipts of 100 have six eligible charges; newest-first allocation should put all 100 on the original charge and leave five zero allocations. This tests allocation fan-out independently of payment value. Fixture notes PERF-FANOUT-ZERO-01 through 05 were verified in the copied database; combined initial outstanding is 198,600 after the preceding 19 receipts.

A proposal is eligible for recommendation only if it improves the relevant measured workload and preserves posted amounts, allocation order, one repayment per allocation, balances, retry behavior and relevant freshness. A faster failed operation is rejected. A setting that only reduces acknowledgement time must be identified as such. Untested redesigns must not receive invented percentage gains.

The earlier review's remaining opportunities—receipt scan reduction, full analytics separation, snapshot fan-out, notification waiting, sync settings, complete operational working sets and scheduling—remain under investigation. Materialized balances/worker separation and a transactional backend are structural hypotheses; no quantified AppSheet improvement has yet been established for them.

## Evidence and rollback

P03b removed the entire Statistics table definition (26 columns, 23 VCs) from the app, while retaining its physical database table. The first saved version 1.000019 did not load because KPIs and Reporting App Shortcut still referenced it. Removing those two views made 1.000020 runnable; no receipts were benchmarked in the invalid version. AppSheet also affected related format rules and two table-bound actions, including the manual charge-generation entry point. Thus this is a cost diagnostic, not a feature-complete migration. Median receipt time fell by 1.102s (6.69%) versus the fresh control, with overlapping ranges. All three receipts Posted; latest had one repayment, planned/posted 100 and both differences zero. Native version-history restoration of the complete 1.000018 definition produced verified current 1.000022 with Statistics and both views present again. Removing the reporting table did not demonstrate a large reduction in receipt latency.

The owner approved the two cache columns and further necessary isolated testing changes on 13 September. The next materialized-balance experiment is specified in MATERIALIZED_BALANCE_TEST_PROPOSAL.md. No production change or API enablement is authorized by that approval.

P04a removes the nested Calculated Order evaluation from Calculated Amount's predecessor SELECT. It compares snapshot date descending, then snapshot row number descending directly. All snapshot, freeze and reconciliation guards and zero allocation rows remain. The six-charge median fell by 1.000 second (6.42%), with overlapping ranges and only three runs per condition. This is a modest candidate, not a demonstrated major architectural gain. A separate 114-check predicate-equivalence script covers same-date order, equal tuples, another payment and amount boundaries; those checks are correctness checks, not AppSheet performance measurements. Native database evidence for baseline receipt PERF-FAN-BASE-01 showed orders 1 through 6: original charge row 690 received 100 at order 1; older rows 695 through 691 had orders 2 through 6 and all received zero. All three P04a receipts were Posted, and the latest showed one repayment, planned/posted 100, both differences zero.

`receipt-timings.csv` contains sanitized observations; `lab-config.json` contains exact variant expressions and rollback records. The authoritative change log records versions, checks and synthetic recovery. The data-model overview and dictionary maintain a separate performance-lab section, preserving production definitions. No production configuration should be copied from this lab without the requested review and subsequent authorization.

P09 initialization checkpoint: the all-row client backfill crashed the test browser. This attempt has no successful duration or verified completion and is excluded from performance comparisons. The replacement server-side Test UI process limits each run to 100 missing-cache rows; two runs returned Success and initial native rows show stored values. Full initialization, reconciliation, maintenance integration and performance measurement are still pending. Existing balance formulas continue using the ledger.

New-GUI-only correction: the earlier bounded initialization used AppSheet's older Table Data Test page. It was closed after the owner reiterated the GUI restriction. Five Success dialogs were observed; a sixth click was unconfirmed. These initialization runs are not new-GUI benchmarks. Version 1.000028 replaces the failed bulk-client action with a single-row Statistics update trigger for the bounded bot, available in the new app interface. Its first click is not yet confirmed. Original Statistics ID MAIN will be restored when the test trigger is retired.
