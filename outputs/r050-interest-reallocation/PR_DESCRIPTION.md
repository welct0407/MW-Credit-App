Posted receipt allocations cannot be corrected through ordinary edits. Add an
admin-only operation to move whole interest allocations to earlier unpaid
charges on the same active loan, preserving IDs, receipt dates/amount/account,
principal, loan state and cash. V57 records exact before/after transitions in the
existing append-only transaction audit; the posted-record guard permits only
those transitions in their authorized transaction and keeps all ordinary edits
blocked. Retry independently reconciles the committed state without duplicates.

Validation: PostgreSQL 18.6 / Flyway 13.6.0 rebuilt all 57 migrations; SQL regression
batch and five concurrency suites passed; repeat migrate was a no-op; checksum
tampering was rejected. New tests cover stale/cross-loan/closed/capacity requests,
late-batch rollback, ordinary guard and restricted-role denial, four contention
paths, committed retry and unchanged borrower/loan/receipt/cash tables.

Candidate only: live DEV/PROD are unchanged. Production deployment is owner-authorized after
CI/DEV validation, verified backup/restore rehearsal, current schema/role checks
and fresh private before-state. No private borrower evidence or credentials are
included. No merge/default push, notifications or VM-controller action requested.

Direct owner authorization permits task-branch/draft-PR publication and the
bounded V57 deployment/correction after all required checks pass.
