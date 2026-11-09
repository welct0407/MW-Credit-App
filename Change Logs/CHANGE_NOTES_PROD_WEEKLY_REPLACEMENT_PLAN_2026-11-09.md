# Change notes — PROD weekly replacement plan for one borrower, 9 November 2026

## Purpose
The owner asked to turn one borrower's overdue balance of THB 27,000 into THB 3,500 every Friday from 13 November 2026, with principal and interest split by each loan's current remaining principal and interest. Authority: the owner's chat instruction of 9 November 2026 ("apply" after reviewing the plan). It covers this financial write only. No payment, notification or job was forced.

## Changes
- `loan_manager_prod`, `public."Charges"` of one borrower's eight open Daily Interest loans, in one transaction at about 12:58Z as `postgres` through the IAP tunnel (`scripts/database/cloud-db-tunnel.sh`). Integrity, history and row-change triggers stayed enabled.
- Before: 81 overdue unpaid charges (16 September to 22 October 2026) from the earlier replacement plan, remaining THB 17,069 principal and THB 9,931 interest.
- 69 unpaid charges with no payment were deleted. 9 partly paid charges were reduced to the amounts already paid. 3 charges that only carry zero-amount allocations from posted payments were set to zero and kept, which matches the rule `charge.update` uses (P5B06). A note was appended to each of these 12 charges.
- 64 charges were created: 8 Fridays × 8 loans. 13 November to 25 December 2026 are THB 3,500 each, and 1 January 2027 is the final THB 2,500. Each payment is split by each loan's share, using cumulative largest-remainder whole-baht rounding, so each loan's principal and interest totals equal what it owed before. Each new charge carries the plan note.
- Loan fields, payments, allocations and cash were not changed.

## Checks
| Command | Result |
| --- | --- |
| `Backup-ProductionPromotion.py --expected-version 140` | Pass: backup `prod-promotion-95e6b04e7cc34284a8f7bed3893e6f35` at V140, restore passed, 39 table fingerprints match |
| Dry run of the same transaction, rolled back | Pass after one revision: the first dry run stopped on the zero-amount allocations, so those 3 charges are zeroed instead of deleted |
| Commit, then read back as `codex-cloud-read` | Pass: 64 unpaid charges, THB 27,000 (THB 17,069 principal, THB 9,931 interest), none due on or before 9 November, 8 per Friday, outstanding principal unchanged at THB 17,069 |

## Not run
No app smoke in the PWA. The change touches data only.

## Recovery
Restore the affected charge rows from backup `prod-promotion-95e6b04e7cc34284a8f7bed3893e6f35` (`gs://mw-credit-operator-private-737787224638/prod-backups/`). Alternatively, reverse it with an equal transaction: delete the 64 plan charges, restore the 12 edited charges' amounts and re-insert the 69 deleted charges from the backup. Any payment recorded against the new charges must be reconciled first.

## Open questions
None.

## Remaining work
None.
