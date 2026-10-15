# Universal payments — isolated implementation and testing — 2026-09-05

## Status

Implementation and bounded regression testing are recorded through clone **v1.000068**, confirmed in Manage > Versions on 6 September 2026. The model inventory remains v1.000065. Core payment/default scenarios, borrower cascade, controlled partial-posting recovery and five dashboard KPI deltas have completed results. The execution report contains T001–T040, including initial failures and corrected retests. Manual acceptance, offline/concurrent use, scheduled execution and the remaining coverage matrix are pending. The clone is undeployed; production, OLAP and Looker Studio were not changed. This is not a full-testing or production-acceptance claim.

## Scope and rollback

- Source OLTP: `Loan Manager ผู้จัดการสินเชื่อ`, app ID `93844270-6aa5-420b-a960-bcdf08abd357`.
- Source version confirmed live before any copy or edit: **2.300005**, Manage > Versions > Version History, 2026-09-05 (Asia/Singapore). Save was disabled; no pending source edits.
- Source data label in live Repayments configuration: `Money database`, native AppSheet database, qualifier `Repayments`.
- Cloned app: `LoanMgr Payments TEST 20260905`, ID `1b901dff-2e47-477c-8d2c-28aad5556102`. Created using My Apps > OLTP Actions > Copy, Save app to = AppSheet database, copy data = ON, copy file data/images = OFF. All six original OLTP tables appeared as Connected in the cloned database picker. Clone database ID `eEwpmrK1Zr4_ao2UcQzF42`, source ID `9Y5vh3TFzZ4sIe2JgNh4l0`.
- Clone pre-edit rollback version: **1.000002**, confirmed in Manage > Versions > Version History before configuration edits. Clone is Not Deployed.
- Production, OLAP, Looker Studio, live notifications, and production financial records are outside the mutation scope.
- Source production v2.300005 remains the source reference; no production restoration should be necessary. App version restoration does not undo physical database edits.
- Documentation rollback: repository versions immediately before this task. Preserve unrelated pre-existing local changes, including the untracked OLAP automation migration log.

## Reference and design boundary

Referenced conversation: `Implement Lump Sum Payments`, `6a9ad098-c8d4-83ec-815d-053449c5b799`. Retrieved its eight available turns. Latest assistant specification is capped by the retrieval provider at 20,000 characters and ends during implementation order; preceding detailed sections 1–19 and the prior change inventory were available. The conversation supplies design context; the current user request authorizes clone implementation.

Target: Payments and Payment Allocations for Single Full, Single Partial, Receive All, Lump Sum, and First-day Auto. Newest due charge first for multi-charge methods; interest before principal; future charges allowed only for targeted single-charge methods. Preserve historical/default direct Repayments and existing financial rollups. Preserve Borrower > Loan > Charge > Repayment IsPartOf and add Borrower > Payment > Allocation IsPartOf.

Important implementation details must be checked against the native database: system Row ID is currently read-only in the app column editor, so the suggested `PAY-` custom Row ID cannot be assumed supported. Retry, concurrency, first-day downstream bot triggering, and frozen population completeness require live validation.

## Inspection evidence

| Object | Confirmed baseline | Reconciliation boundary |
| --- | --- | --- |
| OLTP source | Deployed, v2.300005, six tables: Borrowers, Charges, Loans, Partners, Repayments, Statistics | No source mutation |
| Repayments | 14 columns; Row ID key with read-only `UNIQUEID("PackedUUID")`; Ref Loans formula `[Ref Charges].[Ref Loans]`; Ref Charges required | Live editor inspected |
| Amount Received | VC `[Principal Paid] + [Interest Paid]` | Live editor inspected |
| Payment Amount Today | VC `IF([Payment Date] = TODAY(), [Amount Received], 0)` | Live editor inspected |
| Data-model documents | Last affected OLTP reconciliation v2.300003 | Unrelated drift through v2.300005 remains pending reconciliation |

## Change ledger

| ID | Location | Before | After / exact change | Status |
| --- | --- | --- | --- | --- |
| DOC-001 | This Markdown file | Absent | Added task scope, source rollback, inspection evidence, and implementation/test status | Written |
| ENV-001 | My Apps > source OLTP > Copy | No test app | Created `LoanMgr Payments TEST 20260905` with copied native AppSheet data and without copied file attachments. Version 1.000002, not deployed. | App created; database isolation pending verification |
| ENV-002 | Native cloned database `eEwpmrK1Zr4_ao2UcQzF42` | Copied name `Money database` | Renamed to `Money Payments TEST 20260905`. All ten original table tabs observed. Original database ID verified live as `9Y5vh3TFzZ4sIe2JgNh4l0`. | Saved |
| BOT-001 | Clone > Automation > Notification - New Loan Created > More > Disable | Enabled | Disabled to prevent external test messages. Production migration: do not copy this isolation setting automatically. | Saved |
| BOT-002 | Clone > Automation > Notification - Loan Closed > More > Disable | Enabled | Disabled to prevent external test messages. Production migration: do not copy this isolation setting automatically. | Saved |
| BOT-003 | Clone > Automation > Notification - Charge Received > More > Disable | Enabled, event `Charge Received` on Repayments | Disabled to prevent external test messages. This is a per-Repayment notification dependency that needs payment-level handling before production cutover. | Saved |
| DB-001 | Clone database > new table | Absent | Created `Payments`, table ID `7rco54zfAb4EEbaVFZpkJc`; table description `Isolated universal-payment test. One actual receipt per row. Production migration pending testing and acceptance.`; inherited time zone Asia/Singapore and locale English (United States). | Saved; not yet loaded/configured in app |
| DB-002 | Payments physical columns | Default `Untitled Text` and `Untitled Dropdown` | Renamed first default Text column to `Ref Borrower`; changed default Enum to Text and renamed `Status`. Added `Amount Received` Price, `Payment Method` Text, `Allocation Method` Text, `Bank Reference` Text, `Notes` LongText, `Created By` Email, `Payment Date` Date, `Created At` DateTime, `Processed At` DateTime, `Ref Target Charge` Text. App-level Ref/Enum, required rules, IsPartOf, defaults, validation, and display settings remain pending. System Row ID retained. | Saved physical staging only |
| DB-003 | Clone database > new table | Absent | Created `Payment Allocations`, table ID `Pho662DYf_4QA-sG61JDD0`; description `Isolated payment allocation snapshots and frozen interest/principal amounts. One payment-charge pair per row.`; Asia/Singapore, English (United States). | Saved; app configuration pending |
| DB-004 | Payment Allocations physical columns | Default `Untitled Text` and `Untitled Dropdown` | Renamed Text to `Ref Payment`; changed default Enum to Text and renamed `Ref Charge`. Added `Charge Date Snapshot` Date; `Charge Row Number Snapshot` Number; `Interest Remaining Snapshot`, `Principal Remaining Snapshot`, `Amount Remaining Snapshot` Price; `Allocation Order` Number; `Allocated Interest`, `Allocated Principal`, `Allocated Amount` Price; `Created At` DateTime. System Row ID retained. | Saved physical staging only |
| DB-005 | Clone Repayments, table ID `hfddgdRya84TaarymC0mu2` | No payment trace columns | Added nullable native Text fields `Ref Payment` and `Ref Payment Allocation`. Must regenerate clone Repayments and configure app-level Ref targets. Existing Row ID/key and rows preserved. | Saved physical staging only |

The database initially rejected changing its label column (`Untitled Text`) directly into a native Reference. The user questioned the intermediate Text types. This was resolved by changing the new-table database labels first, then converting all six added links to native Reference. The Text states in DB-002/004/005 record the staging history only and are superseded by DB-006 through DB-013 below. Existing Row ID keys remain unchanged.

| ID | Location | Before | After / exact change | Status |
| --- | --- | --- | --- | --- |
| DB-006 | Payments database label | Ref Borrower | Payment Date, using column menu > Use column as label | Saved |
| DB-007 | Payments[Ref Borrower] | Native Text | Native Reference to cloned Borrowers | Saved; app regeneration pending |
| DB-008 | Payments[Ref Target Charge] | Native Text | Native Reference to cloned Charges | Saved; app regeneration pending |
| DB-009 | Payment Allocations database label | Ref Payment | Allocation Order, using column menu > Use column as label | Saved |
| DB-010 | Payment Allocations[Ref Payment] | Native Text | Native Reference to cloned Payments | Saved; app regeneration pending |
| DB-011 | Payment Allocations[Ref Charge] | Native Text | Native Reference to cloned Charges | Saved; app regeneration pending |
| DB-012 | Repayments[Ref Payment] | Native Text | Native Reference to cloned Payments | Saved; app regeneration pending |
| DB-013 | Repayments[Ref Payment Allocation] | Native Text | Native Reference to cloned Payment Allocations | Saved; app regeneration pending |

All conversions affected newly created, unpopulated link columns in the isolated database. The native type-conversion prompt states the operation can be undone. Production migration should create these six columns as native Reference from the start; do not reproduce intermediate Text types. Configure IsPartOf separately in the app.

### App schema checkpoint — v1.000006, 6 September 2026

| ID | Exact clone location | Before | After | Verification / migration note |
| --- | --- | --- | --- | --- |
| APP-001 | Data > Add new Data > AppSheet database > Money Payments TEST 20260905 | Six loaded tables | Added Payments and Payment Allocations only. Deselected the four unrelated unloaded tables. | All six original tables were marked Connected in the clone picker. Production migration must select the production database. |
| APP-002 | Payments > Ref Borrower | Inferred Ref to Borrowers, optional, IsPartOf false | Require true; IsPartOf true | Existing key retained. New borrower-to-payment ownership branch. |
| APP-003 | Payments > Status | Text, editable, optional, blank initial value | Enum; values Processing, Posted, Error; editable false; required true; initial value `"Processing"` | Read back in grid. Other values and autocomplete remain false. |
| APP-004 | Payments > Ref Target Charge | Inferred Ref to Charges, Show true, optional, Editable true, no validation | Valid If `SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0))`; Show If and Required If `IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto"))`; Editable If `NOT(IN([Row ID], Payments[Row ID]))` | Target and IsPartOf false verified. Allows outstanding future targets for the single-charge methods. Locks target after receipt creation. |
| APP-005 | Data > Repayments > Regenerate schema | 14 app columns | 16 columns, including inferred Ref Payment -> Payments and Ref Payment Allocation -> Payment Allocations | Regeneration saves all pending app changes. Source caption refreshed to Money Payments TEST 20260905. Existing key/formulas retained in inspected rows; full regression pending. |
| APP-006 | Repayments > Ref Payment; Ref Payment Allocation | Inferred Ref, optional, editable true, IsPartOf false | Editable false for both; optional and IsPartOf false preserved | Both target tables verified. Historical/default records may retain blank trace links. |
| APP-007 | Payment Allocations > Ref Payment | Inferred Ref to Payments, optional, editable true, IsPartOf false | Require true; Editable false; IsPartOf true | Allocation follows payment deletion. |
| APP-008 | Payment Allocations > Ref Charge | Inferred Ref to Charges, optional, editable true, IsPartOf false | Require true; Editable false; IsPartOf false preserved | One ownership branch, plus a charge cross-reference. |
| APP-009 | Auto-generated reverse-reference VCs | Absent for new relationships | Payments[Related Payment Allocations] = `REF_ROWS("Payment Allocations", "Ref Payment")`; Payment Allocations[Related Repayments] = `REF_ROWS("Repayments", "Ref Payment Allocation")` | Both observed in app grids. Other generated reverse references require explicit inventory. |

