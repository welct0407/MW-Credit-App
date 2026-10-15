# Borrower collection-field cleanup — 13 September 2026

## Scope and authority

Owner requested retirement of the old MW AI Collection fields, bank tables and views, keeping Instagram Username; required Communication Name and City; AI Collection Enabled initial TRUE for new rows; Address from the current borrower location sheet and borrower views. Owner clarified MW AI Collection is abandoned. MW Partner Operations remains independent and active. Description must retain its internal name and show English Name; Borrower Name retains its key/name and shows Borrower Name - Thai.

## Rollback and baseline

- OLTP Loan Manager: 3.000052, current editor Version History verified before edits.
- OLAP Loan Business Insights: 1.100033, current loaded editor preview verified before edits.
- Native database copied with table rows through the current database UI: Money BACKUP Borrower Cleanup 20260913, database ID yrfagjpv6L4la0GLZ8cdn2. Original remains 9Y5vh3TFzZ4sIe2JgNh4l0.
- Private app-definition property snapshots: Documents/ChatGPT/AppSheet-Loan-Project/borrower-cleanup-20260913/definitions-before.json. These are outside Git; independent backup coverage is unverified.
- App versions restore definitions, not deleted native data. Retain the separate native copy and restore only affected schema/values after checking intervening edits; do not overwrite financial history.

## Dependencies inspected

Borrowers is shared by OLTP and OLAP, with 45 and 81 loaded columns respectively. OLTP owns borrower editing; OLAP borrower data remains read-only. Description feeds bilingual borrower-name formulas, so the display-only change preserves references. The old collection setup adds Effective Receiving Bank Account, Collection Setup Issues and Collection Account Number helpers plus collection bank/settings/setup-review views and a setup-review slice. These dependents must be removed with their obsolete inputs. System-generated phone/URL/ref actions and manual borrower form/detail orders require reconciliation after regeneration. Both apps consume Collection Bank Accounts; OLTP additionally consumes Collection Settings.

MW Partner Operations uses Communication Name, City, Working Location and the retained AI flag. Its bounded data-edit adapter retains Description internally but matches the old Description GUI label; update only label verification for the new display name. No adaptation of the abandoned agent is planned. The source sheet currently includes Address; live schema baseline does not. Direct report effects and name-based exports are reviewed separately; no report audit or report edits are authorized by this task.

## Status

Implemented and reconciled at OLTP **3.000064** and OLAP **1.100041**. Owner acceptance pending. The browser restart allowed cleanup to resume; the interruption history below is retained for recovery context.

### Final implementation and checks

- Removed five stored borrower fields: Telephone, Instagram Conversation URL, Instagram Verified At, Late Penalty Enabled, Receiving Bank Account. Retained Instagram Username.
- Removed three OLTP VCs: Effective Receiving Bank Account, Collection Setup Issues, Collection Account Number. Removed Collection Setup Review slice, all three requested views, and Collection Bank Accounts/Collection Settings table connections and native tables. Native deletion dialogs explicitly provided Database History restoration. Removed-column Undo was available. Both consuming apps were regenerated.
- Description and Borrower Name remain internal identifiers, with English Name and Borrower Name - Thai display labels in both apps. Communication Name and City Require are enabled in both apps; AI Collection Enabled initial TRUE is verified. No existing flag data was edited by this task.
- Address created as optional Text, blank initial/no formula. Seven nonblank source values uniquely matched both Thai and English names. Entered through current native database UI, then reloaded and all seven verified. Source XLSX, plan and readback are private under borrower-cleanup-20260913 outside Git. Source spreadsheet was not edited. A concurrently added borrower was preserved; do not restore the full old database over intervening work.
- A cell-focus error briefly renamed the database during the first address attempt. Restored Money database immediately and verified the title. No address was treated as saved until exact cell readback matched. Later writes targeted the actual textarea and exact observed cell IDs.
- Manual borrower form lists retained old deleted field names after regeneration. Both OLTP forms were explicitly cleaned. Address appended to both OLTP borrower detail/form pairs and OLAP Borrowers_Detail.
- Final counts: OLTP Borrowers 12 stored +26 VCs =38; OLAP 12 stored +65 VCs =77. All retained VC properties, including expressions, match the baseline. Slice membership counts are OLTP 18/38 and OLAP 74/74/57/15; filters and permissions preserved. Sanitized evidence: outputs/borrower-cleanup-20260913/final-schema.json and schema-check.json.
- New app GUI: OLTP blank borrower form shows both required markers, English Name, Address and selected Y default; cancelled without saving. Imported Address is visible in both apps' borrower detail. OLAP remains READ_ONLY and displays English Name. Saved definitions report Runnable/Deployable. No financial or notification test used. Offline behavior and actual owner form submission remain manual acceptance.
- Data dictionary and overview reconciled together. Removed inventory is labeled retired, not active. Direct reporting field names/calculations retain their internal identifiers. No Looker changes; actual report refresh/rendering not retested. Historical process-diagram artifacts retain their dated scope and are not current schema specifications.
- MW Partner Operations source matcher updated to English Name, retaining Description API key and editable boundary. Four existing synthetic adapter tests passed. No worker restart/loaded-code verification or partner command sending performed; update takes effect on next worker start. Separate companion log in that repository records source rollback.

