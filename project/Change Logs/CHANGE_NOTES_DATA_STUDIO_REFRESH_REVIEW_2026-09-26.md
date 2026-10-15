# Data Studio refresh review — 26 September 2026

Scope: Owner requested on-demand refresh for the legacy `Loan Reports - Mobile` Data Studio report and its seven OLAP AppSheet sources while preparing to decommission it.

Live inspection: The report's seven data sources are the `Loan Business Insights` AppSheet connector sources (Borrowers, Loans, Statistics, Daily Analytics, Repayments, Partners and Charges). The report's Resource menu has no `Manage auto refresh settings` control. The email-delivery screen offered a new schedule with defaults, rather than an existing schedule to disable. Report settings showed viewer refresh disabled; editors still have the manual `Refresh data` command. Opening the report loaded data and displayed a new `Data Last Updated` time, demonstrating that the existing live sources can query automatically on report open. Data Studio source editing exposed the AppSheet connection wizard, not a manual-only freshness setting.

Changed object: Created a pre-change report copy, [Loan Reports - Mobile - Backup 2026-09-26 pre-auto-refresh](https://datastudio.google.com/reporting/15888f3d-e3d5-4a1d-b2b2-731e2dd2df7e). No refresh, source, schedule, or delivery settings were changed. No email was sent.

Rollback: The report copy is an independent recovery reference. No live report configuration rollback is needed.

Check/status: Inspected the live report editor, report settings, Resource menu, delivery form, source inventory and manual refresh action. A strict manual-only mode is not available on the existing live AppSheet connector report: source freshness can issue requests when the report opens or its cache expires. A static extract with automatic update off would require replacing and validating the existing sources and chart/blend bindings. This remains unimplemented pending a separate decision on that larger conversion or decommissioning.
