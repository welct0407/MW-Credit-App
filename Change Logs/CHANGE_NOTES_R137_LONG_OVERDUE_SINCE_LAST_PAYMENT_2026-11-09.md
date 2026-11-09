# Change notes — Long Overdue counts from the last payment (R137), 9 November 2026

## Purpose
Owner decision of 9 November 2026: a borrower is Long Overdue when they have at least one unpaid past-due charge and 8 or more days have passed since their last payment. A borrower who never paid counts from the first charge date. Any payment of any amount counts, per borrower across all loans. The Collection list shows the fewest days since last payment first.

## Changes
- `database/migrations/V140__long_overdue_since_last_payment.sql` (Byte): `CREATE OR REPLACE VIEW` of `olap_borrowers_analytics` only; columns, types and grants unchanged; `olap_portfolio_summary` not recreated and follows automatically.
- Payment definition: a posted repayment (`"Ref Payment"` set) of more than 0 whose payment method is not 'Referral Rebate Offset' and not 'Net-off at Disbursement'. The V138 rollover settlement and the first-day charge carry no borrower cash, so after a rollover an unpaid charge on the new loan counts from the last cash payment.
- `services/api/collection-read-contract.mjs`: `LONG_OVERDUE_SINCE_PAYMENT_DAYS = 8`; long overdue rows carry `sinceLastPaymentDays` and `neverPaid`; cursor v5 unchanged.
- `apps/pwa/src/CollectionRecords.tsx`: copy "No payment for N days" and "Never paid · N days", English and Thai. Chat schema digest 139 to 140.
- Records: `database/README.md` (V140), `project/Documents/Solution_Design.md` (Long overdue rule), `project/Documents/Release_Tracker.md` (R137 scope), `project/Documents/Development_Changes.md`.
- Metabase lane question 414 keeps overdue-amount order; the optional "Days Since Last Payment" view column was not added (needs owner authority). Metabase text still says "8+ days overdue" (the lane note in `build_design.py` and the question 414 and 396 descriptions) and "more than 7 days" for the V114 rule; Byte updates it, not this batch.

## Checks
| Command | Result |
| --- | --- |
| V1 to V140 disposable migrate | Pass (Byte) |
| `scripts/database/Test-LongOverdue.sql` | Pass (Byte) |
| `npm test` | Pass, 1251 of 1251 (Byte) |
| typecheck, lint | Pass (Byte) |
| Integration tests | 23 of 26 pass; 3 pre-existing failures (Byte; confirmation by Chase pending) |
| Chase verification | pending |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
V140 is not applied to DEV or PROD, so the PostgreSQL dictionary record of `olap_borrowers_analytics` (a captured live definition) is unchanged; refresh it after the apply.

## Recovery
Before the apply, nothing live changes. After it, a later migration restores the V132 text of `collection_long_overdue` (charge older than the date minus 7 days) and drops the two CTEs by the same method; the Git baseline is the commit before V140.

## Open questions
- Add a "Days Since Last Payment" column to the view for the Metabase lane (owner authority needed)?

## Remaining work
Apply V140 to DEV, then PROD, with the usual backup and records; update the Metabase question text; refresh the dictionary record.
