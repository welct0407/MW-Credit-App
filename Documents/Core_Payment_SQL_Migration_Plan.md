# Core payment migration — phases 1–3

15 September 2026. Status: implemented and verified in development (OLTP 1.000032 / OLAP 1.000033 / Flyway V6); owner confirmed tested notification delivery/amounts. Overall acceptance and a separate production release remain pending. See [actual tests and limitations](../outputs/core-payment-20260915/REPORT.md).

## Scope and sequence

Follow the proposal in “Move Automations To DB Triggers”, conversation 6aa91abd-d690-83ec-a990-effcf128b0dd. PostgreSQL owns financial posting; AppSheet owns entry, confirmation, navigation and notifications.

1. Capture current definitions, versions, database schema and dependencies. Review development bots before test writes.
2. Phase 1: use one payment function for Single Full, Single Partial, Receive All, Lump Sum, First-day Auto and Loan Close. Thin triggers route commands. Preserve method-specific eligibility, whole-baht amounts, interest-first allocation, newest-first ordering and immutable key ties. Full methods require the exact current eligible balance. Partial/lump methods cannot exceed it.
3. Phase 2: atomically commit allocations, repayments, receipt status and eligible loan closure. Charge balances/status remain derived from the ledger; do not add redundant stored charge totals. Record Loans.Ref Closing Payment, explicitly approved by the owner in this task, to identify payment-caused closures. Rework notifications around the originating AppSheet payment/loan event and verify SQL readback. Preserve the ordinary non-payment loan-closure event. Do not claim exactly-once device delivery.
4. Phase 3: move first-day charge creation and net-off receipt creation to SQL, preserving daily-interest/installment formulas, transfer fee, auto-charge eligibility and loan-date payment basis. The new loan, first charge, receipt and ledger must succeed or roll back together. Preserve the existing manually added first-day-charge behavior.
5. Reconcile both development apps, including the new read-only Ref. Disable superseded financial bots/actions after recording rollback settings. Verify development sources and cross-app navigation.
6. Rebuild migrations in disposable PostgreSQL. Exercise conservation, invalid input, same-borrower competition, independent borrowers, retries, immutable posting, future-charge distinctions, closure and first-day edge cases. These supplement, not replace, current-GUI tests.
7. Use Chrome and the current AppSheet GUI for synthetic payment and loan workflows in OLTP; sync OLAP and reconcile its ledger/balances. Record backend and visible-sync timings separately when available.
8. Update the overview, detailed dictionary, environment/development registers and change log. Commit/push reviewed source and sanitized evidence. Obtain owner acceptance before a separately approved production release.

## Existing behavior to preserve

| Method | Eligible charges | Amount |
| --- | --- | --- |
| Single Full | Target charge belonging to borrower, including an intentionally selected future charge | Exact target balance |
| Single Partial | Same target rule | Positive amount up to target balance |
| Receive All | Borrower's positive balances with charge date at/before payment date | Exact eligible balance |
| Lump Sum | Same date cutoff as Receive All | Positive amount up to eligible balance |
| First-day Auto | Target charge on the auto-enabled daily-interest/installment loan's Loan Date | Exact eligible balance; Net-off at Disbursement |
| Loan Close | All positive charge balances on target charge's loan, including future charges | Exact eligible balance |

The existing daily-interest Close Loan wrapper first creates/updates its final charge and then creates a Loan Close payment. Moving final-charge generation into one command is not implied by claiming that receipt posting is atomic; document this remaining boundary explicitly. Daily scheduled generation, default posting and analytics remain phases 4–7.

## Consumers and rollback

OLTP owns receipt/loan creation. Both development apps consume Borrowers, Loans, Charges, Payments, Payment Allocations and Repayments via database-3. OLAP financial tables are read-only. Keep repayment grain, dates/components and existing export metrics intact. Looker is a secondary downstream consumer; no report edit is planned.

Fresh Chrome observations: development OLTP 1.000025, development OLAP 1.000031. Starting repository commit a6b3a7d. Development Flyway V5; schema captured to the external project flyway folder as development-schema-20260915-180922.sql. App versions alone do not reverse SQL or posted test data.

Before a fallback, pause receipt entry, reconcile in-flight commands and preserve posted history. Add a higher Flyway forward-fix restoring V4 processing/guards and disabling new first-day routing; restore the recorded app configuration only after checking compatibility with new posted receipts. Retain the nullable closing-payment reference unless separately reviewed for removal. Never modify applied migrations or delete financial history as rollback.

## Acceptance checklist

- Full, partial, Receive All, lump sum and loan-close paths post exactly one matching allocation/repayment per funded charge; receipt differences are zero.
- Reject stale overpayment and changed posted financial inputs; retry produces no additional financial effects.
- Close only when principal is covered and every charge is settled, including future charges. Closing reference identifies this payment.
- First-day daily-interest and installment amounts, transfer fee and net-off match the prior formulas; disabled auto-charge and fixed-date loans do not generate an automatic first-day transaction.
- SQL-created rows and closure appear after sync in both apps; OLAP has no financial edit path.
- Payment, loan-created and loan-closed notification content/recipients and first-day coverage are verified separately from financial correctness; record delivery limitations.
- Owner reviews synthetic examples, edge cases and measured performance before production approval.
