# R047 — Collection borrower receipts

27 September 2026. Owner selected option 1 (receipts linked to recorded Payments) and authorized DEV implementation. DEV OLTP **1.000098**, rollback **1.000095**. R047 stays Open for review; PROD promotion is not authorized by this turn.

Added a read-only receipt Payments slice, borrower Ref list, Collection detail section, thumbnail deck and navigation action into existing Payment detail. Receipt image/time visibility supports nested read views while excluding forms. No SQL, agent, GCS, OLAP, notification or financial data change. Dependencies are the existing R046 receipt fields/native storage and Payment borrower Ref.

Current GUI verified synthetic Collection → borrower → receipt → Payment detail → full-size image, borrower with no image, and absence of receipt inputs in the cancelled edit form. Saved filter/read-only configuration verified. Both DEV editors have no issues. OLAP observed 1.000036 unchanged; OLTP1.000098. Runtime multi-receipt sort was not seeded; descending configuration verified.

[Exact implementation, evidence, limitations and rollback](../outputs/r047-collection-receipts/HANDOVER.md). Dictionary DEV overlays, environment/development records and model explanation updated. PROD references stay unchanged. Review/acceptance and normal integrated RC promotion are pending; no final release tag is created while Open.

## Receive Selected Charges — design, 27 September 2026

Owner requested feasibility, a design summary and an implementation handover for selecting a group of Collection charges and receiving one payment. Added [the design/handover](../outputs/r047-selected-charges/HANDOVER.md), linked it in the documentation map and extended the tracker scope under the sole Open R047. R046 remains Frozen; no successor number is allocated. The receipt implementation described above remains a completed DEV component; the added selected-charge component is **design only, implementation pending**.

Recommended flow: borrower-scoped multi-select Payment form, full settlement of selected residuals, one Payment with existing SQL allocations/Repayments/cash effect, no spillover. Proposed one nullable Payments selection field requires the owner's schema approval before mutation. Direct existing-list checkboxes and the connector's selection serialization require a current GUI proof; neither is claimed verified. The handover records business assumptions, exact affected engine entry points, both-app/downstream dependencies, tests, rollback and integrated promotion order.

Documentation rollback: starting commit `bb192ed6cf7ec5f75ab0c526d4174685cd51d376`; preserve pre-existing untracked risks/payment-health artifacts. Changed files: handover, this log, `Documents/Release_Tracker.md`, `Documents/README.md`. Checks: source references reviewed against maintained dictionary/migrations and official AppSheet documentation; local links and whitespace checked before publication. No app/SQL/data/notification/report/agent changes or live workflow tests. Current-state dictionary, environment and model references need no change because the proposed behavior has not been applied. Schema/UX review, DEV implementation/testing and scoped production approval remain pending.
