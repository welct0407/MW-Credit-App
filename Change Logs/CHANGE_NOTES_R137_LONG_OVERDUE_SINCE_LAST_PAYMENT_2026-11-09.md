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
| Integration tests (`collection-postgres`) | 23 of 26 pass; the same 3 failures exist before the change (3494144: 21 pass, 4 fail; Chase confirmed); the suite is not run by CI |
| Chase diff review (commits `0a1cca5`, `706ee67`) | Pass: the API and V140 agree on the payment definition (posted repayment, method not Referral Rebate Offset or Net-off at Disbursement, amount above 0, date on or before the reporting date, 8 or more days); the first charge excludes `df10:` rows; sort and cursor v5 are correct; a same-day payment counts as 0 days |
| e2e `collection-read.spec.ts`, desktop-chromium | Pass, 3 of 3 (Chase) |
| PR #273 Database migrations run 42599654593 ("rebuild (receiving)") | Fail before the fix: `collection-prepaid-source-independent.test.mjs` threw permission denied without the optional Payments and Repayments `"Ref Payment"` grants (reproduced on `212d834`, 2 of 4 pass) |
| After Byte's fix: that test, focused unit tests, biome, typecheck | Pass: 5 of 5 including the new fallback test; unit 16 of 16 (Byte) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## CI correction
PR #273 failed on the permission error above. `readCollection` now checks the grants once (the R114 `has_column_privilege` check): with the grants it applies the full rule; without them it falls back to Repayments dates and amounts only (any repayment above 0 counts), which can understate Long Overdue but never overstate it, and never throws.

## Not run
Low risks Chase noted, not fixed: a borrower with only `df10:` unpaid charges falls to Overdue in both the view and the API; a cursor issued before the deploy can skip or repeat a row once across the deploy.

V140 is not applied to DEV or PROD, so the PostgreSQL dictionary record of `olap_borrowers_analytics` (a captured live definition) is unchanged; refresh it after the apply.

## Recovery
Before the apply, nothing live changes. After it, a later migration restores the V132 text of `collection_long_overdue` (charge older than the date minus 7 days) and drops the two CTEs by the same method; the Git baseline is the commit before V140.

## Open questions
- Add a "Days Since Last Payment" column to the view for the Metabase lane (owner authority needed)?

## Remaining work
Apply V140 to DEV, then PROD, with the usual backup and records; update the Metabase question text; refresh the dictionary record.
