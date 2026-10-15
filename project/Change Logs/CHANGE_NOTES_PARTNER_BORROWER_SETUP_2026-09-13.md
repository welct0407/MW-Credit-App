# Partner controls and borrower locations — 13 September 2026

Status: production setup complete; owner review pending. Agent implementation and activation remain deferred.

## Scope and rollback

Owner explicitly authorized production OLTP table changes and borrower location loading. App: Loan Manager ผู้จัดการสินเชื่อ, ID 93844270-6aa5-420b-a960-bcdf08abd357. New editor Version History confirmed **3.000045** before edits and **3.000050** after completion, Save disabled and no issues. Git baseline: `96ff5c9e174fe90aca867e1c8b425825cf7bbbbe`.

No OLAP configuration or Looker report changed. Shared fields exist but OLAP loading remains pending reconciliation. No agent, schedule, notification, financial operation or existing collection runtime modification performed.

## Changes

- Partners: optional editable Text **Instagram Username**, Text **Language Preference**, Yes/No **IG Integration Enabled**, initial `FALSE`. Both existing partner flags unchecked; usernames/languages blank for owner review. Existing Email reused. Future agent requires explicit TRUE for Instagram and email fallback.
- Borrowers: optional editable Text **City** and **Working Location**, blank defaults, bilingual display names. Appended to base Borrowers and Visible Borrowers forms/details, preserving existing order.
- Source: owner's Borrower Locations sheet, ID `1EraUswJ7xnSUUE0Gw0Hsv3wgXr_jT7tlbzD1H5_wgBk`, Sheet1. Connector access failed; read through signed-in browser without sharing changes. All 27 source identities (name plus English description) matched uniquely against 28 live borrowers. Loaded **30 nonblank cells across 18 borrowers: 16 City and 14 Working Location**. Preserved blanks, uncertainty wording and extra borrower.
- All 28 existing AI Collection Enabled values unchanged. Instagram Verified At retains blank initial value; regeneration-inserted NOW() was removed before final save.
- OLTP Borrowers: 16 stored including ordinal/key +29 VCs =45. Partners: 8 stored +0 VCs. Regeneration added new fields to Todays Collection Board (21), Visible Borrowers (45), Collection Setup Review (45); existing filters/update modes unchanged. Exact membership captured in slice-columns.json and dictionary.
- Revised design: existing collection source plus due-today/overdue and borrower AI opt-in; partner flag gates all channels, preferred language controls partner text. These rules await agent implementation.

## Documentation and verification

Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx together, plus proposal AGENTS.md and DESIGN_SUMMARY.md. Documentation script: scripts/update-partner-borrower-dictionary.mjs. Sanitized workbook previews and slice membership retained under outputs/partner-borrower-setup-20260913.

Database reload verified all 30 values, unique source matching and unchanged AI flags. New app GUI synchronized; borrower detail and edit form showed loaded locations. Edit form canceled without saving. Partner schema/defaults and existing disabled values verified in database/editor; Partners has no visible client menu, and navigation was not expanded.

Workbook comparison preserved all 12 sheets, existing native tables and both formulas; existing-cell differences were limited to intended documentation updates. Added five field rows, five availability rows and eight missing slice-membership rows. Preserved the existing final inventory row outside the old Columns table. Updated previews checked visually; formula-error scan returned no matches. No transaction, bot or messaging test was performed; full app regression and owner acceptance are not claimed.

## Owner review

1. Review Partners Instagram Username, Language Preference and IG Integration Enabled. Keep integration off until agent acceptance/activation.
2. Review borrower city/workplace values, blanks and uncertain locations, detail/edit usability and sync.
3. Confirm existing AI Collection Enabled choices for future draft inclusion.
4. Give the next go-ahead for agent implementation after accepting this setup.

## Recovery

Restore app **3.000045** for configuration rollback; app versions do not restore database schema/data. Retain/hide added columns and keep integration off for non-destructive rollback. Restore only task-written location cells from the private before-image after checking for later edits; do not automatically delete columns or overwrite newer data.

