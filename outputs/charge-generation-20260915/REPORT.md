# Phases 4–5: common charge generation

15 September 2026. Implemented and verified in development; owner workflow acceptance pending. Production remains Flyway V5 / OLTP 3.000080 / OLAP 1.100055. No production deployment or Looker edit occurred.

## Result

- Development Flyway V8 supplies one generator for manual and nightly daily-interest, fixed-date and installment charges. V9 installs pg_cron and creates an initially inactive job; a separate reviewed development runner activates it after testing.
- Both development apps are **1.000039**, using database-3. OLTP's existing **Generate All Today's Charges** routes to **Generate Today's Charge**, which now writes only `Loans.Charge Generation Request`. SQL calculates and inserts the charge within that update transaction.
- `loan-daily-charges` is **active at 00:05 Asia/Bangkok**, as explicitly approved by the owner. The superseded AppSheet Generate Daily Charges bot stays disabled. Four reviewed owner-only notification bots remain enabled; OLAP schedules/exports remain disabled.
- First-day and Close Loan routines retain their specialized V6/V7 SQL behavior. Default-loan posting and analytics are phases 6–7 and remain outside this change.

## Business rules and limits

The nullable request column has no default/backfill. It is hidden Text in both apps, user-read-only via Editable_If FALSE in OLTP (allowing action assignment), statically read-only in OLAP. The command is `CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|", UNIQUEID())`. SQL rejects malformed or Bangkok-stale dates. An unchanged token is a no-op; different tokens cannot duplicate an existing loan/date charge.

The generator preserves the inspected AppSheet rules: auto enabled, active loan, date eligible, and no existing charge on that date. Daily-interest interval alignment uses the optional schedule anchor, while accrual starts at the latest charge date at or before the business date (Loan Date fallback). Fixed loans generate remaining principal and fixed interest on Due Date. Installments preserve quotient/remainder principal distribution and interval/final-due-date behavior, requiring a preceding charge. Invalid negative components fail atomically; no new business interpretation of unpaid balances was introduced.

Borrower, loan and charge locks serialize generation with payment posting. Because a manual Loans update already holds its loan lock, its borrower lock uses NOWAIT: a concurrent payment may produce **Loan is busy; sync and request charge generation again**, leaving no partial charge or request update. The nightly batch is atomic; one invalid eligible loan rolls back that run. Inspect cron.job_run_details for failures; this task adds no notification monitor. The job processes its current Bangkok date, not a historical backfill after outages. Refresh apps to see SQL-generated rows; OLAP required a browser refresh once when sync retained a stale search result.

## Verification

| Check | Result |
| --- | --- |
| Disposable PostgreSQL 18.6 / Flyway 13.6 | All 9 migrations apply, validate, repeat as zero changes; checksum tampering rejected |
| Functional and concurrency regression | V6 core payment, V7 atomic Close Loan, V8 interval/accrual/fixed/installment/retry/error/rollback cases pass; manual/payment lock contention rejects promptly and retry reconciles |
| Current OLTP GUI manual generation | Existing bulk action created daily interest 50, fixed principal 100 + interest 30, installment principal 22 + interest 8; OffDay loan skipped |
| Manual completion | After sync, Generate All Today's Charges disappeared; three stored request tokens map to deterministic cg8 charge IDs |
| Actual Cloud SQL scheduler | Temporary job 2 ran at 20:52:00 Bangkok, succeeded in about 39 ms, created exactly one Cron fixture charge principal 0 / interest 20; job removed after reconciliation |
| Current OLAP GUI | Daily 50, fixed 130, installment 30 and scheduled 20 visible in related charges; read-only loan detail and hidden request field retained |
| Original rows | Fingerprints across all 14 business tables match pre-task baseline, excluding only CG8GUI fixture rows and the additive nullable request field |
| Live business schema | Equals independent V9 rebuild; normalized SHA256 `49765db93df4c0851d171394d9e340f0b0f361d6e4160bc62861a6cd165aea91` |
| Cleanup | Five fixture borrowers hidden, all five loan auto-charge flags disabled; financial history retained |

