# Receipt notification isolation — 2 October 2026

Owner requested that Instagram plus fallback-email failure must not stop receipt intake/processing, and that the current exception be cleared. Starting source: c98724e6cc21bf4f49e766e4b2ee9c923eba4dd2. Deployed checkout observed read-only at 07b53cd1707ce9210477a959e3536a3ef4d67acd (the difference is deployment documentation).

Confirmed: optional retained result failures contributed to the receipt processing health indicator. Live observed cycles finished successfully; intake blockage and the exact failed rows/provider cause are not independently established. An unbounded shared OAuth-file lock is a source-level blocking risk, not a demonstrated incident cause.

Changes: separate optional notification-stage errors from processing errors; retain all delivery state and failure counts while splitting optional notification health; bound delivery work to two ordered notices per cycle; defer unexpected item failures; use nonblocking OAuth locking; back off a receipt whose pre-processing master read fails. Reviewer approval, payment idempotency/readback, unknown-effect protection, switches, cutoffs, model settings and financial data are unchanged. No schema, credentials, grants, infrastructure, new schedule, historical resend or live test payment/message.

Validation: 280 tests completed in a fresh isolated PostgreSQL 18.6 lab (278 passed, two optional platform tests skipped). An initial run against the retained lab hit an existing synthetic-payment fixture collision; the retained lab was not reset and the clean lab passed. Regression coverage includes closed IG window plus email rejection, next receipt processing, duplicate-payment prevention, required reviewer policy, bounded retries, uncertain outcomes, busy credential lock, per-item deferral and optional health separation.

Production exception acknowledgement remains pending: the approved business reader cannot connect to the central agent database; the current instruction prohibits substituting credentials. No runtime failure row or audit record has been deleted, reset or falsely marked delivered. Deployment status pending.

Rollback: reinstall the previously backed-up package/catalogue, retaining current PostgreSQL runtime/audit and configuration. Do not restore stale journals or replay uncertain sends/payments. This change needs no database rollback. Before scoped deployment, pin the tested source and preserve installed package/catalogue/config; let active affected workers finish and resume their existing timers unchanged.