The source and clone keys are unchanged. The native Text staging is superseded for all six relationships. AppSheet app `Ref` and native database `Reference` are the respective UI labels for the configured links. The app-level `IsPartOf` controls are separate from native database column types. Save completed with warnings rather than schema errors; clone version **1.000006** verified in Manage > Versions > Version History. The warnings still require review before functional tests.

### Receipt and snapshot configuration — v1.000009, 6 September 2026

The intermediate saves were v1.000007 (reconciliation helpers and Repayments Editable_If correction) and the receipt-field save, followed by **v1.000009**, verified in Manage > Versions > Version History after snapshot settings were saved. No processing action or bot was added at this checkpoint.

| ID | Exact clone location | Before | After / rationale |
| --- | --- | --- | --- |
| APP-010 | Repayments > Ref Payment; Ref Payment Allocation | Editable checkbox false | Enable base Editable, then set Editable_If `FALSE` for both. The checkbox-only setting excluded the fields from add-row actions. The expression setting preserves user-form protection while allowing actions to write the trace links. Verified both fields appeared in the existing create-repayment action's column picker, without changing that action. |
| APP-011 | Payments > Status | Editable checkbox false | Enable base Editable, then set Editable_If `FALSE`; retain required Enum values and initial `"Processing"`. Same action-write distinction as APP-010. |
| APP-012 | Payments > Created By | Blank default, Editable true | Initial `USEREMAIL()`; Editable_If `FALSE`. |
| APP-013 | Payments > Created At | Initial `NOW()`, Editable true | Retain `NOW()`; Editable_If `FALSE`. |
| APP-014 | Payments > Processed At | Imported initial `NOW()`, Editable true | Clear initial value; Editable_If `FALSE`. Completion timestamp must be written by processing. |
| APP-015 | Payments > Amount Received | Optional, Editable true, no validation | Required true; 0 decimals, ฿; Editable_If `NOT(IN([Row ID], Payments[Row ID]))`; Valid If and error text below. |
| APP-016 | Payments > Payment Date | Optional, Editable true, initial TODAY() | Required true; retain `TODAY()`; Valid If `[_THIS] <= TODAY()`; Editable_If `NOT(IN([Row ID], Payments[Row ID]))`. |
| APP-017 | Payments > Ref Borrower | Required, IsPartOf true, Editable true, no Valid If | Preserve required/IsPartOf. Editable_If `NOT(IN([Row ID], Payments[Row ID]))`; Valid If `COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Row ID] <> [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0`; error `"Finish or retry the existing payment for this borrower before creating another receipt."`. This is a form constraint, not an atomic concurrency lock. |
| APP-018 | Payments > Payment Method | Text, optional, blank initial | Enum with Text base; values Bank Transfer, Cash, Net-off at Disbursement; required true; initial `"Bank Transfer"`; Editable_If `NOT(IN([Row ID], Payments[Row ID]))`. Other values/autocomplete remain false. |
| APP-019 | Payments > Allocation Method | Text, optional, blank initial | Enum with Text base; values Single Full, Single Partial, Receive All, Lump Sum, First-day Auto, Loan Close; required true; initial `"Lump Sum"`; Editable_If `FALSE`. Other values/autocomplete remain false. |
| APP-020 | Payments > Ref Target Charge | Show/Required If include three targeted modes | Extend both expressions to `IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto", "Loan Close"))`; preserve target, IsPartOf false, Valid If, and Editable If. |
| APP-021 | Payments > Related Repayments | Generated by APP-005, inventory pending | Observed generated List VC `REF_ROWS("Repayments", "Ref Payment")`, app position 16, Show true. |
| APP-022 | Payments > Eligible Charges | Absent | Added hidden List VC, element Ref to Charges, app position 17. Exact eligibility formula below. |
| APP-023 | Payments > Eligible Outstanding | Absent | Added hidden Price VC `SUM([Eligible Charges][Amount Remaining])`, app position 18; inherited ฿ and 0 decimals observed. |
| APP-024 | Payments > Planned Allocation Amount | Absent | Added shown Price VC `SUM([Related Payment Allocations][Allocated Amount])`, position 19; ฿, 0 decimals. |
| APP-025 | Payments > Posted Amount | Absent | Added shown Price VC `SUM(SELECT(Repayments[Amount Received], [Ref Payment] = [_THISROW].[Row ID]))`, position 20; ฿, 0 decimals. |
| APP-026 | Payments > Allocation Difference | Absent | Added shown Price VC `[Amount Received] - [Planned Allocation Amount]`, position 21; ฿, 0 decimals. |
| APP-027 | Payments > Posting Difference | Absent | Added shown Price VC `[Amount Received] - [Posted Amount]`, position 22; ฿, 0 decimals. |
| APP-028 | Payment Allocations > Ref Payment; Ref Charge | Editable checkbox false | Enable base Editable and set Editable_If `FALSE` for both, preserving required and IsPartOf settings. |
| APP-029 | Payment Allocations > Charge Date Snapshot | Initial TODAY(), optional, Editable true | Clear initial; required true; Editable_If `FALSE`. Snapshot action must supply charge date. |
| APP-030 | Payment Allocations > Charge Row Number Snapshot; Allocation Order | Blank initial, optional, Editable true | Initial `0`, required true, Editable_If `FALSE` for both. |
| APP-031 | Payment Allocations > Interest Remaining Snapshot; Principal Remaining Snapshot; Amount Remaining Snapshot | Blank initial, optional, Editable true | Initial `0`, required true, Editable_If `FALSE`, 0 decimals, ฿ for all three. Read back all defaults/flags after recovering the final expression save from a browser timeout. |

APP-015 Valid If:

```appsheet
AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE))
```

APP-015 Invalid value error: `"Enter a positive whole-baht amount within the eligible outstanding balance. Full-payment methods must equal that balance."`

APP-022 App formula:

```appsheet
SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], [Amount Remaining] > 0, IFS(IN([_THISROW].[Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), [Row ID] = [_THISROW].[Ref Target Charge], [_THISROW].[Allocation Method] = "Loan Close", [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans], IN([_THISROW].[Allocation Method], LIST("Receive All", "Lump Sum")), [Charge Date] <= [_THISROW].[Payment Date], TRUE, FALSE)))
```

#### Live dependency findings and implementation refinements

