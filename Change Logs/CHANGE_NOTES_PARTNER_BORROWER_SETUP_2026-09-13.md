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
