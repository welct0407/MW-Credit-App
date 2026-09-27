# R047 — Collection borrower receipts

27 September 2026. Owner selected option 1 (receipts linked to recorded Payments) and authorized DEV implementation. DEV OLTP **1.000098**, rollback **1.000095**. R047 stays Open for review; PROD promotion is not authorized by this turn.

Added a read-only receipt Payments slice, borrower Ref list, Collection detail section, thumbnail deck and navigation action into existing Payment detail. Receipt image/time visibility supports nested read views while excluding forms. No SQL, agent, GCS, OLAP, notification or financial data change. Dependencies are the existing R046 receipt fields/native storage and Payment borrower Ref.

Current GUI verified synthetic Collection → borrower → receipt → Payment detail → full-size image, borrower with no image, and absence of receipt inputs in the cancelled edit form. Saved filter/read-only configuration verified. Both DEV editors have no issues. OLAP observed 1.000036 unchanged; OLTP1.000098. Runtime multi-receipt sort was not seeded; descending configuration verified.

[Exact implementation, evidence, limitations and rollback](../outputs/r047-collection-receipts/HANDOVER.md). Dictionary DEV overlays, environment/development records and model explanation updated. PROD references stay unchanged. Review/acceptance and normal integrated RC promotion are pending; no final release tag is created while Open.
