# Checkpoint 4D independent verification

Date: 2026-10-08. Scope: disposable loopback PostgreSQL 18.6, complete V1–V78 history. No live database, API, authentication integration or receipt storage deployment.

## Results

B executed the final coherent runner: **13/13 transaction cases passed** (five B cases plus eight independently authored C cases), followed by **1/1 separate restart recovery case** in a new Node process. C independently inspected the final assertions, runner and retained migration/restart diagnostics; C did not duplicate that run. D owns the separate required database CI result.

The final retained migration result reports success, 78 migrations executed and target version 78. The same cluster's PostgreSQL log records an orderly fast shutdown, restart on loopback, readiness, and final shutdown; restart.out confirms startup. The runner preserves the same data directory and launches a new test process after restart. The disposable cluster is stopped.

## Independent assertions

- Exact JavaScript/SQL canonical bytes, SHA-256 and Unicode/multiline Notes; noncanonical JSON, alternate Unicode escapes and duplicate keys rejected.
- Outer rollback removes both financial source and journal; committed outcomes are readable through another connection.
- Actual source correction and deletion retain the original journal outcome; replay does not recreate a deleted payment; changed payload conflicts.
- UPDATE, DELETE and TRUNCATE guards reject mutation; nullable constraint edges fail closed; the three functions have no PUBLIC EXECUTE grant.
- Typed account rejection records a rejected outcome without a payment. Untyped financial P0001 and invalid current actor mapping abort without a journal result.
- AppSheet-style direct Processing insertion competes with the wrapper: the test observes its backend waiting on a lock before committing the direct contender. The wrapper then aborts without a second payment or journal outcome.
- Changed actor conflicts; wrong-subject status remains unresolved; changing the current Partner mapping denies known replay/status and preserves existing records. Fixture mapping is restored in finally.
- An explicitly seeded historical retained outcome replays before new-command date validation; a new request with that old date is rejected.

B cases additionally cover simultaneous identical requests, different request IDs against the same charges, typed date rejection, and commit recovery. The restart test replays persisted outcomes, compares scoped status and confirms no increase in payment count, including deleted-source cases.

## Precise limits

Acknowledgement loss is a **client-side injected exception after an actual successful COMMIT**, not an observed network outage. Restart is an **orderly fast PostgreSQL stop/start**, not power-loss/crash recovery. The historical case is a **seeded retained-record fixture**, not a clock change or actual midnight crossing. Invoker routines and PUBLIC ACL checks do not prove a deployed least-privilege role or Firebase authorization boundary. No claim of live payment readiness, production durability under every failure mode, or universal manual-receipt path mapping is made.

## Files and evidence

C assertions: `tests/integration/payment-journal-independent.test.mjs` (eight cases). B runner: `tests/integration/Run-PaymentJournal.ps1`; B cases: `payment-journal.test.mjs`; restart: `payment-journal-restart.test.mjs`. Approved implementation: V78 journal migration plus disposable runner/version guard; prior V77 rehearsal remains pinned to 77.

Retained local diagnostic run: `mw-payment-rehearsal-c9f819153f68419692117f3e7804c7b3`. Inspected `migration.json`, `restart.out`, and final PostgreSQL shutdown/startup log sequence. Raw database files and logs remain temporary and are not publication artifacts.

Final focused review has no remaining blocker. No browser/UI changes or broad rerun were needed for this backend checkpoint.
