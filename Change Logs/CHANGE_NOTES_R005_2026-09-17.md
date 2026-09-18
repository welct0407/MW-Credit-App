# R005 — Cash custody, cash ledger and expense reimbursement

Started 17 September; updated 18 September 2026. Status: **DEV implemented and GUI tested; Not ready to promote.** Current saved OLTP **1.000120**, OLAP **1.000123**, SQL **V21**. [Delete reversal refinement, tests and recovery](../outputs/r005-20260917/REVERSAL_REPORT.md) supersedes the V20 candidate for settlement behavior. [Earlier cash-custody tests](../outputs/r005-20260917/GUI_TEST_REPORT.md) remain applicable. Earlier entries below are dated intermediate checkpoints.

## Settlement Delete refinement — 18 September 2026

Owner explicitly requested DEV implementation of full settlement reversal through **Delete**, without creating a separate Cancel Settlement action. Inspected the forwarded device operation and verified the restrictive source FK. Added immutable Flyway V21, saved OLAP 1.000123, and verified completed and pending synthetic create/Delete cycles in the current GUI plus SQL readback. Cash, partner availability and normal related lists restore exactly; source facts and the deletion note remain in SQL. The owner's reported record was left unchanged. Rollback baseline OLAP 1.000120 / SQL V20 captured before edits; coordinated recovery is described in the linked report.

Changed objects: Settlements table update permission/security filter, Status Enum/validation, Partners Total Settlement Created formula, visible Delete replacement action, SQL reversal guard/settlement validation/historical refresh. OLTP unchanged; shared Daily Analytics consumers retain existing columns/grain. Both model documents are updated together. Current full export reconciliation is `reversal-configuration-checklist.json`; original V20 manifest/checklist remains historical evidence. The second assignment was corrected before testing; intermediate 1.000122 capture remains unverified, as recorded. Both editors show No issues found, but deployed-state diagnostic reruns remain unavailable. **Not ready** for full-release promotion; owner acceptance/production authorization pending.

## Authorization and design

Owner request: “based on the design document of release R005, implement these changes in dev env.” This authorizes the specified DEV schema/app implementation and synthetic testing, including the new tables and columns. The design document is the specification, not separate authorization for its production-promotion instructions. No production writes, opening balances or promotion are authorized.

Source: `G:/My Drive/Loan Manager/R005 Design.md`. The source remains unchanged. Depends on the released R004 baseline, preserving R002/R003. R005 is reserved; next release number is R006. After rechecking V1–V19, V20 was authored for R005. It has only been applied to isolated local test/restore databases, not Cloud SQL.

## Intended scope and consumers

- SQL: Cash Holders (Dad, Lisa, Tommy with stable keys), Cash Ledger, Cash Holder Balances; nullable historical Payments receiver and Business Expenses payer columns. Do not backfill historical rows or reconstruct historical custody.
- Payments: one idempotent ledger receipt per qualifying new Posted payment; Dad default for new ordinary receipts, selectable Lisa; First-day Auto fixed to Lisa. Receiver corrections update the same ledger row without reallocating repayments.
- Loans: Lisa gross disbursement plus the separate first-day receipt; preserve lending-capacity checks and source editing permissions.
- Expenses: deliberate payer for new positive manual expenses; SQL-owned referral rebate paid by Lisa; negative adjustment without payer creates no cash entry, with payer creates a refund inflow. Economic partner allocations remain unchanged.
- Settlements: OLAP retains workflow ownership; Pending has no cash movement, actual completion creates Lisa outflow to the partner personally, never an inflow to Tommy Cash Holder. Existing Pending settlements completing after cutover qualify; old completed rows do not backfill.
- Manual custody: Cash Handover and Expense Reimbursement through Record Cash Transfer; controlled opening/correction entries; SQL and AppSheet protect system rows. Cash Pool Contributions, charges, allocations, repayments, default and closure do not independently cash-post.
- Owner refinement on 17 September: **OLAP owns Cash Ledger manual entry, Record Cash Transfer, Cash Position and ledger presentation.** OLTP retains payment receiver and expense payer source entry. Cash Holders remains read-only in both consuming apps. Preserve existing Loans form and Business Expenses deck.
- Owner explicitly approved one SQL-only cutover metadata table storing source type and Row ID, with no amounts/personal details and no AppSheet exposure. It distinguishes pre-R005 sources from new backdated sources and new accounting-only expenses. Existing Pending settlements remain eligible when completed after cutover.
- Review direct export/report dependencies; no Looker edit or unrelated dashboard audit is currently included.

