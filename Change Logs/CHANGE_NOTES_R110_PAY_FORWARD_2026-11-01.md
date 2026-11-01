# Change notes — R110 Pay Forward, Release 1, 2026-11-01

## Purpose
Money that arrives before its charge exists today needs the Partner to book future charges by hand (Upcoming Charges "Record charge", R104) before recording the payment, and R101 "Pay ahead" covers one next charge per loan only. R110 lets the payment command create the charges itself and lets the Partner choose what the remainder does. Design record: the owner-approved [plan artifact](https://claude.ai/artifact/6iCRmdeKsroNkf6NxKrZBj) (Pay Forward Design, revision 6, 1 November 2026); no new design document.

## Changes
Scope: Release 1 (core) only. Release 2 (rebate offset, needs a new column) and Release 3 (agent) are later releases and are not part of R110.

Owner authority (1 November 2026): "Engage the 6 members team and implement release 1 from the repayment handling solution session." This authorizes building Release 1 as R110 and delegating to the team. It does not authorize DEV or PROD deployment, merging, live financial writes or any new table or column (Release 1 needs none).

Owner decisions (plan revision 6):
| Id | Decision |
| --- | --- |
| D1 | Fixed Due Date loans join the forecast: their single Due Date charge can be booked and paid early |
| D4 | Deleting a pay-forward payment leaves the booked charges, which reopen; today's raised or booked principal stays unpaid |
| D6 | Identical future rows collapse into one row with a count, expandable |
| D8 | Daily Installment: pay forward only in Release 1, no principal option |
| D9 | Non-schedule day: book today's charge with accrued interest plus the principal; the interval anchor resets to today |
| D2, D3, D5, D7 | Recorded in plan revision 6; to be copied here by the orchestrator (not in the shared scope file) |

Design rules (owner): one charge per loan per day; no default purpose, so when money exceeds what is due the Partner chooses Pay forward, Repay principal or Split before Review. Booked charges are ordinary charges afterwards.

Planned areas (Release 1 scope; file list filled from `git status` at hand-off):
- Database: migration V121 (functions only): read function `pwa_pay_forward_plan_v1`; payment submit command schemaVersion 10 (several `materialize` entries per loan and a `principal` entry; v9 and earlier keep working).
- API: payment draft returns the plan; Auto-assign uses it.
- PWA: Receive payment Remainder block replaces "Pay ahead"; Collection "Paid in advance" names its source; Borrower detail shows "Paid through <date>".
- Tests: SQL parity with the generator per loan type, concurrency race, unit, integration, receiving Playwright specs.

Team (six-agent process, this session): Archie designs, Byte builds code, Chase verifies once on a disposable cluster, Echo reviews the sheet, Dewey keeps records, Forge: finding to be filled.

## Checks
| Command | Result |
| --- | --- |
| (to be filled) | |

## Not run
To be filled at hand-off. A skipped check is not a pass.

## Recovery
Before release: revert the pull request (Git baseline R109 `8ced324` plus later main commits). Schema: V121 is functions only; rollback is a later migration that restores the replaced bodies. To be completed at hand-off.

## Open questions
None for the owner at this point.

## Remaining work
- Build, verification and review by the team; fill Checks, Not run and the file list.
- DEV and PROD deployment need a separate scoped owner instruction.
- Releases 2 and 3 of the plan.
