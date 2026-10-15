# Change Notes — OLTP Isolated Test Round — 2026-08-30

## Status

**Initial test execution and the approved F-002/F-003 remediation retest are complete; broader acceptance remains pending manual follow-up.**

Overall result: **Conditional fail**. Production isolation was successful, but the test identified two high-severity and four lower-severity findings. No production AppSheet configuration, data, deployment state, notification setting, OLAP object, or Looker Studio object was changed.

Follow-up on 2026-08-31 changed the production OLTP configuration only: the approved zero-value-row and negative-principal controls were validated in the isolated clone and then promoted to production version `2.200079`. No production transaction data was created or edited. The initial conditional-fail result is retained until the remaining manual test scope is completed.

## Purpose

Conduct a broad functional and financial-control test of the OLTP Operations app in a separate AppSheet app and native AppSheet database so synthetic transactions could not affect production.

## Scope

- App: `Loan Manager ผู้จัดการสินเชื่อ`
- Test round: `OLTP_Full_Test_20260830-221908`
- Test date: 2026-08-30
- As-of time zone: Asia/Singapore
- Areas covered: environment isolation, borrowers, daily-interest loans, fixed-term loans, charges, repayments, collection tracking, first-day automations, scheduled-automation configuration, sync, mobile/tablet layout, security boundaries, performance smoke, privacy, rollback, and cleanup.
- Detailed test inventory: 73 cases — 50 pass, 9 fail, 8 blocked, 3 not run, and 3 observations.

## Rollback point recorded before testing

- Production OLTP app ID: `93844270-6aa5-420b-a960-bcdf08abd357`
- Production OLTP AppSheet version: `2.200076`
- Production AppSheet database ID: `9Y5vh3TFzZ4sIe2JgNh4l0`
- Production rollback required now: **No**. No production change was made.

## Test copies created

Primary isolated test environment:

- Test app: `OLTP DB TEST 20260830-221908`
- Test app ID: `fa3882d6-993d-450e-b7fc-15c3c7545263`
- Backing native AppSheet database: `Money DB TEST 20260830-221908`
- Test database ID: `qlNWJ209fg40Mrk3sGqtwd`
- Deployment state: Prototype; intentionally not deployed.

Isolation proof:

- Production and test app/database IDs are distinct.
- The cloned database contains all 10 source tables.
- The synthetic `TST-221908` borrower existed in the test database only.
- At the verification point, the test database contained 18 borrower rows and production remained at 17 with no synthetic prefix.
- The production editor had no unsaved change.

Redundant staging artifacts created while confirming the correct native-database copy workflow:

- `OLTP TEST 20260830-221908`, app ID `573da65d-e155-4bf9-9d1b-059a7208ec64`
- `Money TEST 20260830-221908`, database ID `sT7AXYFcCz4daQscPwUII2`

These redundant staging artifacts were not deleted because deletion requires explicit user approval.

## Deliverables created

- `Testing/OLTP_Full_Test_20260830-221908/OLTP_Test_Report_20260830-221908.xlsx`
- `Testing/OLTP_Full_Test_20260830-221908/OLTP_Test_Summary_20260830-221908.docx`
- `Change Logs/CHANGE_NOTES_OLTP_TEST_ROUND_2026-08-30.md`

No production data-model documentation was changed because this task did not implement a production table, column, virtual column, expression, key, Ref, slice, or app-availability change.

## Key results

### Passed controls

- Borrower name required; exact and normalized duplicates rejected.
- Core loan form constraints rejected zero/negative principal, negative transfer fee, zero daily interest, zero payment interval, invalid fixed due date, and zero fixed interest.
- First-day charge and first-day receipt automations executed once in the isolated clone.
- Fixed and daily loan close workflows reconciled to zero outstanding principal.
- Payment overages were blocked and pending, partial, and paid transitions were deterministic for the tested net amounts.
- Sync completed, and the primary navigation rendered in Mobile and Tablet simulator modes.

### Findings

1. **F-001 — High:** The global Add Loan path saved an active loan without a borrower. The orphan loan and its charge were omitted from the collection board.
2. **F-003 — High:** Negative charge components saved, resulting in a negative amount due and a silently ineffective receive action.
3. **F-002 — Medium:** Zero-value charges and repayments saved.
4. **F-004 — Medium:** Past-due unpaid and partially paid charges did not show an explicit overdue state in `Payment Status`.
5. **F-005 — Medium / review:** Negative interest could be entered by editing an ordinary repayment without a dedicated adjustment/reversal type.
6. **F-006 — Low / review:** A future-due fixed charge could be paid early; policy confirmation is required.

