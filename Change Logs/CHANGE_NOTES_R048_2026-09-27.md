# R048 — Charge-scoped Collection receipts

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
