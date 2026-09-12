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

P01a reduced the median by **2.734 seconds (16.50%)** against the initial baseline, or **1.347 seconds (8.87%)** against the restored control. Both comparisons must be shown because the control itself varied. This is promising single-charge evidence, not a guarantee or proof across allocation modes and scale.

P03a was **0.883 seconds (5.82%) slower** than the preceding control. Filtering reporting rows did not establish a benefit. This diagnostic is narrower than removing reporting definitions and all historical dependencies; it does not establish that complete analytics separation would fail or succeed.

P01b must not be presented as a 12.306-second successful receipt. Its allocation had Order=1, stored interest/principal/amount all zero, and the payment was Error with both allocation and posting differences of 100. The proposed gate apparently becomes true before the freeze operation has populated the stored components. The original four formulas were restored at 1.000009. Only the unposted synthetic allocation marker was reset to zero; existing Retry then posted 100 with one repayment and both differences zero. This recovery took a separate 10.575-second Edit operation and is excluded from Add medians.

P01c uses a safer gate: reuse stored helpers only when the parent receipt is Posted, keeping original Processing/Error calculations. Its median was **0.665 seconds (4.38%) below** the earlier restored control. This small difference could include server variation and does not establish a dependable improvement. All three matched the unique test prefix, were Posted and totaled 300. Results from further experiments will be added as they complete.

## Review standard

A proposal is eligible for recommendation only if it improves the relevant measured workload and preserves posted amounts, allocation order, one repayment per allocation, balances, retry behavior and relevant freshness. A faster failed operation is rejected. A setting that only reduces acknowledgement time must be identified as such. Untested redesigns must not receive invented percentage gains.

The earlier review's remaining opportunities—receipt scan reduction, full analytics separation, snapshot fan-out, notification waiting, sync settings, complete operational working sets and scheduling—remain under investigation. Materialized balances/worker separation and a transactional backend are structural hypotheses; no quantified AppSheet improvement has yet been established for them.

## Evidence and rollback

`receipt-timings.csv` contains sanitized observations; `lab-config.json` contains exact variant expressions and rollback records. The authoritative change log records versions, checks and synthetic recovery. The data-model overview and dictionary maintain a separate performance-lab section, preserving production definitions. No production configuration should be copied from this lab without the requested review and subsequent authorization.
