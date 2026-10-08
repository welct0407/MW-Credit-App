# R052 checkpoint 4D — Disposable durable command journal

8 October2026. Owner approved the concrete4C proposal for implementation and rehearsal in a disposable database only: one public.pwa_payment_commands table, immutable guard and proposed submit/status routines. This approval does not authorize live DEV/PROD schema application, grants, financial endpoints, GCS access, notifications or cloud deployment.

Baselines: app2c66bdd50f8afd30561ddd76abfc02ae1267585a; PMb00d437d1c2e064a5b39cf5efcea23c1ce54a6bb. Both matched upstream; app clean, unrelated PM DNS planning log preserved. R052 remains the sole Open release. Canonical migration directory ends atV77, with no pending migration observed; V78 is coordinated exclusively to B for this approved candidate. No release freeze/tag or live history change.

Reuse existing PostgreSQL18.6/Flyway13.6 disposable tooling. Focused A/B/C verification precedes D's single required scripts/database/Test-CI.ps1 run on the frozen migration/test candidate. Existing preview is not part of this backend checkpoint and is not restarted. Retain actual disposable transaction/durability evidence separately from pure contract tests and future live integration.

Rollback: stop/discard only owned disposable runtime when finished; preserve source baseline and unrelated work. No live down-migration or financial rollback is involved. Published migration remains unapplied to live environments until separately authorized; do not edit previously applied V1–V77 bytes.

V78 SHA2568ea5009d29bf8c78fadcdaa478680defd3f161ef2a7e22e7999c2a2aa7170c30 passed maintained Test-CI once (exit0) on disposable targets. A final review passed. B reports13 transaction cases plus one actual PostgreSQL same-directory restart; C independently corroborated retained migration/restart/shutdown evidence and assertions; report frozen with no blocker. COMMIT acknowledgment loss is explicitly simulated after real COMMIT, not a claimed network outage. Original journal outcome persists through permitted correction/deletion and is distinct from current Payment state. Future rollback retains journal/financial history; no dropping journal as recovery.
