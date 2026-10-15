# R049 — Summary-first upcoming charges

DEV implementation complete, 29 September 2026. **R049 remains Open for owner review. Production promotion is not authorized by this refinement request.**

## Saved state and recovery

- DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`: **1.000157**, runnable; rollback **1.000152** recorded before editing.
- DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`: unchanged **1.000045**. Both editors report **No issues found**.
- DEV PostgreSQL `appsheet-pg-prod-20260914` / `34.21.174.215:5432` / `loan_manager_dev`: **V56**, validated.
- PROD unchanged: V55 / OLTP3.000260 / OLAP1.100208.
- Starting Git `dccb28adfd2c62d9aca067521a0cbdd3fe3b1b06`; SQL checkpoint `45e0f3248c30e6e7bc35f98060cde619797b59d8`. Unrelated Metabase/Risks work is excluded.

Restore DEV OLTP1.000152 if app rollback is needed; V1 remains present and unchanged. V56 is additive and need not be undone for app rollback. Never edit an applied migration; any SQL correction uses a higher migration. Private DEV backup was restored and fingerprint-verified before V56 rehearsal/application. [App rollback](app-rollback.json), [database recovery evidence](summary-development-backup.json).

## Implemented design

### Providers and bounds

`public.oltp_upcoming_charge_summary_v2` retains V1's columns and stable borrower/date keys, aggregating the existing event provider's seven-day OR first-five-date union. This preserves days six/seven in the main view while keeping the borrower limit. Existing schedule simulation, recorded-charge precedence, auto-generation-disabled settlement charges and paid-date behavior are unchanged; no financial records are created.

Existing readonly `Upcoming Charge Summary` now binds to V2 through DEV `database-3`. Its borrower reference is visible with the fixed bilingual Borrower label. Currency remains zero-decimal baht. Existing V1 is untouched for compatibility with the released app.

`Upcoming Summary 7 Days` is a new readonly slice, matching synced context As Of Date and inclusive From Date/Through Date (tomorrow through T+7). `Borrower Upcoming Summary` matches the synced As Of Date and only dates in `Borrower Upcoming 5 Dates` for that borrower/as-of. This yields at most five distinct future dates across all loans, within three calendar months and the existing maximum 93-day guard. All charges on the fifth date remain included.

### Main Upcoming Charges

The existing direct menu table uses `Upcoming Summary 7 Days`, groups **only by Due Date ascending**, and sums `Total Charge` per day. Its two columns are `Ref Borrower`, `Total Charge`, sorted by borrower. Partner-language menu naming remains unchanged. No inline charge details or context section is shown.

### Shared drilldown

The hidden `Open Upcoming Charge Details` action belongs to `Upcoming Charge Summary` and navigates without writes:

```appsheet
LINKTOFILTEREDVIEW("Upcoming Charge Details", AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Due Date] = [_THISROW].[Due Date], [As Of Date] = [_THISROW].[As Of Date]))
```

`Upcoming Charge Details` is a reference table over **Upcoming Charge Forecast**, preserving the existing detail format: Amount Remaining, Ref Loan, Basis Display; Due Date ascending groups, SUM of Amount Remaining, loan ascending sort, Narrow width, no quick edit. Using the full bounded forecast source supports menu days six/seven as well as borrower dates. Its fixed literal display name is `"รายละเอียดเรียกเก็บล่วงหน้า / Upcoming Charges Details"`.

The main table, base summary inline view and new explicit `Borrower Upcoming Summary_Inline` all use this Row Selected action. The explicit borrower inline view is necessary to keep the slice's automatic view from adding a Borrower column. It has Date/Total Charge only, ascending date sort, no grouping, and fixed bilingual Summary title. Generated summary reference action and seven-day default detail view are included in the captured change set.

### Collection and Borrowers

`Todays Collection Board_Detail` removes only `Upcoming Charges` from its visible column order. `Upcoming Charges Summary` follows `Todays Collection Charges`; the issue-only note and submitted receipts follow. The existing borrower-note quick edit is retained.

`Visible Borrowers_Detail`, the actual Borrowers entry point, inserts `Upcoming Charges Summary` immediately **before Related Loans**, after the existing financial summary fields. The source already included the column. All other columns/cosmetics remain in their original order. Both entry points show the same Date/Total summary and open the matching details on tap.

## Verification and evidence

- Full disposable migration CI passed at the SQL checkpoint: V1 compatibility, V2 seven-day coverage including days six/seven, five-date limit, summary/detail equality, paid-date removal and inclusive three-month boundary. Reused because SQL and dependencies did not change during UI integration.
- Verified DEV backup/restore, V56 rehearsal with existing public values unchanged, actual DEV migration and validation passed. [Migration](development-migrate.json), [validation](development-validate.json), [saved SQL definitions](postgresql-affected-definitions.json).
- Current DEV GUI: main date-grouped borrower totals, Collection two-column summary, Borrowers summary before loans, all three row drilldowns, date/borrower isolation, matching amounts and back navigation passed using readonly existing data. Bilingual detail title and whole-baht display checked. No financial writes or notification tests.
- GUI viewport showed representative dates; all seven groups were not visually enumerated. SQL synthetic tests and exact saved slice/provider definitions cover days six/seven. Collection/Borrowers behavior checks were reused through the final title-only correction; final saved version is runnable and final main drilldown title was rechecked.
- Final saved AppDoc HTML independently parses identically to DOM extraction. Exactly **12 AppSheet objects** changed from1.000152 to1.000157; unrelated definitions are unchanged. [Object observations](app-config-observations.json), [editor-only source/title observations](view-bindings.json), [sanitized editor screenshot](upcoming-summary-editor.png).
- Exact before/after definitions are in `Documents/Data Dictionary/development/appsheet/r049-upcoming-summary`; SQL overlay in the matching PostgreSQL development folder. Canonical PROD definitions remain unchanged. Guarded closure helper validates all overlays and regenerates the index. [Closure plan](dictionary-closure-plan.json).
- Private AppDoc captures and GUI evidence are outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r049-upcoming-summary`; borrower data is not published.

## Later promotion

Ready for owner review; not deployed to production. R049 stays Open until separately authorized promotion begins. Use the current release's single master checklist, integrated DEV capture, compatible V56-before-app dependency order, PROD-mapped immutable RC and normal App Upgrade. Recheck current versions and intervening work at that time. No RC, freeze handoff, production write, final release tag or cleanup applies to this DEV task. OLAP, Looker, notification routing and financial logic are unchanged.
