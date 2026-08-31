# Daily Loan Analysis Automation

## Purpose

This pilot produces a private daily loan-analysis workbook from the OLAP AppSheet app and uses that workbook as the governed input to a standalone Codex summary. It does not add an operational data-entry path, change financial records, or make Looker Studio responsible for business logic.

## Architecture

1. `Loan Business Insights` reads the existing reporting slices and creates one timestamped XLSX workbook in the app owner's private Google Drive.
2. The workbook contains separate, joinable worksheets rather than one flattened export.
3. A standalone Codex scheduled task locates the newest workbook, validates freshness and data quality, performs the analysis, and returns a personal summary in the scheduled task result.
4. Email delivery is out of scope for the pilot. Outlook or Gmail can be added only after the private summary is accepted.

Both the AppSheet bot and Codex automation are disabled/paused until the first production-data test and final timing are approved.

## Workbook contract

| Worksheet | Grain and purpose |
|---|---|
| `Manifest` | One export-run row with freshness, source, schema version, and population counts. |
| `Statistics` | Current governed portfolio totals and today's collection metrics. |
| `Daily Analytics 30D` | One row per persisted portfolio snapshot date for the most recent 30 calendar dates. |
| `Borrowers` | Full borrower master. `Borrower Name EN` is sourced only from `Borrowers[Description]`. |
| `Loans` | Full loan master. Joins to Borrowers by `Borrower ID`. |
| `Charges` | Charges in the selected 30-day period, plus the full earlier charge history of every loan with activity in that period. Joins to Loans by `Loan ID`. |
| `Repayments 30D` | Repayments in the selected 30-day period, plus the full earlier repayment history of every loan with activity in that period. The worksheet name is retained for backward compatibility. Joins by `Loan ID` and `Charge ID`. |

The current selected period is the 30 calendar dates ending on the export date, inclusive. A loan is activity-linked when its loan date, close date, a charge date, a charge payment date, or a repayment payment date falls inside that period. Direct in-period transaction rows remain included even if their loan reference is blank or invalid, so referential-integrity issues stay visible to the analyzer.

The analyzer must never substitute `Borrower Name`, `Borrower Name TE`, or a transaction-tab label for `Borrower Name EN`. If the English description is blank, it must display `Missing English name — <Borrower ID>` and report the data-quality issue.

## Summary contract

The private daily summary should contain:

- executive overview;
- amounts due, collected, outstanding, and collection rate for today;
- outstanding principal, active loans, realized profit, and projected profit;
- material 30-day trend changes;
- borrower-level overdue, default, concentration, and late-payment attention items;
- notable charges and repayments;
- freshness, reconciliation, and missing-name checks; and
- an explicit explanation when exported population filters prevent exact reconciliation.

The task is read-only. It must not edit AppSheet, Drive files, source rows, or financial records, and it must not send external messages during the pilot.

## Current pilot configuration

- AppSheet bot: `Daily Loan Analysis Export` — disabled.
- AppSheet event: `Daily Loan Analysis Export Schedule` — daily, Singapore time, placeholder time pending user decision.
- AppSheet task: `Create Daily Loan Analysis Workbook` — XLSX, default private file store.
- Output folder expression: `"Loan Daily Analysis/Exports"`.
- Filename prefix: `"Loan_Daily_Analysis"`; AppSheet timestamp remains enabled.
- Production Drive template: `Loan_Daily_Analysis_Template.xlsx` (template schema `1.1`).
- Current verified local template: `outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.2.xlsx`.
- Codex automation: `Daily Loan Analysis Summary` — paused.
- Delivery: private scheduled-task result only; Outlook and Gmail disabled.

## Activation checklist

1. Choose the daily export time and a later analysis time in Asia/Singapore.
2. Approve one AppSheet run that writes borrower-level production data to private Google Drive.
3. Validate every worksheet, name mapping, row population, and financial reconciliation.
4. Run the Codex automation once and accept or revise the summary format.
5. Enable the AppSheet bot and activate the Codex task only after manual acceptance.
6. Add Outlook or Gmail delivery later as a separate least-privilege change with its own testing and change log.
