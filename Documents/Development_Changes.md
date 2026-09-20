# Open development differences

Current production baseline is R009. This register contains open product differences and intentional environment differences, not completed-release narratives.

## R010 ready for review — 20 September 2026

DEV OLTP **1.000036** blocks predictable invalid payment operations in the form with bilingual guidance. New receipts require borrower, amount and date; existing amount/date/account eligibility remains enforced with clearer messages. Posted account/holder corrections compare the form to `_THISROW_BEFORE` and require Notes to preserve the old text and append a reason. The three R008 quick-command account fields expose an empty choice list when the live borrower/charge/loan is no longer eligible and display the relevant balance or loan prerequisites.

The saved editor reports **No issues found**. Current-GUI checks proved that an unchanged Posted receipt opens without an error, an account change without a reason is blocked, and a blank new receipt is blocked for borrower and amount; all forms were cancelled/discarded and no financial row was written. OLAP remains **1.000015** and SQL remains **V26**. PROD remains R009. RC creation, owner acceptance and production promotion are pending. [R010 report](../outputs/r010-20260919/REPORT.md), [tests](../outputs/r010-20260919/TESTS.md), [manifest](../outputs/r010-20260919/release-manifest.json).

[R010 promotion checklist](../outputs/r010-20260919/promotion-checklist.md) owns remaining promotion checks. Close this entry only after R010 validation and documentation closure, preserving later work.

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- Synthetic DEV fixtures and uninitialized cash-account openings are not production data to promote. Use release-specific evidence for any approved initialization.

## Closed differences

R001–R009 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R009 [closure](../outputs/r009-20260919/production/REPORT.md) preserves its limitations. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