Windows disposable PostgreSQL lacks pg_cron: V9 explicitly skips scheduler installation there. The actual Cloud SQL test above verifies scheduling separately. Test coverage does not establish overnight production-scale timing, offline multi-device recovery or a completed natural 00:05 run. The current OLTP charge detail retains a pre-existing dollar symbol on Principal Due (`$22.00`); its numeric value and total reconcile, and this change did not alter that column's formatting.

## Configuration and dependencies

Fresh before/after appdoc property comparison: OLTP changes only the new request column (plus generated schema copies), version/column summary, and Generate Today's Charge. Existing columns, keys, defaults, formulas, references, slices, forms/details and other actions match. OLAP adds the hidden request column and appends it to READ_ONLY Reporting Loans; existing settings match except generated View Ref (Ref Target Loan) visibility changes ADVANCED to ALWAYS, with the same navigation, condition and no edit permission. Both current Automation lists were checked: no bot enablement changes or new destinations.

OLTP owns this workflow. OLAP reads shared Loans/Charges through existing calculations. No grain or charge/repayment relationship changed. Looker/export direct dependencies were reviewed for the additive command field; it is not a reporting metric. No dashboard audit or report refresh was performed, and the existing disabled OLAP export remains disabled. Cron deployment metadata is not added to either app.

Cloud SQL development `appsheet-pg-dev-20260915`, host `34.158.38.171`, database `loan_manager_prod`: saved/restarted at 20:35:07 Bangkok. Preserved cloudsql.iam_authentication=on and max_connections=50; added cloudsql.enable_pg_cron=on, cron.database_name=loan_manager_prod, cron.timezone=Asia/Bangkok, cron.max_running_jobs=1. Live extension is 1.6.7, background workers on; session TimeZone remains UTC, and the SQL command explicitly derives the Bangkok date. Machine/network/security settings were unchanged. See [Cloud SQL extension guidance](https://docs.cloud.google.com/sql/docs/postgres/extensions) and [pg_cron API](https://github.com/citusdata/pg_cron/blob/main/README.md).

## Recovery and promotion

Before edits: Git `ea274895a0fb5dbf384d1a605957d65fa36bd72c`, Flyway V7, **both apps 1.000036**. Private snapshot folder: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/charge-generation-20260915/`. `development-before.dump` SHA256 `681f5b1386e83755f7b3532130f7174a7b1b855ea50735a3fc88b7b836032cf9`; archive list verified, full restore not rehearsed. Pre-schema hash `0a1972cc1e8eb5a072da584d394cfc85b3b1b96fc991e11b6fba9c39a4480c98`. Credentials and private snapshots remain outside Git; their independent backup coverage is unverified.

V8 hash `897e34a8d1f6db8cd63ae1caeb240a5c53471c45bc068e3fe410cab034d3e226`; V9 hash `b41d8c4dd1cf5af92e4208de019c2e64940172d054fb91ee1c0823ff01f6a13b`. Applied migrations are immutable; corrections require V10 or higher.

First pause the development job with `Set-DevelopmentChargeSchedule.ps1 -Mode pause-nightly`. Preserve generated charges and references. Restore both recorded AppSheet versions only as part of coordinated recovery; the old manual action writes charges directly, so keep the SQL nightly job paused while investigating. Use a higher migration for SQL correction, or restore the private backup to a separate development instance and reconcile subsequent history. Do not drop the command column or remove financial rows as routine rollback. Removing cron flags requires a separately reviewed restart after disabling/removing the job and extension as appropriate. An app restore alone cannot revert SQL.

Promote only an exact tested commit and migration hashes after a restorable production backup, drift/dependency review, owner acceptance and explicit release approval. Repository publication does not authorize production deployment.

## Owner check

In development, sync both apps and check a due daily-interest, fixed-date and installment loan: use Generate All Today's Charges where eligible, confirm component totals and one charge per loan/date; verify auto-off/off-interval loans are skipped. The request field should be absent from forms/details and OLAP remain read-only. After the first natural nightly run, check cron.job_run_details and corresponding charges. Owner acceptance of this phase's workflow is still pending; nightly activation itself was explicitly approved.
