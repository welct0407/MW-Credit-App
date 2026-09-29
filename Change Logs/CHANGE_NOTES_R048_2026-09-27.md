# R048 — Collection receipts, report labels and original loan interest

## Upcoming charges — DEV complete 29 September

Owner authorized development as R048 after the design-only handover. Implemented the seven-day grouped menu and Collection borrower preview of five distinct future due dates within three calendar months, recorded-settlement-only for auto-off loans. Final DEV OLTP1.000140 / unchanged OLAP1.000045 / V54; both editors clear. Production unchanged; R048 remains Open.

Changed V54, database backup/test helpers, targeted dictionary capture/closure helpers, 23 DEV dictionary objects/index, affected model/current-state/tooling documents and sanitized evidence. Starting Git5b12c8bc; OLTP rollback1.000128; private DEV dump restored/fingerprint-verified before migration. Full database CI, V54 migrate/validate, saved metadata validation, normal sync and current desktop/mobile/borrower/receipt GUI checks passed. No financial GUI test write. Offline/midnight transition and comparative sync latency were not measured. Detailed scope, evidence, native presentation choices, recovery and later promotion steps: [implementation](../outputs/r048-upcoming-charges/IMPLEMENTATION.md), [handover](../outputs/r048-upcoming-charges/HANDOVER.md). Owner acceptance and production promotion remain separate. Unrelated report work preserved.

## Owner-confirmed historical-rate correction — 28 September

The owner confirmed that the last missing closed daily loan originally charged ฿400/day on ฿4,000 principal, yielding 10%. A new private PROD dump was restored and fingerprint-verified; a two-update transaction was rehearsed with all other rows unchanged. Applied the guarded correction using existing V53 logic, adding the original-basis note and stored 10%. SQL readback confirms 80/80 rates populated and unchanged principal, interest, daily amount and outstanding balance. The canonical OLTP detail/key displays 10%. App versions and SQL V53 remain unchanged. [Step-by-step evidence, private backup reference and recovery](../outputs/r048-loan-interest-correction/README.md). Earlier 79/80 counts below are dated cutover evidence.

## Original daily interest — production cutover completed 28 September

Owner explicitly authorized the agreed direct-production method. Applied immutable V53 from clean pin `487a238a036853d9470fbaa08b788f2b79983440` after private backup/restore verification and a production-data rehearsal. Edited only the affected canonical app properties from OLTP3.000254 / OLAP1.100205 to **3.000257 /1.100208**; preserved the intervening OLTP owner version. Both editors clear and Deployed; live load/sync, integer Loan Key, read-only rate/details and slice membership passed. PROD backfill **79/80**: one closed daily loan lacks original basis and has no outstanding principal; left blank. No financial test writes or forced notifications. Metabase label alignment remains a separate follow-up.

[Production record](../outputs/r048-loan-interest-production/README.md) contains exact steps, SQL/app evidence, pinned manifest, backup hash, rollback and limits. Canonical dictionary objects reconciled, 13 feature overlays closed, owning model/current-state documents updated. Added reviewed backup/rehearsal, read-only verification and dictionary-closure helpers. Local database CI passed; dictionary/syntax/diff checks precede normal publication. R048 stays Open under the scoped exception, with no RC, release freeze/number handoff or tag. Earlier DEV pending-PROD statements below are historical and superseded for this feature.

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

## Forecast original-rate alignment — 28 September 2026

Owner approved correcting question360 to stored Original Daily Interest Rate with whole percentages. Earlier effective-rate/two-decimal expression is superseded for this question. All36 rows checked; other values and dashboard unchanged; Chrome verified. Recovery dashboard24 and private exact baseline; starting Git4b682c5. Generator, canonical dictionary and current references updated. No app/schema/charging change; R048 remains Open. [Steps, verification and rollback](../outputs/r048-forecast-original-rate/README.md).
