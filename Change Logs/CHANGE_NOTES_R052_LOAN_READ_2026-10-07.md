# R052 checkpoint 2B — borrower-scoped loan reads

Date: 7 October 2026. Status: implementation in progress; grant/deployment pending.

Owner authorized continuation after completed 2A. Agent A selected borrower-scoped Loans list/detail using existing governed physical fields. Collection eligibility reconciliation remains later scope. The owner-only actual UID pin, prior read-service identity and existing AppSheet/private API are retained. No new schema, business writes, scheduler or production effects.

Starting app commit: adedf6915f51f6edd6dcf58daebb2667d3d29f0c, clean. D owns infrastructure, ACL tooling, documentation and publication; B owns application code and C verification.

Metadata-only DEV inspection confirmed V77 and all 14 selected Loans fields/types, Row ID PK, Ref Borrowers FK and loans_borrower_idx. All fields except Row ID are nullable; no borrower/date composite index. No business rows inspected. Sanitized evidence: outputs/r052-loan-read/metadata-preflight.json.

Maintained grant helper now plans only missing column privileges and unchanged settings are preserved. Read-only plan is exactly one SELECT grant on 14 Loans columns to the existing DEV reader, retaining the prior nine Borrowers/Partners columns. A reviewed the scoped plan and recovery. Nothing applied yet. Before mutation, capture private ACL/settings for all affected tables; recovery removes only introduced Loans SELECT, never prior grants or unchanged settings. Role remains non-elevated, no business DML or schema CREATE.

Rollback: starting source commit, retained 2A read image/Hosting version and private pre-grant ACL snapshot once applied. No live snapshot is claimed before execution. Verification so far: Python syntax, read-only plan, exact target tuple and metadata, git diff --check. Remaining: B/C code checks, scoped ACL application/readback, immutable build and deployment, live boundary/UI verification and next owner visual checkpoint.

Applied reviewed one-statement DEV grant after A review and C84units/4affectedbrowser passes. Private snapshot read-role-before-20261007T121157979459Z.json retained outside Git. Exact effective audit: DEV23 columns, PROD0, no DML/schema CREATE in either. Four actual source SQL variants passed EXPLAIN with synthetic parameters as existing operator. SET ROLE and service-account impersonation were unavailable; no privileges added to work around this. Effective reader audit is separate, and actual runtime loan proof remains owner validation. Historical 2A mocked screenshots restored; six new loan screenshots are synthetic and labeled. Source deployment pending.

Deployment: exact source084bb5376ddc6f156cbba7ba4acd931c1f22d8d0 passed CI37619664493. Cloud Build9c05cff6-94f1-491a-bef9-b92e257cdb51 succeeded; image b0a44c370d7afa7c17675a0a0f12fa290a9d3bc2714b32e731e237444f554c30 applied through reviewed image-only Terraform plan (0add1change0destroy). Read revision00004-wmg Ready; actual UID pin retained. Hosting version0e7710ff18851030/release1791375515233000 deployed. Prior Hostingc0872b1adcb4006f and image89f10f...8593 are rollback pins. C bounded deployed smoke pending; actual owner list/detail/back validation remains pending. Stop at checkpoint2B, no Collection/next slice.

Independent deployed smoke passed on00004-wmg: health200, unsigned nested list/detail401, invalid synthetic bearer401, POST405, allowed-origin preflight204; allno-store. Signed-out EN/Thai desktop/mobile passed with zero records/API requests/overflow. Owner actual loan-list/detail/back validation remains pending. Development package is ready for owner review; stop here.

## Owner-requested 2B refinements

Owner feedback is not acceptance: governed Loan Key and borrower labels/profit, hidden technical IDs, grey inactive/closed cards, independent desktop scrolling, grouping/pagination and baht display need refinement. Starting clean app e9281e9. Exact metadata confirms three existing nullable sources: Borrowers.Description text, Borrowers.Total Interest Earned numeric, Loans.Original Daily Interest Rate integer. Prepared two SELECT statements for only these three columns (23→26); not applied yet. No schema or calculation change. A resolves exact display/grouping semantics; B/C implementation/testing precedes deployment. Broader borrower fields remain inventory/roadmap scope, not blanket access.

Pagination clarification: owner identified the reported Next page issue as the greyed-out/disabled end-of-list button. Baseline27-record pagination worked; no SQL cursor defect is established. Refinement hides Next when no further page exists and shows an explicit end message; C verifies the affordance. This resolves the reported presentation ambiguity, subject to review, without claiming a database bug fix.

Refinement gate passed: A contract/source review; C89units,6affected browsers and2final scroll rechecks. Applied exact three-column SELECT delta with private snapshot read-role-before-20261007T130416029011Z.json; effective DEV26/PROD0/no DML/schemaCREATE. Sixteen actual grouped borrower/loan query variants passed operator EXPLAIN with synthetic parameters, separately from mocked traversal; no rows read. Local UTF-8 decoding corrected before successful EXPLAIN, no source/runtime defect. UID pin unchanged. Ready for exact-source build/deployment.