### Earlier interruption checkpoint

- OLTP Description display English Name and Borrower Name display Borrower Name - Thai entered through the current editor expression assistant. Internal names preserved.
- OLTP Communication Name and City Require checkboxes enabled. AI Collection Enabled initial TRUE entered through the expression assistant. Global Save clicked and subsequently disabled, indicating the save completed. Final saved version and independent readback are unavailable after the connection failure.
- OLTP Collection Bank Accounts view deletion visibly confirmed with an Undo delete control. This deletion was not globally saved. Subsequent Collection Settings menu/delete attempt timed out; its outcome is unknown. Inspect the existing editor before any repeated deletion or save.
- No stored column/table deletion, Address creation/import, OLAP mutation or Partner Operations source edit performed. No financial row or existing borrower flag value was edited.
- Browser inventory remains available, but existing tabs report debugger unattached and a fresh documentation tab times out on page reads. Asked owner to reconnect the extension and preserve editor tabs. No alternate browser-control technology used.
- Overview and dictionary record the partial settings and pending reconciliation. Prior counts, slices and removed-field inventory remain intact until actual schema reconciliation.
- Dictionary checkpoint checked: nine intended cell values changed; sheet names, formulas, table names and freeze panes preserved. Changed label rows rendered and inspected; formula-error scan returned no matches. Maintained documentation builder is scripts/borrower-cleanup-dictionary.mjs. Before/after previews are under outputs/borrower-cleanup-20260913.
- Owner reported the page looked working. Recheck still failed for DOM, accessibility and screenshot access with the debugger detached. The saved OLTP settings and unsaved view cleanup remain pending independent readback. Editor tabs marked for handoff.

## Remaining work and acceptance

App/schema cleanup and documentation are complete. Remaining acceptance: owner sync/review of normal borrower create/edit, especially existing blank required fields, permissions and address accuracy; Partner Operations worker loading and live command acceptance. No deployment/test notification is implied by repository publication.

Owner acceptance remains pending. Required checks include both-app sync without errors, new OLTP borrower form showing required Communication Name/City and default AI TRUE, display labels, Address detail/form visibility, preservation of existing row flags, OLAP read-only borrower behavior, and absence of obsolete collection views/references. Do not save synthetic financial or borrower records for these checks.

## Rollback instructions

Restore affected native columns/tables using Database History or the recorded native copy, then restore OLTP 3.000052 and OLAP 1.100033 definitions and reconcile/sync both. Restore only affected values, accounting for concurrent borrower edits; do not overwrite current financial data with the whole backup. Revert the Partner Operations matcher with the display-name rollback. App versions alone do not restore native data.
