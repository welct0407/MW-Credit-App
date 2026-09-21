# Open development differences

Current production baseline is R011. This register contains open product differences and intentional environment differences, not completed-release narratives.

There are no open R011/R012 product differences. The owner merged the reserved R012 Cash Ledger Recent scope into R011, and R011 was released on 21 September 2026 at PROD SQL V29 / OLTP 3.000240 / OLAP 1.100189. R012 was never promoted independently and its number is retired. See the [R011 production report](../outputs/r011-20260920/production/REPORT.md).

## Open R013

Receipt transfer time uses existing Payment Date / Created At and flows into Cash Ledger.Created At through DEV V30. No columns or historical backfill. Both statement consumers already read that field. OLTP 1.000064 keeps Ignore seconds=TRUE, matching PROD; the temporary seconds display was reverted at the owner's direction. OLAP 1.000021 is unchanged. Automatic receipt payment creation remains disabled. DEV verified; production SQL promotion pending. [R013 evidence](../outputs/r013-20260921/test-results.md).

## Intentional environment differences

- Separate DEV database and app identities, DEV themes and within-DEV companion links. DEV uses `loan_manager_dev` and PROD uses `loan_manager_prod` on the same Cloud SQL instance; see [Environment Inventory](Environment_Inventory.md).
- DEV Partners.Email delivers only to the owner, while Login Email remains distinct. RC/PROD use PROD contacts with the shared actor-ID rule in [AGENTS §2](../AGENTS.md#2-architecture-and-ownership).
- Synthetic DEV fixtures and the owner-approved five zero account openings remain DEV-only. See [DEV initialization evidence](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md).
- DEV and PROD may advance through owner saves independently. Current DEV is OLTP 1.000064 / OLAP 1.000021 while PROD is OLTP 3.000240 / OLAP 1.100189.

## Closed differences

R001–R011 product differences are closed according to the [Release Tracker](Release_Tracker.md) and their dated release evidence. R011 [closure](../outputs/r011-20260920/production/REPORT.md) preserves its limitations; the R012 reservation was merged into R011 and retired. Older checkpoints and superseded rules remain in the [archive](archive/2026-09-20/Development_Changes.md), not the active backlog.