- **Loan Close:** Loans[Wrapped Action - Close Loan] currently groups Create Final Charge, Add Principal to Today's Charge, Receive All Remaining Charges, and Set Loan Closed. Receive All Remaining Charges targets *all* outstanding charges of that loan (no date cutoff), then calls Common - Create Full Repayment from Charge. To preserve universal receipt processing and avoid accidentally collecting other loans of the borrower, an internal Loan Close allocation method is added. It identifies the loan through Ref Target Charge and needs no new physical column. The actual action migration remains pending.
- **Full receipt:** Charges[Receive Payment] currently groups Common - Create Full Repayment from Charge and Close Related Loan - Fixed Due Date. Its old guard is `COUNT([Related Repayments]) = 0`; the helper's guard is `[Amount Remaining] > 0`. The replacement must allow full payment of a partially paid charge.
- **Partial receipt:** Charges[Receive Partial Payment] currently targets `LINKTOFORM( "Repayments_Form", "Ref Charges", [Row ID], "Payment Date", TODAY(), "Principal Paid", [Principal Remaining], "Amount Received", [Amount Remaining], "Notes", [Notes])`. Migration to Payments_Form is pending.
- **Closure:** Charges[Close Related Loan - Fixed Due Date] applies Set Loan Closed to `LIST([Ref Loans])` when `AND(IN([Ref Loans].[Loan Type], LIST("กำหนดวันชำระ", "ผ่อนชำระรายวัน")), [Principal Due] > 0)`. Loans[Set Loan Closed] sets Loan Status to `"ปิดยอดแล้ว"`, Closed By to `USEREMAIL()`, Close Date to `TODAY()`, guarded by `[Outstanding Principal] <= 0`. These closure rules must be invoked after successful posting.
- **First-day generation:** New Loan Payment - Create First-Day Charge is still unchanged. It supports daily-interest and daily-installment loans, uses Loan Date, includes Transfer Fee in first-day interest, and checks no existing charge for that loan/date. Only auto-receipt processing is to be replaced.
- **Default:** Default - Create Repayment remains direct and unchanged, using negative Interest Paid for the prototype's accepted loss treatment. New trace fields remain blank. Default - Write Off Remaining Charge sets Principal Due to Principal Paid and Interest Due to Interest Paid when `AND([Total Paid] > 0, [Amount Remaining] > 0)`; unchanged.
- **Native keys:** The live create-repayment action's writable-column picker excludes Row ID. The proposed deterministic `PAY-<allocation>` key cannot be set through this native action. Keys and native References remain intact. Posting/retry implementation must use inspected supported controls and explicitly test duplicate behavior; no atomic/idempotent guarantee has been established.
- **Editable_If:** [Official AppSheet documentation](https://support.google.com/appsheet/answer/10107954?hl=en) confirms `FALSE` can restrict user edits while allowing actions. Both native action-picker inclusion and the actual app constraint were checked for the new repayment references.

### Documentation checkpoint — 6 September 2026

| ID | File / place | Change | Checks and status |
| --- | --- | --- | --- |
| DOC-002 | Documents/AppSheet_Data_Model_Overview.md, control table and §2.2 | Added isolated clone scope, IDs, rollback, the six native/app references, required and IsPartOf rules, ownership branch, processing/testing boundary, and pending reverse-reference reconciliation. Existing production inventories retain their dated baselines. | Names/settings cross-checked against APP-001–009. |
| DOC-003 | Documents/AppSheet_Data_Dictionary.xlsx, new Payments Clone sheet; README rows 28–29 | Added 32 inspected clone column definitions, exact configured expressions, six reference targets, initial imported defaults still requiring implementation, source IDs/URLs, and checkpoint/rollback/testing notes. Separate sheet is needed to avoid labelling clone changes as production/OLAP availability. | Rendered and visually checked changed ranges. All eight prior sheets' values/formulas, cell styles, formats, tables, merges, freeze panes, validations, and chart counts preserved in automated comparison. Six physical Ref rows confirmed; new expressions are stored as text. Formula-error scan found no matches. |
| DOC-004 | outputs/universal-payments-20260905 | Added dictionary inspection/update/verification scripts and local pre-change dictionary/overview copies; generated preview evidence and the verified workbook output. | Uses bundled artifact-tool for workbook edits. Pre-change copies are documentation rollback points. Support files contain configuration only. |
| DOC-005 | Overview §2.2/control table; dictionary Payments Clone/README; this log | Updated through saved clone v1.000009: 39 clone column definitions, six new calculation VCs plus observed reverse Repayments VC, payment methods/defaults/validation, Editable_If correction, partial snapshot configuration, and the Loan Close/native-key findings. | Re-rendered changed views, checked formula text and six reference rows, and reran comparison against all eight original sheets with zero preservation issues. Generated Borrowers/Charges reverse references remain pending reconciliation. |

Append each actual app, database, action, bot, UX, expression, validation, permission, slice, and documentation mutation here, with its exact location, before/after values, rationale, saved version, checks, and production migration instruction. Proposed changes must remain distinct from implemented changes.

## Implementation checkpoint — clone v1.000028, 6 September 2026

Manage > Versions > Version History displayed **1.000028** after saving. Baseline rollback remains v1.000002. These are configuration changes; runtime testing has not begun. All locations below are in the isolated OLTP clone. No further physical columns or production changes were made in this checkpoint.

### Additional column changes

| ID | Exact place | Before | Saved configuration |
| --- | --- | --- | --- |
| APP-032 | Data > Payment Allocations > Allocated Interest, Allocated Principal, Allocated Amount | Imported defaults | All three Price columns: initial `0`, required true, base Editable enabled with Editable_If `FALSE`, ฿, zero decimal digits. |
| APP-033 | Data > Payment Allocations > Created At | Editable | Editable_If `FALSE`, existing initial `NOW()` retained. |
| APP-034–037 | Data > Payment Allocations > four helper VCs below | Absent | Hidden VCs, app positions 16–19; Price helpers use ฿ and zero decimals. |
| APP-038 | Data > Repayments > Created By > Update Behavior | Editable checkbox false | Base Editable enabled, Editable_If `FALSE`; existing hidden Email field and `USEREMAIL()` initial retained. Allows generated repayments to carry the original receipt creator. |

**Payment Allocations[Calculated Order] — Number**

```appsheet
1 + COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Ref Payment], OR([Charge Date Snapshot] > [_THISROW].[Charge Date Snapshot], AND([Charge Date Snapshot] = [_THISROW].[Charge Date Snapshot], [Charge Row Number Snapshot] > [_THISROW].[Charge Row Number Snapshot])))))
```

**Payment Allocations[Calculated Amount] — Price**

```appsheet
MAX(LIST(DECIMAL(0), MIN(LIST(DECIMAL([Amount Remaining Snapshot]), DECIMAL([Ref Payment].[Amount Received]) - DECIMAL(SUM(SELECT(Payment Allocations[Amount Remaining Snapshot], AND([Ref Payment] = [_THISROW].[Ref Payment], [Calculated Order] < [_THISROW].[Calculated Order]))))))))
```

**Payment Allocations[Calculated Interest] — Price**

```appsheet
MIN(LIST(MAX(LIST(DECIMAL(0), DECIMAL([Interest Remaining Snapshot]))), DECIMAL([Calculated Amount])))
```

**Payment Allocations[Calculated Principal] — Price**

```appsheet
MIN(LIST(MAX(LIST(DECIMAL(0), DECIMAL([Principal Remaining Snapshot]))), DECIMAL([Calculated Amount]) - DECIMAL([Calculated Interest])))
```

### Actions: exact migration inventory

The following settings were read back from the saved editor. Unless stated, new actions have an empty display-name override and no confirmation. Existing label/icon settings were preserved except the new Lump Sum display label. Unspecified destination values use the documented column defaults. The native Row ID and Ref Loans app formula are not assigned by posting actions. The structured copy is `outputs/universal-payments-20260905/action_checkpoint_v1.000028.json`.

#### ACT-001 — Actions > Payment Allocations > Payment - Freeze Allocation

Before: Absent

After: **Set row values**; position **Hide**.

| Destination column | Value expression |
| --- | --- |
| Allocation Order | `[Calculated Order]` |
| Allocated Interest | `[Calculated Interest]` |
| Allocated Principal | `[Calculated Principal]` |
| Allocated Amount | `[Calculated Amount]` |

Only if this condition is true:

```appsheet
AND([Ref Payment].[Status] = "Processing", [Allocation Order] = 0, COUNT([Related Repayments]) = 0, [Calculated Amount] = [Calculated Interest] + [Calculated Principal], COUNT([Ref Payment].[Related Payment Allocations]) = COUNT([Ref Payment].[Eligible Charges]), COUNT(INTERSECT(SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Ref Payment]), [Ref Payment].[Eligible Charges])) = COUNT([Ref Payment].[Eligible Charges]))
```

#### ACT-002 — Actions > Payment Allocations > Payment - Post Allocation

Before: Absent

After: **Add row**; position **Hide**.

Destination table: `Repayments`.

| Destination column | Value expression |
| --- | --- |
| Payment Date | `[Ref Payment].[Payment Date]` |
| Principal Paid | `[Allocated Principal]` |
| Interest Paid | `[Allocated Interest]` |
| Ref Charges | `[Ref Charge]` |
| Ref Payment | `[Ref Payment]` |
| Ref Payment Allocation | `[Row ID]` |
| Notes | `[Ref Payment].[Notes]` |
| Created By | `[Ref Payment].[Created By]` |

Only if this condition is true:

```appsheet
AND([Ref Payment].[Status] = "Processing", [Allocation Order] > 0, [Allocated Amount] > 0, [Allocated Amount] = [Allocated Interest] + [Allocated Principal], COUNT([Related Repayments]) = 0, [Ref Payment].[Allocation Difference] = 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Ref Payment], [Allocation Order] = 0))) = 0, [Ref Charge].[Ref Loans].[Ref Borrowers] = [Ref Payment].[Ref Borrower], [Allocated Interest] <= [Ref Charge].[Interest Remaining], [Allocated Principal] <= [Ref Charge].[Principal Remaining], [Allocated Amount] <= [Ref Charge].[Amount Remaining])
```

#### ACT-003 — Actions > Charges > Payment - Snapshot Charge

Before: Absent

After: **Add row**; position **Hide**.

Destination table: `Payment Allocations`.

| Destination column | Value expression |
| --- | --- |
| Charge Date Snapshot | `[Charge Date]` |
| Charge Row Number Snapshot | `[_RowNumber]` |
| Interest Remaining Snapshot | `[Interest Remaining]` |
| Principal Remaining Snapshot | `[Principal Remaining]` |
| Amount Remaining Snapshot | `[Amount Remaining]` |
| Ref Payment | `ANY(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Status] = "Processing")))` |
| Ref Charge | `[Row ID]` |

Only if this condition is true:

```appsheet
AND(COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Status] = "Processing"))) = 1, IN([Row ID], LOOKUP(ANY(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Status] = "Processing"))), "Payments", "Row ID", "Eligible Charges")), [Amount Remaining] > 0, [Interest Remaining] >= 0, [Principal Remaining] >= 0, [Amount Remaining] = [Interest Remaining] + [Principal Remaining], COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment].[Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Ref Payment].[Status] = "Processing", [Ref Charge] = [_THISROW].[Row ID]))) = 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment].[Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Ref Payment].[Status] = "Processing", [Allocation Order] > 0))) = 0)
```

#### ACT-004 — Actions > Payments > Payment - Create Snapshots

Before: Absent

After: **Execute action on rows**; position **Hide**.

Destination table: `Charges`.

Referenced action: `Payment - Snapshot Charge`. Referenced rows: `[Eligible Charges]`.

Only if this condition is true:

```appsheet
AND([Status] = "Processing", [Amount Received] > 0, [Amount Received] <= [Eligible Outstanding], COUNT([Eligible Charges]) > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocation Order] > 0))) = 0, COUNT([Related Repayments]) = 0)
```

#### ACT-005 — Actions > Payments > Payment - Freeze Plan

Before: Absent

After: **Execute action on rows**; position **Hide**.

Destination table: `Payment Allocations`.

Referenced action: `Payment - Freeze Allocation`. Referenced rows: `[Related Payment Allocations]`.

Only if this condition is true:

```appsheet
[Status] = "Processing"
```

#### ACT-006 — Actions > Payments > Payment - Post Plan

Before: Absent

After: **Execute action on rows**; position **Hide**.

Destination table: `Payment Allocations`.

Referenced action: `Payment - Post Allocation`. Referenced rows: `SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0))`.

Only if this condition is true:

```appsheet
AND([Status] = "Processing", [Amount Received] > 0, [Allocation Difference] = 0, COUNT([Related Payment Allocations]) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocation Order] = 0))) = 0)
```

#### ACT-007 — Actions > Payments > Payment - Reconcile

Before: Absent

After: **Set row values**; position **Hide**.

| Destination column | Value expression |
| --- | --- |
| Status | `IF(AND([Amount Received] > 0, [Allocation Difference] = 0, [Posting Difference] = 0, COUNT([Related Payment Allocations]) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR([Allocation Order] <= 0, [Allocated Amount] <> [Allocated Interest] + [Allocated Principal], COUNT([Related Repayments]) <> IF([Allocated Amount] > 0, 1, 0), SUM([Related Repayments][Principal Paid]) <> [Allocated Principal], SUM([Related Repayments][Interest Paid]) <> [Allocated Interest])))) = 0), "Posted", "Error")` |
| Processed At | `IF(AND([Amount Received] > 0, [Allocation Difference] = 0, [Posting Difference] = 0, COUNT([Related Payment Allocations]) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR([Allocation Order] <= 0, [Allocated Amount] <> [Allocated Interest] + [Allocated Principal], COUNT([Related Repayments]) <> IF([Allocated Amount] > 0, 1, 0), SUM([Related Repayments][Principal Paid]) <> [Allocated Principal], SUM([Related Repayments][Interest Paid]) <> [Allocated Interest])))) = 0), NOW(), "")` |

Only if this condition is true:

```appsheet
[Status] = "Processing"
```

#### ACT-008 — Actions > Payments > Payment - Close Paid Loans

Before: Absent

After: **Execute action on rows**; position **Hide**.

Destination table: `Loans`.

Referenced action: `Set Loan Closed`. Referenced rows: `UNIQUE([Related Repayments][Ref Loans])`.

Only if this condition is true:

```appsheet
[Status] = "Posted"
```

#### ACT-009 — Actions > Payments > Payment - Process Receipt

Before: Absent

After: **Grouped**; position **Hide**.

Ordered actions: `Payment - Create Snapshots` → `Payment - Freeze Plan` → `Payment - Post Plan` → `Payment - Reconcile` → `Payment - Close Paid Loans`.

Only if this condition is true:

```appsheet
[Status] = "Processing"
```

#### ACT-010 — Actions > Payments > Payment - Retry

Before: Absent

After: **Set row values**; position **Prominent**.

| Destination column | Value expression |
| --- | --- |
| Status | `"Processing"` |

Only if this condition is true:

```appsheet
[Status] = "Error"
```

#### ACT-011 — Actions > Payments > Payment - Automation Entry

Before: Generated by bot suggestion as Payment - Process Receipt 2 with empty Status mapping; renamed and replaced with this explicit sequence. Group selector excludes another grouped action.

After: **Grouped**; position **Hide**.

Ordered actions: `Payment - Create Snapshots` → `Payment - Freeze Plan` → `Payment - Post Plan` → `Payment - Reconcile` → `Payment - Close Paid Loans`.

Only if this condition is true:

```appsheet
[Status] = "Processing"
```

#### ACT-012 — Actions > Charges > Common - Create Full Payment from Charge

Before: Common - Create Full Repayment from Charge added Repayments directly: Ref Charges=[_THISROW], Payment Date=TODAY(), Interest Paid=[Interest Remaining], Principal Paid=[Principal Remaining], Notes=[Notes]; guard [Amount Remaining] > 0.

After: **Add row**; position **Hide**.

Destination table: `Payments`.

| Destination column | Value expression |
| --- | --- |
| Status | `"Processing"` |
| Payment Date | `TODAY()` |
| Payment Method | `"Bank Transfer"` |
| Created By | `USEREMAIL()` |
| Created At | `NOW()` |
| Amount Received | `[Amount Remaining]` |
| Ref Borrower | `[Ref Loans].[Ref Borrowers]` |
| Ref Target Charge | `[Row ID]` |
| Allocation Method | `"Single Full"` |
| Notes | `[Notes]` |

Display name: `รับชำระ`.

Only if this condition is true:

```appsheet
AND([Amount Remaining] > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-013 — Actions > Charges > Receive Payment

Before: Grouped old full-repayment helper then Close Related Loan - Fixed Due Date; guard COUNT([Related Repayments]) = 0.

After: **Grouped**; position **Primary**.

Ordered actions: `Common - Create Full Payment from Charge`.

Display name: `รับชำระ`.

Needs confirmation: false. Retained message: `ยืนยันการรับชำระเงินรายการนี้หรือไม่?`.

Only if this condition is true:

```appsheet
AND([Amount Remaining] > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-014 — Actions > Charges > Receive Partial Payment

Before: LINKTOFORM( "Repayments_Form", "Ref Charges", [Row ID], "Payment Date", TODAY(), "Principal Paid", [Principal Remaining], "Amount Received", [Amount Remaining], "Notes", [Notes]); guard [Amount Remaining] > 0.

After: **Go to view**; position **Primary**.

Target expression: `LINKTOFORM("Payments_Form", "Ref Borrower", [Ref Loans].[Ref Borrowers], "Ref Target Charge", [Row ID], "Payment Date", TODAY(), "Payment Method", "Bank Transfer", "Allocation Method", "Single Partial", "Notes", [Notes])`.

Display name: `รับชำระบางส่วน`.

Only if this condition is true:

```appsheet
AND([Amount Remaining] > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-015 — Actions > Borrowers > Receive All Charges

Before: Execute Receive Payment on SELECT( Charges[Row ID], AND( [Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Charge Date] <= TODAY(), [Amount Remaining] > 0 )); original guard COUNT(the same SELECT)>0. Confirmation retained.

After: **Add row**; position **Inline**.

Destination table: `Payments`.

| Destination column | Value expression |
| --- | --- |
| Status | `"Processing"` |
| Payment Date | `TODAY()` |
| Payment Method | `"Bank Transfer"` |
| Created By | `USEREMAIL()` |
| Created At | `NOW()` |
| Amount Received | `SUM(SELECT(Charges[Amount Remaining], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Charge Date] <= TODAY(), [Amount Remaining] > 0)))` |
| Ref Borrower | `[Row ID]` |
| Allocation Method | `"Receive All"` |

Display name: `รับชำระทั้งหมด`.

Needs confirmation: true. Retained message: `ยืนยันรับชำระยอดคงเหลือทั้งหมดของผู้กู้รายนี้หรือไม่? Receive All Charges?`.

Only if this condition is true:

```appsheet
AND(COUNT(SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Charge Date] <= TODAY(), [Amount Remaining] > 0))) > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-016 — Actions > Borrowers > Receive Lump Sum

