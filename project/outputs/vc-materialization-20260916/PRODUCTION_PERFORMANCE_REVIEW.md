# Production VC performance review — 16 September 2026

Read-only Chrome review of the current production OLTP Performance Analyzer, opened through the current editor's Manage > Monitor > Performance Profile. No production configuration or financial records changed.

Source: https://www.appsheet.com/manage/viewLog?perfOnly=true&appId=93844270-6aa5-420b-a960-bcdf08abd357

The aggregate VC graph still shows historical versions 3.000031–3.000074, including removed Collection Bank Accounts fields. Changing the log filter to 15 September 17:00 UTC through 16 September 03:40 UTC did not change those graph labels. Do not treat the historical top-ten graph as a ranking of the current V11/3.000098 app.

The individual non-preview sync at **16 September 2026 03:36:42 UTC** took **3.7401581 s**. Its parallel table read took 3.6244242 s; table durations overlap. Observed costly branches:

| Branch | Seconds | Interpretation |
| --- | ---: | --- |
| Payments: all VCs | 2.2479863 | Includes dependency work |
| Payments.Eligible Charges | 1.7169074 | Best remaining candidate for avoiding repeated scans on historical receipts |
| Payments.Posted Amount | 0.5223005 | Already materialized in DEV phase 4; includes 0.5155960 s dependent repayment read |
| Borrowers: all VCs | 1.7913996 | Multiple dependency branches |
| Borrowers.Active Daily Interest | 0.6834463 | Already materialized in DEV phase 3; includes 0.6702025 s dependent loan read |
| Borrowers.Todays Collection Charges | 0.7573373 | Direct borrower branch |
| Statistics.Borrowers Fully Paid Today | 1.3774435 | Includes nested Todays Collection Charges at 1.3671539 s, with a 0.6024632 s charge-row read |

These are inclusive trace timings, not independent savings. Do not add them together or promise their full removal from wall-clock sync. Database reads for Loans, Charges and Repayments each took about 1.86 s in parallel, which also limits gains from reducing VCs.

## Proposed next experiments — not implemented

1. **Skip eligibility for posted receipts.** Review every consumer of Payments.Eligible Charges and Eligible Outstanding, then test a status gate returning an empty list for Posted rows. Keep current live eligibility for new forms and legitimate retry/error states. The SQL payment engine remains authoritative. This avoids storing a time-dependent eligibility list and preserves unsaved form feedback. Inspect legacy action conditions, validations and detail headers before changing the expression.
2. **A shared daily collection summary.** Replace repeated borrower-wide SELECT scans with a curated SQL result by borrower and Bangkok business date, feeding Today's Due/Collected/Remaining and the Statistics fully-paid count. Preserve existing population logic: overdue unpaid charges, fully paid today, and any repayment today. Trigger-only refresh is insufficient because TODAY changes without a write: use a date-aware SQL view or an explicitly refreshed summary with a midnight schedule and visible as-of cutoff. Payment edits/reassignments must refresh old and new borrowers. Keep relationship/navigation lists where needed.
3. **Stable Statistics totals.** The original phase 5 remains a possible small follow-up. Measure the current dependency chain after DEV phases 1–4 before adding more caches; several totals are now cheap sums of stored borrower/loan values.

Loans.Last Interest Charge Date remains a VC: `MAX(SELECT([Related Charges][Charge Date], [Charge Date] <= TODAY()))`. It is a further candidate for the same date-aware SQL strategy; a future-dated charge can become eligible at midnight without a write. Its historical chart cost is not evidence of its current isolated cost, so remeasure before prioritizing it. Collection Bank Accounts relationship VCs belong to the historical model. Charges.Principal Remaining, Charges.Amount Remaining, Payments.Planned Allocation Amount, Borrowers.Active Daily Interest and Payments.Posted Amount are already addressed by the DEV implementation. Charges.Amount Due remains a lightweight interactive VC.

Before promoting or extending anything: repeat representative measurements using current versions and the same dataset, and retain current-GUI correctness checks. The DEV end-to-end benchmark and this production server trace measure different things and use different datasets, so their absolute durations are not comparable.
