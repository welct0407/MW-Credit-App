# R008 revision 3 — collection detail action display

19 September 2026. Owner requested removal of the redundant prominent Receive All button in the selected borrower's Daily Collection detail panel, retaining the list's inline action. DEV OLTP **1.000179**; OLAP **1.000169** and SQL **V24** unchanged. Both apps remain Prototype. No PROD changes.

Changed only `Borrowers / Receive All Charges / Only if this condition is true`: wrap the prior eligibility expression in `AND(CONTEXT("View") <> "Todays Collection Board_Detail", <unchanged prior condition>)`. Original financial eligibility, action target, prominence, collection manual action list and account command remain unchanged. This scopes suppression to the collection detail view; the ordinary Borrowers detail retains the action.

## Saved and functional checks

- Reloaded current editor independently confirms 1.000179 and the exact saved expression, with Save and Undo disabled: [saved readback](saved-action.json).
- Current desktop GUI, synthetic `R006-Lump`: selected collection borrower detail has no prominent Receive All button. The inline Receive All buttons remain on the collection list; Lump Sum and related charge actions remain available.
- Clicked the synthetic row's inline Receive All: one-field receiving-account selector opened with DEV Dad Account 2 preselected. Canceled; no payment or other financial write was submitted.
- Followed Borrower Reference TE to ordinary Borrowers_Detail: Receive All remains visible there. This confirms the restriction is specific to collection details.
- Initial runtime read still had cached 1.000178 and showed the old button. Reload after the save loaded 1.000179 and verified the corrected result. No second configuration change was needed.
- Final current-editor diagnostics show only the existing Prototype schedule limitation for Daily 00:05. No new configuration warning/error. Unchanged OLAP diagnostics and prior financial tests are reused because this display-only condition does not change their dependencies. No deployment check or mode change.

## Candidate and recovery

[Complete 175-item delta](release-delta.json) includes every revision-2 item plus this one property. [DEV comparison](dev-comparison.json) maps the independent new saved readback and explicitly reuses the 174 unchanged observations with original versions/timestamps. The [revision-2 freeze](../r2/FROZEN.md) remains historical; its Bangkok-date sync repair is preserved. No migration changed; reuse the original V23/V24 manifest and recovery constraints.

Starting clean Git **1ded65102efdff1b89609211497e75b0fa019e01**. Verified pre-edit app version/rollback **1.000178**. For this display-only edit, rollback can restore the recorded previous condition; a database restore is unnecessary. Preserve newer unrelated work. No table, column, slice, data permission or model expression changed, so no data-dictionary/model-inventory revision is required for this presentation-only action condition. Environment/tracker/development-difference records are updated.

Ready for review subject to existing R008 owner checks; this requested display refinement is verified. Mobile/fallback acceptance, live opening allocations and production recipient review remain as documented in prior revisions. No production authorization is inferred.
