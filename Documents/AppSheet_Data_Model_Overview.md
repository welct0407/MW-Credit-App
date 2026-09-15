# AppSheet production data model

Reconciled 15 September 2026. This is the current production architecture reference. [Development differences](Development_Changes.md), [environment inventory](Environment_Inventory.md), and [documentation index](README.md) are maintained separately. The detailed inventory is in [AppSheet_Data_Dictionary.xlsx](AppSheet_Data_Dictionary.xlsx).

## Verification basis

Production app definitions were freshly captured from the read-only AppSheet documentation pages: OLTP **3.000070**, OLAP **1.100046**. Captures cover tables, source bindings, column properties/formulas, references, slices and their membership, actions and views. Both database schemas were exported read-only and exactly match Flyway V1 after normalization. Runtime PostgreSQL version and connection limits were queried separately. Sync toggles and bot enablement were then checked in the current editor for all four apps. This reconciliation did not execute financial transactions or prove notification delivery, scheduled execution or Looker behavior.

The workbook contains all **555 production business-column entries** (196 OLTP, 359 OLAP), **14 slices**, their **440 membership entries**, and the live SQL catalog. Internal AppSheet process/user tables are identified in Prod Tables; their full generated schemas are retained in the [sanitized definition snapshot](../outputs/documentation-reconciliation-20260915/app-model.json), rather than mixed into the business dictionary. Counts are app-specific, not unique physical database columns.

## Architecture and ownership

Production OLTP and OLAP share Cloud SQL PostgreSQL database **loan_manager_prod** on **appsheet-pg-prod-20260914**, through AppSheet connection **database-2**. The original Money AppSheet database is historical migration reference. Production OLAP still reads its Calendar from **Calendar Help Table / Sheet1** through Google Sheets. AppSheet internal user/process tables remain native.

OLTP owns borrowers, loan operations, charges, receipts and allocation posting. OLAP owns partner management, contributions, settlement, portfolio analysis and loan assessment. Looker Studio is downstream presentation over governed feeds. Its source configuration has not been freshly reconciled in this task. External collection software remains governed in its separate repository; the presence of collection-related borrower fields here does not authorize changes to that system.

## Production table catalog

Counts below are provider/physical fields followed by virtual columns. Provider counts include AppSheet's _RowNumber where present; they must not be treated as SQL column counts. Exact PostgreSQL types/defaults/nullability are in the workbook's DB Columns sheet.

| Table | Consumers | Source | OLTP provider / VC | OLAP provider / VC | Purpose |
| --- | --- | --- | --- | --- | --- |
| Borrowers | OLTP + OLAP | PostgreSQL | 12 / 26 | 12 / 65 | Borrower master; operational and reporting indicators |
| Loans | OLTP + OLAP | PostgreSQL | 20 / 21 | 20 / 31 | Loan terms, lifecycle and balances |
| Repayments | OLTP + OLAP | PostgreSQL | 11 / 5 | 11 / 13 | Posted principal/interest entries and receipt/allocation trace |
| Statistics | OLTP + OLAP | PostgreSQL | 3 / 23 | 3 / 36 | Control row and app-level KPI virtual columns |
| Charges | OLTP + OLAP | PostgreSQL | 7 / 18 | 7 / 20 | Amounts due and charge-level collection state |
| Partners | OLTP + OLAP | PostgreSQL | 8 / 0 | 8 / 12 | Partner master; management owned by OLAP |
| Payment Allocations | OLTP + OLAP | PostgreSQL | 14 / 5 | 14 / 1 | Receipt-to-charge allocation snapshots; workflow owned by OLTP |
| Payments | OLTP + OLAP | PostgreSQL | 14 / 9 | 14 / 2 | Receipt and processing state; workflow owned by OLTP |
| Calendar | OLAP | Google Sheets | — | 2 / 26 | Date spine and assessment forecast calculations |
| Loan Assessment | OLAP | PostgreSQL | — | 6 / 16 | Proposed-loan inputs and app-calculated assessment outputs |
| Cash Pool Contributions | OLAP | PostgreSQL | — | 7 / 2 | Partner capital contributions |
| Settlements | OLAP | PostgreSQL | — | 8 / 0 | Partner settlement records |
| Daily Analytics | OLAP | PostgreSQL | — | 17 / 6 | Persisted daily portfolio snapshots |

## Keys and relationships

Preserve existing text **Row ID** keys byte-for-byte, including case. Do not cast imported AppSheet identifiers to PostgreSQL UUID or use _RowNumber as a stable key. Calendar uses its Date key. AppSheet Ref behavior and database foreign keys are separate controls: an AppSheet part-of relationship does not imply PostgreSQL ON DELETE CASCADE.

