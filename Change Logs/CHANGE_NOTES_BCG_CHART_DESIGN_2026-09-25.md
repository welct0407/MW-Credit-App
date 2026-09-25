# BCG chart design — 25 September 2026

Scope: owner accepts R028 categorization and requests an equal-quadrant plot design and detailed implementation handover. Documentation-only; no live database/report/AppSheet changes or production queries.

Starting commit: `8fb56e19e4c7b11333336d8d6fdbb16dbbda3ae8`. Existing unrelated risks-design and R026 output files preserved.

Deliverables: [handover](../outputs/bcg-matrix-chart-design-20260925/HANDOVER.md), [synthetic SVG preview](../outputs/bcg-matrix-chart-design-20260925/matrix-preview.svg). Design uses centered display transforms, explicit categorical schedule placement and familiar BCG quadrant order, preserving raw ratings/categories. Includes source contract, edge cases, renderer feasibility checkpoint, implementation sequence, acceptance tests and rollback. Installed native Metabase rendering capability is not asserted; latest official documentation and repository version evidence are distinguished.

Checks: formula examples and boundary/category invariants checked locally with synthetic values; Markdown links and SVG XML checked. No live implementation or visual-renderer acceptance claimed. Rollback: revert these documentation files. No product release allocated/frozen for this handover; implementer must re-read current Open release. Intended sanitized files committed/pushed under standing repository authority.
