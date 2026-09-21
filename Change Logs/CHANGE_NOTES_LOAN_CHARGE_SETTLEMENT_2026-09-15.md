# Loan charge settlement — 2026-09-15

## 3 October consolidation — 2026-09-21

The owner moved Pond's unpaid THB 5,000 installment from 20 September 2026 into the 3 October schedule, where THB 7,000 was already due. Both charges had zero payments, zero repayments and zero allocations when changed. Because the charges belong to different loans, their immutable identities and loan links were retained so future principal repayments continue to reduce the correct THB 2,000 and THB 3,000 loans. The two charge rows now share 3 October and produce one borrower-level due total of THB 12,000: THB 5,000 principal and THB 7,000 interest.

The remaining plan is THB 12,000 on 3 October, THB 12,000 on 3 November and THB 12,000 on 3 December. Total principal remains THB 15,000, total negotiated interest remains THB 21,000 and total outstanding remains THB 36,000. No payment, repayment, allocation, cash movement, loan balance, historical receipt or AppSheet definition changed.

Before the write, created and restore-tested `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/pond-oct3-combine-before-20260921.dump`, SHA-256 `513BB022A781F334D1256935DC8E9E69F87775068825B4FBE6DB5A08B90C6F45`. The restore matched the normalized `public` and `assessment_lab` schemas, including Flyway V30 history; Cloud SQL cron extension and instance settings are outside the logical-backup scope. Rollback is a locked, preconditioned correction that restores charge `EbDvjdHteTi2HJ4htrAYuM` to 20 September and restores both affected notes from this backup; never restore the whole dump over later production activity without reconciling subsequent writes.

The complete change was rehearsed under a serializable transaction and rollback, then repeated and committed against the verified production tuple `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`. Post-commit SQL confirmed two unpaid loan-linked charges on 3 October totaling THB 12,000, no outstanding 20 September charge, and an unchanged THB 36,000 plan. Production OLTP 3.000240 synced successfully and visibly shows the THB 7,000 and THB 5,000 loan charges both dated 3 October, with automatic charge generation still disabled on both loans. No manual test remains for this refinement.

## Erroneous 18 September loan removal — 2026-09-18

The owner confirmed that Pond's 2026-09-18 THB 3,500 loan was created accidentally and explicitly requested deletion of the loan and its payment. The complete self-contained transaction was removed atomically: loan `YczlTc4YwB0o6hb7IE5TCG`; THB 350 first-day charge; THB 350 Posted First-day Auto payment; its one allocation and one repayment; and the two derived Lisa cash movements (THB 3,500 loan disbursement out and THB 350 payment receipt in). No business expense referenced the loan.

The immutable posted-payment, generated-child and system-cash guards were suspended only for the exact deletion transaction because the owner's requested outcome was removal of the wholly erroneous same-day transaction. Exact borrower, amount, date, status, receiver and dependency preconditions were checked before deletion. Deferred refreshes were forced before commit, all guards were re-enabled inside the transaction, and the commit asserted that all seven records were absent. This was rehearsed successfully in a rolled-back transaction first.

Fresh private pre-write backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/pond-erroneous-loan-delete-before-20260918.dump`, SHA-256 `68F446BB6E15391954361E7B621853310649CDE41356EF336C5AD889F76DFA3E`. The dump restored successfully in isolation and all 19 public-table fingerprints matched production. The standard normalized-schema text comparison retained the already-documented redundant-parentheses rendering difference in `olap_borrowers_analytics`.

Post-commit SQL and production OLTP **3.000173** confirm Pond now has four loans, THB 15,000 total/outstanding principal and THB 9,020 received interest. The 2026-09-18 THB 3,500 loan is absent from the live related-loans list. The four-row future settlement plan remains THB 36,000. Removing the two derived cash rows restored Lisa's current balance to THB 76,331. No other loan, payment, repayment, charge, cash movement, schema, app definition or notification changed.

## Payment-plan refinement — 2026-09-18

The owner replaced the single-date THB 36,000 settlement presentation with this future payment plan:

| Payment date | Scheduled amount |
| --- | ---: |
| 2026-09-20 | THB 5,000 |
| 2026-10-03 | THB 7,000 |
| 2026-11-03 | THB 12,000 |
| 2026-12-03 | THB 12,000 |
| **Total** | **THB 36,000** |

The four existing unpaid settlement-charge identities and loan links were retained. The THB 2,000 loan's charge changed from THB 4,800 to THB 5,000 by changing negotiated interest from THB 2,800 to THB 3,000. The THB 3,000 loan's charge changed from THB 7,200 to THB 7,000 by changing negotiated interest from THB 4,200 to THB 4,000. The two THB 5,000 loan charges remain THB 12,000 each. Total principal remains THB 15,000, total negotiated interest remains THB 21,000, and the plan total remains THB 36,000. None of the four charges had a repayment when rescheduled. Pond's separate 2026-09-18 THB 3,500 loan and its paid first-day charge are outside this plan and were not changed.

A fresh private production backup was created before the refinement at `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/pond-plan-before-20260918.dump`, SHA-256 `9334EE871A678D362A08D526E6A65214A106EC7FB702D1ADF0EFEAEDE9DA451F`. The dump restored successfully in isolation and all 19 public-table fingerprints matched production. The standard normalized-schema text comparison reported one redundant-parentheses rendering difference in `olap_borrowers_analytics`; direct diff confirmed that as the only difference.

The update was rehearsed in a rolled-back transaction, then applied atomically with borrower lock, exact before-state checks, no-repayment checks, deferred refresh execution and a THB 36,000 postcondition. SQL readback confirmed four unpaid rows, zero paid, the requested dates and amounts, and unchanged THB 18,500 borrower outstanding principal. Production OLTP **3.000173** synced successfully: Pond is absent from today's collection, and the linked loan details visibly show 2026-09-20 / THB 5,000, 2026-10-03 / THB 7,000, 2026-11-03 / THB 12,000 and 2026-12-03 / THB 12,000. No schema, app definition, notification, payment, repayment or cash record changed.

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

## Manual testing

1. Open the borrower in Loan Manager and confirm each of the four loans has only one charge with an outstanding amount.
2. Confirm the current outstanding plan is THB 12,000 on 3 October, THB 12,000 on 3 November and THB 12,000 on 3 December, totaling THB 36,000. The 3 October total is represented by separate THB 5,000 and THB 7,000 loan-linked charges so principal settles the correct loans.
3. Confirm the THB 3,000 loan's 2026-09-11 historical charge shows THB 200 paid and zero remaining.
4. Confirm the settlement refinement created no payment or repayment and did not change historical received totals.
5. After the next scheduled charge run, confirm no new daily charge is generated for any of the four loans.
6. In Loan Business Insights, confirm the same four settlement amounts after sync and review any directly affected borrower or loan analysis.

## Status and rollback

Status: the original settlement, 2026-09-18 payment-plan refinement and erroneous same-day loan removal, and 2026-09-21 due-date consolidation are implemented and verified in production. No manual test remains for the 2026-09-21 refinement.

To roll back the data correction, use a transaction to restore the five modified charge rows and reinsert the seven removed charge rows and six removed zero-value allocation rows from the private before-image CSV files. Re-run the same one-open-charge, payment, allocation, and repayment reconciliation checks before committing, then sync both apps. App version restoration is unnecessary because no app definition changed; versions 3.000094 and 1.100062 remain the recorded configuration rollback references.