| App | Child table | Ref column | Parent table | Parent key | Part of parent |
| --- | --- | --- | --- | --- | --- |
| OLTP | Loans | Ref Borrowers | Borrowers | Row ID | Yes |
| OLTP | Repayments | Ref Loans | Loans | Row ID | No |
| OLTP | Repayments | Ref Charges | Charges | Row ID | Yes |
| OLTP | Repayments | Ref Payment | Payments | Row ID | No |
| OLTP | Repayments | Ref Payment Allocation | Payment Allocations | Row ID | No |
| OLTP | Charges | Ref Loans | Loans | Row ID | Yes |
| OLTP | Payment Allocations | Ref Payment | Payments | Row ID | Yes |
| OLTP | Payment Allocations | Ref Charge | Charges | Row ID | No |
| OLTP | Payments | Ref Borrower | Borrowers | Row ID | Yes |
| OLTP | Payments | Ref Target Charge | Charges | Row ID | No |
| OLAP | Loans | Ref Borrowers | Borrowers | Row ID | Yes |
| OLAP | Repayments | Ref Loans | Loans | Row ID | No |
| OLAP | Repayments | Ref Charges | Charges | Row ID | Yes |
| OLAP | Repayments | Ref Payment | Payments | Row ID | No |
| OLAP | Repayments | Ref Payment Allocation | Payment Allocations | Row ID | No |
| OLAP | Charges | Ref Loans | Loans | Row ID | Yes |
| OLAP | Calendar | Assessment Borrower | Borrowers | Row ID | No |
| OLAP | Loan Assessment | Ref Borrower | Borrowers | Row ID | No |
| OLAP | Cash Pool Contributions | Ref Partner | Partners | Row ID | No |
| OLAP | Settlements | Ref Partner | Partners | Row ID | No |
| OLAP | Payment Allocations | Ref Payment | Payments | Row ID | No |
| OLAP | Payment Allocations | Ref Charge | Charges | Row ID | No |
| OLAP | Payments | Ref Borrower | Borrowers | Row ID | No |
| OLAP | Payments | Ref Target Charge | Charges | Row ID | No |

PostgreSQL currently has **13 validated foreign keys**. The workbook records exact constraints, including update/delete behavior. Eight BEFORE-row blank-reference triggers call public.appsheet_normalize_blank_refs to convert optional empty-string references to NULL before constraint checking. This includes payment-related optional references and other shared tables. Historical missing payment links have not been fabricated by this documentation task. Normalizers remain in place by the owner's instruction to retain the constraints as they stand.

## Current calculations and workflow boundaries

Loans[Borrower Name] is a **Name virtual column** in both production apps, with expression **[Ref Borrowers].[Borrower Name]**. Borrowers[Borrower Name] remains physical. The obsolete Loans name column and its two maintenance triggers are absent from the live database baseline. Charges and Repayments use their existing loan-name dereferences.

Payments represent receipts; Payment Allocations represent receipt-to-charge processing snapshots; Repayments record posted principal/interest and optional payment/allocation trace. The existing OLTP action definitions and guards are captured exactly in app-model.json. Operational correctness depends on posted amounts and processing state, not merely the existence of a row. Read-only configuration capture does not establish atomicity across separate AppSheet writes.

Production loan assessment retains its **Loan Assessment input/control table**, app virtual output columns and the Google Sheets Calendar forecast path. Statistics remains a KPI/control table. The trigger-based assessment is a **development app design**, not the production app's assessment source. Lab tables/functions also exist physically in production because they were present before cloning and Flyway adoption; physical presence is not deployment in the production app.

The existing three loan types, whole-baht daily-installment allocation, first-day receipt behavior, duplicate-charge guards, early-closure/default guards and receipt retry/reconciliation rules are preserved. Detailed rule history and prior tests are retained in [model history](AppSheet_Data_Model_History.md) and the dated Change Logs. The fresh dictionary is authoritative for current exact expressions; historical narrative is not a new test result.

## SQL objects and change management

Both instances contain 14 business/lab base tables, two public views, six application functions and ten enabled application triggers. public.flyway_schema_history is an additional metadata table, excluded from both apps and the business-column inventory. The same baseline includes indexes and constraints. Source SQL is [V1__existing_schema.sql](../database/migrations/V1__existing_schema.sql); later changes require immutable higher-version migrations under [database/README.md](../database/README.md).

Changes must be tested in development, with affected OLTP/OLAP consumers checked in the new GUI. Promote the exact tested commit/migration hashes after backup, drift review, rollback planning and explicit owner release approval. Never copy development financial data into production during schema promotion. AppSheet versions/bindings and Cloud SQL capacity/network settings are recorded separately from Flyway.

## Maintenance and remaining checks

Update this overview and the dictionary together with the applicable Markdown change log. Keep one production baseline and a development difference register. On promotion, update production documentation and close the promoted development differences. Re-export app definitions and database catalogs after model changes; a Flyway checksum validation alone is not a live drift check.

No manual financial test is needed for this documentation-only change. Owner review should confirm the environment labels and prototype scope. Bot enablement and six sync toggles are freshly recorded; scheduled execution, report/export delivery and sustained capacity behavior were not retested. See [verification coverage](Environment_Inventory.md#verification-coverage). Historical source notes remain preserved and explicitly dated.