Private evidence folder: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\partner-borrower-setup-20260913`. Files: location-before-and-source.json, location-readback.json, AppSheet_Data_Dictionary.before.xlsx. Independent backup coverage is unverified. Private borrower data is excluded from Git.

Repository recovery uses a scoped normal commit/push after checks. Git history records the publication commit; publication is separate from production acceptance.

## OLAP corrective impact review — in progress

Owner identified missed partner-management ownership after the initial completion report. OLAP is a required consumer of shared Partners/Borrowers changes; marking it pending was insufficient. Before any corrective app edits, the current new editor confirmed Loan Business Insights **1.100028** (Save disabled), app ID e74dd368-654f-44d7-bccf-83cf361d1cdb. This is the OLAP configuration rollback point. Borrowers currently reports an out-of-sync native database schema warning. Review partner management, borrower schema/slices/views, existing calculations and downstream reporting dependencies before saving corrective changes. No agent implementation or live data test is included.

## OLAP corrective review completed — 13 September 2026

The earlier completion report was incomplete: OLAP owns partner management and is a required shared-table consumer. The pending label did not satisfy impact analysis. Corrected in **Loan Business Insights 1.100031**, rollback **1.100028**. OLTP remains 3.000050. No database row, financial record, agent runtime or Looker report changed in this follow-up.

### Impact and correction

- Partners schema regenerated from17 to20 columns (8 stored including ordinal/key +12 VCs). Instagram Username, Language Preference and IG Integration Enabled now loaded. Flag initial FALSE and explanation aligned with OLTP. Existing Partners_Form automatic ordering exposes all three; appended all three to Partners_Detail manual order.
- All17 previous Partner definitions compared: financial formulas, labels, key, role and other captured settings preserved. Native regeneration changed Email PII from FALSE to TRUE; retained this data-protection classification. Existing table add/update/delete mode preserved.
- Borrowers schema regenerated from79 to81 (16 stored +65 VCs), clearing out-of-sync warning. Table remains read-only. Appended City/Working Location to Borrowers_Detail and aligned bilingual labels. Existing older Instagram Verified At NOW() default cleared and blank AI Collection Enabled/Late Penalty Enabled defaults set FALSE. These affect initial values only; no borrower flag/data writes.
- All79 previous Borrower definitions compared: only the three stated initial expressions changed. All65 borrower VCs and12 partner VCs preserved. Existing OLAP conversation-link Text versus OLTP Url variance retained.
- Four OLAP read-only slices automatically appended the two locations: Borrowers with Outstanding Loans72->74; Profit Contribution 30D72->74; Reporting Borrowers54->56; Todays Collection Board12->14. Filters, prior column order, actions and modes unchanged. Reporting Borrowers filter is blank (all rows), not the previously inventoried literal TRUE.
- Downstream impact: additions do not alter keys, filters, metric expressions or row grain. Reporting Borrowers is a curated feed; retained name-based template references were inspected in the repository. No export/bot execution or live Looker refresh test performed. Consumers assuming fixed complete slice column counts may need adaptation; no such active consumer was verified. No Looker edit means no report-copy rollback was required.

### Checks and evidence

- New editor Version History confirms1.100031; Save disabled, **No issues found**.
- Current production client synced successfully. Both Partner edit forms show username/language inputs and integration choices, preserving read-only financial fields and role behavior. Entered synthetic username/language in one form, canceled/discarded, reopened and verified both blank. No production save was submitted. Existing partner integration values were not altered.
- Partner summaries before/after match for both records, including pool shares, total profit, completed and available settlement. Related settlement/contribution lists render. No financial actions executed.
- Borrower sample with two populated location values matches the source sheet; a blank-source sample remains blank. Borrower detail has no edit action, consistent with OLAP ownership.
- Seven displayed analytics monetary amounts match before/after. This is a scoped regression check, not independent recalculation or full app regression testing.
- Sanitized configuration evidence: outputs/partner-borrower-setup-20260913/olap-schema-review.json. No borrower records or contact values included. Dictionary corrected for the five new fields, seven older loaded fields, relevant defaults/type variance, Email PII and exact slice membership. Forty-four missing inventory memberships added: eight newly added live location memberships plus36 previously existing undocumented memberships. All four resulting dictionary memberships match live capture exactly.
- Workbook retains all12 sheets, native tables and both formulas; no formula errors found. Rendered inventory checked and row heights increased for readable updated text. Original pre-correction workbook privately retained as AppSheet_Data_Dictionary.before-olap.xlsx in the existing private evidence folder.
- Root AGENTS.md now requires explicit workflow-owner and shared-consumer impact review before shared table changes, including post-regeneration comparisons and affected-app checks. Proposal instructions/design identify OLAP partner-management ownership.

### Review and recovery

Review OLAP **Partners > partner > Edit** for the new controls, and **Borrowers > borrower** for locations. Keep integration disabled until the agent is implemented and accepted. A live save/activation, financial workflow execution and downstream export delivery were not tested and are not claimed accepted. Agent implementation still awaits owner go-ahead.

Restore OLAP1.100028 for configuration rollback only; it reintroduces missing new fields, the schema warning and earlier defaults. Shared database location values and columns remain. The earlier OLTP/data rollback procedure remains applicable. Repository changes receive a scoped commit and normal verified push; no new repository or agent deployment is included in this corrective task.

### Owner priority and final OLTP check

Owner clarified that working OLTP and OLAP apps take priority and Data Studio reports are secondary, and explicitly requested this in project instructions. Added that priority to root AGENTS.md and the proposed partner project's AGENTS.md. Direct downstream impacts are still assessed; unrelated report audits do not block verified app work. Report backups remain required before report edits.

After the OLAP correction, freshly opened the current OLTP client: dashboard and collection board loaded, last-sync indicator showed less than one minute, and the six shared displayed amounts (total profit, daily interest, realized MTD, remaining forecast interest, projected monthly profit, outstanding principal) matched the checked OLAP values. No financial action invoked. This completes the scoped app checks; live data-save acceptance remains with the owner. No additional Data Studio audit is required for this task. Instruction-only rollback is a normal Git revert; no app version changed in this final step.
