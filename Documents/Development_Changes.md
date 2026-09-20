# Open development differences

Current production baseline is R010. This register contains open product differences and intentional environment differences, not completed-release narratives.

## R011 — DEV complete, awaiting acceptance and production authorization

DEV SQL V28 adds optional `Borrowers.Borrower Note`. OLTP 1.000057 displays it below the daily collection totals with quick edit, stores it on the borrower across days, and requires `Description` (English Name) in borrower forms. Collection slice permits updates only; regenerated borrower slices include the note. OLAP remains unchanged at 1.000017 over its read-only analytical view. [Scope, tests and rollback](../Change%20Logs/CHANGE_NOTES_R011_2026-09-20.md). PROD remains V27 / R010; no RC exists yet.

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- Synthetic DEV fixtures and the owner-approved five zero account openings remain DEV-only. See [DEV initialization evidence](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md).
- DEV and PROD may advance through owner saves independently. R010 preserved production OLAP 1.100183 unchanged and promoted only the frozen OLTP RC2 definition.

## Closed differences

R001–R010 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R010 [closure](../outputs/r010-20260919/production/REPORT.md) preserves its limitations. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
