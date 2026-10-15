# R011 Cash Ledger Recent evidence

Date: 21 September 2026

This scope was initially recorded under the now-retired R012 reservation. The owner directed that all R012 work be included in R011; R012 was never promoted independently.

## DEV verification

Target: DEV OLAP `MW-OLAP-DEV-20260919-578763613` (`9f3422be-bc87-4a5a-a42a-67528ee80393`), saved in the integrated R011 definition by version `1.000021`.

| Check | Result | Evidence |
| --- | --- | --- |
| Virtual columns | Pass | `Movement Time` is Text with `TEXT([Created At], "HH:MM")`; `Ref Borrower` is a Borrowers Ref resolving Payment, Loan or Business Expense context. |
| Table usefulness | Pass | Manual order contains movement date/time, borrower/payer, movement, amount, holders, payment/loan/source/notes/creator and from/to accounts. |
| Sort/edit/layout | Pass | Movement Date DESC then Created At DESC; Narrow width; quick edit off; Cash Position membership retained. |
| Saved state | Pass | DEV editor reported no issues and remained Deployed. No row, SQL object, automation or notification was changed by the view refinement. |

## Production verification

Target: production OLAP `LoanBusinessInsights-975338008` (`e74dd368-654f-44d7-bccf-83cf361d1cdb`) version `1.100189` after App Upgrade from frozen RC3 `1.000005`.

The current PROD `Cash Position` dashboard loaded and `Cash Ledger Recent` visibly presented:

- `Movement Date` and 24-hour `Movement Time` values such as `20:43`, `20:04`, `18:28` and `17:47`;
- resolved borrower/payer names such as `พี่ไอซ์ - Ice`, `พี่เบล - Bell` and `พี่เนย - Noey`;
- movement type, amount, from/to cash holders, origin, payment/loan references, source type, notes/creator action, and from/to cash accounts;
- production data without a test write, forced notification or scheduled run.

The saved PROD editor is Deployed and reports no issues. Physical-device, offline, separate Partner-login and concurrent-edit tests were not repeated; passing DEV behavior was reused as permitted by the promotion workflow.
