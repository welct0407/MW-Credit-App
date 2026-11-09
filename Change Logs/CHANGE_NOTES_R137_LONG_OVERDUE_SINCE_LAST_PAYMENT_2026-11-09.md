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

No authenticated PROD check was made. The PostgreSQL dictionary record of `olap_borrowers_analytics` was refreshed at closure from the PROD capture (see Closure notes).

## Recovery
V140 is forward-fix only. A later migration restores the V132 text of `collection_long_overdue` (charge older than the date minus 7 days) and drops the two CTEs by the same method; the Git baseline is the commit before V140.

## Open questions
- Add a "Days Since Last Payment" column to the view for the Metabase lane (owner authority needed)?

## Remaining work
Owner acceptance in PROD; update the Metabase question text (Byte).

## PROD promotion record (Forge, 9 November 2026, UTC)
Authority: the owner's instruction of 9 November 2026, "move to production", relayed by the orchestrator as the scoped PROD approval for R137: the PROD backup and restore verification, V140 (a view only) on `loan_manager_prod`, the standard temporary owner window and its restoration, the changed images, Hosting and the technical records. No payment, notification or job was forced, and no financial correction or other data write was made; the smoke is read-only. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in `gs://mw-credit-operator-private-737787224638/promotion-packages/r137/` (receipt also in `promotion-receipts/R137-HOSTING-RECEIPT.json`).

| Step | Result |
| --- | --- |
| Freeze (baseline read 11:12Z) | Release R137; package `e81072f` (PR #273 head), merged to `main` as `0e9997c8d4050291b906771d216eaef9b0fd79b0`; deploy inputs of `e81072f` and `9b76950` are identical. Baseline R136 `3aafed13`. Next unused number R138 (opened by the closure pull request) |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod`, Hosting site `mw-credit-prod-737787224638` |
| Baseline capture (11:12Z) | Flyway head V139 (139 history rows). Revisions read `00050-5wg`, command `00055-t94`, chat `00034-mzp` on `b8a04f8e…`, notify and jobs on `f8cb243b…`; settings generation `1794191808466000`; Hosting `5af169db6cb665ce`, release `1794192111540000` |
| Backup at V139 | `prod-promotion-ae80a30425364d28b561751d1f2f9d94`: dump sha256 `65c08214…68a9`, isolated restore passed, 39 table fingerprints matched |
| Image | Cloud Build `4a02ad3a-9d3b-4458-9009-5451a6615fd2`, PROD builder digest `sha256:d5eae8f1…2835`; the DEV image was not relabelled |
| SQL package | Manifest `release-r137-v140-e81072fc-prod.json`; V140 sha256 `29d28f95…` equals the DEV-applied bytes; connect preflight `544863e6…` (0 DEV sessions); `check`: pending exactly `["140"]` |
| Owner window and V140 | Window 11:19:06Z to 11:21:04Z (24 statements each way; the first close attempt was refused for missing PROD arguments and the retry closed it). V140 applied 11:19:23Z to 11:20:42Z, 3.4 s, checksum 488249198. `verify` schema 140. Owners closed, no CREATE on `public`, view owner and grants unchanged |
| Data effect | Daily Collection Status on PROD: Long Overdue 13 to 9, Overdue 2 to 6, Fully Paid 11, Not Paid 2, blank 24 |
| Terraform | Plan 0 add, 3 change, 0 destroy (image only; plan sha256 `2297de86…`, JSON `3c95c02f…`), settings generation `1794223508302093` (previous `1794191808466000`), applied 11:25:11Z to 11:25:47Z, re-plan clean. Revisions read `00051-kh6`, command `00056-tr2`, chat `00035-8x4`; notify and jobs unchanged |
| Hosting | Generic runner package `f7f18962…`, 18 files, as `mw-credit-unattended-admin`: version `17fa23f731e997e3`, release `1794223923190000`, build-version R137 `41ed456ba05adad5e3f86a6d` |
| CI receipts | e2e: reused run 42599959317 (`212d834`, input-equivalent); Terraform: evidence run 42480531387; `Development checks` 42601853028 and `Database migrations` 42601844703 on `e81072f` |
| Smoke (read-only) | Origins serve R137 (200), health 200, unauthenticated 401, CORS preflight 204, no ERROR logs 11:19Z to 11:32Z; second read-only verification at 11:30:38Z |
| Rollback | Settings generation `1794191808466000`, then Hosting `5af169db6cb665ce`. V140 by a forward fix only (a later migration restoring the V132 text of `collection_long_overdue`) |

### Deviations
- The first owner-window close attempt was refused for missing PROD arguments; the retry closed it.

### Limitations
- No authenticated PROD check and no board read on PROD data; owner acceptance in PROD is pending.

### Tag record
Annotated tag `R137` on `0e9997c8d4050291b906771d216eaef9b0fd79b0` (merge of PR #273, `main`) through the Release tag workflow, run [42610347210](https://github.com/welct0407/MW-Credit-App/actions/runs/42610347210), succeeded 11:36:44Z; tag object `07dc9fb342a3bca54c91830b73c16419457d763a`, GitHub Release published in the same run.

### Closure notes
- Acceptance: PROD acceptance by the owner is pending. The owner decision that a rollover does not reset the clock stays as built.
- Data Dictionary: refreshed in this closure from a read-only PROD capture at schema 140 (`capture_postgresql.py production` as `codex-cloud-read`, metadata only, 9 November 2026; capture sha256 `46c2e6be3d32366f0501e8bb649070f23406a24eb3caca587a6ae5bfed41c24e`): the relation `public.olap_borrowers_analytics` only. The index is rebuilt and `dictionary.py validate` shows no errors. Evidence: [plan, coverage and observations](../project/outputs/dictionary-r137-20261109/).
- Metabase texts for Byte (not edited here, Metabase is Byte's): question 414 description and the lane note in `build_design.py` ("8+ days", "sorted by overdue amount"), and the question 396 description (the Long overdue lane wording), which still describe the charge-date rule.

### Prune (closure)
Deleted after repointing every inbound link to commit `0e9997c` (the last commit where it exists): `Change Logs/CHANGE_NOTES_R134_LATE_CHARGE_STEPPER_2026-11-07.md` (R134 left the three-release window of R137, R136 and R135). The Development Changes row for R137 is removed (the tracker row links this record). Deleted as evidence nothing current cites (the Data Dictionary documents it fed were refreshed since): `project/outputs/dictionary-r131-20261105/` (plan, coverage and observations). Other notes are inside the window or linked by current documents and stay.
