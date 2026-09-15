# Payment interval anchor — development

Date: 15 September 2026. Status: implemented and verified in development; owner acceptance pending. Owner approved the proposed stored schedule anchor and development implementation. Production app/data corrections are not authorized by this task.

## Purpose and rollback

Daily-interest scheduling currently counts interval multiples from Loan Date. A revised three-day interval therefore does not start from the agreed change date. Add an optional Loans.Interest Schedule Anchor Date. Blank retains Loan Date; explicit anchor sets subsequent dates to anchor + interval, +2 intervals, etc. Preserve original loan dates, posted charges/receipts, and existing interest-accrual calculations.

Fresh rollback definitions: Dev OLTP `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b` **1.000021**; Dev OLAP `494cd013-0d9b-482f-9559-c9d83059de91` **1.000028**. Full private pre-edit AX appdoc captures are in `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/interval-anchor-20260915`. Database before migration: Flyway V4; pre-DDL schema export `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/development-schema-20260915-162657.sql`. Migration is additive and has no data backfill. No credentials or borrower records belong in Git; published test evidence contains synthetic records only.

## Consumers and scope

OLTP owns loan schedule entry and charge generation. Both Dev apps consume shared Loans, Charges and Repayments through database-3. Loans was regenerated in both; existing settings/formulas/Refs/slices/permissions and companion-app navigation were compared unchanged. OLAP retains financial read-only permissions. Only daily-interest scheduling changes in individual/bulk/scheduled paths. Installment and fixed-date expressions and daily-interest accrual remain unchanged. OLAP displays shared loan metadata and balances. No existing export slice membership or governed metric changes; disabled exports were not run and Looker was not edited or verified.

## Preparation, verification and completion

Final versions: **Dev OLTP 1.000025**, **Dev OLAP 1.000031**, **development Flyway V5**. Production remains unchanged by this task. Sources/permissions are recorded in `outputs/interval-anchor-20260915/consumers-before.json`; final expected-only comparison and verification are alongside it. A temporary extra detail header selected during UI editing was removed before the final comparison; final view changes only add the anchor after Interest Payment Interval.

### Implemented objects

- `database/migrations/V5__interest_schedule_anchor.sql`: nullable Date, no default/backfill, check blank or on/after Loan Date.
- Both Loans schemas: optional physical column, no initial value/formula/reset, nonkey/nonlabel/non-Ref; daily-interest Show_If and matching Valid_If. OLTP editable; OLAP read-only.
- OLTP `Generate Today's Charge` eligibility, Statistics `Generate All Today's Charges` referenced rows/visibility, and `Generate Daily Charges / Daily 00:05` filter use the anchor with Loan Date fallback. Exact expressions are in `outputs/interval-anchor-20260915/expressions.json`.
- OLTP Loans_Form and Loans_Detail; OLAP Loans_Detail: anchor included immediately after Interest Payment Interval. Existing form behavior, headers, quick edits and other view settings preserved.
- Overview, detailed XLSX dictionary (Dev Differences / DB Logic / Guide), development register, environment inventory and this change log updated together. All workbook sheets round-tripped with only intended cell changes; AppSheet expressions stored as text; error scan clean and changed ranges visually checked.

### Development preparation

Reviewed OLTP transaction bots/events/processes/tasks and all three OLAP scheduled/export bots before synthetic writes. Daily generation and OLAP scheduled/export bots remained disabled. The three previously owner-authorized Dev push bots retained sole recipient `LIST("welct0407@mw-credit.com")`; task destinations were checked in the current editor. No new notification task, recipient or bot enablement was added. Essential processing remained confined to database-3. No real collection-agent work or live financial record correction was performed.

### Checks and results

1. Disposable PostgreSQL regression passed using `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-InterestScheduleAnchor.sql`: five migrations applied, second run zero, checksum mutation rejected, nullable fallback and invalid-date constraint passed. PostgreSQL 18.6 / Flyway 13.6.0. Rebuild differs from V1 as expected with V2–V5 present.
2. Development migration applied V5 only at 16:32:48 Bangkok and validated successfully. Schema inspection confirmed Date, nullable, no default.
3. Before bulk GUI testing, SQL found zero other potentially chargeable development loans. Four synthetic loans were seeded without contact details; all interest generation and form tests used the current AppSheet app UI.
4. First real bulk run on 15 September: anchor 14 September / interval 3 produced no charge; due anchor 12 September produced interest 60; blank anchor preserved Loan Date scheduling and produced interest 90; Auto Charge Enabled=false produced none.
5. The real loan form rejected anchor 2 September for a 3 September loan. Setting a valid 12 September anchor saved successfully without changing Loan Date. A second real bulk run produced only interest 10 since that loan's last charge on 14 September. Prior 60/90 charges were not duplicated. Total new synthetic interest 160, principal 0, duplicate groups 0.
6. OLAP new GUI showed the shared anchor 12 September, interval 3 and charge 60 on 15 September with no loan-edit control. The field and Loans table remain read-only in saved configuration.
7. Final app comparison verifies no existing column/formula/Ref/slice/table permission changes, no removed objects, only intended action changes and view-column additions. Synthetic fixtures remain for audit, borrower hidden and all four Auto Charge Enabled=false; no rows deleted.

### Owner acceptance and limits

In Dev OLTP, review the new field on a daily-interest loan. For the requested schedule, set interval **3** and anchor **14 September 2026**; subsequent scheduled dates are **17, 20, 23 September**. Blank retains the original Loan Date schedule. Review the same field in Dev OLAP and confirm it is read-only. No payment automatically moves the anchor. Review the bilingual field wording and confirm this explicit schedule-change workflow meets expectations.

Future 17 September/midnight execution, offline multi-device concurrency and scheduled export/Looker delivery were not tested. Daily bot remains disabled per development preparation rules. Fixed-date/installment branches were compared unchanged, not retested through new financial transactions. Bell's copied development and production financial history was not corrected by these synthetic tests. Premature production charges still require a separately approved, auditable correction before release; do not delete or regenerate them blindly. Owner manual acceptance and production promotion are pending.

Rollback: restore the two recorded development app versions. Preserve the additive nullable database field and any entered anchor values for recovery; remove it only through a separately reviewed higher Flyway migration after checking consumers. App rollback does not reverse test data. Production premature-charge corrections remain a separate authorized release, with audit trail and no double charging.
