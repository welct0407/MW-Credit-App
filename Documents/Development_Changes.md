# Open development differences

Current production baseline is R010. This register contains open product differences and intentional environment differences, not completed-release narratives.

## R012 — DEV complete, awaiting acceptance and production authorization

OLAP 1.000019 makes the `Cash Position` dashboard's `Cash Ledger Recent` table useful for operational review. It now shows movement date and 24-hour `hh:mm` time, the borrower/payer resolved from the linked payment, loan or business expense, movement and amount, from/to cash holders, payment and loan references, source type, notes, creator and from/to cash accounts. The table retains `Movement Date` descending then `Created At` descending, uses Narrow width and keeps quick edit off. Two OLAP-only virtual columns provide `Movement Time` and `Ref Borrower`; no SQL object, stored financial row, notification, schedule, OLTP definition or production app changed. [Scope, tests and rollback](../Change%20Logs/CHANGE_NOTES_R012_2026-09-21.md). R012 depends on the unreleased R011 DEV definition; no RC exists yet.

## R011 — DEV complete, awaiting acceptance and production authorization

DEV SQL V28 adds optional `Borrowers.Borrower Note`. OLTP 1.000059 displays it below the daily collection totals with quick edit, stores it on the borrower across days, requires `Description` (English Name) in borrower forms, and gives the six formerly English-only/raw new-borrower inputs Thai-first bilingual display names. Collection slice permits updates only; regenerated borrower slices include the note. In OLTP 1.000059 and OLAP 1.000018, all 116 AppSheet system-text localizations resolve the signed-in `USEREMAIL()` to `Partners[Login Email]` and select platform English only when `Language Preference` is `English`; Thai is the fallback. OLAP's analytical data contract remains read-only and unchanged, but its app definition now requires upgrade for the localization change. [Scope, tests and rollback](../Change%20Logs/CHANGE_NOTES_R011_2026-09-20.md). PROD remains V27 / R010; no RC exists yet.

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- Synthetic DEV fixtures and the owner-approved five zero account openings remain DEV-only. See [DEV initialization evidence](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md).
- DEV and PROD may advance through owner saves independently. R010 preserved production OLAP 1.100183 unchanged and promoted only the frozen OLTP RC2 definition.

## Closed differences

R001–R010 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R010 [closure](../outputs/r010-20260919/production/REPORT.md) preserves its limitations. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
