# Disposable command journal — checkpoint 4D

V78 is a repository migration candidate tested only in disposable PostgreSQL. Live DEV/PROD remain V77. No financial endpoint, runtime grants, GCS access, event dispatch or preview change is delivered.

Run the guarded focused rehearsal from the app repository:

```powershell
pwsh -NoProfile -File tests/integration/Run-PaymentJournal.ps1
```

It creates a fresh loopback-only full-history database, executes synthetic transaction checks, restarts its owned PostgreSQL cluster on the same data directory, verifies retained outcomes, and stops it. The historical4A/4B runner remains explicitly pinned toV77. Do not substitute a live connection or use the historical live payment lab.

The tests distinguish actual SQL commit/rollback/contention and PostgreSQL restart from simulated acknowledgment loss after a real COMMIT. Original journal outcome is immutable transaction evidence, not the current corrected/deleted Payment status. A timeout alone is not rejection.

Recovery/retention: no live rollback is needed for this checkpoint. Future application rollback must preserve journal rows and financial history; dropping the journal would destroy replay protection. V1–V77 applied migration bytes remain unchanged. New runtime ownership/ACLs, authenticated command API, manual GCS/AppSheet mapping and event delivery require their own exact reviewed scope.

See test-report.md for focused evidence and database-ci.json for the maintained migration regression result when finalized.
