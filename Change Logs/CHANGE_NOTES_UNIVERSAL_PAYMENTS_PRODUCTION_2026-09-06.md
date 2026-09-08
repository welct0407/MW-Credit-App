# Universal payments production migration — 6 September 2026

## Authorization and status

The user reviewed the clone results, stated that they look good, and explicitly authorized implementation in the production app, a full app/database backup before implementation, use of the test change log as the primary migration reference, and post-implementation validation. This supersedes the earlier pending deployment/acceptance status for the requested cutover; it does not change unexecuted test results into passes. The user also confirmed **everyone is synced and data entry is paused**.

Status: **production implementation complete, saved and Deployed at OLTP v3.000002; bounded production validation passed and synthetic fixtures removed.** Full backup verified before changes. Documentation completed. OLAP's additional trace-field schema reconciliation and the manual coverage below remain outstanding; this is not a claim that every possible scenario was tested. Earlier progress entries below are chronological and superseded by the completion record.

## Baselines and reference sources

- Production OLTP: Loan Manager ผู้จัดการสินเชื่อ, app `93844270-6aa5-420b-a960-bcdf08abd357`, app name `LoanManager-975338008-26-08-07`. Live Manage > Versions > Version History confirmed **v2.300005** before backup; Save disabled, app Deployed.
- Production database expected identity from the original live inspection: `9Y5vh3TFzZ4sIe2JgNh4l0`; all current table sources must be reconciled again before mutation.
- Tested clone: LoanMgr Payments TEST 20260905, app `1b901dff-2e47-477c-8d2c-28aad5556102`, current v1.000068; model checkpoint v1.000065.
- Primary reference: [test change log](CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md), [migration runbook](../Documents/Universal_Payments_Clone_Migration_Runbook.md), [test results](../outputs/universal-payments-20260905/functional-test-results.md), dictionary Payments Clone/Payments Clone Slices, final core action JSON and later configuration JSON linked by the runbook. Later log corrections supersede intermediate expressions and test controls.
- Production changes will preserve historical/default repayment grain and keys. No synthetic clone data or temporary test controls will be migrated. No live test notification is authorized by this task; functional validation must suppress test-recipient delivery.

## Backup ledger

| ID | Operation | Options and verification | Status |
| --- | --- | --- | --- |
| BAK-001 | My Apps > production OLTP > Actions > Copy | Name LoanMgr FULL BACKUP 20260906; Save app to AppSheet database; Make a copy of data ON; Make a copy of file data/images ON | Complete; see verified app/database identities below |

### Backup verification before production mutation

Completed on 6 September 2026, approximately21:55 Asia/Singapore:

