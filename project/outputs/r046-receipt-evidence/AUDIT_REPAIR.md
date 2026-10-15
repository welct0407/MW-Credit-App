# R046 receipt audit repair — 27 September 2026

Owner authorized the live repair after investigating the red Audit relay indicator. The fault was in receipt projection/backfill, not R047's DEV Collection display. Business V49/V50 records the stable receipt-link UUID and receipt identity digest; the original worker recorded an unrelated generic central activity. The relay correctly rejected 28 missing intents from 13:20:29 Bangkok onward.

Integration agent commit `34c413336289e116a9bca09fd12c51db716030c1` is deployed on `vm-mw-credit-agent`. New projections persist their deterministic, service-owned central intent before attachment. The relay validates the receipt-specific digest contract plus canonical plan integrity, exact operation/actor/database and the single metadata-only Payment effect. Generic reviewer DML keeps its original exact hash checks. No SQL migration, business-row rewrite, AppSheet change or financial replay was needed.

Recovery validated the 28 existing immutable receipt associations and exact source effects, then appended explicitly retrospective central audit records. No history was rewritten or backdated. Relay runs exported 20 + 8 records; readback found zero pending markers, 28/28 receipt acknowledgements and exactly 28 row-change plus 28 business-commit events. A scheduled run at 14:58:09 succeeded with zero exports. At 14:58:11 Bangkok the monitoring collector successfully exported `audit_relay=1`; all other health components also reported healthy. Receipt and relay timers are active.

Tests: 264-test Debian suite passed (31 environment-dependent skips); Windows suite passed with 35 skips. Separate real PostgreSQL receipt recovery/idempotency and six existing DML/relay tests passed. No live financial test was fabricated.

Rollback: verified private package/config copy `/var/lib/mw-integration-agent/rollback/receipt-audit-repair-20260927T075533Z`; central dump restored with 32 matching tables/1,328,056 rows and business audit dump with three matching tables. Private dumps/proofs remain under `C:/Users/MWCredit/Documents/ChatGPT/MW-Integration-Agent/audit-repair-20260927`. Preserve appended audit events and later runtime work; do not restore stale database snapshots or re-enable the defective projector without reconciliation. Deployed code, maintained recovery/deployment scripts and complete log are in MW-Integration-Agent.

R046 remains Frozen with AppSheet UI promotion pending; R047 remains Open. This is a correction to the already-deployed R046 backend, not approval to promote either AppSheet app.