## Preflight evidence and limits

Observed through the current AppSheet editor on 17 September:

| Check | Observation | Status |
| --- | --- | --- |
| DEV OLTP identity/version | Inventory UUID `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`; editor preview and freshly generated appdoc show 1.000110 | Observed, no save performed |
| DEV OLAP identity/version | Inventory UUID `494cd013-0d9b-482f-9559-c9d83059de91`; editor preview shows 1.000096 | Observed, no save performed |
| DEV OLAP diagnostics | Current editor DOM shows No issues found; deployed indicator | Starting observation only, not final release verification |
| DEV OLTP appdoc | Generated 21:54:44 Bangkok; 13 tables including native internal tables, 345 columns, 2 slices, 36 views, 56 format rules, 83 actions, 0 legacy workflow rules; shown business sources database-3 | Rendered observation only; complete persistent baseline capture failed |
| DEV automation | Visible OLTP list includes enabled Generate Daily Charges and disabled first-day financial/notification bots | Partial inventory only; parity, recipients and dependent routes not verified |
| Flyway DEV validate | Existing repository runner returned validationSuccessful=true, invalidMigrations=[], warnings=[], validateCount=20 | Passed, read-only |
| Flyway PROD validate | Existing repository runner returned validationSuccessful=true, invalidMigrations=[], warnings=[], validateCount=20 | Passed, read-only |
| Schema drift, backup/restore | Not executed | Pending; Flyway validation does not establish live-schema equivalence or recoverability |

Browser control initially read the editors and a fresh appdoc, then repeatedly returned `Debugger unattached` on follow-up reads/capture attempts. Existing-tab recovery, a fresh documentation tab and a full browser-tool session reset did not restore reliable control. Chrome's content-export command also reported unsupported. No full baseline file was successfully saved; do not represent rendered excerpts as complete definitions.

AGENTS.md Section 6.1 requires complete saved definitions for **both** DEV apps before the first release edit, with exact editor capture for export-omitted properties. This gate remains unmet. R004's COVER-01 exception applies to R004 only and has not been carried into R005. After browser recovery, reconcile export coverage and editor-only values explicitly; do not silently assume omitted configuration unchanged.

## Continuation gates and acceptance

### Resumed preflight, 17 September

Browser access recovered. Both saved appdoc exports are now persisted privately, along with editor-only settings/security and partial automation captures. These are **not yet claimed to be complete app-definition coverage**; automation and omitted-property reconciliation remains in progress. Both current editors showed No issues found at starting versions OLTP 1.000110 / OLAP 1.000096. No app save has been made.

Fresh DEV/PROD schema exports normalize to the same V19 SHA-256: `4A4BE3E9B4469F53CFB3F90074CD382B5D439047DF3119CCF88B3B94F0777D20`.

