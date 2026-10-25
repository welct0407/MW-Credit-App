# Change notes — Loan Close ignores unpaid interest on future-dated charges (R101), 25 October 2026

## Purpose
Loan Close charged the full interest of a charge dated after the close day and stopped counting interest from the last charge to today. The borrower paid for days that had not happened. The owner decided on 25 October 2026 to ignore that unpaid interest, as a separate change; it resolves the open question (Chase D-1) in the [pay the next charge early note](CHANGE_NOTES_R101_PAY_NEXT_CHARGE_2026-10-25.md).

## Changes
- Rule, in plain terms: Loan Close charges interest only up to the day of the close.
  - Principal: everything still owed, as before.
  - Interest: unpaid interest on charges dated today or earlier, plus interest from the last of those charges up to today, as before.
  - A charge dated after today counts only for the days up to today. Interest for later days is dropped. Interest already paid on it counts towards those days and is never refunded.
  - After the close the future charge shows as settled, so the loan closes normally.
  - Loans with no future-dated charge close exactly as before, with byte-identical plans. Hand-booked future charges follow the same rule. The Instagram agent still sends any loan with a future-dated charge to review.
- Example, at 10 baht a day, principal 1,000, last charge 3 days ago, next charge booked 4 days ahead with 70 interest:

| Early payment on the booked charge | Close today, before | Close today, after |
| --- | --- | --- |
| None, or deleted | 1,070 | 1,030 |
| 40 paid | 1,030 | 1,000 |
| 70 paid in full | 1,000 | 1,000 |

- `database/migrations/V113__loan_close_future_interest.sql` and `database/current/public-functions.sql`: `loan_close_calculation_v83` and `apply_loan_close_calculation_v83` redefined. When a stored Interest Due changes, the calculation's `mutation` carries `futureInterest` and the apply lowers those charges' Interest Due and appends a note to the charge's Notes. The plan hash still covers the full context, so a stale preview fails as before.
- Output shape: `mutation.futureInterest` lists only the charges whose due is lowered; a mutation that was null becomes kind `adjust`. Nothing outside the database reads `mutation`. Final rule (commit `13396e7`): A future charge already lowered by an earlier Loan Close counts as settled and keeps its lowered interest. The Notes line on the charge, "Interest Due lowered from <old> by Loan Close <date>", is what marks it settled; if a Partner edits that line away, the charge falls back to the normal rule. Interest days start from whichever is later: the last charge on or before the close day, or that earlier close date. Re-closing a reopened loan on a later day therefore charges only the days since the first close (example: 1040, 1050 and 1060 at 1, 2 and 3 days after).
- A trail note with an invalid date is ignored rather than failing the payoff.
- `scripts/chat/build-schema-digest.mjs` (Loan Close description) and `services/chat/assets/schema-digest.json` (rebuilt at migration 113, rebuilt again at `13396e7` without change): after the chat redeploy each chat thread starts a new history epoch.
- Tests (Byte, commit `3edf1d1`): `scripts/database/Test-AtomicLoanClose.sql` cases 1 to 8, including a byte-identical comparison against the V112 calculation for loans without a future charge, an adjust-only close (1020), an `lc7:` charge from yesterday plus a future charge (1010), a pre-V113 `lc7:` charge plus a hand-booked future charge (1050) and re-closes on later days (1040, 1050, 1060); `tests/integration/projected-charge-payment-independent.test.mjs`, one case (not `phase5-operation.test.mjs`, which runs at V96).
- Records: `services/chat/assets/conversation-business-rules.md` (sections 6 and 15 item 5; the chat image needs a redeploy to pick it up), `project/Documents/Development_Changes.md`, `database/README.md` (V113 paragraph), and the open question in the pay-next-charge note.
- Workers (Archie, Byte, Chase, Dewey, Echo, Forge) were restarted after a session restart; this batch was recorded by the restarted Dewey.

## Checks
| Command | Result |
| --- | --- |
| `python3 -B scripts/database/Test-MigrationsCloud.py` (as postgres: 113 migrations, second run 0, SQL tests including the extended `Test-AtomicLoanClose.sql`, 9 of 9 concurrency suites, checksum tampering rejected, `public-functions.sql` matches the rebuild) | Pass, clean tree of `1ebec53` (Byte) |
| `npm run -s lint` | Pass, 565 files, clean tree of `1ebec53` (Byte) |
| `npm run -s typecheck` | Pass, clean tree of `1ebec53` (Byte) |
| `npm test` | Pass, 918 pass, 1 skipped, `3edf1d1` (Byte); later commits changed SQL and SQL tests only |
| `tests/integration/Run-UnifiedReceiving.ps1` (CI=true) | Pass, 20/20 and 5/5 including the V113 case, clean tree of `13396e7` (Byte); `1ebec53` changed only the trail date parse and its SQL tests |
| `tests/unit/chat-schema-digest.test.mjs` against a V113 lab | Pass, 4/4, `3edf1d1` (Byte) |
| Adversarial review of `bfd2ad4..13396e7`; owner table rows 1030/1000/1000 through the real function; delete then re-close at D to D+3 (1030/1040/1050/1060); adjust-only close 1020; lc7 plus future 1010; trail after D; stale hash `P5B09`; charge today plus future; regex and edited-note cases | Pass after fixes in `13396e7` and `1ebec53`; known limitation recorded under Open questions (Chase, disposable cluster) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## Not run
- The wide Playwright suite: no PWA change in this batch; the pull request's `Development checks` is the broad run.
- `tests/integration/phase5-operation.test.mjs`: it runs at V96, so the V113 case lives in `projected-charge-payment-independent.test.mjs`.
- Unit tests and `Run-UnifiedReceiving.ps1` on `1ebec53`: that commit changed only SQL and SQL tests, covered by the migration chain run.
- A data dictionary capture: production captures are refreshed after V113 reaches PROD.

## Recovery
Git baseline `bfd2ad4` (V113 committed as `3edf1d1`). V113 is `CREATE OR REPLACE` of the two Loan Close functions; rollback is a later migration that restores the V112 bodies. Charges whose Interest Due a close lowered keep the lower value and a note; a rollback does not restore them. Deleting the closing payment also keeps the lowered due.

## Open questions
None. Accepted consequence: undoing a close (deleting or correcting the closing payment) leaves the future charge's lowered interest. If the loan then continues past that date, a Partner should edit the charge.

Known limitation, owner choice. The case: a loan was closed early, the closing payment was deleted, the loan ran past the future charge's own date, and it is then closed again. What happens: the quoted payoff is short by daily interest × the days between the first close and that charge's date (example: 1030 instead of 1070). Nothing flags it. A Partner corrects it by raising that charge's Interest Due back to the amount shown in its "lowered from" note. The owner can accept this, or have it fixed later by restoring the lowered interest when a closing payment is deleted.

## Remaining work
The DEV promotion (applied and verified in DEV on 25 October 2026, including a Loan Close test with a hand-booked future charge; PROD pending the owner's instruction) is in the [promotion record](CHANGE_NOTES_R101_PAY_NEXT_CHARGE_2026-10-25.md#promotion-record). Verification and owner acceptance; PROD promotion on the owner's instruction.
