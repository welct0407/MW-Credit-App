# Change notes — R122 borrower display and Thai name romanization, 4 November 2026

## Purpose
R122 fixes two display issues the owner raised and adds a Thai-to-English name helper on the new-borrower form. The owner wants DEV deployment and testing before review; no PROD in this scope.

## Changes
Scope (owner, 4 November 2026):
- Borrower page: the small numbers under open loans show outstanding principal instead of total principal.
- Cash page: the transaction from/to field shows the borrower name in the preferred language.
- New-borrower form: a button next to the English name romanizes the Thai name with Claude Opus 5.5 (medium effort) through the Claude API, likely reusing the existing VM chat relay (design by Archie pending).

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (tests), Forge (DEV deploy).

Files and objects: to be filled as the batch lands.

## Checks
| Command | Result |
| --- | --- |
| to be filled | pending |

## Not run
To be filled. A skipped check is not a pass.

## Recovery
Git baseline is R121 `f6622c5` (tag `R121`). Prior DEV artifact and any configuration change to be recorded when deployed.

## Open questions
Design of the romanization call (relay reuse, key handling, cost limits) is pending from Archie.

## Remaining work
Design, build, verification, DEV deploy and owner review. PROD promotion is not in scope.

## DEV deploy
Pending. Forge records the DEV evidence here; deployment pins live only in the Environment Inventory.
