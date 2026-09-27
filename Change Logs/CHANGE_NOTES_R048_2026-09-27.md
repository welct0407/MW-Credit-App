# R048 — Collection receipts, report labels and original loan interest

## Original daily interest and Loan Key — DEV implemented and tested

27 September: owner requested a stored, read-only original daily interest percentage for all loan types, calculated at creation, used in Loan Key and daily-loan principal-repayment recalculation, and visible in loan views. Owner confirmed whole-percentage rounding of the stored rate and existing-DEV-loan backfill. DEV only; owner intends manual PROD changes after review. Starting Git `78fd914557c37827daa8bbddb9f5b1b61e8dc272`; live rollback OLTP1.000125 / OLAP1.000042 / SQLV52. Private dump restored with matching fingerprints. Implementation, checks, recovery and remaining work: [step-by-step record](../outputs/r048-loan-interest/IMPLEMENTATION.md). R048 remains Open; earlier delivered scope below remains intact.

Final DEV: OLTP1.000128 / OLAP1.000045 / SQLV53; both editors zero issues. V53 and both regenerated app schemas/configuration are applied. Stored integer rate, immutable server calculation, historical backfill, Loan Key, read-only forms/detail views, generated slice membership and forecast use are reconciled in DEV dictionary overlays. Full SQL CI and restored-backup invariance passed. GUI loan1000/daily5 stored1%; receipt205 left800/daily8; final800 payoff left0/daily0 with1% retained. Both apps displayed the partial result. Fixture retired, audit records retained. Backfill75/78; three fixed-term rows lack original Due Date/Fixed Interest. Owner review and their later manual PROD execution remain pending. Exact instructions and report dependencies are in the linked handover. Repository checks/publication recorded with this batch; no production mutation, RC or tag.

## Scope and status

27 September 2026: owner clarified that daily Collection must show receipts only for Payments related to the charges displayed there. Implemented in DEV OLTP1.000124; R048 remains Open, pending owner review and production authorization. OLAP1.000042 and PROD are unchanged.

## Changes

- Added positive-allocation intersection with Borrowers.Todays Collection Charges to the existing Submitted Receipt Payments slice.
- Set Payments.Receipt Preview as the image label so the existing gallery renders both manual and agent sources. Preserved Borrowers REF_ROWS, gallery layout, read-only slice and underlying image fields.
- Updated DEV dictionary overlays, current-state references and the [handover](../outputs/r048-collection-receipts/HANDOVER.md). No SQL, financial data, agent, storage, permissions, schedules or notifications changed.

## Recovery and checks

Restorable DEV OLTP baseline1.000118; starting Git commit `f505959e4e92ae482f8e951fce1c84d4c3bc80d4`. Targeted rollback values and exact final expression are in the handover. Unrelated pre-existing working files were preserved.

Current GUI: one synthetic charge/two receipts; both images rendered; card opened read-only payment/allocation detail. Controlled nonmatching-charge scope hid the section; final dynamic scope restored in1.000124 and both images returned. Both DEV editors clear. Read-only DEV SQL confirmed fixture allocations. No financial test writes. Multi-charge and agent-only behavior rely on unchanged relationships/formula rather than new financial fixtures; limitations are explicit in handover.

Repository checks: dictionary index regenerated and validation run; whitespace and intended diff reviewed before normal commit/push. Owner acceptance and normal RC-based production promotion remain pending; no release freeze or tag created.

## Direct production delivery — owner exception

The owner explicitly requested these same two changes directly in PROD and instructed us to skip the promotion process. Applied together from restorable OLTP3.000252 to **3.000253**; exact filter and image-label values read back. Both PROD editors clear; canonical app load/sync and a Collection receipt image verified. No financial writes or backend changes. DEV already matches. See [production evidence](../outputs/r048-collection-receipts/PRODUCTION.md).

Earlier pending-approval/promotion statements above describe the DEV checkpoint and are superseded for this correction. No RC/App Upgrade/checklist, freeze/number handoff or release tag was performed under the scoped exception. R048 stays Open with this correction delivered. Canonical dictionary values updated and matching DEV overlays closed. Starting Git commit e47f9ab; production rollback3.000252 or targeted reversal. Repository validation/diff checks and normal publication complete this maintenance batch.

## Forecast watchlist refinement

Owner requested that Forecast watchlist show Loan Key in place of Loan reference. Starting Git commit `4585b62ffd8116c2745fb85d85cecc86fd3e0a1f`. Saved Metabase question360 now builds the readable Borrower Detail Loan Key from original principal, loan date and effective daily interest rate. Its other columns, 34 rows, filters, dashboard placement and other questions remained unchanged in the saved-state comparison. Dashboard23 and a private exact question definition provide rollback. The affected Metabase dictionary question, tracker, inventory, development record and tool documentation are updated. Chrome Wel displayed the new column. No AppSheet, SQL migration, financial record or notification change; R048 remains Open. [Checks and recovery](../outputs/r048-forecast-watchlist/README.md).
