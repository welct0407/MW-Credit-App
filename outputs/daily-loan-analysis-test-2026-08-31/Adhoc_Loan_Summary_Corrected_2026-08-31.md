# Corrected ad hoc loan analysis — 2026-08-31

## Export verification

- Source workbook: `Loan_Daily_Analysis20260831_025455_066.xlsx`
- Drive file ID: `1NXz4FPF3y8-2io12u74pA5iJp1m0jL_X`
- Export timestamp: `2026-08-31 10:55:00.938` Asia/Singapore
- Template schema: `1.1`
- Populations: 17 Borrowers, 31 Loans, 294 Charges, 252 Repayments, and 27 daily snapshots.
- Referential integrity: 0 Loans without an exported Borrower; 0 Charges without an exported Loan; 0 Repayments without an exported Loan or Charge.
- English-name completeness: 17 of 17 Borrowers have a nonblank `Borrower Name EN` sourced from `Borrowers[Description]`.
- Reconciliation: outstanding principal is THB 69,000 in Statistics, Borrowers, and Loans.

The earlier borrower problem is fixed. Ai, Eve, and Nan are now exported, covering four closed loans with THB 13,000 principal issued, THB 17,100 received, THB 4,100 interest, no remaining principal, and no defaults.

The activity-linked history rule did not add older transactions in this run because the earliest Charge and Repayment is 2026-08-05, while the selected period begins 2026-08-02. The rule executed successfully, but a future test with pre-period history is still needed to prove that branch using live data.

## Business assessment

### 1. Profitability is strong, but revenue and credit risk are concentrated in the same borrower

- Gross borrower profit for the period is THB 82,820.
- Default losses are THB 6,000, leaving THB 76,820 net realized profit. This reconciles to Statistics and the daily analytics series.
- Puifai generated THB 45,120, or 54.5% of gross borrower profit, while also carrying THB 31,000, or 44.9% of outstanding principal.
- Puifai has THB 5,800 overdue across 16 charges, a 0% recent on-time rate, and a maximum delay of 3 days.

Recommendation: treat Puifai as a concentration-management case, not merely the largest customer. Prioritize principal recovery and avoid increasing exposure until the overdue balance and payment behavior improve.

### 2. Delinquency is operationally concentrated

- Total overdue is THB 10,600, equal to 15.4% of outstanding principal.
- All overdue value is held by two borrowers: Puifai (THB 5,800) and Bell (THB 4,800).
- Bell's overdue amount is 160% of her THB 3,000 outstanding principal, with six overdue charges and a maximum delay of 6 days.

Recommendation: use a two-case collection queue. Puifai requires exposure reduction and payment-discipline controls; Bell requires immediate resolution of accumulated interest and a realistic settlement or repayment plan.

### 3. Capital recycling is weaker than headline profit suggests

- Principal issued is THB 97,000; principal returned is THB 28,000; outstanding principal is THB 69,000.
- Total receipts are THB 104,820: THB 28,000 principal and THB 76,820 net interest/profit.
- Only 26.7% of receipts recycled principal; 73.3% came from interest/profit.

Recommendation: add a capital-recovery KPI beside profit: principal returned divided by principal issued, plus principal returned as a share of total receipts. This will prevent high interest income from masking slow recovery of lendable capital.

### 4. The corrected master data reveals a low-risk reactivation segment

- Ai completed two loans; Eve and Nan completed one each.
- Together they repaid THB 13,000 principal and generated THB 4,100 interest with no defaults, no outstanding balance, and 100% lifetime on-time performance.
- These borrowers contributed 5.3% of net realized profit but were previously invisible because they had no current risk or exposure.

Recommendation: create a controlled reactivation list for fully repaid, on-time borrowers. This segment can diversify the portfolio away from Puifai without relying only on new, untested borrowers.

### 5. Today's collection result needs an intraday interpretation

- Exact-date amount due is THB 6,870; collected is THB 0 as of the 10:55 export.
- This is a 0% collection rate, but the export occurred before the end of the business day.

Recommendation: keep the morning summary as a collection plan, then generate an end-of-day result or compare against an explicit daily cutoff before judging performance.

## Priority actions

1. Freeze additional exposure to Puifai until the THB 5,800 overdue balance and recent payment behavior improve.
2. Resolve Bell's THB 4,800 overdue balance with a defined collection or restructuring action.
3. Add gross profit, default loss, and net realized profit as a visible three-step bridge.
4. Track principal recycling alongside profitability.
5. Pilot reactivation offers for Ai, Eve, and Nan under a conservative exposure limit.

