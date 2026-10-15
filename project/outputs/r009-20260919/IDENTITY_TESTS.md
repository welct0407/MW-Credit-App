# R009 identity-routing verification — 19 September 2026

DEV OLTP **1.000014**, OLAP **1.000015**, Flyway **V25**. Both apps Deployed; both final saved editors show **No issues found**. PROD remains V24 / 3.000228 / 1.100178. No RC created or production change performed.

| Check | Result |
| --- | --- |
| Disposable migration chain with a populated V24 Partner fixture | Passed: V25 preserves Email and backfills normalized Login Email; second migrate does nothing; checksum tampering rejected. PostgreSQL 18.6 / Flyway 13.6.0. |
| Identity constraints and selection | Passed: normalized duplicate and blank logins rejected; null identity allowed; exclude actor ID before deduplicating shared nonblank delivery addresses. Synthetic rows rolled back. |
| Live DEV migration | V24 → V25 applied; Flyway validate passed (26 entries, no warnings). Initial uncommitted attempt rolled back because deferred Partner triggers prevented subsequent DDL; final tested migration puts backfill last. Applied V25 is immutable. |
| DEV master data | Two Partners, two distinct Login Email values, both Email values owner-only. Role A and role B each resolve to one other partner and one owner delivery address. [Aggregate SQL readback](identity-sql-readback.jsonl). |
| App schema and saved configuration | Partners regenerated in both apps; Login Email type Email, sensitive, non-key, no initial/app formula; existing permissions retained. All 12 push-task To expressions reloaded and independently matched [exact definitions](identity-routing.json). |
| OLAP GUI | Sync, Partners list/detail and edit form load. Separate Email and Login Email fields visible. Financial fields remain disabled. Form cancelled without data changes. |
| OLTP GUI positive case F | Current Collection Receive All posted 110, closed one loan. Automation run 7c9d32cd-d9a8-4218-84c8-3da4ca8f3e87 Complete at 10:55:58 UTC; positive branch Y. Receipt and closure task properties both To welct0407@mw-credit.com; closure title Loans Closed (1). |
| OLTP GUI zero-closure case G | Current Collection Receive All posted 10, closed no loans. Run dbed3949-39bc-42a0-9395-6b6e4919e9bb Complete at 10:56:21 UTC. Trace includes receipt and closure condition, then return; no closure-summary task. |
| Earlier closure regression | Reused [five prior GUI cases](TESTS.md) for unchanged closure gates across Borrowers/Charges/Loans commands. Recipient implementation evidence above supersedes the earlier owner-literal assertions. |

Fixtures R009IDENT-F/G (loans LF/LG, charges CF/CG) remain as auditable synthetic DEV records, auto-charge disabled. Existing synthetic cash accounts used; no real transfer. Notification recipient evaluation and task completion are verified; physical-device receipt and a transaction actually signed in as Lisa are **not verified**. Role B is covered by SQL identity/selection checks, not a claimed second-user GUI session. An Expression Assistant Test opened the legacy Table Data page; it was closed and excluded from accepted GUI evidence, and the temporary expression was cancelled without saving.

Recommendation: **Ready for owner review and RC preparation, subject to owner acceptance and production authorization**. A short two-account/device acceptance test remains useful. Before promotion verify PROD's existing Partner emails are the correct login mappings, then apply exact V25 before binding/using upgraded apps. Never copy DEV delivery overrides to PROD. Freeze a fresh integrated candidate per the workflow; no production readiness claim is based on later DEV state.

Repository checks: 11 release/directory-checklist helper tests passed; new PowerShell scripts parse; workbook round-trip preserves existing values/formulas; git diff whitespace checks passed. Database runner manifest created after clean-commit DEV validate/info at d1424ff0bd06b99b4b644ae5cbb6197c09728654; exact private path/hash recorded in release-manifest.json.
