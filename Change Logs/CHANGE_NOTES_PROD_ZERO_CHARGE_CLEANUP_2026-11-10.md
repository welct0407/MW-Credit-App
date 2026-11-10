# Change notes — PROD cleanup of three zero-amount charges, 10 November 2026

## Purpose
The owner asked why one borrower still had 3 zero-amount charges after the [9 November weekly replacement plan](CHANGE_NOTES_PROD_WEEKLY_REPLACEMENT_PLAN_2026-11-09.md), and to engage the team and delete them properly. Authority: the owner's chat instruction of 10 November 2026 ("engage the team and delete them properly"; "go ahead once Chase confirms"). It covers this one deletion only.

## Changes
- Why they existed: on 9 November the 3 charges could not be deleted, because 3 zero-amount `Payment Allocations` rows from 2 posted September payments referenced them through foreign key `appsheet_ref_11`. They were set to zero and kept.
- Team: Archie designed the change. The app has no path for it: `charge.delete` hits the foreign key (P5B05), and `payment.correct` would re-plan two Lump Sum payments that have no v2 command history. Byte wrote a one-off guarded script, kept outside Git because it holds record IDs. Chase verified it on a disposable restore. Echo and Forge did not apply (no UI or infrastructure change).
- `loan_manager_prod`, one transaction at 12:06Z as `postgres` through the IAP tunnel, all triggers enabled. It took the app's lock order (borrower, loans, payment advisory locks and rows, charge advisory locks and rows), ran its guards, deleted the 3 zero-amount `Payment Allocations` rows, then the 3 zero-amount `Charges`, and ended with `SET CONSTRAINTS ALL IMMEDIATE`.
- Side effect: the `Daily Analytics` snapshot row for 2026-09-16 was regenerated. Only `Generated At` changed.
- Repayments, Loans, Borrowers, Payments and Cash Ledger were not changed.

## Checks
| Command | Result |
| --- | --- |
| Backup `prod-promotion-726d41376f704465bef706226b570966` | Pass: V141, 11:59Z, restore passed, 39 table fingerprints match |
| Chase's dry run on a disposable restore | Pass: rolled back, 0 of 39 tables changed |
| Chase's commit on the disposable restore | Pass: exactly 3 + 3 rows changed; Repayments, Loans, Borrowers, Payments and Cash Ledger unchanged; `pwa_row_changes` gained 7 keys (6 rows plus the analytics row); charge payment health lost exactly the 3 zero rows; borrower payment health unchanged; a re-run was refused by the guards (exit 2) |
| PROD dry run | Pass: all guards passed |
| PROD commit | Pass: exit 0 |
| Read-back as `codex-cloud-read` | Pass: 0 of the 3 charges and 0 of the 3 allocations left; 0 zero-amount charges for the borrower; open charges 64 / THB 27,000; outstanding principal THB 17,069; both payments still 3,000 and 2,000 with Received = Planned = Posted |

## Not run
No PWA smoke. The change touches data only.

## Recovery
Re-insert the 3 charges and then the 3 allocations from backup `prod-promotion-726d41376f704465bef706226b570966` (charges first). Reconcile any newer payment on these loans first.

## Open questions
None.

## Remaining work
None.
