# Change notes — R116 Principal write-off segregation, 2 November 2026

## Purpose
The owner asked to segregate principal write-offs from actual profit on the Dashboard page, show them in the income statement, exclude them from Realized MTD profit, and give Metabase the same visibility. Net profit becomes gross profit minus expenses minus write-offs. Built and tested in DEV first; promotion only under a later owner instruction.

## Changes
Outcomes (owner request, 2 November 2026):
1. Dashboard: principal write-offs are shown separately from actual profit.
2. Income statement: write-offs appear as their own line.
3. Realized MTD profit excludes write-offs.
4. Metabase: the same segregation is visible.
5. Net profit = gross profit - expenses - write-offs.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (UX and tests), Forge (infrastructure impact).

Design decisions, files and objects: to follow from Archie, Echo, Forge and Byte.

## Checks
| Command | Result |
| --- | --- |

## Not run
To follow.

## Recovery
Git baseline: `main` 80fbf6b (branch `claude/r116-writeoff-segregation`). Further recovery detail to follow once the change set is known.

## Open questions
None yet.

## Remaining work
Design, build, verification and records (in progress).
