# R008 production correction and full audit

Completed 19 September 2026. The initial production closure was incomplete. This correction reviewed the entire 199-target revision-4 package against fresh PROD AppDoc captures, current editors and focused runtime behavior, then corrected every actionable R008 gap found.

## Corrected production gaps

- OLAP Cash Position's **Record Cash Transfer** form now includes the From and To Cash Account selectors between their holder fields.
- Five OLAP reporting/collection slices now include the required R008 account and request fields: Borrowers with Outstanding Loans, Profit Contribution 30D, Reporting Borrowers, Reporting Loans and Todays Collection Board.
- Generate Daily Charges now creates its request date from Bangkok time with `DATE(UTCNOW() + "007:00:00")`.
- Receive All remains inline in Daily Collection and is hidden from selected collection and borrower details, including borrower details opened from a charge.
- Charge and repayment borrower navigation uses native Ref links; loan detail uses its existing Ref Borrowers link. The superseded custom borrower actions are absent.
- The affected OLTP/OLAP account columns, cash-account views/forms, balance currency presentation, Complete Transfer account propagation and detail column bindings were reconciled to the final R008 behavior.

Final saved versions are **PROD OLTP 3.000228 / PROD OLAP 1.100178 / SQL V24**. Both apps remain Deployed.

## Complete package reconciliation

The frozen delta is revision 4, 199 targets, SHA-256 `3a689c3d9a658f1927c57cb202ee06b0c74bdd10de0527a71783ca4a5cbfd656`.

Fresh AppDoc comparison produced 169 literal matches and 30 serialization or final-refinement exceptions. Every exception is adjudicated in [appdoc-comparison.json](appdoc-comparison.json):

- 169 `VERIFIED_MATCH`
- 22 `VERIFIED_EQUIVALENT` (generated reverse-Ref names/order, preserved reporting fields, table-level OLAP read-only semantics, sensitive-token metadata and generated native Ref action serialization)
- 6 `EDITOR_VERIFIED` (three form bindings and three bots that AppDoc does not serialize completely)
- 2 `SUPERSEDED_BY_FINAL_REFINEMENT` (the accepted one-field Receive All confirmation form replaced the earlier action-input target)

There are **zero unadjudicated targets** and **zero unresolved design gaps**. Equivalent items preserve the design behavior and existing unrelated fields; the two superseded targets record the accepted final DEV refinement rather than a production omission.

## Verification

Both current PROD editors are saved and show **No issues found**. [Editor and runtime evidence](editor-and-runtime-evidence.json) records the three enabled exact-receipt bots, Generate Daily Charges Bangkok expression and focused smoke checks.

The OLAP runtime showed all three live accounts and both transfer account selectors. The OLTP runtime showed inline Receive All, no detail Receive All, and native borrower Ref navigation. Both opened forms were cancelled and no financial record or notification was created.

The unchanged V24 SQL readback remains valid because the correction changed AppSheet configuration only: three active accounts, two active defaults, zero holders without exactly one active default, 22 ledger rows, zero holder/account mismatches and zero synthetic R008 accounts. Dad TTB, Dad SCB and Lisa remain loaded; their openings remain uninitialized.

## Recovery

The coordinated database rollback remains V22 plus the restore-tested private pre-release backup. AppSheet rollback for the correction is the restorable versions recorded before this batch; prefer a reviewed forward correction if later production activity exists. The final V24 private backup remains the database recovery checkpoint because this correction made no database write.
