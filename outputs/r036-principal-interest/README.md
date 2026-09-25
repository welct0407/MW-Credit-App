# R036 — automatic daily interest after principal repayment

Implemented and verified in DEV on 25 September 2026. R036 remains Open; owner acceptance and production promotion are pending. PROD remains V44 and its apps are unchanged.

## Behavior

Daily-interest loans retain their original rate in the existing **Loan Arrangement** text and automatically update **Current Daily Interest** from remaining principal. No new database column or table was added.

Example: 1,000 baht principal with 10 baht/day retains a 1% daily rate. A 200-baht principal payment leaves 800 baht principal and 8 baht/day. Later repayments reuse the original ratio, avoiding cumulative rounding drift. Interest-only receipts leave the amount unchanged; signed principal corrections restore the corresponding amount. Adjusted daily amounts round to the nearest whole baht, matching the existing payment engine and app display. Full repayment gives zero.

The owner selected the existing manual-update accrual convention: generated charges apply the updated daily amount to the uncharged interval. There is no split by repayment date and no rewrite of posted charges or receipts.

## Original-rate storage and existing loans

New daily-interest loans append a readable note without replacing existing arrangement text:

> [Original daily interest: 10.00 baht/day on 1000.00 baht principal] Original rate: 1.00000000% per day. Daily interest automatically follows remaining principal; retain this note.

The note retains numerator and denominator, so the calculation does not derive a new rate from a rounded current amount. PostgreSQL restores the note if a stale app save omits it and rejects a conflicting edited ratio. Other arrangement text remains editable. Once the note exists, the stored daily amount is database-controlled; intentional original-rate changes require a separately reviewed correction.

There is **no bulk update of backlog amounts or arrangement text**. An existing loan acquires its note on a future principal-total change. The preferred basis is its single positive zero-principal charge on the loan date, less its recorded transfer fee, divided by original principal. This follows the owner's authorization to infer the rate from historical transactions. If first-day evidence is unavailable, the fallback preserves daily amount / outstanding principal immediately before the new repayment. The explanation names the source. Zero/blank-interest setups without a positive basis remain unchanged; an otherwise unusable basis raises a review error rather than dividing by zero.

Historical inference assumes the first-day charge and recorded transfer fee reflect the original agreement. A later fee edit or intentional concession cannot be independently reconstructed from those fields. At investigation, all 11 open partially repaid daily-interest PROD loans had a positive single first-day candidate; 9 current daily amounts differed from the candidate's proportional amount. These observations triggered no backlog correction.

## Implementation and app impact

- Immutable [V45](../../database/migrations/V45__automatic_daily_interest_after_principal_payment.sql) adds three helpers and replaces `vc_loan_row()`. Existing borrower locks and transaction-deferred repayment refresh remain. The calculation follows authoritative signed repayment totals; expected daily interest and borrower aggregates stay consistent.
- DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`: **1.000085 → 1.000086**. Two properties on `Loans.Current Daily Interest` changed: Valid If permits calculated zero when the rate note exists; Editable If prevents manual changes once the note exists. Required/Show conditions, binding and formulas are unchanged. No schema regeneration.
- DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`: **1.000033**, unchanged. Its read-only detail consumes the updated amount.
- Fixed-interest/installment calculations, notifications, schedules, reporting definitions and posted charge amounts are unchanged. Existing OLAP/report providers consume the changed current amount.

Both DEV apps remain Deployed and both final saved editors reported **No issues found**. The owner was notified before the small OLTP change. [Saved expressions and GUI results](app-verification.json) · [Exact live DEV SQL](development-routines.json).

## Verification

- Full `scripts/database/Test-CI.ps1`: empty migration rebuild, validation, repeat no-op, checksum rejection, cumulative SQL regressions and payment/close/generation/default concurrency passed. The [feature suite](../../scripts/database/Test-PrincipalDailyInterest.sql) covers actual posting, repeated/interest-only repayments, signed corrections, original-rate rounding, stale saves, payoff, historical fee exclusion, fallback and unchanged fixed-loan behavior. Two older fixture setups were adapted for the derived daily amount without removing guard assertions. [CI evidence](ci-evidence.json).
- DEV V45 migration and Flyway validation passed: 46 validated history entries including the baseline. Identity: `appsheet-pg-prod-20260914`, `34.21.174.215`, `loan_manager_dev`.
- Private backup restored with matching row fingerprints. Initial migration rehearsal changed no rows; final live migration separately preserved every existing Loans/Charges/Repayments/Payments row before synthetic testing. [Backup](development-backup.json) · [No-backfill check](no-backfill-verification.json). The backup rehearsal hash identifies an earlier note-wording candidate; final SQL is identified by CI/live definitions. The dump remains the verified pre-change recovery point.
- Current Chrome work-profile GUI: synthetic receipt210 posted interest10 and principal200. OLTP and OLAP showed outstanding800 and daily8. The edit form displayed the amount read-only. Close Loan receipt800 then closed the loan with principal0/daily0. Editing and saving its arrangement with daily0 succeeded.
- Synthetic ledger retained: loan `R036-DI-L` fully settled/closed, auto-charge off; borrower `R036-DI-B` hidden; account `R036-DI-ACCOUNT` inactive. Two posted receipts total1,010. No real borrower used. [DEV-only fixture helper](../../scripts/database/Invoke-PrincipalInterestFixture.ps1).

No production writes, financial backfill, dashboard publication or forced production notifications occurred. Existing owner-only DEV routing was reused; notification delivery was not an acceptance measurement for this calculation change.

## Recovery and promotion handoff

Starting Git commit: `f94f71a3bba3e57f4eefa279fefd9d26e1a73c7f`. Pre-existing untracked risk-redesign work remains untouched. Restore DEV OLTP1.000085 for its two form rules when rolling back the database behavior too. App restoration does not undo SQL or receipts.

The private pre-V45 dump/restore proof is in `development-backup.json`; previous `vc_loan_row()` is in the production dictionary and V12. V45 is immutable. Prefer an approved higher forward correction; do not edit V45 or remove transaction history. Arrangement notes can remain as historical explanation after a forward rollback. A full restore discards intervening DEV work and must be coordinated.

Before production, integrate all R036 work, obtain scoped acceptance/promotion authority and use the master checklist. Capture the tested SQL package and integrated app candidate, account for earlier DEV-only differences, and apply the OLTP rule change with SQL behavior. PROD-mapped RC/App Upgrade rules apply to the OLTP change. No release freeze, final tag or production authorization is implied by DEV completion.
