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

## DEV deployment evidence
Forge, 9 November 2026 (UTC). Package: PR #273 head `e81072f`; `Development checks` run 42601853028 and `Database migrations` run 42601844703 green. Target `loan_manager_dev` on `mw-credit-pg-20261017`; preflight 10:41Z at head 139.
- Backup at V139, 10:42Z to 10:44Z: dump sha256 `9e376c17…92a9e3`, restore and 39 table fingerprints passed, folder `dev-refresh-3ad379b427354a05a0c58b875d1c1ebe` under `dev-backups/`.
- Image: Cloud Build `7b23e848-446f-441d-891b-4bd3ee0cdd91`, digest `sha256:ace2363d811e3849404d258dcad16d9de10c7ad1486428111d9d011370df45b2`.
- V140: owner window 10:46:09Z to 10:53:58Z, closed and read back; migrate 3.3 s; reconcile 565 statements, 0 violations; `validate` clean; `verify` schema 140. Manifest `release-r137-v140-e81072fc.json` sha256 `4ac6062f…7184`.
- Terraform: plan 0 add, 3 change, 0 destroy (image only), plan sha256 `0d711d74…8592`, settings generation `1794221803831392` (previous `1794188367905895`), re-plan clean. Revisions: read `00078-tbb`, command `00095-wtk`, chat `00047-cdv`; notify and jobs unchanged on `d35efe83…`.
- Hosting: version `7cb80157ed2451f1`, release `1794221945553000`, build-version R137 `06e2b59006efce53ebf0a9bf`.
- Smoke: origins 200, health 200, unauthenticated 401, CORS preflight 204, no ERROR logs. Daily Collection Status on DEV: Long Overdue 20 to 32, Overdue 19 to 7, Fully Paid 1, blank 48.
- Rollback: settings generation `1794188367905895`, then Hosting `214e47b93d7fdc27`; V140 is forward-fix only. Private records: `gs://mw-credit-operator-private-737787224638/promotion-packages/r137/dev/`.
- Owner decision, 9 November 2026: a rollover does not reset the clock; the rule stays as built.
- Chase board smoke on DEV: not run. The board needs the owner's Firebase sign-in and the session has only `codex-cloud`; the owner tests the Collection board on DEV. Ordering and fields are covered by the disposable-database tests.

## Not run
Low risks Chase noted, not fixed: a borrower with only `df10:` unpaid charges falls to Overdue in both the view and the API; a cursor issued before the deploy can skip or repeat a row once across the deploy.

V140 is not applied to PROD. The PostgreSQL dictionary record of `olap_borrowers_analytics` (a captured live definition) is unchanged: the established capture was not run against DEV, so the refresh is pending.

## Recovery
V140 is forward-fix only. A later migration restores the V132 text of `collection_long_overdue` (charge older than the date minus 7 days) and drops the two CTEs by the same method; the Git baseline is the commit before V140.

## Open questions
- Add a "Days Since Last Payment" column to the view for the Metabase lane (owner authority needed)?

## Remaining work
Apply V140 to PROD with the usual backup and records; update the Metabase question text; refresh the dictionary record.
