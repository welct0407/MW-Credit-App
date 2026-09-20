# R012 DEV test results — OLAP Cash Ledger Recent

Date: 21 September 2026

Target: DEV OLAP `MW-OLAP-DEV-20260919` (`9f3422be-bc87-4a5a-a42a-67528ee80393`)

Saved version: `1.000019`

Dependency: R011 DEV OLAP `1.000018`

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Target identity and rollback | Pass | Editor app name/ID and database-3 DEV binding matched the environment inventory; pre-edit restorable version `1.000018` recorded. |
| Virtual column typing | Pass | `Movement Time` saved as Text; `Ref Borrower` saved as Ref to Borrowers with bilingual display name. |
| Time display | Pass | Current preview rendered representative rows as `19:45`, `18:28` and other 24-hour `hh:mm` values. |
| Borrower/payer context | Pass | Payment rows resolved visible borrower names including Tommy and พี่เนย - Noey from their linked payment context. |
| Table usefulness and order | Pass | Preview showed movement date/time, borrower, movement type, amount, custody holders, payment/loan/source/note/creator and from/to cash-account context in the saved manual order. |
| Sort and edit behavior | Pass | `Movement Date` DESC then `Created At` DESC retained; quick edit remains off; width saved as Narrow. |
| Dashboard containment | Pass | `Cash Position` entries and sizes retained; tabs and interactive mode remain off. |
| Saved-state diagnostics | Pass | Green editor check after save reported `No issues found`; app remained Deployed at `1.000019`. |
| Data/automation isolation | Pass | No row was submitted, no SQL/database object changed and no notification or scheduled job was invoked. |
| Data dictionary | Pass | DEV differences rows added for both virtual columns and the view configuration; recalculated workbook scan found no formula errors; changed range render inspected. |

## Remaining checks

- Owner acceptance is pending.
- RC preparation, PROD-source rebinding, initial RC deployment check, scheduled-guard verification and limited PROD validation belong to a separately authorized promotion.
- Physical-device and separate Partner-login checks were not required for this desktop-only presentation refinement.
