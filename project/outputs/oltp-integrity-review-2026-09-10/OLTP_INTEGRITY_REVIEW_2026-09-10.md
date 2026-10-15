# OLTP audit and data-integrity review

Completed: 10 September 2026, 23:01 Bangkok (16:01 UTC).

## Conclusion

No evidence of duplicate financial posting, broken financial references, or inconsistent payment balances attributable to the six reviewed email alerts was found. The two payment requests completed successfully, with later retries returning cached successes. The cancelled borrower deletion succeeded on retry; no remaining references to the deleted records were found.

This is a read-only review of the observed current state and targeted audit windows, not a guarantee about all historical activity or external bank receipts. No app configuration, database records, automations, or dashboard settings were changed.

## Sources and scope

- Six AppSheet alert emails and the corresponding OLTP audit-history operation details, including original requests and successful retries.
- Current OLTP app version **3.000044**; alert operations reported version **3.000042**.
- All ten tables available in the OLTP data preview: **1,509 rows**. Each table was below the preview's 1,000-row limit.
- Independent native AppSheet database inspection of all six core tables: **1,503 rows**. The complete native row-key sets matched the OLTP previews exactly.
- Browser reads were sequential, not an atomic database snapshot. Findings describe the records observed during this review.
- Raw email bodies, personal details, bank-account details, and unrestricted row exports are deliberately not included in this report.

| Table | OLTP rows | Native database key comparison |
| --- | ---: | --- |
| Borrowers | 28 | Exact match |
| Loans | 56 | Exact match |
| Charges | 638 | Exact match |
| Payments | 81 | Exact match |
| Payment Allocations | 143 | Exact match |
| Repayments | 557 | Exact match |
| Statistics | 1 | OLTP preview checked |
| Partners | 2 | OLTP preview checked |
| Collection Settings | 1 | OLTP preview checked |
| Collection Bank Accounts | 2 | OLTP preview checked |

## Alert outcomes

All times below are Bangkok time on 10 September 2026.

| Case | Audit evidence | Current financial result |
| --- | --- | --- |
| Payment A, amount 200 | Original request started 15:26:25 and succeeded in 15.753 seconds. Duplicate-request alerts followed at 15:26:32, 15:26:34, and 15:26:36. Retry at 15:26:48 returned `ReturnedFromCache: true`, `Result: Success`. | One Posted payment; one allocation and one repayment. Received, allocated, and posted amounts all 200; both difference fields zero. |
| Payment B, amount 300 | Original request started 15:26:49 and succeeded in 16.733 seconds. Duplicate-request alerts followed at 15:26:58 and 15:27:01. Retry at 15:27:09 returned cached Success. | One Posted payment; two allocations and two repayments. Received, allocated, and posted amounts all 300; both difference fields zero. |
| Synthetic Lisa borrower deletion | Request started 00:09:00 and was cancelled after 120.075 seconds during locking/cache invalidation/cascade processing. The same request and row payload retried at 00:11:01 and succeeded in 13.369 seconds. A successful sync followed at 00:12:01. | Borrower, both loans, and all 11 payments listed in the original parent payload are absent. No remaining references to those keys were found in the core tables. |

The payment evidence supports successful duplicate-request protection. The precise reason for client retries was not established. The deletion evidence supports eventual completion; a complete independent pre-deletion child-row snapshot was not available, so every historical deleted child cannot be reconstructed from this review.

## Integrity results

- All ten OLTP tables: no blank or duplicate row keys.
- Core relationships: no broken nonblank borrower, loan, charge, payment, or allocation references. Repayments had no half-linked payment/allocation pairs.
- All 81 payments are Posted; none is Processing or Error. Received amounts reconcile per payment to allocations and linked repayments. Each population totals **33,410 baht**; posting and allocation differences are zero.
- All 143 allocations reconcile interest plus principal to allocated amount and to their linked repayment amounts. No allocation has multiple repayment postings. The 34 zero-value allocations have no repayment posting.
- The 109 payment-linked repayments reconcile to their payments and allocations. The other 448 historical repayments have both payment and allocation references blank and remain included in loan/charge reconciliation.
- Repayment charge-to-loan, allocation-to-charge/payment, and payment borrower-to-loan borrower relationships agree.
- Each charge's received principal and interest agree with linked repayments. Amount due agrees with principal plus interest due. Remaining amounts agree with the displayed due/paid logic; no overpaid charges were found.
- Each loan's received principal and interest agree with linked repayments. Principal received does not exceed original principal. Outstanding principal agrees with the displayed prototype calculation.
- Loan and borrower outstanding principal reconcile per borrower; loans, borrowers, and the OLTP Statistics summary total **104,004 baht**.
- No duplicate charge groups by loan and charge date, or duplicate payment groups by borrower, payment date, creation time, amount, and method were found. These are specific duplicate screens, not proof that every possible business duplicate is absent.
- No nonpositive payment amounts or negative allocations were found.
- Native database values also match OLTP values for payment amount/status, loan principal, charge interest/principal due, repayment interest/principal, and allocation interest/principal/total: zero mismatches. Numeric comparisons use the displayed precision, without currency conversion.
- Default, override, and effective collection-bank references checked resolve to active records.

Two historical negative-interest repayment entries are offset by principal entries and carry explicit default/loss adjustment notes. They agree with the corresponding closed/defaulted loans and recorded losses under the prototype's existing logic. They were not treated as new alert-related corruption or modified.

## Separate follow-up

One enabled borrower has an incomplete Instagram collection setup. The app's `Collection Setup Issues` field requests a verified conversation URL and mapping verification. This is separate from the six reviewed audit events; no causal connection to those alerts was established. Verify that mapping manually before relying on its collection route.

No financial repair or request replay is indicated by the reviewed evidence. If external receipt confirmation is required, compare the two affected payment amounts (200 and 300 baht) with their original receipts; bank settlement was outside this review. This task did not perform a comprehensive OLAP or Looker Studio reconciliation, restore test, or live automation execution.
