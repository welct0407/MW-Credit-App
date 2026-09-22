# Open development differences

Current production baseline is R015. This register contains open product differences and intentional environment differences, not completed-release narratives.

## R016 — Metabase reporting migration

The owner accepted the borrower POC on PC and mobile and directed continuation after the first two pages. Nine pages, including the period-selectable Income Statement, are implemented for review in [dashboard 3](https://reports.mw-credit.com/dashboard/3), with 16 reusable models, two shared parameterized snippets and 126 visual placements. The owner superseded column-by-column grants with SELECT on the 12 existing sources used by Metabase; no write/schema authority or future-table grants were added. Borrower-level daily balance history remains unavailable in the source and is identified on page 7. Full owner acceptance and migration-key revocation remain pending. Railway Hobby sizing and Singapore hosting are unchanged. [Scope, verification and recovery](../Change%20Logs/CHANGE_NOTES_R016_2026-09-22.md).

There are no open R011/R012 product differences. The owner merged the reserved R012 Cash Ledger Recent scope into R011, and R011 was released on 21 September 2026 at PROD SQL V29 / OLTP 3.000240 / OLAP 1.100189. R012 was never promoted independently and its number is retired. See the [R011 production report](../outputs/r011-20260920/production/REPORT.md).

There are no open R013 product differences. R013 promoted only PostgreSQL V30; production AppSheet definitions remain OLTP 3.000240 / OLAP 1.100189. Any future app change belongs to R014. Automatic receipt payment creation remains disabled. [R013 production report](../outputs/r013-20260921/production/REPORT.md).

## R014 — promoted and closed

R014 is promoted to PROD V32 / OLTP 3.000245 / OLAP 1.100194. Dashboard, account balances, partial/FIFO settlements, account-selector restrictions, borrower grouping/principal and disabled record swipes are included. Both editors are clear. Forecast proposal excluded. [Production evidence and rollback](../outputs/r014-20260921/production-report.md).

Partners[AI Reviewer] and the reviewed integration-agent policy are deployed. Tommy is selected and Lisa unselected; OLAP owns editing and OLTP reads the field. Current production master selection and 102 VM tests passed. Partner summaries/results retain their routing. No open R014 product difference remains.

## Intentional environment differences

R015 is promoted and closed: both databases have V33 internal transaction audit. The agent uses separate `mw_agent` PostgreSQL state and append-only audit, with current-reviewer API-first corrections and approved exact-key DELETE. AppSheet definitions remain at the R014 versions. No open R015 product difference remains. [Production evidence](../outputs/r015-20260922/production-report.md).

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- The former five-account zero-opening fixture was replaced by the owner-requested refresh. Current DEV has four initialized accounts. R014 retains one audited, cancelled synthetic settlement with no cash effect; DEV test records do not establish PROD balances.
- DEV and PROD may advance through owner saves independently. Current DEV is OLTP 1.000075 / OLAP 1.000031 while PROD is OLTP 3.000245 / OLAP 1.100194. Production APIs remain enabled for the integration agent; DEV API settings remain unchanged.

## Closed differences

R001–R015 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R012 was merged into R011 and retired. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
