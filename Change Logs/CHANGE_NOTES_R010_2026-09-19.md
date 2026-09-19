# R010 — OLTP GUI validation for predictable payment rejections

## Scope and status

Reserved 19 September 2026. Status: **In development**. The owner requested implementation in DEV OLTP of the first error-prevention proposal: reject predictable invalid user operations in the AppSheet GUI so users receive a form or action message instead of a later synchronization error.

The initial affected paths are direct payment entry, correction of cash account/cash holder on a Posted payment, and R008 quick-payment commands for Receive All, Receive Full and Loan Close. The implementation will map current database rejection rules to AppSheet input controls, preserve the database constraints as the final integrity layer, and add bilingual user-facing messages. Scope may be refined from current saved configuration and runtime testing; exact saved expressions and tests will be recorded here before readiness.

## Baseline and rollback

- Starting Git commit: `ca79639667343a598a369d9cef84441d9bfb785f`; working tree clean.
- DEV OLTP: `MW-OLTP-DEV-20260919-578763613` (`500b27b6-884a-41e8-a9ec-df801b0110ad`), saved version **1.000033**, Deployed, editor diagnostics **No issues found**. Version **1.000033** is the recorded restorable rollback point before R010 edits.
- DEV OLAP remains **1.000015**. SQL remains Flyway **V26**. No database schema/data change is planned for this GUI-only batch.
- PROD remains R009 at OLTP **3.000231**, OLAP **1.100181**, SQL **V26**. No RC or PROD action is authorized by this development request.

AppSheet rollback restores DEV OLTP version 1.000033 if needed. Repository rollback uses a scoped revert of R010 commits while preserving later unrelated work. App rollback does not undo accepted data writes, so runtime tests will use validation-only or cancelled forms unless a separate reviewed DEV fixture is necessary.

## Planned verification

- Read back each saved expression after editing and confirm final editor diagnostics contain zero warnings/errors.
- Exercise invalid and valid boundary cases in the current DEV GUI without producing a failed synchronization operation.
- Verify affected quick-payment command forms do not submit when their eligible balance is blank or zero and show a useful GUI message.
- Confirm direct payment and posted correction forms retain valid workflows.
- Update the model overview and data dictionary for affected validation and required-expression metadata, then record final DEV version and readiness recommendation.
