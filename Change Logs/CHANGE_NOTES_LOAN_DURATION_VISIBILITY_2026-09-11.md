# Loan Duration visibility — 11 September 2026

## Status

Saved and reloaded as OLTP **3.000045**. User authorized investigation and correction. Manual acceptance on the affected client remains pending.

## Scope and findings

- OLTP `Loan Manager ผู้จัดการสินเชื่อ`, `Loans[Loan Duration]` blank-number branch and visibility.
- Reported path: Borrowers → borrower detail → related loans → latest loan.
- The reported loan's physical Close Date was blank in the live expression-test table. Its server-evaluated duration was also blank.
- Initial investigation used the top-level Loans route and incorrectly concluded no change was needed. Subsequent checks followed the requested Borrowers route in desktop and mobile editor preview. Initially both hid the field, but after preview refresh the mobile `Loans_Detail` visibly reproduced Loan Duration `0` for the reported loan. This supersedes the earlier non-reproduction conclusion.
- Changed the false branch from empty Text `""` to explicit blank Number `NUMBER("")`. The field disappeared in the same mobile preview before adding Show_If, supporting a client evaluation/type-coercion cause. The precise internal AppSheet engine behavior is not independently inspected.
- Added `ISNOTBLANK([Close Date])` as an explicit Show_If guard instead of unconditional Show. Preserved the existing closed-loan inclusive-day arithmetic and all transaction data.
- Prior read-only server check: 57 loans, 41 blank Close Dates with blank durations, 16 populated Close Dates with correct inclusive durations, including a same-day closure returning 1.
- No borrower names, record keys, or transaction exports are retained in repository evidence.

## Rollback point

- OLTP **3.000044**, confirmed in Manage → Versions → Version History before editing.
- Repository documentation baseline: `ce6f6114da6b9c9fbe078a46fe12085cc1c475c3`.
- OLAP and Looker Studio are outside this presentation fix and remain unchanged.

## Objects and files

- OLTP `Loans[Loan Duration]` app formula and Show_If.
- `Documents/AppSheet_Data_Model_Overview.md`.
- `Documents/AppSheet_Data_Dictionary.xlsx`.
- This change log, maintained documentation script, and redacted verification outputs.

## Checks and manual testing

- Both expressions passed editor validation; the editor reported no issues.
- Reloaded the editor and verified persisted formula, Show_If, and app version 3.000045.
- Repeated Borrowers → borrower detail → latest related loan in the reloaded mobile preview. `Loans_Detail` no longer contained the Loan Duration label or zero.
- Tested the corrected expression against saved version 3.000045: all 57 loans checked; 41 blank Close Dates yielded blank results; all 16 closed-loan results matched independent inclusive-day calculations; same-day closure remained 1. The reported record's Close Date, duration, and expression result were blank.
- Changed dictionary cells `Columns!F215:H215`, with a targeted wrapped row for legibility. Rendered before/after and visually checked. Round-trip value comparison found exactly those three changed cells and no other sheet value changes.
- XLSX package check across all ten worksheets confirmed only the three intended cell values and row 215 height/wrapping changed. Style definitions, workbook structure, relationship targets, and all unrelated worksheet content were preserved.
- Documented the intentional OLTP/OLAP difference without claiming current OLAP reconciliation.

User: sync the affected client, open Borrowers → borrower → latest open loan, and confirm Loan Duration is absent. Check an existing closed loan still displays inclusive duration. Check another open loan and the top-level Loans route. No test requires creating, closing, or modifying financial records.

## Downstream effects and rollback

The correction affects OLTP blank-duration results and field visibility, including reference/detail navigation. Closed-loan numeric results, source rows, allocations, notifications, and dashboard definitions are unchanged. No production financial records or action/bot workflows were edited or invoked. Existing background activity crossed midnight during investigation; it was not triggered as a test.

To undo only this fix, replace `NUMBER("")` with `""` in the false branch, remove the Show_If expression, and restore Show to TRUE. For full app rollback, restore OLTP 3.000044 through Manage → Versions, considering any later unrelated edits first. Restore affected documentation from the baseline or revert the task commit using a normal new commit, then update this log.
