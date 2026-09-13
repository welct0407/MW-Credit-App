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

PARTIAL; waiting for Chrome control reconnection. Not complete or accepted.

- OLTP Description display English Name and Borrower Name display Borrower Name - Thai entered through the current editor expression assistant. Internal names preserved.
- OLTP Communication Name and City Require checkboxes enabled. AI Collection Enabled initial TRUE entered through the expression assistant. Global Save clicked and subsequently disabled, indicating the save completed. Final saved version and independent readback are unavailable after the connection failure.
- OLTP Collection Bank Accounts view deletion visibly confirmed with an Undo delete control. This deletion was not globally saved. Subsequent Collection Settings menu/delete attempt timed out; its outcome is unknown. Inspect the existing editor before any repeated deletion or save.
- No stored column/table deletion, Address creation/import, OLAP mutation or Partner Operations source edit performed. No financial row or existing borrower flag value was edited.
- Browser inventory remains available, but existing tabs report debugger unattached and a fresh documentation tab times out on page reads. Asked owner to reconnect the extension and preserve editor tabs. No alternate browser-control technology used.
- Overview and dictionary record the partial settings and pending reconciliation. Prior counts, slices and removed-field inventory remain intact until actual schema reconciliation.
- Dictionary checkpoint checked: nine intended cell values changed; sheet names, formulas, table names and freeze panes preserved. Changed label rows rendered and inspected; formula-error scan returned no matches. Maintained documentation builder is scripts/borrower-cleanup-dictionary.mjs. Before/after previews are under outputs/borrower-cleanup-20260913.
- Owner reported the page looked working. Recheck still failed for DOM, accessibility and screenshot access with the debugger detached. The saved OLTP settings and unsaved view cleanup remain pending independent readback. Editor tabs marked for handoff.

## Remaining work and acceptance

After browser reconnection: recover unsaved editor state; read back saved OLTP version/settings; complete dependency removal, native Address migration and requested physical cleanup; reconcile both apps and new-GUI borrower workflows; update the Partner Operations visible-label matcher while retaining Description internally; complete dictionary, overview and this log with final verified counts/versions. Verify direct export/report effects without unrelated report edits.

Owner acceptance remains pending. Required checks include both-app sync without errors, new OLTP borrower form showing required Communication Name/City and default AI TRUE, display labels, Address detail/form visibility, preservation of existing row flags, OLAP read-only borrower behavior, and absence of obsolete collection views/references. Do not save synthetic financial or borrower records for these checks.

## Rollback instructions

Undo unsaved view deletion through the current editor, or discard only this task's known unsaved changes after checking for other work. Restore OLTP version 3.000052 for the saved field settings if needed. OLAP has not yet changed. The native backup remains available but no source data restoration is currently needed. Later data/schema restoration must be selective and account for intervening operational edits.
