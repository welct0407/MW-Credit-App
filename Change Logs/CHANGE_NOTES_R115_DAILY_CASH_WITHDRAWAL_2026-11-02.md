# Change notes — R115 Daily Cash withdrawal, 2 November 2026

## Purpose
The owner asked for a "Daily Cash withdrawal" quick-entry page reached from the Cash Position page. It records the day's cash taken from the SCB and TTB source accounts into Dad's on-hand cash account in one confirmation. Build and test in DEV only; no PROD action in this batch.

## Changes
Outcome: from Cash Position the user opens a page with a date (default yesterday), a 10-minute time slicer, the available balance of each source account (SCB, TTB) as of that date and time, a withdraw amount box per source, the remaining amount, and a confirm that creates two transfers into Dad's on-hand cash account at the selected time.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (tests). Forge is not applicable: no infrastructure change.

Design decisions (to be filled by Archie and Byte):
- Page and route, entry point on Cash Position: pending.
- Available balance as of date and time (source of the figure, handling of later-dated entries): pending.
- Transfer creation (existing API or function, idempotency key, audit, one transaction for both transfers, rejection when an amount exceeds the available balance): pending.
- Schema: pending (no new table or column is assumed; any migration needs owner authority).
- Authorization and role access: pending.

Files and objects changed: pending.

## Checks
| Command | Result |
| --- | --- |
| pending | pending |

DEV deploy evidence (Byte and Forge-free path; pins live only in the [Environment inventory](../project/Documents/Environment_Inventory.md)): pending.

## Not run
PROD deployment and any live PROD write: out of scope for this batch. Further entries pending.

## Recovery
Git baseline is the tip of `main` before the R115 branch `claude/r115-daily-cash-withdrawal`. DEV test transfers are synthetic and disposable. Details pending.

## Open questions
None yet.

## Remaining work
Design, build, tests, DEV deploy, records update and owner review.
