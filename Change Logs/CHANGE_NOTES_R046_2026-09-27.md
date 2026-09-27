# R046 — Receipt evidence in Payment review

Status: Frozen at authorized PROD-backend promotion. The owner superseded the initial DEV-only decision and authorized Debian/SQL PROD changes while keeping AppSheet definitions in DEV. R047 is the sole Open development release. [Pinned package](../outputs/r046-receipt-evidence/frozen-package.json).

## Scope and recovery

Implement the [receipt design](../outputs/receipt-storage-design-20260927/HANDOVER.md): original image archive, private agent metadata, three service-owned Payments fields and existing OLTP Payment review display. One existing GCS bucket and standard bucket roles; no DEV VM or second bucket.

Starting AppSheet repository commit: `75279c41e6c9b7689823982e89f6bb2c6d9f2dc9`. Agent repository commit: `8efd92561f8b0550fb51e7f2993f73cbe7ee6504`. Unrelated Risks redesign and r026 outputs preserved. DEV OLTP rollback version observed: `1.000092`. DEV database private logical backup: [sanitized reference](../outputs/r046-receipt-evidence/dev-backup.json). Additive V49 leaves previous app versions compatible; do not drop evidence on rollback.

## Implementation

- Business Flyway V49: nullable triplet, service ownership guard, exact locked Payment verification, atomic idempotent projection and append-only audit. No financial backfill.
- Agent V4: immutable source/locator and association records. Original bytes spooled privately and conditionally created in GCS, verified by generation and SHA-256. Separate retries preserve existing payment posting rules and UNKNOWN handling.
- Generic conversation API/DML tools cannot modify the evidence fields.
- DEV OLTP 1.000095 and OLAP 1.000035 saved; both editors report No issues found. Rooted `//receipts/...` image renders and expands; edit form excludes evidence controls. V50 supplies the required display prefix without copying the original.

## Checks

- Disposable PostgreSQL 18 migration chain through V49, no-op second run and checksum-tampering rejection passed.
- Synthetic SQL checks passed: exact attachment/retry, no direct projector DML, URL rejection, incomplete verification rejection, Bangkok midnight conversion, unchanged Payment financial columns/allocations/repayments/cash ledger, one audit operation, ordinary-client clearing rejection. Fixtures rolled back.
- Agent existing suite: 251 tests passed, 33 environment-dependent tests skipped; new archive tests: 7 passed. Expanded central-state and GUI checks pending.

Checks now complete: 258 agent tests with 33 environment-dependent skips; independent actual PostgreSQL V4 adapter/immutability/audit test; V50 SQL chain and database CI; PROD business and central backup restore checks. [Implementation handover](../outputs/r046-receipt-evidence/IMPLEMENTATION.md). Remaining: pinned backend deployment/health, final documentation/publication; PROD AppSheet stays pending owner review.

Credential incident: a cached PROD connector key appeared in diagnostic output. It was disabled immediately, replaced with a fresh key, native Test Connection/save passed, and the exposed key was deleted. No key contents are committed.