- Backup app **LoanMgr FULL BACKUP 20260906**, ID `243eb391-5f6d-4720-a7e2-f0dc67151e78`, internal name `LoanMgrFULLBACKUP20260906-578763613`. Manage > Versions confirmed **v1.000002**; Save disabled; not deployed. No backup app configuration was edited.
- Backup database **Money FULL BACKUP 20260906**, ID `SAYscSVuS847EarNTaAiwc`. Renamed the new database from its copied Money database label. All ten tables are present: Loans, Statistics, Partners, Charges, Cash Pool Contributions, Settlements, Repayments, Loan Assessment, Daily Analytics, Borrowers. This includes tables not loaded in OLTP.
- All six backup app table Source Id values were read from Table settings > Storage and point to the backup database. Table IDs: Borrowers `rrkRsY94Ut4gEBvFsvxgW9`; Charges `IbOnTnso1e49E4eFEL76w4`; Loans `3AjHOjpvxw4v22MbblRvE0`; Partners `9YpLPbCPPg4nIeyimR-jX1`; Repayments `dcB5j_AT8H4WaSg9LqaqJf`; Statistics `3M57nAUC5646aHhbD3vJF7`.
- Both data-copy and file/image-copy options were explicitly enabled when submitted. Copy completed into a usable backup editor without a displayed copy failure. The dictionary contains no File/Image/Signature/ Drawing typed columns. Individual attachment byte-for-byte verification was not performed.
- **Recovery detail:** native copy generates new system row IDs (observed Statistics source key8v7jvRGPTJ42AXVpL2B4de versus backup keygNxum_fnll4TQ4xccLKX23). Retain the backup app and database together; do not merge backup rows into production by assuming identical Row IDs. Original production keys remain the migration target. App configuration rollback and native database change-history undo are separate recovery mechanisms; [official history/undo documentation](https://support.google.com/appsheet/answer/12726292?hl=en) describes its30-day window.

The requested backup assets now exist and their scope/isolation have been verified to the extent stated above. No production schema/configuration/data mutation occurred before this verification.

### Current production source mappings

All six live app sources were reconciled again to database `9Y5vh3TFzZ4sIe2JgNh4l0`:

| App table | Native table ID |
| --- | --- |
| Borrowers | rnh3hHqmph4aA3LhyyStVb |
| Charges | 3284cyJlr544IDOUvBvzL9 |
| Loans | LT3NMhYnru4gmKHflZhfNa |
| Partners | o7lTWOB-ER4lMxsA_6iMfb |
| Repayments | e54tCERnqB41EsWr0oR7-8 |
| Statistics | YhYb7_iBcJ4QE1MtC2M-q2 |

**ENV-001 — release staging:** started a definition-only copy of tested LoanMgr Payments TEST 20260905, named LoanMgr RELEASE 20260906, with data-copy OFF and file-copy OFF. A longer proposed name was rejected by the30-character form limit before submission; no extra app was created. This staging copy must be remapped to the original production sources and new empty production tables before any upgrade. The full backup remains untouched.

## Migration approach under review

The supported App Upgrade workflow may transfer a prepared copy's definition into the original app while retaining the original app identity. Any such candidate must first be reconciled to the production data sources, file storage and production-specific settings; the tested clone's source IDs and synthetic data must never become production sources. Configuration migration does not synchronize or restore transactional data. See [official AppSheet upgrade documentation](https://support.google.com/appsheet/answer/10105386?hl=en). Current production v2.300005 matches the original source checkpoint.

## Rollback and validation

Configuration rollback baseline is production v2.300005. Full backup app/database identities and file-copy result are recorded above. App version restoration alone does not remove physical columns or restore deleted rows. No production mutation may proceed until the requested full backup is confirmed.

Validation will include source isolation/mapping, new native/app references and IsPartOf, exact configuration comparison, editor errors, saved deployment state, and bounded synthetic/read-only workflow checks with notification suppression. Pending offline/concurrent/device/role/schedule/downstream coverage remains explicit unless executed. All implementation and validation results will be appended here, and the production model documents updated in the same task.

## Production physical schema migration — in progress

**DB-001 — Payments:** created native table `O5PsoZ45Pa4-UiwXmMUzq8` in original Money database. User columns in order: Ref Borrower (Reference → Borrowers), Status (Text), Amount Received (Price), Payment Method (Text), Allocation Method (Text), Bank Reference (Text), Notes (LongText), Created By (Email), Payment Date (Date; native label), Created At (DateTime), Processed At (DateTime), Ref Target Charge (Reference → Charges). System Row ID and source ordinal retained. Asia/Singapore; English (United States). Description: One received payment per row. Universal payment processing; production migration 2026-09-06.

**DB-002 — Payment Allocations:** created native table `o9bAh2SCbt4umWWbdwabH9` in original Money database. User columns in order: Ref Payment (Reference → Payments), Ref Charge (Reference → Charges), Charge Date Snapshot (Date), Charge Row Number Snapshot (Number), Interest Remaining Snapshot (Price), Principal Remaining Snapshot (Price), Amount Remaining Snapshot (Price), Allocation Order (Number; native label), Allocated Interest (Price), Allocated Principal (Price), Allocated Amount (Price), Created At (DateTime). System Row ID and source ordinal retained. Asia/Singapore; English (United States). Description: Frozen charge allocation snapshots for universal payment processing. Production migration 2026-09-06.

**DB-003 — Repayments:** appended Ref Payment (native Reference → Payments) and Ref Payment Allocation (native Reference → Payment Allocations). Existing business rows and keys were not intentionally changed. New relationship values remain blank for historical rows. App-level configuration is still pending.

New-table starter rows are pending cleanup. No test-clone business data was copied into production. The original production app has not yet been upgraded. New named reference columns were configured directly as Reference; temporary primitive labels on blank default columns were replaced with the final labels. Creating tables retained existing database sharing; no new recipients were added.


**DB-004 — starter cleanup:** removed the four automatically created, wholly empty rows from each new table. Verified completion by waiting for decreasing row counts. No populated cells were present. Historical production rows were not part of this cleanup.

**ENV-002 — release source remapping:** release app `68bc9be3-acf3-468e-b305-e38db0d29b8f`, internal name `LoanMgrRELEASE20260906-578763613`, now uses all six original table IDs above plus Payments `O5PsoZ45Pa4-UiwXmMUzq8` and Payment Allocations `o9bAh2SCbt4umWWbdwabH9`. Each Table settings > Storage source and qualifier was explicitly selected and its resulting Source Id checked. Source selection initially chooses the first qualifier; each was corrected to the matching table before saving. No Copy Data operation was used.

**ENV-003 — production properties and access baseline:** original Short Name is Loan Manager ผู้จัดการสินเชื่อ; Default app folder `/appsheet/data/LoanManager-975338008-26-08-07`. Set those two release properties to match. Both original and release require Google sign-in and have Allow all signed-in users OFF. Original share dialog contains owner plus one Use app user; identities retained privately for post-upgrade comparison, not exported. No grants or invitation messages were sent.

**ENV-004 — automation cutover controls:** original six bots were verified enabled (Create First-Day Charge, Auto Receive First-Day Charge, Generate Daily Charges, Notification - New Loan Created, Notification - Loan Closed, Notification - Charge Received). Release retains the tested receipt-processing bot and first-day chaining. Disabled Generate Daily Charges in the release candidate to prevent an independently deployed copy running the schedule. The three clone notification switches remain disabled for migration validation. Restore intended production schedule/notification enablement after validation; keep the candidate inactive. No notification delivery has been tested or sent.

**DB-005 — correction found by deployment check:** the first candidate check passed definition checks but reported Repayments had 8 columns versus 10 expected. Native tab navigation had retained Payment Allocations when the initial DB-003 add operations were issued. Inspection by explicit table URL found accidental unused `Ref Payment (1)` and `Ref Payment Allocation` columns in the empty Payment Allocations table, and missing links in Repayments. Corrected by adding both native Reference fields to the explicitly verified Repayments table, then deleting the two accidental fields from the zero-row allocation table (confirmed exact column names in the app-impact dialog). No financial rows were deleted or converted. Final native visible user-column inventories verified: Repayments 9, Payments 12, Payment Allocations 12; system Row ID is additional. The original app was not upgraded during this failure. Re-running deployment checks after correction. DB-003 above describes the final intended/resulting location, with this entry recording the intermediate error and fix.

**CFG-001 — source schema regeneration and reconciliation:** candidate deployment check next detected a native internal column-order mismatch in Payment Allocations despite matching visible order. Regenerated candidate Payment Allocations, Payments and Repayments against production. This reset several new-table properties. Compared all 187 columns across eight loaded operational tables using the rendered generated app documentation against the accepted clone: restored the three Payments Enum definitions/options/base type/input mode/autocomplete settings, their Initial values and Editable_If guards; Created By initial USEREMAIL(); Amount Received descriptive expression; cleared Processed At default; preserved Created At NOW(); restored eight allocation numeric defaults to zero and cleared Charge Date Snapshot initial TODAY(). Existing six-table column definitions otherwise matched. This is a release-candidate correction before original-app upgrade.

**CFG-002 — complete documented behavior comparison:** all 133 generated documentation objects (actions, views, format rules and slices) compared equal between accepted clone and release candidate after source regeneration. Counts: 73 actions, 30 views, 50 format rules, 2 slices (some format objects lack independent headings; 133 ID-bearing objects compared). Bot enablement differences are intentional migration controls and tracked separately. Generated documents continued to show four old label flags, while controlled saved editor checkboxes and native label icon showed the intended new labels. Label reconciliation remains pending final reload/cutover verification; no financial expression differences remained in the comparison.

## Production cutover and validation

**DEP-001:** candidate readiness check PASSED app-definition warnings/errors, app-definition errors and data/expected-structure consistency, plus sign-in, allowed updates, account and UI checks. Non-blocking description/server-cache warnings remained. Deployed the quiet candidate, then used original Manage > Versions > App Upgrade with source `LoanMgrRELEASE20260906-578763613`. Original app ID remained unchanged and Deployed. Upgrade initially reported v2.300008; explicitly set Settings > Information > Version to 3.000000, committed the field, then saved. Fresh editor read confirmed **v3.000001**. Candidate returned to prototype state immediately afterward; its daily schedule and three notifications remain disabled.

**DEP-002:** fresh production generated documentation matched all **187** operational column definitions against the accepted clone, with **zero property differences**, including all references/IsPartOf, financial expressions, defaults, and intended labels. All **133** compared action/view/format/slice objects also matched. An earlier comparison helper retained its initial snapshot, producing stale label-difference reports; fresh inline comparison against the production documentation resolved those reports. No additional label change was needed. Native Payment Date / Allocation Order labels and production document labels agree. Production default folder and sign-in settings preserved. Original owner and one Use app user's identities/roles matched before and after upgrade; no new access grants or invitation messages.

| Test | Production input / check | Observed result |
| --- | --- | --- |
| P001 | Synthetic borrower DEPLOY-VERIFY-20260906; loan principal100, daily interest10, date6Sep | Created loan and first-day charge; first-day receipt10 automatically Posted with one allocation/repayment; planned10=posted10; both differences0 |
| P002 | Only synthetic charge Interest Due increased from10 to30, preserving existing paid10 | Remaining eligible20 shown in payment form |
| P003 | Attempt lump-sum amount21 against eligible20 | Rejected with configured positive whole-baht/eligible-balance validation; form remained open |
| P004 | Valid lump-sum15 | Automatically Posted; allocation15=repayment15; both differences0; remaining interest5 |
| P005 | Close synthetic loan | Receipt105 automatically Posted; repayment split principal100/interest5; planned105=posted105, both differences0; one repayment/positive allocation; generated repayment detail did not expose ordinary edit/delete controls |
| P006 | Delete exact synthetic borrower via confirmed borrower Delete action | Cascade processed; operational dashboard's ten monetary indicators returned exactly to pre-fixture baseline. Native Payments and Payment Allocations were subsequently verified empty; downstream snapshots refreshed as recorded below |

Fixture identifiers (synthetic only): borrower `qxHU5Jx1PHwthVaKfYpubr`; loan `MzBWbt0Ge0hkRYQpoGnJ7C`; charge `IYHSUc9Dsi4ZQsiWfdUtN6`; receipts first-day `dMBRccmtZU4nu_dFTDxop4`, lump-sum `qChkEeqkCj88540StKCtkS`, closure `uUqgDABN5X6pJbWWKEhsiM`. No real borrower/loan/charge was intentionally edited. All three notification bots were disabled during these tests; no test notification sent.

**Downstream inspection:** live OLAP app opens as LoanBusinessInsights-975338008, ID `e74dd368-654f-44d7-bccf-83cf361d1cdb`, v1.100012. Repayments remains22 app columns and shows a native-schema out-of-sync warning for the additional shared fields; it has not been regenerated or given payment-processing workflows. Fresh reporting client loads Analytics without a displayed load error. Existing OLAP metadata is therefore recorded as pending schema reconciliation rather than claiming the new trace fields are loaded. No OLAP editor configuration has been changed by this migration task. Historical docs had v1.000192 and a separate migration-repair log recorded v1.100010; those are dated historical baselines, not current-version assertions.

## Completion record

**DEP-003 — final save:** restored Generate Daily Charges and the three notification bots after fixture cleanup. All seven production bots are enabled. Fresh Manage > Versions verification shows **3.000002**, Deployed, Save disabled. Candidate remains a prototype with its daily scheduler and three notifications disabled. Actual notification delivery was not tested.

**VAL-007 — cleanup:** native Payments and Payment Allocations are empty after synthetic borrower cascade. Ten monetary dashboard values exactly matched baseline: pending collection15030; today interest6486; yesterday interest7486; total profit128316; daily interest9396; realized MTD44086; forecast remaining221834; projected monthly280950; outstanding principal96176; active-loan profit117246. This is aggregate reconciliation, not a complete audit of unrelated records.

**VAL-008 — reporting refresh:** the existing hourly OLAP refresh captured temporary fixtures (today interest6511 and outstanding principal96276). Inspected enabled bot `Refresh Daily Analytics Daily2`, hourly event `Every Hour2`, Calendar filter `AND([Date]>=TODAY()-1,[Date]<=TODAY())`, and step `Rebuild Yesterday and Today's Analytics` invoking `Rebuild Daily Analytics - This Date` (Delete Existing Daily Analytics then Create Daily Analytics). Ran that existing bot once after cleanup without changing configuration or schedule. The regenerated 6 September row, Generated At10:13:30PM in the app's Thailand time, showed principal issued12500, loans4, principal returned4294, **interest6486**, repayments22, **outstanding principal96176**, active loans37 and borrowers21. Yesterday was also rebuilt by the existing filter. This is derived reporting-data refresh; operational financial records were not changed by it. Looker connector freshness and all dashboard visuals were not tested.

**DOC-001 — model documentation:** updated `Documents/AppSheet_Data_Model_Overview.md`, including current baseline, backup, table/relationship catalogs, two slice counts and reporting boundary. Updated `Documents/AppSheet_Data_Dictionary.xlsx`: 54 accepted clone definitions promoted (47 additions and seven existing-definition changes), six relationships, two tables, 45 ordered OLTP slice memberships, app availability and production order notes. Existing OLAP-only definitions and OLAP slice membership remain unchanged. Updated `Documents/Universal_Payments_Clone_Migration_Runbook.md` with acceptance and deployment status. This log is authoritative production history; the linked clone log and final JSON checkpoints contain the inherited exact object settings/expressions, and the DB/CFG/ENV/DEP entries here record production differences and corrections.

**DOC-002 — verification:** pre-update copies, builder, read-only verifier and rendered checks are under `outputs/universal-payments-production-20260906/`. Initial workbook verification caught two existing OLAP entries outside its imported Excel table boundary; the builder was corrected to preserve the full inventory before publishing. Final independent verification passed: ten sheets preserved, 365 unique union column entries, 47 additions, six added relationships, exact 45-row OLTP slice membership, unchanged OLAP-only definitions/slices and historical clone sheets, zero Excel error cells. Rendered changed areas were reviewed and clipped new notes expanded. Both model documents and this log were checked for consistent current version, counts and references. No `sources/` files were changed.

## Remaining manual checks and resumption

Clone results were accepted before rollout. Production validation was a bounded subset, not every possible scenario. Users should sync the original app to v3.000002 before resuming entry.

- On the normal user account/device, check Collection navigation, full/partial, Receive All and multi-charge lump sum; confirm expected allocation and zero reconciliation differences.
- Exercise offline/reconnect, concurrent submissions and Error retry in the isolated clone; duplicate guards do not constitute an atomic database lock.
- Confirm normal notification delivery on a genuine next transaction and scheduled/date-boundary automation. No live delivery test was performed here.
- Reconcile OLAP/Looker after refresh using matching dates and grain. OLAP currently works with a Repayments schema warning; loading the new trace fields remains pending schema reconciliation.
- A full restore drill and individual attachment byte audit were not performed.

## Rollback instructions

1. Pause entry and sync again. Preserve any real transactions created after cutover; do not discard them or delete new tables as a shortcut.
2. For configuration rollback, restore original OLTP **v2.300005** in Manage > Versions, then verify sources, access, bots and client sync. App-version rollback leaves physical schema/data in place.
3. For full data recovery, retain **LoanMgr FULL BACKUP 20260906** and **Money FULL BACKUP 20260906** as a pair. Copied native Row IDs differ; do not mix the copied database with current references or blindly overwrite rows. Reconcile post-backup transactions before replacing current data.
4. Native database history is a separate physical rollback mechanism with limited retention. After recovery, validate relationships, receipt/repayment totals, bots and reporting snapshots. No recovery was executed during this rollout.


## Copy retirement — 6 September 2026

At the user's request, the test app, release candidate and isolated test database were deleted after production implementation. The full production backup app/database pair is the only retained AppSheet backup. Earlier references to accessing the clone/candidate are historical; local test records and configuration checkpoints remain. Production and OLAP were retained without configuration changes. See [copy cleanup log](CHANGE_NOTES_LOAN_MANAGER_COPY_CLEANUP_2026-09-06.md) for exact IDs and final verified inventory.

## OLAP follow-up — 7 September 2026

The pending OLAP payment trace schema warning was resolved at v1.100016, rollback v1.100012. Payments and Payment Allocations are loaded read-only, and all six payment trace references resolve. Twenty shared numeric KPI formulas and same-date displayed values match OLTP. Collection date-basis and historical Pending Charges EOD partial-payment differences are documented separately; no financial records changed in this follow-up. See [OLAP reconciliation log](CHANGE_NOTES_OLAP_WARNINGS_KPI_RECONCILIATION_2026-09-06.md).

## Automation diagram follow-up — 7 September 2026

Updated the existing workspace Google Drive file `Automation Plan.drawio` in place. Its OLTP page now shows the six payment-entry paths, the five-step `Payments - Process Receipt` pipeline and helper actions, retry/error recovery, first-day bot chaining, payment-level notification transition, close-loan dependency, and payment-aware default guard. The OLAP page remains unchanged. No AppSheet object or financial row changed. See [diagram change log](CHANGE_NOTES_AUTOMATION_PLAN_DIAGRAM_2026-09-07.md).
