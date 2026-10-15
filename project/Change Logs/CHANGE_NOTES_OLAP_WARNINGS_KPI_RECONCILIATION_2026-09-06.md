# OLAP schema warnings and KPI reconciliation — 6 September 2026

Status: completed on7 September2026. OLAP saved at **v1.100016**, runnable/deployable, original Deployed state retained. Editor warning indicator cleared; fresh client sync and Analytics load succeeded. User authorized fixing OLAP warnings and comparing KPIs with OLTP.

Rollback: live OLAP Manage > Versions confirms v1.100012, Deployed, Save disabled before edits. Restore this version for configuration rollback. Existing full production backup pair is retained; no additional copy created, respecting the single-backup request. No physical schema or financial row changes are planned.

Initial warning: App Schema for table 'Repayments' is out of sync with the schema in AppSheet database. Please regenerate the table structure. This is the only message shown in Errors & Warnings at inspection. Production OLTP baseline is v3.000002. Previous implementation checked selected live aggregates and refreshed temporary-test-contaminated snapshots; a complete cross-app KPI/formula comparison was not established.

## Configuration changes

1. Data > Repayments > Regenerate schema: loaded Ref Payment and Ref Payment Allocation from existing native schema. The table increased22→24 columns, preserving its prior22 definitions/properties and READ_ONLY permission. Initial regeneration exposed missing reference-target warnings.
2. Data > Add data > AppSheet database > Money database: added **existing** Payments and Payment Allocations, both explicitly selected **Read-only** before Add2 tables. No database table/column/data mutation.
3. New Payments:14 physical fields and2 reverse-reference VCs (Related Payment Allocations, Related Repayments). New Payment Allocations:14 physical fields and Related Repayments VC. All original stored fields are loaded. Status, Payment Method and Allocation Method are Text in this read-only reporting app; operational Enum/validation remains OLTP-only. Native relationship columns and OLAP relationships are proper References/Refs.
4. Six resolved Refs, all target Row ID and IsPartOf=false in OLAP: Payments.Ref Borrower→Borrowers; Payments.Ref Target Charge→Charges; Payment Allocations.Ref Payment→Payments; Payment Allocations.Ref Charge→Charges; Repayments.Ref Payment→Payments; Repayments.Ref Payment Allocation→Payment Allocations.
5. Automatically added Borrowers.Related Payments, Charges.Related Payment Allocations and Charges.Related Payments with corresponding REF_ROWS expressions. Together with the three new-table reverse VCs, six new VCs were introduced; total scoped additions36 columns. No operational allocation-calculation VCs or payment-processing bots/actions copied.
6. Adding both targets left one persisted Payment Allocations.Ref Payment invalid-structure warning. Regenerated Payment Allocations after Payments existed. Final v1.100016 removed it. This normalization added explicit NFC Scannable=No on12 user columns; no stored financial values changed.
7. System-generated ref-position views: Payments_Detail, Payments_Inline, Payment Allocations_Detail, Payment Allocations_Inline. System Ref navigation actions resolve the six references; Payments also has generated Compose Email (Created By). No email was sent. READ_ONLY tables expose no normal financial add/edit/delete workflow.

## Verification

- Fresh generated documentation: v1.100016, Runnable Yes, Deployable Yes. Editor Save disabled and warning indicator absent after final regeneration. Fresh client synced and displayed Analytics, with expected aggregate figures.
- Compared every previously loaded column/property from baseline generated documentation to final: **zero existing-column property differences**. Shared KPI financial formulas therefore remained unchanged.
- All6 new payment Refs resolve to valid Row ID targets. Payments, Payment Allocations and Repayments all READ_ONLY.
- Live OLTP version is3.000003, observed only. Prior deployment completed3.000002; no assumption is made about the intervening save's author or cause.
- No production financial test records, notifications, snapshot rebuild, database changes, OLTP edits or Looker changes were performed in this task.

## Shared KPI comparison

Compared the single MAIN Statistics row using each app's computed Preview data. Locale en-US, timezone offset-480. Captured on7 September just after midnight; refreshed the earlier OLAP page so both used the same date. Values are the displayed precision. All20 numeric KPI expressions are identical; three shared header-text formulas also match.

