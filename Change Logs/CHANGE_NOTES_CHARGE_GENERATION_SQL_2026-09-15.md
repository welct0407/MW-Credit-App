# Common charge generation and database schedule — phases 4–5

15 September 2026. **Implemented and verified in development; owner workflow acceptance pending.** Owner requested phases 4 and 5, approved the nullable Loans.Charge Generation Request column, and explicitly approved nightly development generation after the scheduled test. Production deployment was not authorized. Default posting and analytics remain phases 6–7, outside this task.

## Rollback points

Before-change Git `ea274895a0fb5dbf384d1a605957d65fa36bd72c`, Flyway V7, fresh Chrome appdoc OLTP **1.000036** and OLAP **1.000036**. Both definitions recorded before edits. Private snapshot: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/charge-generation-20260915/development-before.dump`, SHA256 `681f5b1386e83755f7b3532130f7174a7b1b855ea50735a3fc88b7b836032cf9`. Archive listing checked; full restore not rehearsed. Pre-schema normalized SHA256 `0a1972cc1e8eb5a072da584d394cfc85b3b1b96fc991e11b6fba9c39a4480c98`. Dictionary-before.xlsx is in the same private folder. Credentials/snapshots remain outside Git; independent backup coverage unverified.

## Implemented scope and ownership

OLTP owns manual/scheduled charge generation; OLAP consumes shared Loans/Charges and existing reporting calculations. V8 adds the approved hidden nullable command field, common generate_loan_charge, atomic generate_due_charges, request validation function and AFTER Loans trigger. Existing interval/anchor/daily-accrual/fixed-date/installment-remainder rules were inspected in fresh AppSheet definitions and preserved. Borrower/loan/charge locking and deterministic charge keys prevent duplicates. Manual borrower NOWAIT avoids lock-order deadlocks with payment posting; failed commands roll back, with a sync/retry message. Invalid eligible loans roll back a nightly batch.

V9 installs pg_cron and creates an initially inactive daily job. Development Cloud SQL flags saved/restarted at **20:35:07 Bangkok**: enable_pg_cron on, cron.database_name loan_manager_prod, cron.timezone Asia/Bangkok, max_running_jobs 1; existing IAM authentication and max_connections 50 retained. Live pg_cron is **1.6.7**, background workers on; session TimeZone remains UTC and command computes Bangkok date explicitly. Instance size, security and network unchanged.

Both current development apps are **1.000039**. OLTP Generate Today's Charge now assigns only `CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|", UNIQUEID())` to the request field; existing hidden position and eligibility condition remain. Generate All Today's Charges retains its existing route. The field is hidden Text, OLTP Editable_If FALSE, OLAP Read-Only Yes, no default/formula/backfill. Reporting Loans appends the hidden field and remains READ_ONLY. All existing column/relationship/form/detail settings match the pre-change definition; OLAP's generated View Ref (Ref Target Loan) visibility changed ADVANCED to ALWAYS, with unchanged target/condition/no-edit behavior. No other action or calculation changes. Both current Automation lists verified the same four owner-only notification bots, with superseded financial/scheduled bots and OLAP export disabled. No new destination or notification was introduced.

The actual temporary scheduler test succeeded at **20:52 Bangkok**, created exactly one charge 20, and was removed after verification. The primary loan-daily-charges job is now **active at 00:05 Bangkok** by owner approval. Synthetic borrowers are hidden and all five fixture loan auto-charge flags are off; history retained. Production remains V5 / OLTP3.000080 / OLAP1.100055.

## Evidence and checks

- Full disposable regression passed: 9 migrations, repeat no-op, checksum mutation rejection; V6/V7/V8 functional and concurrency checks. The initial new test helper scope error was fixed before live migration; final suite passed. Local Windows intentionally skips pg_cron; actual Cloud SQL scheduler run was separately verified.
- Current OLTP GUI bulk action created daily interest 50; fixed principal100 + interest30; installment principal22 + interest8; off-interval loan skipped. After sync the bulk action disappeared. SQL stored three request tokens and matching deterministic charges.
- Current OLAP GUI readback shows 50/130/30 plus scheduled20, with read-only loan details and hidden request field. Reporting search needed a browser refresh after sync once. Existing OLTP Principal Due currency symbol displays `$22.00`; numeric value and total reconcile, and the column settings were unchanged.
- All original rows across **14 business tables** match pre-task fingerprints. Only synthetic CG8GUI rows and the new nullable request field are excluded. Live normalized business schema matches independent V9 rebuild: `49765db93df4c0851d171394d9e340f0b0f361d6e4160bc62861a6cd165aea91`.
- Model overview, dictionary, Development Changes, Environment Inventory, preparation checklist and database README updated together. Dictionary changed 61 rows; all 12 sheets round-trip to exact expected values; existing formula/native feature inventory preserved; error scan finds zero entries; changed views rendered for review.
- Looker/export direct impact is an additive hidden command field with unchanged financial grains and metrics. No report edit or broad dashboard audit; disabled export remains disabled. Production-scale timing, offline multi-device behavior and the first natural 00:05 run are untested.

Maintained scripts are in scripts/database and scripts/charge-generation-dictionary.mjs; tests and CI use Test-ChargeGeneration.sql plus payment/close/generation concurrency. Evidence under [outputs/charge-generation-20260915](../outputs/charge-generation-20260915/REPORT.md) includes migration/validation, scheduler run, final state, GUI financial reconciliation, preservation and workbook verification.

## Recovery, manual testing and publication

Pause with Set-DevelopmentChargeSchedule.ps1 -Mode pause-nightly. Preserve charges/refs. Coordinate both-app restore to 1.000036 with SQL review; keep the job paused when restoring old manual generation. V8/V9 are immutable; corrections require V10 or higher. Restore the private backup only into a separate development instance first, reconciling later history. Do not drop the command column or delete financial rows as routine rollback. App restore alone cannot revert SQL. Full hashes and Cloud settings are in the report.

Owner checklist: sync both apps; check daily-interest, fixed and installment due generation; verify one charge per loan/date, auto-off/off-interval skips, component totals and hidden/user-read-only command field. Check the first natural nightly run's cron.job_run_details and generated charges. Workflow acceptance remains pending. Nightly activation was separately approved and completed. Production needs a restorable backup, drift/dependency review and explicit release approval for the exact tested commit/hashes.

Relevant checks and staged diff must pass before normal commit/push to master; publication status is reported after push verification. Repository publication alone does not authorize production changes.
