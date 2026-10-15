# Statistics manual copy — passed

14 September 2026. User explicitly authorized manually copying Statistics and changing its source in the trial app.

## Change

- Trial: LoanInsights PG Trial 20260914, app 494cd013-0d9b-482f-9559-c9d83059de91. Rollback version **1.000003**; saved version **1.000004**.
- Source: original Money database, Statistics table YhYb7_iBcJ4QE1MtC2M-q2. Its only row has Statistics ID MAIN. Read the existing key from the rendered native table and preserved its exact case and value.
- Destination: loan_manager_prod, public.Statistics, on 34.21.174.215. Confirmed empty immediately before insertion. Two physical columns: Row ID (text, not nullable, no default) and Statistics ID (text, nullable, no default).
- Inserted the single row using Cloud SQL Studio. The insert was guarded to run only while Statistics was empty. Source data was not modified.
- In the new app editor, Statistics > Table settings > Storage > Source Path > browse for more data > database-2 > Schemas > public > Tables > Statistics. Saved once.
- Persisted source path is Statistics, data source database-2; provider source ID shown in the editor is Table=public.Statistics__Statistics. No regeneration or formula edits were performed. ALL_CHANGES permission and existing column settings remain unchanged.

## Checks

- SQL returned row count **1**, exact key-and-value matches **1**.
- Rendered configuration comparison: **374 columns unchanged**, including **39 Statistics columns**; no added columns. The two data fields are physical; _RowNumber is system metadata and the remaining Statistics fields are virtual calculations.
- Opened the trial using the new desktop GUI and explicitly synced. Dashboard loaded without a visible error.
- Eight displayed metrics matched the read-only original app: Total Profit, Daily Interest, Realized Profit MTD, Forecast Remaining Interest, Projected Monthly Profit, Forecast Monthly Return on ADO, Peak Cash Pool 30D, and Peak Cash Pool Date 30D. Only match results are published; financial values are omitted.
- See statistics-manual-verification.json. Raw app configuration remains outside Git.

## Scope and dependencies

Production OLTP/OLAP and original Statistics are unchanged. The trial is deliberately mixed-source: only Statistics uses PostgreSQL; other tables still use original data sources. Its virtual totals still depend on those other tables. Existing copied scheduled bots remain disabled. This proves a manual row transfer, table binding and read/sync/display for Statistics, not full migration, write-back, automation performance or production readiness. No downstream Looker change was made or tested.

## Rollback and owner review

Restore trial version 1.000003 to return Statistics to its original source; the SQL row may remain for subsequent migration work. Do not restore 1.000002, which re-enables a copied schedule. Production requires no rollback.

Owner review: open the trial, sync, inspect its Analytics dashboard, and compare the values with the original. No financial record edits are needed. User acceptance remains pending; do not cut over production based on this single-table check.
