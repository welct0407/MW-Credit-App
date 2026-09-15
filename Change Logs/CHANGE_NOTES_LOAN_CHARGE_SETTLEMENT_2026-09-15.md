# Loan charge settlement — 2026-09-15

## Scope and purpose

Applied the owner's approved settlement to one borrower's four active production loans. The borrower will now have one open settlement charge on each loan, with the four open charges totaling THB 36,000. Existing posted payments and fully paid historical charges were preserved.

No AppSheet configuration, schema, formula, slice, view, automation, or Looker Studio object changed. This is a production business-data correction in the shared PostgreSQL `Loans`, `Charges`, `Payments`, `Payment Allocations`, and `Repayments` workflow.

## Rollback points

| Consumer | Version recorded before the data update | Configuration changed? |
| --- | ---: | --- |
| Loan Manager ผู้จัดการสินเชื่อ (OLTP) | 3.000094 | No |
| Loan Business Insights (OLAP) | 1.100062 | No |

The exact before-image rows were exported before the transaction to the private project credential/document area at `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\pond-settlement-20260915`. The private export contains the affected borrower's loans, charges, repayments, payments, and payment allocations. It is intentionally excluded from Git because it contains production financial data.

## Implemented change

- Confirmed all four loan-level `Auto Charge Enabled` flags were already false and left them false.
- Reused each loan's unallocated 2026-09-15 charge as its open settlement charge.
- Allocated the agreed THB 21,000 interest in proportion to the original principal amounts (3:2:5:5), while assigning all THB 15,000 outstanding principal:

| Loan principal | Settlement principal | Settlement interest | Open charge total |
| ---: | ---: | ---: | ---: |
| THB 3,000 | THB 3,000 | THB 4,200 | THB 7,200 |
| THB 2,000 | THB 2,000 | THB 2,800 | THB 4,800 |
| THB 5,000 | THB 5,000 | THB 7,000 | THB 12,000 |
| THB 5,000 | THB 5,000 | THB 7,000 | THB 12,000 |
| **Total** | **THB 15,000** | **THB 21,000** | **THB 36,000** |

- Reduced the only partially paid historical charge from THB 420 to THB 200 so it exactly matches its existing THB 200 repayment and is fully paid.
- Removed seven unpaid daily charges superseded by the settlement and six linked zero-value allocation placeholders. The removed rows had no repayments and no nonzero allocation.
- Retained all fully paid historical charges, all ten posted payment records, all 23 repayment records, and the borrower's THB 9,020 received-to-date history.
- Added an audit note to each settlement charge with its principal/interest split and the superseded charge references. Added a note to the adjusted THB 200 historical charge describing the correction.

## Checks performed

- Executed the production change as one PostgreSQL transaction with table locks and precondition checks. Two earlier attempts stopped and rolled back before any mutation when a stored-status predicate and zero-allocation placeholders did not match the initial assumptions.
- Verified after commit that exactly four open charges remain for the borrower, exactly one per loan.
- Verified the open balances total THB 36,000: THB 15,000 principal plus THB 21,000 interest.
- Verified no affected charge is overpaid and every automatic-charge flag remains false.
- Synced the current OLTP app and visually confirmed the four open charges as THB 7,200, THB 4,800, THB 12,000, and THB 12,000. The app also shows the adjusted historical THB 200 charge as fully paid and retains the existing received totals.
- Synced the current OLAP app and visually confirmed the shared charge data on a representative THB 5,000 loan: one THB 12,000 open charge and the prior fully paid charges retained.
- Looker Studio was not separately audited because no report configuration changed. Its governed source will receive the shared PostgreSQL values on its normal refresh.

## Manual testing requested

1. Open the borrower in Loan Manager and confirm each of the four loans has only one charge with an outstanding amount.
2. Confirm the four outstanding amounts are THB 7,200, THB 4,800, THB 12,000, and THB 12,000, totaling THB 36,000.
3. Confirm the THB 3,000 loan's 2026-09-11 historical charge shows THB 200 paid and zero remaining.
4. Confirm historical received totals still equal THB 9,020 and no principal repayment was created.
5. After the next scheduled charge run, confirm no new daily charge is generated for any of the four loans.
6. In Loan Business Insights, confirm the same four settlement amounts after sync and review any directly affected borrower or loan analysis.

## Status and rollback

Status: implemented and technically verified; owner manual acceptance is pending.

To roll back the data correction, use a transaction to restore the five modified charge rows and reinsert the seven removed charge rows and six removed zero-value allocation rows from the private before-image CSV files. Re-run the same one-open-charge, payment, allocation, and repayment reconciliation checks before committing, then sync both apps. App version restoration is unnecessary because no app definition changed; versions 3.000094 and 1.100062 remain the recorded configuration rollback references.
