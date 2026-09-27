# R046 — Receipt evidence in Payment review

Status: Released with integrated R046/R047 promotion; final evidence tags R046 and R047. R048 remains the sole Open release.

## Integrated production closure — 27 September 2026

Owner authorized R046, R047 and relevant pending changes. Included DEV OLTP1.000118 (owner-confirmed minor icon/cosmetic saves after1.000116) and OLAP1.000042. Both definition-only RC1 copies had data/file copy unchecked, were rebound to PROD and frozen Deployed at1.000009. App Upgrade applied OLTP3.000249→3.000252, then OLAP1.100202→1.100205. The sole active promotion checklist is [R047 integrated checklist](../outputs/r047-production/promotion-checklist.md).

PROD loan_manager_prod on appsheet-pg-prod-20260914 /34.21.174.215 migrated V50→V52 using exact tested commit0d2ed5298393cfdec34ba953e9549e3f01c670d9. Private pre-change backup restored with matching fingerprints; V51/V52 rehearsal preserved all existing financial rows. Final Flyway validation53 passed and schema matched pinned DEV. No DEV financial data copied to PROD.

Both PROD apps remain Deployed with zero editor issues. Source mappings, companion links, receipt storage/folder, existing API enablement/keys, canonical scheduled guards, load/sync and Collection/Selected Charges entry points passed. Selected total is disabled; the inspected form was cancelled. Canonical shared Drive logos were reselected in RC to repair broken previews; both render after upgrade and RC deletion. No PROD payment test, upload or forced notification was performed; passing DEV behavior tests are reused. Phone camera hardware remains untested.

Both temporary RC definitions were deleted by verified UUID, leaving DEV/PROD and shared data/files intact. Rollback app versions:3.000249/1.100202; SQL is compatible expansion, so use reviewed forward-fix or the verified private backup under the recovery runbook, preserving later financial writes. App restore does not undo SQL or financial writes. [Production evidence](../outputs/r047-production/production-verification.json) · [backup](../outputs/r047-production/production-backup.json).

Updated tracker, inventory, development differences, design/overview and exact dictionary objects/closed overlays. Targeted dictionary capture and hash/old-value guarded batch closure tooling were added; helper batch planning defers structural validation only until all candidates can be validated together before writes. No reports, Looker/Metabase definitions, dashboard flows, agent runtime, bucket grants or notifications changed in this promotion. Prior backend evidence is reused; no new operating policy. Repository baseline8ebe809; unrelated risks/payment-health work preserved. Relevant dictionary/tool tests, JSON and whitespace checks precede normal push and unique final tags R046/R047 at the evidence commit.

Earlier backend checkpoint: PROD backend deployed and verified; AppSheet receipt UI remained DEV. R046 is Frozen pending integrated AppSheet promotion. The owner superseded the initial DEV-only decision and authorized Debian/SQL PROD changes while keeping AppSheet definitions in DEV. R047 is the sole Open development release. [Pinned package](../outputs/r046-receipt-evidence/frozen-package.json).

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
- Initial archive implementation: 258 tests including seven new archive/projection tests; subsequent recovery correction increased the final suite to259.

Checks now complete: final259 agent tests (30 optional skips on Debian;34 on Windows); independent actual PostgreSQL V4 adapter/immutability/audit test; V50 SQL chain and database CI; PROD business and central backup restore checks. [Implementation handover](../outputs/r046-receipt-evidence/IMPLEMENTATION.md). Backend deployment and health are verified; PROD AppSheet stays pending owner review.

Credential incident: a cached PROD connector key appeared in diagnostic output. It was disabled immediately, replaced with a fresh key, native Test Connection/save passed, and the exposed key was deleted. No key contents are committed.

## Delivered backend

Business PROD48→50 from pinned AppSheet commit `576755ae55f89c6418e0944773196ac4e7ece892`; DEV/PROD affected schema and projector grants match. Central `mw_agent`3→4 applied/no-op verified. Debian installed `817c9b47a574227874cbfb407aaa08794cb50dac`;259 tests passed with30 optional skips. Initial isolated-build correction and terminal-selection URL correction are recorded in the agent log; the archive cutoff remains `2026-09-27T05:43:10.226553+00:00` (12:43:10 Bangkok). Metadata-identity GCS probe exact-byte verification passed; dedicated projector login through the VM proxy passed. All47 installed Python files match, prior service flags/settings are preserved, all five business timers and audit/resource timers are active with successful service results. [Manifest](../outputs/r046-receipt-evidence/release-manifest.json).

PROD OLTP3.000249 / OLAP1.100202 remained unchanged, Deployed, no editor issues, and loaded/synced after SQL. No RC or App Upgrade. DEV OLTP1.000095 / OLAP1.000035 are validated; owner acceptance/combined app promotion remains pending. No final R046 release tag yet because the UI is deliberately unpromoted.

Recovery: original private runtime copy `/var/lib/mw-integration-agent/rollback/receipt-evidence-20260927T053925Z`; correction copy `receipt-evidence-20260927T055022Z`; restored private DB backup proofs in evidence. Preserve additive SQL, captured originals and subsequent financial writes. No historical replay or forced real receipt/payment. Exact production SQL and DEV-only UI definitions are documented in the YAML dictionary and handover.

## Audit relay correction — 27 September, 14:58 Bangkok

Owner-authorized backend repair deployed agent `34c4133`: deterministic receipt intents and typed receipt-marker validation. Reconciled 28 missing intents with explicit retrospective events; normal relay exported all 28, then the next scheduled run succeeded with zero backlog. Monitoring exported healthy at14:58:11. Private central/business-audit restore proofs and package rollback verified. No financial records, SQL schema, AppSheet definitions, cutoffs or permissions changed. [Repair evidence and recovery](../outputs/r046-receipt-evidence/AUDIT_REPAIR.md). R046 UI promotion remains pending; R047 stays Open.