| KPI | OLTP | OLAP | Result |
| --- | ---: | ---: | --- |
| Borrowers Fully Paid Today | 0 | 0 | Match |
| Borrowers Not Paid Today | 0 | 0 | Match |
| Borrowers Partially Paid Today | 0 | 0 | Match |
| Borrowers with Overdue Payment | 6 | 6 | Match |
| Expected Daily Interest | 9396 | 9396 | Match |
| Forecast Average Daily Outstanding Principal | 93773 | 93773 | Match |
| Forecast Monthly Return on ADO | 300% | 300% | Match |
| Forecast Remaining Interest | 221834 | 221834 | Match |
| Forecast Remaining Principal Days | 2212048 | 2212048 | Match |
| Net Principal Days MTD | 601142 | 601142 | Match |
| Outstanding Principal | 96176 | 96176 | Match |
| Pending Payment Amount | 15030 | 15030 | Match |
| Profit Coverage of Outstanding Principal | 122% | 122% | Match |
| Projected Monthly Profit | 280950 | 280950 | Match |
| Realized Profit MTD | 44086 | 44086 | Match |
| Today's Outstanding Interest | 15030 | 15030 | Match |
| Today's Profit | 0 | 0 | Match |
| Total Profit | 128316 | 128316 | Match |
| Total Profit of Outstanding Loans | 117246 | 117246 | Match |
| Yesterday's Profit | 6486 | 6486 | Match |

Monetary values are THB; principal-days are the model's numeric principal-day measure. Date-dependent figures naturally changed at midnight. These checks do not imply every reporting-only metric has a counterpart in OLTP.

## Differences and limits

- Known Collection basis difference: Borrowers[Todays Amount Collected] is `SUM([Todays Collection Charges][Payment Received Today])` in OLTP and `SUM([Todays Collection Charges][Total Paid])` in OLAP. The latter includes prior-date payments against selected charges. Earlier design explicitly preserved this reporting variant; no expression was changed here. All other observed shared formula text differences were whitespace/formatting only.
- Historical snapshot caveat: Create Daily Analytics.Pending Charges EOD sums Charge Amount Due only where Charge Date<=snapshot date and First Payment Date is blank or later. It excludes a partially paid charge once any payment exists. At the earlier6 September cleanup, this snapshot was14930 versus live pending15030 (100 difference); that comparison is historical evidence from the production task, not a new7 September same-date test. This snapshot definition is not equivalent to remaining balance and needs a separate design correction if the user wants historical pending balances to reconcile. No historical rows or formula changed in this task.
- Reporting-only KPIs, hidden decimals/rounding, all historical dates, security roles, mobile/offline behavior and Looker cache/visuals were not exhaustively audited. No claim of a full restoration drill.

## Documentation and rollback

Updated both AppSheet_Data_Model_Overview.md and AppSheet_Data_Dictionary.xlsx with the36 scoped definitions, read-only ownership boundary, table counts, Ref availability and KPI comparison status. Existing unrelated dictionary definitions retain their dated reconciliation. Local builder/output/pre-update document copies are under outputs/olap-reconciliation-20260907; these are documentation files, not additional AppSheet backup copies.

Rollback: restore OLAP **v1.100012** using Manage > Versions, then verify client sync and prior reports. That version will again show the original missing native-trace schema warning. No physical data rollback is required because only OLAP configuration changed. Keep the existing full production backup app/database pair. Manual follow-up: sync normal OLAP clients, verify receipt/allocation reference navigation and absence of edit controls on real posted records, then review Collection and historical Pending Charges EOD semantics before changing them.

### Final documentation verification — 7 September 2026

Published the verified workbook to Documents/AppSheet_Data_Dictionary.xlsx and confirmed its SHA-256 matches the reviewed output. Independent read-only verification passed: 365 unique column definitions, exactly 36 scoped row changes, original OLTP property text preserved, five unrelated sheets unchanged, and no Excel error cells. Rendered Columns, Tables and README samples were visually checked. Both model documents record OLAP v1.100016 and rollback v1.100012. Verification evidence: outputs/olap-reconciliation-20260907/verification.json.
