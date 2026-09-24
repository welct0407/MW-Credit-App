# Open development differences

R016 established ten canonical pages, 129 visual placements, 117 distinct questions, 15 active models / 228 fields and four snippets. Original tabs 2/9/10 are replaced by Cash Position (14), Income Statement (16) and Cashflow Statement (15), now ordered as pages 2/3/4, with later tabs shifted back. Fourteen unused questions and seven models are recoverably archived after dependency checks. DEV/PROD are V39; AppSheet and financial rows are unchanged. [canonical cash statements](../outputs/r016-20260922/statement-cleanup/README.md).

Current production baseline is R015; final R016 owner acceptance and migration-key retirement remain pending.

## R016 — Metabase reporting migration

**Performance review, 24 September:** implemented separate tab **6R · Performance** (18), now immediately after original Performance by owner arrangement. Daily question 222 and new cumulative 230 use Metabase helper 229 for strict seven-day averages before the display-date filter; readiness 231 complements unchanged snapshot status 228. Original Performance (7) is preserved. No DB objects/SQL, snapshot engine, AppSheet or financial-data change. [Saved definitions, 41 checks, browser evidence and rollback](../outputs/r016-20260922/performance-redesign/ROLLING_IMPLEMENTATION.md). R016 is Frozen for promotion; R017 is the sole Open release for subsequent work.

Cash Position keeps today/live and past/snapshot routing. Income and Cashflow statement totals and detail remain live for every selected period. Their separately labeled completed-day trends use stored portfolio/account snapshots, with missing-day counts and actual refresh times. Income excludes principal, capital movements and partner payments; no FIFO distributions or retained-profit bridge appears. Cashflow uses a fresh source opening seed and selected-period running balances. Transfers cancel only in All accounts; unknown balances remain unavailable. The database retains superseded providers for compatible rollback under expand/contract.

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
- DEV and PROD may advance through owner saves independently. Current DEV is OLTP 1.000075 / OLAP 1.000031 while PROD is OLTP 3.000246 / OLAP 1.100195 (current saved versions observed during R016; no app edit in that database task). Production APIs remain enabled for the integration agent; DEV API settings remain unchanged.

## Closed differences

R001–R015 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R012 was merged into R011 and retired. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
