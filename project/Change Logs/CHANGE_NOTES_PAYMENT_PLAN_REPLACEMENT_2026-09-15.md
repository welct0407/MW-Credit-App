# Payment plan replacement — 2026-09-15

## Scope and purpose

Applied the owner's approved replacement payment plan to one borrower's eight active production loans. The supplied schedule records THB 3,000 paid on 2026-09-10 and THB 2,000 paid on 2026-09-14, followed by THB 3,000 every three days from 2026-09-16 through 2026-10-28.

No AppSheet configuration, schema, formula, slice, view, automation, or Looker Studio object changed. This was a production business-data update to existing shared PostgreSQL charge rows plus the additional charge rows needed to extend the plan.

## Rollback points

| Consumer | Version recorded before the data update | Configuration changed? |
| --- | ---: | --- |
| Loan Manager ผู้จัดการสินเชื่อ (OLTP) | 3.000094 | No |
| Loan Business Insights (OLAP) | 1.100062 | No |

Exact before and after rows and the final aggregate schedule are stored outside Git at `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\puifai-plan-replacement-20260915`. The private evidence contains production financial data and is intentionally excluded from the repository.

## Implemented change

- Preserved the two posted payments: THB 3,000 on 2026-09-10 and THB 2,000 on 2026-09-14.
- Replaced the prior THB 41,000 outstanding schedule with 15 future payment dates totaling THB 45,000. Each date has exactly THB 3,000 outstanding: 2026-09-16, 09-19, 09-22, 09-25, 09-28, 10-01, 10-04, 10-07, 10-10, 10-13, 10-16, 10-19, 10-22, 10-25, and 10-28.
- The resulting agreement totals THB 50,000 including the two payments already received.
- Preserved THB 27,801 outstanding principal. The THB 4,000 increase over the prior remaining agreement was assigned to interest, producing THB 17,199 future interest.
- Distributed the additional interest across the eight loans in proportion to original loan principal. Distributed each loan's remaining principal and interest across all 15 dates with whole-baht rounding while holding every borrower-level date to exactly THB 3,000.
- Reduced two partially paid charges to their existing repayment components so they remain as fully paid historical charges. One earlier October 4 deferral was restored to its September 10 payment date because the replacement plan supersedes that deferral.
- Reused 63 existing unpaid charge rows and inserted 57 additional rows to extend the plan. No charge, payment, payment-allocation, or repayment row was deleted.
- Confirmed `Auto Charge Enabled` remains false on all eight loans.

## Checks performed

- Ran the production update in one PostgreSQL transaction with locks, exact precondition checks, deterministic whole-baht allocation, and final assertions before commit.
- Verified 120 open charge rows: eight loan-level charge rows on each of 15 dates.
- Verified each date totals THB 3,000 outstanding and the future schedule totals THB 45,000.
- Verified future balances are THB 27,801 principal and THB 17,199 interest.
- Verified the schedule begins on 2026-09-16, advances in three-day intervals, and ends on 2026-10-28.
- Verified the two posted payments and all eight disabled automatic-charge flags remain unchanged.
- Synced the current OLTP app and visually confirmed the extended future charge sequence through 2026-10-28 on a representative loan, with the loan's paid history retained and automatic charge disabled.
- Synced the current OLAP app and visually confirmed the same representative loan and future sequence through 2026-10-28.
- Looker Studio was not separately audited because no report configuration changed. Shared data will flow through its normal refresh.

## Manual testing requested

1. After syncing Loan Manager, confirm the borrower-level schedule shows THB 3,000 on every listed date from 2026-09-16 through 2026-10-28 and no other outstanding date.
2. Confirm the future total is THB 45,000 and the two paid rows remain THB 3,000 on September 10 and THB 2,000 on September 14.
3. Open several of the eight loans and confirm the charge parts on a date add to the borrower-level THB 3,000.
4. Confirm no duplicate or new daily charge appears after the next scheduled charge-generation run.
5. Sync Loan Business Insights and confirm the same future dates and loan-level balances.

## Status and rollback

Status: implemented and technically verified; owner manual acceptance is pending.

For rollback, use one transaction to delete the 57 rows present only in `charges-after.csv`, then restore every modified charge row from `charges-before.csv`. Reconcile charge totals to payments and repayments before committing, then sync both apps. App version restoration is unnecessary because no app definition changed; versions 3.000094 and 1.100062 remain the configuration rollback references.