### Finding disposition after owner review and focused retest — 2026-08-31

| Finding | Disposition | Evidence / design decision |
| --- | --- | --- |
| F-001 | Owner-remediated; production manual retest pending | The owner hid the global Loans-table Add action so new loans should enter through `Create New Loan` on Borrowers. This follow-up did not create a production loan. |
| F-002 | Remediated and passed in the isolated clone | Zero-value Charges and Repayments remained on their forms with validation errors and could not be saved. |
| F-003 | Remediated and passed in the isolated clone | Negative `Charges[Principal Due]` was rejected. `Repayments[Principal Paid]` already had a nonnegative rule; the retest confirmed it remained effective. |
| F-004 | Accepted by design | `Payment Status` remains a settlement state. Overdue classification continues through separate days-late and collection indicators. |
| F-005 | Accepted by design | Negative interest remains allowed in Charges and Repayments for the owner's default-loan workflow. |
| F-006 | Accepted by design | Payment before the future due date remains allowed. |

Focused retest rollback and resulting versions:

- Test clone rollback point: `OLTP DB TEST 20260830-221908` version `1.000005`.
- Test clone validated version: `1.000006`.
- Production OLTP rollback point: `2.200078`.
- Production OLTP resulting version: `2.200079`.

Focused clone checks all passed: zero-value Charge blocked, negative Charge principal blocked, negative Charge interest allowed, zero-value Repayment blocked, negative Repayment principal blocked, negative Repayment interest allowed, and positive interest overpayment still blocked. The clone received only synthetic test rows; production received configuration changes only.

## Checks performed

- Verified production rollback version before cloning.
- Confirmed native AppSheet database source in the primary test app.
- Compared production and test database IDs, table lists, synthetic-prefix presence, and borrower row counts.
- Executed synthetic borrower, loan, charge, payment, close, overdue, negative, zero, and reconciliation scenarios.
- Inspected cloned automation configuration and the prototype-only scheduled-event warning.
- Confirmed successful sync and responsive simulator smoke behavior.
- Scanned the workbook for formula errors and visually reviewed all eight worksheets.
- Audited Word table geometry and visually reviewed all five rendered summary pages.
- Confirmed artifacts contain synthetic or redacted information only.

## Manual testing required before acceptance

1. Test borrower deletion safeguards using synthetic linked records only.
2. Execute the supported default workflow and reconcile default flag, loss amount, closure state, audit trail, OLAP feed, and Looker reporting.
3. With explicit approval in a deployable test app, exercise the Daily 00:05 bot across two runs and retry conditions to prove idempotency.
4. With an approved test recipient, test new-loan and loan-closed notifications for redaction, routing, single delivery, and failure handling.
5. Test offline create/edit and conflict resolution on a supported device.
6. Test operator and read-only permissions with approved test identities.
7. Test an auditable repayment reversal/void path; do not physically delete a posted payment.
8. Capture instrumented sync and key-view performance at expected peak row volumes.
9. After remediation, retest every loan-add path, negative/mixed-sign charges, zero-value charge/payment controls, and overdue/adjustment reconciliation across OLTP, OLAP, and Looker.

## Downstream effects and limitations

- The test clone contains deliberately invalid synthetic records used to prove the findings. It must not be deployed or used for operational work.
- Scheduled automation and notifications were not executed because the clone remained a prototype and live messages were out of scope.
- Default, reversal, offline, multi-user permission, and load scenarios remain unaccepted until the manual checklist is completed.
- No OLAP or Looker object was changed or tested through a production deployment in this round.

## Rollback and cleanup instructions

Production rollback is not required. If a later implementation changes production, first record the then-current AppSheet version and restore the prior version if rollback becomes necessary.

For this test round:

1. Retain the Excel report, Word summary, and this change log.
2. Keep the primary test app and database until remediation evidence and acceptance are complete.
3. After explicit user approval, delete only the exact redundant staging app/database IDs listed above.
4. After acceptance or cancellation and explicit approval, delete the primary test app/database by their exact IDs.
5. Do not delete or alter the production app or production database.