Before: Absent

After: **Go to view**; position **Prominent**.

Target expression: `LINKTOFORM("Payments_Form", "Ref Borrower", [Row ID], "Payment Date", TODAY(), "Payment Method", "Bank Transfer", "Allocation Method", "Lump Sum")`.

Display name: `"รับชำระรวม / Lump Sum"`.

Only if this condition is true:

```appsheet
AND(COUNT(SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID], [Charge Date] <= TODAY(), [Amount Remaining] > 0))) > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-017 — Actions > Loans > Receive All Remaining Charges

Before: Execute Common - Create Full Repayment from Charge on SELECT( Charges[Row ID], AND( [Ref Loans] = [_THISROW].[Row ID], [Amount Remaining] > 0 )); guard true. No date cutoff.

After: **Add row**; position **Hide**.

Destination table: `Payments`.

| Destination column | Value expression |
| --- | --- |
| Status | `"Processing"` |
| Payment Date | `TODAY()` |
| Payment Method | `"Bank Transfer"` |
| Created By | `USEREMAIL()` |
| Created At | `NOW()` |
| Amount Received | `SUM(SELECT(Charges[Amount Remaining], AND([Ref Loans] = [_THISROW].[Row ID], [Amount Remaining] > 0)))` |
| Ref Borrower | `[Ref Borrowers]` |
| Ref Target Charge | `ANY(SELECT(Charges[Row ID], AND([Ref Loans] = [_THISROW].[Row ID], [Amount Remaining] > 0)))` |
| Allocation Method | `"Loan Close"` |

Only if this condition is true:

```appsheet
AND(COUNT(SELECT(Charges[Row ID], AND([Ref Loans] = [_THISROW].[Row ID], [Amount Remaining] > 0))) > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-018 — Actions > Loans > Wrapped Action - Close Loan

Before: Same first three actions followed by Set Loan Closed; original guard had only Loan Type, Loan Status and Outstanding Principal terms.

After: **Grouped**; position **Primary**.

Ordered actions: `Create Final Charge` → `Add Principal to Today's Charge` → `Receive All Remaining Charges`.

Display name: `"ปิดยอดเงินกู้ / Close Loan"`.

Needs confirmation: true. Retained message: `"ยืนยันปิดยอดเงินกู้และรับชำระเงินทั้งหมดหรือไม่? Close this loan and receive the final payment?"`.

Only if this condition is true:

```appsheet
AND([Loan Type] = "ดอกเบี้ยรายวัน", [Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0, COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

#### ACT-019 — Actions > Charges > Payment - Create First-Day Receipt

Before: Absent

After: **Add row**; position **Hide**.

Destination table: `Payments`.

| Destination column | Value expression |
| --- | --- |
| Status | `"Processing"` |
| Ref Borrower | `[Ref Loans].[Ref Borrowers]` |
| Ref Target Charge | `[Row ID]` |
| Amount Received | `[Amount Remaining]` |
| Payment Date | `[Ref Loans].[Loan Date]` |
| Payment Method | `"Net-off at Disbursement"` |
| Allocation Method | `"First-day Auto"` |
| Notes | `[Notes]` |
| Created By | `[Ref Loans].[Created By]` |
| Created At | `NOW()` |

Only if this condition is true:

```appsheet
AND([Amount Remaining] > 0, [Charge Date] = [Ref Loans].[Loan Date], COUNT(SELECT(Payments[Row ID], AND([Ref Target Charge] = [_THISROW].[Row ID], [Allocation Method] = "First-day Auto"))) = 0)
```

### Automation changes and configuration review

- **BOT-004 — Automation > Payments - Process Receipt:** created enabled clone bot. App event **Payment queued or retried**, table Payments, Adds and Updates enabled, Deletes disabled, Bypass Security Filters false. Event condition: `AND([_THISROW_AFTER].[Status] = "Processing", OR(ISBLANK([_THISROW_BEFORE].[Status]), [_THISROW_BEFORE].[Status] = "Error"))`. Trigger other bots remains false. The generated step was labelled Payment - Process Receipt; its empty generated action was corrected as ACT-011. Final bot-to-action linkage still requires explicit read-back and execution testing.
- **BOT-005 — Automation > Auto Receive First-Day Charge > Receive First-Day Charge:** selected `Payment - Create First-Day Receipt` in place of the full-receipt helper. Options > Trigger other bots changed false → true so added Payments can trigger BOT-004. Existing event, first-day charge-generation formula and loan-generation bot were not edited. Final saved linkage/chaining read-back and end-to-end test remain pending.
- Three copied notification bots remain disabled. No notification test has been sent. Existing `Daily 00:05` warning states scheduled events only trigger when deployed; the clone remains undeployed.
- Fixed editor-detected errors: Price/integer LIST mismatch in three helper formulas (explicit DECIMAL conversion); unsupported chained list dereference in freeze completeness guard (replaced with SELECT); unquoted new Lump Sum display expression (quoted); empty bot-generated Status action (replaced with the explicit processing sequence). No expression errors remained in the final global Errors & Warnings dialog at v1.000028. Remaining warnings: scheduled event deployment requirement and Borrowers schema out of sync.
- The editor briefly reused/renamed Receive All during a new-action creation attempt. Receive All was restored with all mappings and its confirmation, and a separate Receive Lump Sum action was created. Both were individually read back at v1.000028. No action was executed during this correction.
- Native action picker does not accept a grouped action nested in another group. ACT-009 and ACT-011 currently contain the same five shared steps; consolidation and exact bot linkage review are pending before testing. Do not migrate an unused duplicate helper without resolving this dependency.
- Snapshot creation uses the single Processing payment for a borrower, guarded by a count of one; no atomic lock or concurrency guarantee is claimed. Frozen allocations and related-repayment checks provide retry guards, which remain untested. Loan closure calls the existing Set Loan Closed rule after receipt reconciliation; this expands the closure trigger to all fully paid loans touched by a successful receipt and requires regression testing.

### Documentation checkpoint at v1.000028

**DOC-006:** Updated overview §2.2/control table, dictionary Payments Clone/README, dictionary builder, structured action checkpoint, and this authoritative log. The dictionary now contains 44 inspected new/changed clone column definitions. Rendered and visually checked the allocation-helper and README ranges; formula-error scan found zero matches. Automated comparison again found zero preservation issues across all eight original sheets, including values/formulas, checked styles, tables, merges, freeze panes, validations and chart counts. Six new native/app reference definitions remain present. Original production sheets are preserved. Copied the verified output into Documents/AppSheet_Data_Dictionary.xlsx. Pending entries are explicitly marked; no functional test results were added.

## Configuration checkpoint v1.000042 — 6 September 2026

Manage > Versions > Version History explicitly displayed **1.000042** before the first debugging change. Baseline rollback remains **1.000002**. The following changes supersede the v1.000028 descriptions where stated. Production, OLAP and Looker were not edited.

- **APP-039 — Data > Borrowers/Loans/Statistics/Charges/Partners > Table settings and Regenerate schema:** verified Source Id points to cloned database `eEwpmrK1Zr4_ao2UcQzF42` for each loaded original table, then regenerated these five schemas. Source table IDs: Borrowers `xWfVyvMzCR4yUvqpyNlSs5`; Loans `AlooaFmRMo4hATvVWZ7nY0`; Statistics `jKbi_wk8PF4WugOEis02a5`; Charges `DjvkoE527c4QATjxt_unJ9`; Partners `mGxnCc4sq-48MDKYKemtGd`. The old displayed Source name on copied original tables was not relied upon. Captured all displayed grid metadata before/after: Borrowers 33 columns, Statistics 26, Charges 25, Partners 5 unchanged. Loans 40: regeneration introduced TODAY() defaults on Close Date and Due Date; both were cleared back to their prior blank settings and saved, with final read-back pending. No other captured Loans grid differences.
- **APP-040 — Reverse-reference reconciliation:** Borrowers column 33 Related Payments = `REF_ROWS("Payments", "Ref Borrower")`; Charges column 24 Related Payment Allocations = `REF_ROWS("Payment Allocations", "Ref Charge")`; Charges column 25 Related Payments = `REF_ROWS("Payments", "Ref Target Charge")`. All are shown, searchable List VCs. Repayments Created By confirmed at app position 9; hidden Email, initial USEREMAIL(), PII true, Editable_If FALSE. These are clone-only inventory entries, not production changes.
- **APP-041 — Data > Repayments > Payment Date / Principal Paid / Interest Paid / Notes / Ref Charges > Update Behavior > Editable_If:** prior base Editable true changed to expression `ISBLANK([Ref Payment])`, preserving existing formulas/defaults/validation. Prevent direct form changes to receipt-generated repayment values while retaining historical/default rows with blank Ref Payment.
- **APP-042 — Data > Payments > Data Validity:** Amount Received Valid_If changed to `OR(IN([Row ID], Payments[Row ID]), AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")), [_THIS] = [Eligible Outstanding], TRUE)))`. Ref Borrower Valid_If changed to `OR(IN([Row ID], Payments[Row ID]), COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Row ID] <> [_THISROW].[Row ID], IN([Status], LIST("Processing", "Error"))))) = 0)`. Ref Target Charge Valid_If changed to `SELECT(Charges[Row ID], AND([Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower], OR([Amount Remaining] > 0, AND(IN([_THISROW].[Row ID], Payments[Row ID]), [Row ID] = [_THISROW].[Ref Target Charge]))))`. Their existing creation-only Editable_If locks remain. Purpose: allow existing receipts to retain paid targets and original amounts when editing optional bank reference/notes. Runtime metadata-edit verification pending.
- **APP-043 — Data > Payments > Amount Received > Display > Description:** set `CONCATENATE("ยอดคงเหลือที่ชำระได้ / Current eligible outstanding: ฿ ", [Eligible Outstanding])`.
- **APP-044 — Data > Payments > Related Payment Allocations:** Show true → false; save automatically made Search false. Formula unchanged and remains the ownership list. Added column 23 **Visible Allocations**, List with element Ref to Payment Allocations, Show true, formula `SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0))`, display name `"รายการจัดสรร / Allocations"`. Purpose: show positive allocations without removing zero-allocation snapshots from the processing plan.
- **ACT-020 — Actions > Payment Allocations > system Add/Edit/Delete:** Only if blank → `FALSE`, Position Hide. Direct manual allocation CRUD is suppressed; parent cascade must still be tested.
- **ACT-021 — Actions > Payments > system Delete:** Only if blank → `AND([Status] <> "Posted", COUNT([Related Repayments]) = 0)`; position unchanged. Allows discarding an unposted receipt without repayments. Borrower cascade behavior remains unverified.
- **ACT-022 — Actions > Repayments > system Edit/Delete:** Only if blank → `ISBLANK([Ref Payment])`, positions unchanged. System Add: Only if blank → `FALSE`, Position Hide. Normal payment creation now starts through Payments; existing internal default actions are retained.
- **ACT-023 — Payment - Freeze Plan / Payment - Post Plan / Payment - Retry:** added competing-processing-receipt checks. Freeze Plan guard at this checkpoint: `AND([Status] = "Processing", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1)`. Post Plan adds the identical single-Processing count to its previous checks. Retry guard: `AND([Status] = "Error", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 0)`. These are checks, not an atomic lock.
- **BOT-006 — Receipt bot linkage correction:** explicitly read back Payments - Process Receipt > step Payment - Process Receipt > linked action Payment - Process Receipt (ACT-009), with its five ordered actions. The unused duplicate Payment - Automation Entry (ACT-011) was deleted and saved. The v1.000028 note suggesting ACT-011 was the actual bot entry was incorrect. ACT-011 was temporary and must not be migrated. The final bot uses ACT-009 directly.
- **BOT-007 — First-day chaining read-back:** Auto Receive First-Day Charge > Receive First-Day Charge links Payment - Create First-Day Receipt; Trigger other bots true and Wait for execution to complete true. Create First-Day Charge loan bot already had both options true, confirmed without changing its generation action/event. Three notification bots remain disabled.
- **UX-001 — App > Views > Payments:** created menu-position Deck view over Payments. Primary header Ref Borrower; secondary Status; summary Amount Received; sort Payment Date descending then Created At descending; display name `"รับชำระ / Payments"`; automatic action bar on. Runtime inspection later showed unnecessary reference/email actions in the automatic bar; refinement pending.
- **UX-002 — App > Views > system Payments_Form:** Column order Automatic → Manual: Ref Borrower, Payment Date, Ref Target Charge, Amount Received, Payment Method, Bank Reference, Notes. Auto save false, Auto reopen false and Finish view automatic unchanged. Allocation Method and processing metadata supplied by defaults/actions, excluded from the form layout. Runtime prefilling/validation verification pending.
- **TEST-001 — Synthetic fixture and execution report:** created `outputs/universal-payments-20260905/functional-test-results.md`; normal borrower/loan creation and first-day charge/receipt creation observed. First-day posting failed at this checkpoint. Test values and keys are synthetic and recorded in that report. No copied production financial row has been intentionally changed.

## Debugging changes after v1.000042

- **BOT-008 — Payment queued or retried > Condition:** old `AND([_THISROW_AFTER].[Status] = "Processing", OR(ISBLANK([_THISROW_BEFORE].[Status]), [_THISROW_BEFORE].[Status] = "Error"))` → `AND([Status] = "Processing", OR(ISBLANK([_THISROW_BEFORE].[Row ID]), [_THISROW_BEFORE].[Status] = "Error"))`. Saved definition visible as v1.000043 in preview URL; final Manage read-back pending. Initial event was received but did not run its processing bot; default Status was suspected. New-receipt retest still required. A deliberate synthetic-only Status Error intervention and app Retry did run processing, created one snapshot, then reconciled to Error. A second Retry froze and posted one repayment but again left Error despite displayed zero differences. See execution report; root cause is under investigation.
- **ACT-024 — Direct-query processing changes:** changed Freeze Plan referenced rows from `[Related Payment Allocations]` to `SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])`; Close Paid Loans referenced rows from `UNIQUE([Related Repayments][Ref Loans])` to `SELECT(Repayments[Ref Loans], [Ref Payment] = [_THISROW].[Row ID], TRUE)`. Freeze Allocation, Post Allocation and Post Plan replace related-row/reconciliation-VC checks with direct SELECT counts/sums of stored rows. Reconcile now compares stored allocated totals, stored repayment principal/interest totals, positive-allocation and repayment counts, unique allocation links, and exact repayment-to-allocation charge/component matches. These edits were saved; complete expression checkpoint and functional verification are pending. Do not migrate this intermediate state as accepted.

### Documentation and display checkpoint during debugging

- **APP-045 — Payments price Type Details:** Posting Difference Decimal digits 2 → 0 and Currency symbol $ → ฿; Allocation Difference and Planned Allocation Amount Decimal digits 2 → 0, retaining ฿. Posted Amount and Eligible Outstanding were inspected and already had zero digits/฿. The three corrected fields were read back in the editor and saved. This corrects the earlier log's intended formatting claims; final runtime display verification is pending.
- **BOT-009 — Payment queued or retried > Condition:** after a second fresh first-day receipt again remained Processing without a bot run, changed the condition to `[Status] = "Processing"`, retaining Adds/Updates and receipt-bot Trigger other bots false. The previous before-row-ID condition was not sufficient. Fresh-add testing and prevention of metadata edits while processing remain pending; do not infer atomic processing from this change.
- **DOC-007:** updated both model documents to the inspected 53-column clone inventory (Payments 23; Payment Allocations 19; Repayments 8 new/changed definitions; Borrowers 1 and Charges 2 reverse-reference VCs). Original production sheets remain at their dated baselines. Updated the artifact-tool builder and verification script to identify the six new References plus the existing Repayments Ref Charges explicitly. Verification found zero preservation differences across eight original sheets and zero Excel formula errors; rendered allocation and README ranges were visually checked. Copied the verified workbook to Documents. Final debugging version and additional live changes remain pending reconciliation.

- **TEST-002 — Fresh processing / recovery evidence:** after direct-query checks and BOT-009, synthetic installment loan September 4–13, P1,000 at 150/day completed first-day processing automatically: P100/I50, one allocation, one repayment, Posted, zero differences. First synthetic receipt recovered after three sequential retries without duplicating its allocation/repayment; second recovered in one attempt after a diagnostic Error intervention. Posted receipt metadata form accepted a bank-reference/note update with financial controls locked. Generated repayment detail showed no Edit/Delete; money formatting read back in client as whole baht. Exact fixture keys/results in the execution report. Broader scenarios remain pending.
- **ACT-025 — TEMPORARY TEST CONTROL, DO NOT MIGRATE:** Loans > Generate Today's Charge Position Hide → Prominent; original Only if condition wrapped in `AND([Ref Borrowers] = "YSYPQyaxQ6lFGGfdZVD0xG", <original condition>)`. The original active-loan/type/date/interval/no-today-duplicate rules and all charge mappings are unchanged. Purpose: invoke the existing generator only on synthetic Borrower A's loans while the scheduled clone bot is undeployed. Required cleanup: remove the outer synthetic-borrower clause, restore the exact original inner condition and Position Hide, save and verify after targeted testing. No global generation action has been executed.

## Verification and acceptance

**ACT-031 — TEMPORARY overdue/isolation fixture controls, now restored, DO NOT MIGRATE.** To seed fixed-loan charges at their historical due dates, Generate Today's Charge temporarily used `IF(IN([Row ID], LIST("gYLLLduWK1wAjdNl4E0vPK", "93nibq7hlpSt4bFEnAiell")), [Due Date], TODAY())`; its Only if was `OR(<ACT-025 guard>, AND(IN([Row ID], LIST("gYLLLduWK1wAjdNl4E0vPK", "93nibq7hlpSt4bFEnAiell")), COUNT(SELECT(Charges[Row ID], [Ref Loans] = [_THISROW].[Row ID])) = 0))`. Invoked once for A6 (Sep5/P500/I50) and A7 (Sep4/P250/I25), then restored the date mapping and ACT-025 guard. The synthetic borrower scope was subsequently expanded to `AND(IN([Ref Borrowers], LIST("YSYPQyaxQ6lFGGfdZVD0xG", "ICQE1XF5rHCNcjjUkRIuiI")), <exact original generator guard>)` to generate borrower B's one unpaid Sep6 interest2 charge. Finally restored the **exact original guard**, **Charge Date TODAY()**, and **Position Hide**. All three restorations were explicitly read back true in the editor after saving. Original principal/interest mappings were never changed. All generator test controls are now removed.

**BOT-010 — TEMPORARY pause/recovery test, restored.** After all prior receipts were Posted, disabled only Payments - Process Receipt in the clone and saved. Created synthetic receipt `WcON1DFvA1iVZ1XCAh4AZs` (TEST-PAUSED-RETRY1, amount1) using a refreshed client. It remained Processing with zero allocations/repayments and no Edit control. A second new form for the same borrower was rejected with the documented outstanding-receipt validation, then discarded. In the cloned native DB, changed only this test receipt's Status Processing→Error as a deliberate diagnostic intervention. Re-enabled the receipt bot, saved, confirmed its Disable button (enabled state), refreshed client, and invoked normal Payment - Retry. Recovery result pending read-back. No notification bot was enabled and no message sent.

### Default/reference dependency changes after v1.000052

**ACT-028 — Preserve allocation references during default.** Inspection found that Loans > Default - Delete Pending Charges selected every charge with Total Paid0, and Charges > Default - Delete Pending Charge allowed Payment Status รอชำระ. New zero-amount allocation snapshots can reference such charges. Deleting them would break the new Ref Charge relationship. The following clone changes retain those referenced charges and write their unpaid balance off using the existing Principal Due=Principal Paid / Interest Due=Interest Paid mappings. Unreferenced unpaid charges retain their prior deletion path. Default adjustment repayments remain direct, with blank payment references; the existing loss calculation is unchanged.

| Exact object/property | Before | After |
| --- | --- | --- |
| Loans > Default - Write Off Partial Charges > Referenced Rows | `SELECT( Charges[Row ID], AND( [Ref Loans] = [_THISROW].[Row ID], [Total Paid] > 0, [Amount Remaining] > 0 ))` | `SELECT(Charges[Row ID], AND([Ref Loans] = [_THISROW].[Row ID], [Amount Remaining] > 0, OR([Total Paid] > 0, IN([Row ID], Payment Allocations[Ref Charge]))))` |
| Charges > Default - Write Off Remaining Charge > Only if | `AND([Total Paid] > 0, [Amount Remaining] > 0)` | `AND(OR([Total Paid] > 0, COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) > 0), [Amount Remaining] > 0)` |
| Loans > Default - Delete Pending Charges > Referenced Rows | `SELECT( Charges[Row ID], AND( [Ref Loans] = [_THISROW].[Row ID], [Total Paid] = 0 ))` | `SELECT(Charges[Row ID], AND([Ref Loans] = [_THISROW].[Row ID], [Total Paid] = 0, NOT(IN([Row ID], Payment Allocations[Ref Charge]))))` |
| Charges > Default - Delete Pending Charge > Only if | `[Payment Status] = "รอชำระ"` | `AND([Payment Status] = "รอชำระ", COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) = 0)` |

**ACT-029 — Direct deletion guards.** Loans > system Delete > Only if blank → `COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge].[Ref Loans] = [_THISROW].[Row ID])) = 0`. Charges > system Delete > Only if blank → `COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) = 0`. Positions unchanged. This prevents direct row deletion from orphaning an allocation/payment trail. Borrower IsPartOf cascade remains the intended complete test-data cleanup path and requires explicit regression verification. Changes saved; not accepted until tested.

**ACT-030 — TEMPORARY future-charge fixture, DO NOT MIGRATE.** For synthetic fixed loan `qpR8njfYm2Lj9eOVUtEgj7`, Generate Today's Charge temporarily used Charge Date `IF([Row ID] = "qpR8njfYm2Lj9eOVUtEgj7", [Due Date], TODAY())`; Only if became `OR(<ACT-025 synthetic borrower guard>, AND([Row ID] = "qpR8njfYm2Lj9eOVUtEgj7", COUNT(SELECT(Charges[Row ID], [Ref Loans] = [_THISROW].[Row ID])) = 0))`. Invoked once to seed charge `KFRl5ZuSAh8dBshDD2RWsy` at September8, P1000/I100 with unchanged fixed-loan amount mappings. Immediately restored Charge Date `TODAY()` and the exact ACT-025 guard; saved. The original ACT-025 Prominent/synthetic-borrower test control still awaits final restoration. This seed is not evidence of scheduled future-charge generation.

**TEST-005 — Early-payment regression:** the future-due charge was excluded from Lump Sum eligible keys/amount (0) while it still had950 remaining. Single Partial150 at September6 successfully split I100/P50 against September8 charge; subsequent Single Full950 posted the remaining principal. Fixed loan closed with principal received1000, total1100 and principal outstanding0. Exact keys in execution report. Additional rounding and overdue/default fixtures are being prepared.

### Saved checkpoint v1.000052 — 6 September, 03:47 Singapore

Manage > Versions > Version History explicitly displayed **1.000052**. Rollback remains **1.000002**.

- **APP-046 — Data > Payments > Bank Reference and Notes > Update Behavior > Editable?:** plain true → `OR(NOT(IN([Row ID], Payments[Row ID])), [Status] <> "Processing")`. Entry on a new form and edits to Posted/Error metadata remain available; existing Processing metadata is locked to reduce redundant processing events. No formulas, types or required settings changed.
- **ACT-027 — Actions > Payments > system Edit > Behavior > Only if:** blank → `[Status] <> "Processing"`. Position Primary and Open a form behavior unchanged. Processing-state runtime verification remains pending.
- **UX-003 — App > Views > Collection > Actions:** retained Manual and existing `Receive All Charges`; appended `Receive Lump Sum`. Show action bar remains true; source remains `Todays Collection Board`; slice columns/filter/permissions/actions were not edited. Button visibility with a positive outstanding fixture will be verified after sync.
- **DOC-008 — Checkpoint documentation:** updated both model documents, the artifact-tool dictionary builder and `update_overview_checkpoint052.py`. Inventory remains53 definitions. Corrected an incidental dictionary description that incorrectly appended the Ref Charges target text to four non-reference repayment fields. Verification reports zero preservation issues across eight original sheets, six new plus one existing Reference definition, and no Excel formula errors. README render checked; verified workbook copied to Documents.
- **TEST-004 — Successful payment regressions after ACT-026:** lump sum100 retained three snapshots, ranked446/445/444, allocated I100 only to446; lump sum205 retained three snapshots and allocated P200 to446/I5 to445; cash Single Partial2 targeted444; Receive All23 posted18 to444 and5 to445. Collection showed332 collected/23 remaining before Receive All, then355/0. Daily-interest Loan Close500 on A2 generated a principal receipt, reached Posted, then loan Closed with outstanding principal0, principal received500 and total received515. Detailed fixture links and bounded results are in the execution report. No full-regression or acceptance claim.

- **TEST-003 — Generator, validation and lump-sum failures:** execution report T012–T017 records three correctly generated synthetic charges, invalid amount/date rejection, two failed multi-charge receipts, and successful unposted receipt→allocation deletion cascade. Lump sum25 incorrectly posted to the oldest charge with only one snapshot; lump sum100 froze only20 and stopped Error without a repayment. Both failures remain part of the evidence. T016 was deliberately deleted through the app to verify child cascade; T015 remains stored as failure evidence. Posted metadata no-reprocessing was subsequently confirmed server-side for T010.
- **ACT-026 — Snapshot coverage debugging, after v1.000047:** Charges > Payment - Snapshot Charge > Only if replaced the `IN(... LOOKUP(... Eligible Charges))` eligibility test with direct Payments SELECT predicates matching target charge, target loan or date by Allocation Method. Payments > Freeze Plan > Referenced Rows now returns only unfrozen allocations when eligible/snapshot counts and key coverage match. Payments > Post Plan > Referenced Rows now applies its posting guard plus coverage and subtracts already-posted allocation keys. Reconcile Status/Processed At assignments now also require no currently eligible charge missing from snapshots. Saved; test receipt `TEST-LS100-COVERAGE` submitted. Exact final expressions and runtime result will be recorded in the processing checkpoint. This is an intermediate debugging state, not migration acceptance. No model columns changed in ACT-026.

Source/clone configuration inspection, database isolation checks, native type conversion, app schema regeneration, and reference/settings read-back have run. Synthetic borrower/loan creation, controlled recovery, and a fresh daily-installment first-day chain passed in the recorded scenarios after fixes. Initial failures remain recorded. Metadata/repayment protection and currency display were also exercised. See the execution report for exact scope. Lump sum and broader regressions are still in progress. Offline, multi-user, notification and dashboard reconciliation tests have not run. Full functional or regression success is not claimed.

Planned coverage includes isolation; borrower and loan forms; all loan types; scheduled and first-day charges; full/partial/Receive All/lump-sum/first-day receipts; defaults and closures; interest/principal splitting; date and same-date ordering; multiple loans/borrowers; invalid input; historical payments; partial automation failure and retries; competing submissions; sync/offline behavior; deletion cascade using disposable synthetic borrowers; access controls; navigation; Collection, Loans, Charges, and Statistics reconciliation. Manual acceptance remains required under AGENTS.md §6.


### Exact processing expressions at v1.000052

This supersedes the affected ACT-024/026 intermediate descriptions. Unlisted mappings and actions retain their v1.000028 definitions, except deleted ACT-011. The companion `outputs/universal-payments-20260905/action_checkpoint_v1.000052.json` contains the 18 retained entry/processing actions and unchanged helper formulas. Native-key and concurrency limits remain explicit. These expressions are implemented in the clone; migration acceptance is pending.

#### Charges > Payment - Snapshot Charge

Only if this condition is true:

```appsheet
AND(COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Status] = "Processing", IFS(IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")), [Ref Target Charge] = [_THISROW].[Row ID], [Allocation Method] = "Loan Close", [Ref Target Charge].[Ref Loans] = [_THISROW].[Ref Loans], IN([Allocation Method], LIST("Receive All", "Lump Sum")), [_THISROW].[Charge Date] <= [Payment Date], TRUE, FALSE)))) = 1, [Amount Remaining] > 0, [Interest Remaining] >= 0, [Principal Remaining] >= 0, [Amount Remaining] = [Interest Remaining] + [Principal Remaining], COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment].[Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Ref Payment].[Status] = "Processing", [Ref Charge] = [_THISROW].[Row ID]))) = 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment].[Ref Borrower] = [_THISROW].[Ref Loans].[Ref Borrowers], [Ref Payment].[Status] = "Processing", [Allocation Order] > 0))) = 0)
```

#### Payment Allocations > Payment - Freeze Allocation

Only if this condition is true:

```appsheet
AND([Ref Payment].[Status] = "Processing", [Allocation Order] = 0, COUNT(SELECT(Repayments[Row ID], [Ref Payment Allocation] = [_THISROW].[Row ID])) = 0, [Calculated Amount] = [Calculated Interest] + [Calculated Principal], COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Ref Payment])) = COUNT([Ref Payment].[Eligible Charges]), COUNT(INTERSECT(SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Ref Payment]), [Ref Payment].[Eligible Charges])) = COUNT([Ref Payment].[Eligible Charges]))
```

#### Payments > Payment - Freeze Plan

Referenced Rows:

```appsheet
IF(AND([Status] = "Processing", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1, COUNT([Eligible Charges]) > 0, COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])) = COUNT([Eligible Charges]), COUNT([Eligible Charges] - SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Row ID])) = 0), SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocation Order] = 0)), LIST())
```

Only if this condition is true:

```appsheet
AND([Status] = "Processing", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1)
```

#### Payment Allocations > Payment - Post Allocation

Only if this condition is true:

```appsheet
AND([Ref Payment].[Status] = "Processing", [Allocation Order] > 0, [Allocated Amount] > 0, [Allocated Amount] = [Allocated Interest] + [Allocated Principal], COUNT(SELECT(Repayments[Row ID], [Ref Payment Allocation] = [_THISROW].[Row ID])) = 0, [Ref Payment].[Amount Received] = SUM(SELECT(Payment Allocations[Allocated Amount], [Ref Payment] = [_THISROW].[Ref Payment])), COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Ref Payment], [Allocation Order] = 0))) = 0, [Ref Charge].[Ref Loans].[Ref Borrowers] = [Ref Payment].[Ref Borrower], [Allocated Interest] <= [Ref Charge].[Interest Remaining], [Allocated Principal] <= [Ref Charge].[Principal Remaining], [Allocated Amount] <= [Ref Charge].[Amount Remaining])
```

#### Payments > Payment - Post Plan

Referenced Rows:

```appsheet
IF(AND(AND([Status] = "Processing", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1, [Amount Received] > 0, [Amount Received] = SUM(SELECT(Payment Allocations[Allocated Amount], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocation Order] = 0))) = 0), COUNT([Eligible Charges] - SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Row ID])) = 0), SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0)) - SELECT(Repayments[Ref Payment Allocation], [Ref Payment] = [_THISROW].[Row ID]), LIST())
```

Only if this condition is true:

```appsheet
AND([Status] = "Processing", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 1, [Amount Received] > 0, [Amount Received] = SUM(SELECT(Payment Allocations[Allocated Amount], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocation Order] = 0))) = 0)
```

#### Payments > Payment - Reconcile

Status:

```appsheet
IF(AND(AND([Amount Received] > 0, [Amount Received] = SUM(SELECT(Payment Allocations[Allocated Amount], [Ref Payment] = [_THISROW].[Row ID])), [Amount Received] = SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID])) + SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR([Allocation Order] <= 0, [Allocated Amount] <> [Allocated Interest] + [Allocated Principal], [Allocated Interest] < 0, [Allocated Principal] < 0)))) = 0, COUNT(SELECT(Repayments[Row ID], [Ref Payment] = [_THISROW].[Row ID])) = COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0))), COUNT(SELECT(Repayments[Ref Payment Allocation], [Ref Payment] = [_THISROW].[Row ID], TRUE)) = COUNT(SELECT(Repayments[Row ID], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Repayments[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR(ISBLANK([Ref Payment Allocation]), [Ref Payment Allocation].[Ref Payment] <> [_THISROW].[Row ID], [Ref Charges] <> [Ref Payment Allocation].[Ref Charge], [Principal Paid] <> [Ref Payment Allocation].[Allocated Principal], [Interest Paid] <> [Ref Payment Allocation].[Allocated Interest], [Ref Payment Allocation].[Allocated Amount] <= 0)))) = 0), COUNT([Eligible Charges] - SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Row ID])) = 0), "Posted", "Error")
```

Processed At:

```appsheet
IF(AND(AND([Amount Received] > 0, [Amount Received] = SUM(SELECT(Payment Allocations[Allocated Amount], [Ref Payment] = [_THISROW].[Row ID])), [Amount Received] = SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID])) + SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Payment Allocations[Row ID], [Ref Payment] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR([Allocation Order] <= 0, [Allocated Amount] <> [Allocated Interest] + [Allocated Principal], [Allocated Interest] < 0, [Allocated Principal] < 0)))) = 0, COUNT(SELECT(Repayments[Row ID], [Ref Payment] = [_THISROW].[Row ID])) = COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], [Allocated Amount] > 0))), COUNT(SELECT(Repayments[Ref Payment Allocation], [Ref Payment] = [_THISROW].[Row ID], TRUE)) = COUNT(SELECT(Repayments[Row ID], [Ref Payment] = [_THISROW].[Row ID])), COUNT(SELECT(Repayments[Row ID], AND([Ref Payment] = [_THISROW].[Row ID], OR(ISBLANK([Ref Payment Allocation]), [Ref Payment Allocation].[Ref Payment] <> [_THISROW].[Row ID], [Ref Charges] <> [Ref Payment Allocation].[Ref Charge], [Principal Paid] <> [Ref Payment Allocation].[Allocated Principal], [Interest Paid] <> [Ref Payment Allocation].[Allocated Interest], [Ref Payment Allocation].[Allocated Amount] <= 0)))) = 0), COUNT([Eligible Charges] - SELECT(Payment Allocations[Ref Charge], [Ref Payment] = [_THISROW].[Row ID])) = 0), NOW(), "")
```

Only if this condition is true:

```appsheet
[Status] = "Processing"
```

#### Payments > Payment - Close Paid Loans

Referenced Rows:

```appsheet
SELECT(Repayments[Ref Loans], [Ref Payment] = [_THISROW].[Row ID], TRUE)
```

Only if this condition is true:

```appsheet
[Status] = "Posted"
```

#### Payments > Payment - Retry

Only if this condition is true:

```appsheet
AND([Status] = "Error", COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Status] = "Processing"))) = 0)
```

## Rollback instructions

Restore clone app definition to v1.000002 to undo app configuration. App version restoration does not remove physical tables or columns. For a clean database rollback, create a fresh isolated copy of source OLTP v2.300005 with copied native data, and verify its distinct database ID before use; preserve this test clone until its implementation/test evidence is no longer needed. Do not restore, edit, or delete production as part of clone rollback. Update this log and both data-model documents after any actual model change or rollback.


## September 6 continuation: default, notification draft, and cascade defect

Status at this checkpoint: **implementation/testing in progress; borrower cascade FAILED for the new branch; not accepted or ready for migration**. Exact new expressions are also in `outputs/universal-payments-20260905/configuration_checkpoint_after052.json`. App rollback remains clone v1.000002; the last explicitly confirmed Manage version remains v1.000052 until a later read-back. Source OLTP remains untouched at recorded pre-copy v2.300005.

- **APP-047 — Data > Charges > Interest Due > Valid If:** existing validation rejected the zero/zero writeoff needed to retain a charge referenced only by zero allocations. Required, type, and initial value retained. The new exception requires no actual payment, at least one snapshot, and exclusively zero allocations belonging to Posted receipts. This adds one existing-column definition to the clone dictionary (54 definitions). It does not allow arbitrary empty charges.
- **ACT-032 — Loans > Wrapped Action - Default Loan > Behavior:** retain existing guard and additionally prohibit default while the borrower has a Processing/Error receipt. Confirmation now describes writeoff rather than promising all pending charges are removed. Group order and loss-entry mappings unchanged.
- **BOT-011 — disabled Notification - Charge Received:** retain bot name and disabled state. Event renamed Charge Received → Payment Posted; table Repayments → Payments; Adds only → Updates only; new Posted-transition condition below. Event bypass remains false. Task Send App Notification table context becomes Payments; category, recipients, title retained; body and deep link changed below. This drafts one notification per posted receipt instead of one per allocation repayment. No test notification or live delivery executed. New Loan Created and Loan Closed notification bots remain disabled too.
- **BOT-012 — Payments - Process Receipt > Options > Trigger other bots:** false → true; Wait for execution to complete remains true. Required for subsequent posted-receipt and loan-closure events when notifications are separately enabled. The fresh B receipt below posted once with no duplicate repayment under this setting; notification delivery remains untested and disabled.
- **ACT-033 — temporary B2 fixture generator:** Generate Today's Charge guard temporarily became `[Row ID] = "DJtdgGTUrMucQRcO3ZykTB"`, Charge Date became `[Due Date]`, Position Prominent. Invoked once to seed charge `JcPeskT41fckssAMwfoXpc`, ordinal456, dateSep4, P10/I1. Immediately restored exact original generator guard, Charge Date TODAY(), and Position Hide; all three read back. Principal/interest mappings never changed. Do not migrate fixture overrides.
- **TEST-006 — paused retry completed:** receipt `WcON1DFvA1iVZ1XCAh4AZs` automatically reached Posted at04:21:41 after the already documented Error intervention/Retry. Planned/posted/received1, differences0; PAs `UvSA2e-SRR4P6hJBsn9i06` (A6/I1) and `WMTiabV8IC46I2lLT1NTt8` (A7/0); repayment `d4zh1W2cX44LMLLGRYs0G2`. The competing new form was rejected and discarded, creating no second receipt. Receipt bot restored enabled.
- **TEST-007 — A7 default failure/repair:** original charge `Kp8WutgIxO5TjsEjls94UD` zero/zero writeoff failed Interest Due validation. Other group steps nevertheless committed: A7 closed/defaulted, loss250, new loss charge `CVjHNvGPDoaFdnxgQH4ZaC` and default repayment. Old charge incorrectly retained275 due. After APP-047, edited only that synthetic old charge Principal Due250→0 and Interest Due25→0 through its normal app form; saved successfully, no repayments on old charge, payment actions disappeared. Both zero snapshots retained. This is a disposable fixture repair, not a routine production financial correction or proof that grouped actions are atomic.
- **TEST-008 — fresh zero default passed:** B2 fixed loan `DJtdgGTUrMucQRcO3ZykTB`, P10/I1, loanSep3/dueSep4. B receipt `zUBEI4YQZtmUF8A8AURWRA`, TEST-B-LS1-ZERO-DEFAULT, created04:45:39/Posted04:46:06, pays1 to B1 today and0 to B2. PAs `aCP73vJL2o4LiuhxsOXXNb` and `AvCa8Oca314IYpWgwLSJH4`; repayment `fMfRm3R48U4neMxcXGj4J9`; totals1/differences0. B2 default ran normally with corrected validation, retained old charge at0 and original zero snapshot I1/P10/total11/order2/allocation0, added loss charge `S9mozSoGrB5R1xU5BDqclU` and repayment `xSsPZOIM53nqqUtfMoTKzP` P10/I-10/amount0. Native new receipt references on this default repayment are blank, compared with populated references on B1's generated repayment. B2 closed/defaulted, loss10, principal outstanding0, total received0. Posted receipt and Processed At/counts unchanged.
- **TEST-009 — borrower B cascade FAILED:** normal Visible Borrowers detail Delete and confirmation removed the borrower, its two loans, four charges, and three repayments (native Repayments448→445, all three known keys absent at bottom after reload). However two Posted receipts `VDvvqcLtp34pAsgZwraGg5` and `zUBEI4YQZtmUF8A8AURWRA`, and all three PAs `84Tkj6rk2t4He1p3XwveKa`, `aCP73vJL2o4LiuhxsOXXNb`, `AvCa8Oca314IYpWgwLSJH4` remained. Server receipt inspection shows orphan borrower/charge keys and nonzero Posting Difference after repayments were cascaded. Do not treat IsPartOf settings alone as verified cascade behavior. Investigation pending. Read back Payments Ref Borrower: Ref, Borrowers, IsPartOf=true. Borrowers Related Payments: List/Ref Payments, exact REF_ROWS expression, shown. Visible Borrowers already includes Related Payments at position33, all CRUD allowed, filter NOT([Hidden Flag]); no slice mutation made during this check.

### Interest Due before

```appsheet
OR([Principal Due] <> 0, [_THIS] <> 0)
```

### Interest Due after

```appsheet
OR([Principal Due] <> 0, [_THIS] <> 0, AND([Total Paid] = 0, COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Charge] = [_THISROW].[Row ID], OR([Allocated Amount] <> 0, [Ref Payment].[Status] <> "Posted")))) = 0))
```

### Default guard before

```appsheet
AND( [Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0, COUNT( SELECT( Charges[Row ID], AND( [Ref Loans] = [_THISROW].[Row ID], [Charge Date] = TODAY(), [Payment Status] = "ชำระแล้ว" ) ) ) = 0)
```

### Default guard after

```appsheet
AND(AND( [Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0, COUNT( SELECT( Charges[Row ID], AND( [Ref Loans] = [_THISROW].[Row ID], [Charge Date] = TODAY(), [Payment Status] = "ชำระแล้ว" ) ) ) = 0), COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrowers], IN([Status], LIST("Processing", "Error"))))) = 0)
```

### Default confirmation after

```appsheet
"ยืนยันบันทึกหนี้สูญหรือไม่? ยอดค้างชำระของเงินกู้นี้จะถูกตัดออก และเงินต้นคงเหลือจะถูกบันทึกเป็นขาดทุน / Record this loan as a bad debt? Outstanding charges will be written off and the remaining principal recorded as a loss."
```

### Notification condition

```appsheet
AND([Status] = "Posted", [_THISROW_BEFORE].[Status] <> "Posted")
```

### Notification recipients unchanged

```appsheet
SELECT( Partners[Email], AND(ISNOTBLANK([Email]), [Email] <> [_THISROW].[Created By]))
```

### Notification title unchanged

```appsheet
"ได้รับชำระเงิน / Payment Received"
```

### Notification body before

```appsheet
ผู้กู้ Borrower: << [Borrower Name TE]>>
จำนวนเงิน Amount: <<[Amount Received]>>
ดอกเบี้ย Interest: <<[Interest Paid]>>
เงินต้น Principal: <<[Principal Paid]>>
```

### Notification body after

```appsheet
ผู้กู้ Borrower: <<[Ref Borrower].[Borrower Name TE]>>
วันที่รับชำระ Payment date: <<TEXT([Payment Date], "DD/MM/YYYY")>>
วิธีชำระ Method: <<[Payment Method]>>
จำนวนเงิน Amount: <<[Amount Received]>>
ดอกเบี้ย Interest: <<SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID]))>>
เงินต้น Principal: <<SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID]))>>
รายการที่ชำระ Charges paid: <<COUNT(SELECT(Repayments[Row ID], [Ref Payment] = [_THISROW].[Row ID]))>>
```

### Notification deep link before

```appsheet
LINKTOROW([_THISROW].[Row ID], "Repayments_Detail")
```

### Notification deep link after

```appsheet
LINKTOROW([_THISROW].[Row ID], "Payments_Detail")
```



## Checkpoint v1.000065 — completed sync correction and cleanup

**Correction to TEST-009/T034:** The earlier FAILED label was premature: it described an intermediate state while the app was still sending cascade deletions. On a later server refresh both B receipts disappeared; native PA inspection found none of the three B allocations and retained A's zero snapshots. No cascade-expression or IsPartOf fix was needed. Native Borrowers contains A but neither B nor C; B's three repayments were absent and native Repayments count fell448→445; B charge keys were absent while A7's original and loss charges remained. The completed borrower cascade passed for this fixture. Exact completion latency was not measured. Wait for sync to finish before assessing a cascade or reconciling its intermediate counts.

- **TEST-010 — disposable diagnostic C:** created `gRyrH04bEKmrPeF3e3HbIT`, name ZZ_TEST_PAY_C_CASCADE_20260906, blank phone, diagnostic description. No receipt was reparented and no loan created: the original B cascade completed before intervention. Deleted C through normal app Delete/confirmation; native Borrowers read-back confirms absence.
- **DATA-001 — new-table starter cleanup:** selected the first four fully blank rows in Payment Allocations and Payments separately using the native database grid, opened Delete rows, verified each confirmation said Delete4rows, then confirmed. Each row had no business values or references. No schema settings changed. After reload native Payments has14 nonblank keyed synthetic rows; Payment Allocations22. First row in each table is the retained A1 fixture. The four known blank receipt keys were I5SzcIBTYn4ae5lTx-6WU4,4kmOsBTl614Ea8aqqU99Y5,9VinG0sSq54giSqrLQdFF5,08Ze7vHxJW4PMVBVGjoKua. Blank allocation keys were not exposed in the grid; exact scoped cleanup was four first rows with no values, before the first A1 allocation. These unlinked empty rows are not production migration data. No grid undo recovery was verified; disposable blank rows can be recreated if needed.
- **SLICE-001 — automatic schema consequence, reconciled:** Visible Borrowers includes Related Payments at position33; Todays Collection Board includes it at position12. Source/filter/permissions and existing column order retained. No manual slice mutation was made. Prior notes saying the slice definition was not changed mean no manual edit; the automatic appended membership is a model change and is now explicitly inventoried in both model documents. Exact45 membership rows are in clone_slices_checkpoint065.json and Payments Clone Slices.
- **VERIFY-001 — Manage > Versions:** Editing LoanMgr Payments TEST 20260905 version1.000065 confirmed. Save disabled. Errors & Warnings contains only Scheduled event Daily00:05 is only triggered when app is in deployed state. No configuration errors shown. The clone remains undeployed. Loans Close Date and Due Date grid initial values both blank, confirming restoration after regeneration.
- **DOC-009 — model/test documentation:** update overview, workbook builder/verifier, separate clone slice inventory, post-052 exact expression JSON and execution report. Preserve all eight production-baseline workbook sheets; clone appendix contains54 column definitions plus45 slice-membership rows. Workbook export/render/preservation verification is recorded when completed.

Rollback remains clone app v1.000002. For a clean data/schema reset, make a fresh isolated source copy and verify all Source Id values; restoring an app version does not restore deleted data or undo physical columns. Do not use clone fixture keys, temporary overrides, failed-test rows, blank cleanup, or disabled-notification isolation settings as production migration operations.

## Additional recovery testing after v1.000065

- **DOC-010:** exported/rendered v1.000065 workbook checked successfully: 54 clone column definitions, 45 ordered slice memberships, six new plus one existing Ref in the affected-column inventory, zero formula-error matches, and zero preservation issues across the eight original worksheets. Published to Documents/AppSheet_Data_Dictionary.xlsx. Corrected stale cascade status in overview/test report and removed an unverified native Undo recovery claim.
- **TEST-011 preparation:** baseline v1.000065 recorded. A blank native Charges create form was opened, its reference search did not resolve the loan's key, and Escape discarded the form without saving. For controlled partial-posting coverage, use existing synthetic A1 charges instead: 9c26vIkY6BQLWFz7RXgzm5 interest due45→55 and 0gEpwYmatO4pILlCDEFTM8 interest due17→27, principal0 unchanged. These fixture-only supplemental balances must not be migrated. The planned fault guard will suppress allocation order2 only for receipt Bank Reference TEST-PARTIAL-RECOVERY15, then restore the exact original guard before Retry. Execution and results are recorded below when observed.

- **ACT-034 — temporary skipped-allocation fault, restored:** Payment Allocations > Payment - Post Allocation > Only if temporarily wrapped its exact final ACT-002 guard as `AND(<original>, OR([Ref Payment].[Bank Reference] <> "TEST-PARTIAL-RECOVERY15", [Allocation Order] <> 2))`. Saved only in the clone, then submitted one matching synthetic receipt. After observing Error with15 planned/10 posted, restored the exact original expression, read back that the fault marker was absent, and saved. Manage confirmed restoration version **1.000067**. Do not migrate this test wrapper.
- **TEST-011 result / T037:** AW2Qm4npbTxtcOd8guxROu retained frozen allocations F8qtfglTO74_Y1D5H6NMj7/order1/I10 and vCIBt6pYFB4TQP3NA_532f/order2/I5. Initial repayment4dGcjLQezW4eAJ2liVQzM2 remained; normal Retry added only MfxltEOfde4AUazAaMsrxa. Posted05:28:25, planned/posted15, both differences0. Retry disappeared. Pass for this partial-posting recovery. Synthetic A1 charge interest increases were saved through normal Charge Edit as recorded above.
- **UX-003 — App > Views > Payments > View Options > Actions:** Automatic changed to Manual. Before automatic order: Delete, Edit, Compose Email (Created By), View Ref (Ref Borrower), View Ref (Ref Target Charge), Payment - Retry. After manual order: **Delete, Edit, Payment - Retry**. Show action bar remains enabled; action definitions/conditions unchanged. Removed only three card shortcuts, not their underlying system actions. Saved version **1.000068** confirmed in Manage. Synced Posted receipt card shows Edit only; no Retry/Delete/email/reference shortcuts.
- **TEST-012 / T038:** Created final synthetic receipt5, g0PtONLMUWw6ptoZXFM2rq, TEST-DASHBOARD5. Posted05:33:09 with PA K58m4hOVje4yaaUrjID913 and repayment IITBgeqoUU4S6NMel9Mpm8, planned/posted5 and differences0. Captured five dashboard metrics before and after at the same session/date: Pending Payment -5; Today's Profit +5; Total Profit +5; Realized Profit MTD +5; Outstanding Principal0. These exact deltas match the interest-only receipt. No full-history/downstream audit is implied.
- **VERIFY-002 / T039–T040:** v1.000068, Save disabled. Final Errors & Warnings has only the undeployed Daily00:05 scheduled-event warning. All16 retained A receipts are Posted. The initial wrong LS25 test row is intentionally preserved and must not be interpreted as an accepted allocation result.
- **DOC-011:** Added Documents/Universal_Payments_Clone_Migration_Runbook.md with environment identities, ordered migration instructions, exact source cross-references, excluded test controls, rollback and remaining acceptance matrix. Updated execution report through T040 and current overview/status. Model definitions remain at verified v1.000065; v1.000067 restored a temporary action test and v1.000068 changed only the payment card action list. No workbook model row changed after its verification/publication.
- **DATA-002 — final retained fixture count:** server Payments read showed16 synthetic A receipts, all Posted; native Payment Allocations exposed25 distinct keyed rows. No B or C records were added after completed cascade/cleanup. A1 supplemental interest from TEST-011 was subsequently paid by T037/T038. Keep this test-data history separate from schema migration instructions.
- **DOC-012 — final consistency checks:** workbook verifier passed again with zero preservation issues across eight original sheets,54 clone definitions and45 slice memberships. Published workbook SHA-256 matches the verified output (`1A5EB1C44278FA2DFE026932C2B98C3FF6F23F9DD5216940DED86C67BBF2E93F`). All local runbook links resolve; the execution report contains the complete T001–T040 case sequence. Git whitespace check passed for the changed overview; no tracked file under sources/ changed. Unrelated pre-existing workspace changes were left in place. App/editor and database tabs retained for user review. No production deployment or manual acceptance recorded.