DEV recovery captured using `scripts/database/Snapshot-R005.ps1`; isolated restore verified by `scripts/database/Test-R005Backup.ps1`. Private artifact root: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917`. Dump `development-before.dump` SHA-256: `25AE0426F1F984AFACF2D662FD9706529EFC0C165A49DE26FFB21CFFEFA0C85C`. Restored public and assessment_lab, including Flyway history, successfully; normalized schema matches. Cloud SQL cron extension/settings are outside this restore-test scope. No schema/data changes were applied to Cloud SQL by the backup rehearsal.

The initial browser-failure observations above are retained as history and superseded only by the specific successful checks in this continuation. Existing DEV notification enablement differs from the expected released baseline; compare live PROD definitions and verify every owner-only route before correcting parity or testing. No notification was sent by this task.

1. Restore working browser control. Recheck current versions and capture both saved DEV definitions plus editor-only configuration. Inspect both initial diagnostics/deployment checks; compare released PROD baseline and DEV preparation/notification routes.
2. Capture schema drift evidence and a verified recoverable DEV database backup before applying DDL. Recheck migration numbering and record affected consumers and rollback artifacts.
3. Implement immutable Flyway migrations and isolated synthetic tests for all source types, historical cutover, source correction, system protection, retry/concurrency and transaction rollback. Preserve original financial calculations.
4. Apply tested SQL to DEV, regenerate/configure both apps, capture each coherent save and property-level diff, reconcile reverse references and permissions. Record exact property checklist rows from saved evidence, not prospective values.
5. Execute current-GUI scenarios in design Sections 38.8–38.10, including receiver correction, first-day net effect, three expense payers, handover/reimbursement, rebate, both settlement partners, default/closure, sync/readback and independent holder reconciliation. SQL-only tests do not replace GUI acceptance.
6. Resolve all warnings/errors in both apps. Update overview/dictionary together, development differences and environment inventory from actual implementation evidence. Freeze the tested package only when complete; obtain owner acceptance separately from production authorization.

At the initial browser-blocked checkpoint, no R005 functional tests had run. The continuation now includes isolated SQL regressions/concurrency and a restored-DEV-copy migration rehearsal. No current-GUI acceptance or notification-delivery test has run. Owner testing is not yet actionable; use the scenarios above after live implementation.

## Local implementation checkpoint

The [checkpoint report](../outputs/r005-20260917/REPORT.md) records exact files, tests, remaining checklist IDs and recovery. V20 adds the approved SQL-only cutover table, new cash tables/view and source fields, deterministic transaction-owned synchronization, source/ledger identity guards and manual transfer rules. Existing financial allocation functions remain intact. Normal manual transfers belong to OLAP under the owner refinement; opening/correction entries require controlled SQL administration, with no opening amounts loaded.

Executed checks passed on PostgreSQL 18.6/Flyway 13.6.0: V19 fixture then V20 cutover; financial/custody regression; simultaneous receiver changes; expense and settlement contention/retry; migration validation and repeat no-op; checksum-tampering detection in disposable copies. The real DEV backup also restored and migrated locally with unchanged source-table fingerprints, historical receiver/payer NULLs and zero initial ledger entries. See the report's linked transcripts; none of these are claimed as GUI tests.

Both appdoc baselines now include DOM object identities (550 OLTP / 714 OLAP property tables), with private current-editor supplements. Full omitted-setting/unset/inherited coverage remains unproven. A specific limited **R005** exception was requested from the owner under AGENTS.md §6.1; **approved by owner on 17 September 2026: “Approve the limited R005 coverage exception”**. No live app or Cloud SQL edits were made while awaiting it. R004's exception is not applied to R005. Deployment Check on the already-deployed editor exposes deployed status without a separate rerun control; final zero-warning/deployment verification remains pending and is not waived by the requested coverage exception.

The overview and data dictionary were updated together with a clearly labeled **pending R005 draft**; the workbook adds 34 row-level Dev Differences entries and preserves production inventories. Workbook export/reimport value comparison passed for all sheets; the error scan found no matching formula errors; representative changed rows were rendered and inspected. Exact AppSheet properties still require live reconciliation.

## Changes and rollback

The initial checkpoint changed only the tracker/log. The continuation adds V20, maintained backup/test/evidence/dictionary scripts, sanitized baseline and test artifacts, and pending model documentation. The task started with a clean working tree. Live application/schema/financial records remain unmodified by this task. Observed DEV rollback versions are OLTP 1.000110 and OLAP 1.000096; recapture if they change before implementation. The verified DEV backup is recorded above.

For this documentation checkpoint, recover prior text from Git while retaining the R005 number reservation; never reuse a cancelled/reserved number. Eventual SQL/app rollback must be coordinated, retain ledger evidence and use a higher Flyway migration or explicitly authorized restoration. Do not edit applied migration files or restore a database over newer writes.

## Live DEV implementation in progress

Owner approved the limited R005 AppSheet baseline-coverage exception on 17 September: “Approve the limited R005 coverage exception”. Per-save exported-property comparisons, exact changed-property editor verification and final zero-warning checks remain mandatory.

At 22:46 Bangkok, V20 was applied to DEV by the repository Flyway runner from checkpoint commit `9756814`, SHA-256 `1FE5F4038E48371F52E3C31BF5F79C95CF4FB836A00785FB311AC2AD24F4FFE3`. One migration, 639 ms, no warnings; subsequent validate passed (21 entries). DEV readback: three holders, zero ledger rows, zero historical receiver/payer assignments or historical cash rows; cutover identities captured for 182 payments, 98 loans, five expenses and two completed settlements. Duplicate system sources and holder-balance mismatches are zero. The pg_cron daily-charge job remains disabled, leaving the reviewed AppSheet schedule as the active scheduler. Exact outputs are in `outputs/r005-20260917/dev-migration.json`, `dev-validate.json` and `dev-cutover-readback.jsonl`.

AppSheet configuration is now being edited; no GUI test writes have been performed. Local-only statements in the earlier checkpoint report describe that historical checkpoint and are superseded by this live section. V20 is now immutable. Production remains V19 and is not authorized for changes.

### AppSheet save batches — ongoing implementation

DEV OLTP baseline 1.000110 is retained. Saved appdoc exports and exhaustive property differences are under `outputs/r005-20260917/dev-oltp-save*-diff.json`; stable property checklist IDs are embedded in each difference. All added-object properties are retained. Final intended PROD targets and final verification remain Pending until the candidate is reconciled.

| Batch | Saved version | Change / observed result |
|---|---|---|
| save01 | 1.000111 | Added Cash Holders from DEV database-3, read-only. AppSheet inferred row-number key and LongText names; intermediate import retained. |
| save02 | 1.000112 | Text holder ID/name, name label, physical fields noneditable, ID hidden. AppSheet retained row-number key; explicit key correction followed. Warning: `Column Name 'Row ID' in Schema 'Cash Holders_Schema' was set to be unsearchable because it is 'Hidden'`. |
| save03 | 1.000113 | Explicitly cleared _RowNumber key and selected Row ID; saved export confirms stable key. Current editor: No issues found. |
| save04 | 1.000114 | Regenerated Payments; imported nullable cash receiver. Existing exported property differences retained. |
| save05 | 1.000115 | Receiver Ref to Cash Holders.Row ID, Dad/Lisa validity, new Dad default / first-day Lisa, first-day and Processing edit restrictions, historical-safe required condition, Thai/English label. Generated reverse reference and navigation action included in diff. Current editor: No issues found. |

Regeneration transiently serialized `LocaleName` on generated daily-charge process/output columns and data locale on their generated tables; subsequent ordinary saves removed them again. Each occurrence remains in the per-save evidence and will be individually reconciled at candidate freeze. No user-defined loan financial formula was intentionally changed. UI workflow tests remain pending; definitions alone are not test execution.

### Subsequent app implementation — 17 September 2026

OLTP save06 1.000116 regenerated Business Expenses; save07 1.000117 configured payer Ref, Dad/Lisa/Tommy validity, no default, manual-only editing, positive/historical-safe requirement and Thai/English label. Both source field definitions have saved-export evidence; form order/quick-edit workflow tests remain pending.

OLAP baseline 1.000096; save01 1.000097 added read-only Cash Holders. Browser interruption during metadata editing required a fresh editor and saved-definition readback. The next captured key-correction candidate was 1.000099; intermediate 1.000098 definition recovery remains Pending. Do not claim complete per-save coverage until resolved. No saved definition is inferred from attempted clicks.

OLAP save03 1.000100 imported Cash Ledger read-only; save04 1.000101 configured immutable generated ID, movement-date default, movement-type validity and positive whole-baht Amount. Save05 1.000102 configured holder directions, source refs, manual entry origin/default, protected source metadata and manual notes. Generated source reverse lists and the Reporting Loans slice membership change are retained in the exhaustive diff for reconciliation. Save06 1.000103 regenerated expenses; save07 1.000104 configured read-only payer Ref. Save08 1.000105 regenerated payments; save09 1.000106 configured read-only receiver Ref. Current editor showed No issues found at the source-field saves. This is intermediate evidence, not the final warning gate.

Intermediate warning observed after ledger Enum import: `Column Name 'Movement Type' in Schema 'Cash Ledger_Schema' of Column Type 'Enum' should have a list of allowed values or allow the user to add other values`. Movement validity now supplies choices; final diagnostics and executed form selection remain required. Ledger manual writing remains disabled while the workflow is assembled. No GUI financial test rows or notification tests have been submitted.

### Cash interface and source views — continuation

OLAP save10–20 (1.000107–1.000117) added read-only Cash Holder Balances with stable holder Ref key, whole-baht Price fields, protected ledger audit fields, ADDS_AND_UPDATES table permission, holder summary/recent ledger reference views and Cash Position menu dashboard. The transfer form contains Movement Date, Movement Type, From, To, Amount, optional expense and Notes, returns to Cash Position, and is titled Record Cash Transfer. The Add action uses that title; Edit is eligible only for Manual Cash Handover/Expense Reimbursement. System rows remain source-controlled with SQL enforcement. This supersedes the preceding temporary statement that manual writing remained disabled.

Save16 (1.000113) temporarily introduced an unquoted dashboard display expression. Exact diagnostic: `View 'Cash Position' has an invalid Display Name 'Cash Position / สถานะเงินสด'. "/" called with wrong types: first argument is Text, but requires Decimal or Number second argument is Text, but requires Decimal or Number`. Save17 quoted the literal and cleared the error. All intermediate exports and diffs are retained. Save20 shows No issues found; final reload/deployment gate is still pending.

OLTP save08 captured 1.000119: receiver added after Amount Received in Payments_Form and as the sole Payments_Detail quick-edit field. Business Expenses_Form automatic order already includes payer. The export also changes the generated payer View Ref action's Visible? from ADVANCED to ALWAYS; attribution/editor reconciliation remains pending. Version 1.000118 was not captured before the next saved readback and requires history recovery, alongside OLAP 1.000098.

OLTP save09 (1.000120) restores four notification bots to the enabled PROD baseline: First-Day Charge, New Loan Created, Loan Closed and Charge Received. Previously captured task/called-branch evidence contains only LIST("welct0407@mw-credit.com") recipients. Superseded Create First-Day Charge and Payments - Process Receipt remain disabled. Daily charge scheduling remains enabled with duplicate pg_cron disabled. Final automation reload/parity reconciliation and execution/delivery checks remain pending. No GUI financial test writes had occurred at this checkpoint.

All save batches link exact before/after values through `outputs/r005-20260917/dev-*-save*-diff.json`. Production remains unchanged; readiness is **Not ready** pending GUI tests, missing intermediate-version recovery, final property reconciliation, documentation and final diagnostics.

### DEV GUI tests and final candidate — 18 September 2026

OLAP save21 **1.000118** limits the existing Record Cash Transfer Add action to `IN(CONTEXT("View"), LIST("Cash Position", "Cash Ledger Recent"))`, preventing a manual form opened from a related source list from inheriting prohibited source refs. Save22 **1.000119** adds Business Cash Held to the summary, ordered Holder Name / Business Cash Held / Current Balance / Reimbursement / Advance Due. Save23 **1.000120** changes the Cash Holder Summary dashboard entry from Small to Wide, placing the readable summary above the ledger. Saved/reloaded exports and per-save diffs are retained. Final GUI confirms the main action remains available and related ledger lists have no Add. OLTP remains **1.000120**; final export equals save09 with zero additional property differences.

Current-GUI tests passed for positive/whole-baht manual validation, handover and correction, explicit expense payer requirement, Tommy reimbursement, first-day disbursement/net-off, closure/referral rebate, receiver and payer correction, accounting-only negative expense versus cash recovery, Pending/no-cash and Completed settlements for both partners, normal Dad and direct Lisa receipts, and default/no-cash. Source allocations remain unchanged by custody correction. Full expected/observed results and fixture preparation are in [GUI_TEST_REPORT.md](../outputs/r005-20260917/GUI_TEST_REPORT.md), with eight maintained readback assertion groups in `gui-assertions.json`. Final DEV has 14 synthetic ledger rows; historical cash count, historical payer/receiver assignment, duplicate source and balance mismatch counts are zero. Both synthetic loans are closed; no fixture remains eligible for daily charges. No actual opening balances or production data writes occurred.

Automatic intermediate versions are now attributed using current-editor Version History: OLAP **1.000098**, 2026-09-17T16:08:14Z, and OLTP **1.000118**, 2026-09-17T16:51:10Z, are System / Editor refresh / Automatic consistency check. Exact available internal history deltas are retained. The latter explicitly makes generated payer View Ref visibility ALWAYS. A readonly historical OLAP editor was opened without restore; its appdoc link points to the current app, so complete historical exports were not invented. These gaps remain explicit under the limited R005 export-coverage exception.

The complete available baseline-to-candidate diff has **5,009 OLTP + 1,940 OLAP = 6,949** property changes. Every difference has its stable ID, exact before/after values, candidate version/artifact, per-save references and individual disposition in [configuration-checklist.json](../outputs/r005-20260917/configuration-checklist.json); unmapped exported changes **0**. Generated notification processing schemas are DEV parity evidence, not instructions to overwrite PROD notification logic. New table Data Source substitutions are explicitly database-3 → database-2. The AppSheet package is **not frozen/accepted**; omitted editor-state coverage and final PROD target review remain listed, not silently assumed complete.

Both DEV editors were reloaded and show **No issues found** at 1.000120. Deployment Check exposes deployed status and Return to prototype state only; there is no rerun control. No change to deployment state or legacy tests were used to evade the requirement. **Not ready** under the current diagnostic gate. Owner-only task routes were inspected before enabling the four existing notifications. Read-only PROD OLAP inspection confirmed hourly analytics enabled and Daily Loan Analysis Export disabled, matching DEV. End-device delivery and post-candidate scheduled execution remain unverified; the monitor launched the older interface and was closed.

Model overview and workbook were updated together. The workbook contains **103 R005 development inventory records**, including exact exported column/table/view/slice properties; all worksheets passed export/reimport value comparison and the error scan found no formula errors. Production inventory remains unchanged. Environment inventory, development differences and release tracker now identify DEV V20 / both apps 1.000120. Existing Looker metrics were not edited; no report audit or new report was added.

Rollback remains DEV OLTP **1.000110**, OLAP **1.000096**, and the previously verified pre-V20 backup. Preserve all source/ledger evidence; applied V20 is immutable and requires a reviewed higher migration or explicitly authorized coordinated restore. Do not replay fixture scripts or copy DEV financial records to PROD. Remaining gates and short owner test checklist are in the linked GUI report; owner acceptance and production authorization are separate and pending.

### SQL candidate preservation — 18 September 2026, 00:51 Bangkok

Test/evidence commit **239702e65eb10e767b203143cd9bc9f556f4f542** is pinned for this candidate. `New-Release.ps1` ran from its clean checkout while DEV still represented V20; Flyway validation and no-pending-migration checks passed. Original manifest is external at `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\flyway\release-239702e65eb10e767b203143cd9bc9f556f4f542.json`; [sanitized manifest](../outputs/r005-20260917/sql-candidate-manifest.json), SHA-256 **81BD7B8965B7B5E77CEA94EE2FE0039D46C39D5C019584F680F13E319AC7CF96**. Target V20 retains hash **1FE5F4038E48371F52E3C31BF5F79C95CF4FB836A00785FB311AC2AD24F4FFE3**, verified against the immutable migration. This preserves the SQL candidate before later DEV work; it does not freeze or approve the unresolved AppSheet package. Subsequent documentation commits do not change the pinned candidate commit.
