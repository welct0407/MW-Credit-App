# R036 — automatic daily interest after principal repayment

Date: 25 September 2026. Status: **DEV implemented and verified; owner acceptance / production promotion pending. R036 remains Open.**

Daily-interest loans preserve their original ratio in existing Loan Arrangement text and recalculate Current Daily Interest from remaining signed principal. No new table/column or backlog update. The owner selected this text field, historical-rate inference for existing loans on future principal changes, and the existing manual-update convention for uncharged interest. Posted charges/receipts remain unchanged. Fixed-interest/installment rules are preserved.

V45 adds `daily_interest_basis(text)`, `daily_interest_basis_note(numeric[])`, and `apply_principal_daily_interest(Loans,Loans)`, then replaces `vc_loan_row()` to compute the amount after repayment totals. Adjusted amounts use whole baht; repeated payments reuse the exact ratio. Interest-only receipts, signed corrections, stale saves and full payoff are covered. First-day historical inference excludes the recorded transfer fee; missing evidence falls back to the pre-change amount/outstanding ratio and records the source. No bulk historical text/amount correction.

After notifying the owner of the form dependency, DEV OLTP changed **1.000085 → 1.000086**: calculated zero is valid and daily interest becomes read-only once its rate note exists. DEV OLAP **1.000033** is unchanged. Both final editors show zero issues and remain Deployed. DEV SQL is **V45**; PROD remains **V44**, with no production app edits.

Changed files/objects: V45; feature SQL tests; compatible AtomicLoanClose/ScheduleHealth fixture setup and StatementBatch inclusion; DEV backup/fixture helpers; exact PostgreSQL/AppSheet dictionary DEV deltas and index; model overview; database guide; tracker/environment/development references; this log and sanitized evidence under `outputs/r036-principal-interest/`.

Verification: full migration/SQL/concurrency CI passed; DEV Flyway migrate/validate passed; verified restored private backup; live pre-fixture fingerprints prove existing Loans/Charges/Repayments/Payments unchanged. GUI receipt210 = interest10 + principal200 changed principal1,000 → 800 and daily10 → 8 in both apps. Payoff800 closed the synthetic loan with daily0; zero-interest arrangement edit/save passed. Synthetic ledger retained, borrower hidden, auto-charge off, dedicated account inactive. No new recipient/notification route or binding; no production or real-borrower writes.

Recovery: start commit `f94f71a3bba3e57f4eefa279fefd9d26e1a73c7f`; OLTP1.000085; verified pre-V45 private dump referenced in evidence. V45 is immutable; use a reviewed higher migration/coordinate recovery and reconcile app rules. App restoration does not undo SQL or financial postings. Unrelated untracked risk-redesign files remain excluded.

Limitations/remaining work: first-day inference depends on recorded charge/fee integrity; intentional rate concessions need a separately reviewed correction. DEV behavior is complete; owner acceptance and the complete R036 production checklist/package/promotion remain pending. No financial backfill, tag or release freeze. [Implementation, exact evidence and handoff](../outputs/r036-principal-interest/README.md).
