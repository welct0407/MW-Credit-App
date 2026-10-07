# R052 checkpoint 2B — borrower-scoped loan reads

Date: 7 October 2026. Status: implementation in progress; grant/deployment pending.

Owner authorized continuation after completed 2A. Agent A selected borrower-scoped Loans list/detail using existing governed physical fields. Collection eligibility reconciliation remains later scope. The owner-only actual UID pin, prior read-service identity and existing AppSheet/private API are retained. No new schema, business writes, scheduler or production effects.

Starting app commit: adedf6915f51f6edd6dcf58daebb2667d3d29f0c, clean. D owns infrastructure, ACL tooling, documentation and publication; B owns application code and C verification.

Metadata-only DEV inspection confirmed V77 and all 14 selected Loans fields/types, Row ID PK, Ref Borrowers FK and loans_borrower_idx. All fields except Row ID are nullable; no borrower/date composite index. No business rows inspected. Sanitized evidence: outputs/r052-loan-read/metadata-preflight.json.

Maintained grant helper now plans only missing column privileges and unchanged settings are preserved. Read-only plan is exactly one SELECT grant on 14 Loans columns to the existing DEV reader, retaining the prior nine Borrowers/Partners columns. A reviewed the scoped plan and recovery. Nothing applied yet. Before mutation, capture private ACL/settings for all affected tables; recovery removes only introduced Loans SELECT, never prior grants or unchanged settings. Role remains non-elevated, no business DML or schema CREATE.

Rollback: starting source commit, retained 2A read image/Hosting version and private pre-grant ACL snapshot once applied. No live snapshot is claimed before execution. Verification so far: Python syntax, read-only plan, exact target tuple and metadata, git diff --check. Remaining: B/C code checks, scoped ACL application/readback, immutable build and deployment, live boundary/UI verification and next owner visual checkpoint.

Applied reviewed one-statement DEV grant after A review and C84units/4affectedbrowser passes. Private snapshot read-role-before-20261007T121157979459Z.json retained outside Git. Exact effective audit: DEV23 columns, PROD0, no DML/schema CREATE in either. Four actual source SQL variants passed EXPLAIN with synthetic parameters as existing operator. SET ROLE and service-account impersonation were unavailable; no privileges added to work around this. Effective reader audit is separate, and actual runtime loan proof remains owner validation. Historical 2A mocked screenshots restored; six new loan screenshots are synthetic and labeled. Source deployment pending.
