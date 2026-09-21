# Open development differences

Current production baseline is R013. This register contains open product differences and intentional environment differences, not completed-release narratives.

There are no open R011/R012 product differences. The owner merged the reserved R012 Cash Ledger Recent scope into R011, and R011 was released on 21 September 2026 at PROD SQL V29 / OLTP 3.000240 / OLAP 1.100189. R012 was never promoted independently and its number is retired. See the [R011 production report](../outputs/r011-20260920/production/REPORT.md).

There are no open R013 product differences. R013 promoted only PostgreSQL V30; production AppSheet definitions remain OLTP 3.000240 / OLAP 1.100189. Any future app change belongs to R014. Automatic receipt payment creation remains disabled. [R013 production report](../outputs/r013-20260921/production/REPORT.md).

## R014 — open, DEV complete

DEV V31 adds the read-only Cash Dashboard and oldest-month-first completed-settlement allocation. OLTP 1.000070 displays eight bilingual figures with green income, red expenses/withdrawals and blue balances, plus account-level cash grouped by owner. OLAP 1.000024 removes inline account creation from Cash Ledger and adds Set Amount alongside settle-all. Both editors are clear. Owner acceptance and production authorization are pending; no RC has been created. [Scope, tests and rollback](../outputs/r014-20260921/REPORT.md).

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- The former five-account zero-opening fixture was replaced by the owner-requested refresh. Current DEV has four initialized accounts. R014 retains one audited, cancelled synthetic settlement with no cash effect; DEV test records do not establish PROD balances.
- DEV and PROD may advance through owner saves independently. Current DEV is OLTP 1.000070 / OLAP 1.000024 while PROD is OLTP 3.000240 / OLAP 1.100189.

## Closed differences

R001–R013 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R012 was merged into R011 and retired. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
