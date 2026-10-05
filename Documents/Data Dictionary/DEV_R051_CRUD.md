# R051 DEV CRUD delta

DEV V59–V62 changes function/trigger behavior only: no new business tables, columns, enum values, role grants or app table bindings. Existing production YAML exports remain production reference. DEV apply/test and browser evidence are recorded in [R051 evidence](../../outputs/r051-receipt-corrections/README.md).

Payments source edits reconcile old/new allocations, repayments, charge/loan materialized values, account cash and payment-owned closure/referral. Source deletion removes its financial projections atomically; it does not refund money. Whole positive interest allocation Ref Charge edits work in either date direction within the same eligible loan. Other generated child amounts remain source-managed.

Manual expenses, manual handovers/reimbursements and settlements support physical deletion with owned cash cleanup. Existing settlement Cancel/Reverse actions remain valid. Unreceived charges and unpaid loans support source deletion; independent receipts/reimbursements and other FK dependents must be corrected first. Defaulted=false restores recorded default components and removes the matching zero-cash loss entry; independent fully-paid charges remain. Missing/changed restoration evidence is a concrete consistency error.

An older principal receipt correction updates current principal/current daily interest. Later booked charges and prepared Loan Close charges remain separately editable; no retrospective charge regeneration or guessed historical amount. Historical opening/cutover and unassigned cash require explicit account/opening reconciliation. Metadata/no-op source changes do not repost.

Keep source identity, posting/service fields and derived snapshots noneditable. Preserve existing Ref/IsAPartOf relations; actual AppSheet cascade ordering still needs synthetic sync verification. OLAP analytics views stay read-only with operational navigation to OLTP. Do not interpret a SQL transaction guarantee as atomicity of separately synced app rows.

Exact proposed AppSheet fields/action/slice changes: [UI handoff](../../outputs/r051-receipt-corrections/ui-handoff.json). These formulas require current GUI validation/readback, both-app no-warning/error checks and no real outbound test notifications before the UI is considered complete. See [all scenarios](../R051_CRUD_Scenarios.md).
