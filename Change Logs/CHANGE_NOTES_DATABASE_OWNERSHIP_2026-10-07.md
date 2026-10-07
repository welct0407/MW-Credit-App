# Database ownership — 7 October 2026

Owner authorized moving database scripts/history/promotion tooling into MW-Credit-App and making AppSheet-Loan-Project the overall project-management repository. Owner explicitly selected moving remaining implementation code separately.

Transferred the complete current V1–V77 package from AppSheet-Loan-Project a1cf24ccda21c6dde74edec19e9a792fd5dc2715, including database CI and required support modules. Destination baseline 9c7b8209f8870114f2126e9bc551b11b8e93fcfb. Original local design checkout was stale and had unrelated work; source removal uses a clean managed worktree of current master.

Changes: database/, scripts/database/, five analysis/dictionary support modules, database CI, migration transfer integrity check, VM-01 tool-root override and owning documentation. The old repository receives pointers and temporary cross-repository dependency adapters for retained helpers. No live DB, schema, financial data, credentials, service or scheduler mutation.

Rollback: preserve original Git history/source manifest and revert the two repository handovers together. No database restoration is needed for this source-only move. See database/OWNERSHIP.md.

Completed: original migration hashes, runner guards, full disposable database CI, retained-consumer checks and both default-branch publications are verified. Local initialization initially failed because the PostgreSQL restricted subprocess could not read the prior Windows account’s private tool directory. Trusted binaries were copied into the current account’s tool directory; initialization and the local migration-chain check then passed. No live runner fallback was used.

Verification: database CI run 37587058469 passed (full disposable suite and 17 runner-guard tests); all 77 original migration hashes match. A retained-helper import check found one transitive schedule simulation dependency, now included. All five compatibility imports and JavaScript database-root resolution pass without DB access; syntax checks covered 107 Python and 13 JavaScript files. No live database validation or migration was run.

Closure: MW-Credit-App PR #1 merged at 17fab31986efd97bae3ebfbd8d75b4df93736400; AppSheet-Loan-Project PR #18 merged at 91120513bed10851baec4660a72a80849b371574. Final revision CI runs 37588108890 and 37588115673 passed, including 17 runner guards; application CI 37588115710 passed. Local PostgreSQL 18.6/Flyway 13.6.0 rebuilt all 77 migrations, repeated with zero migrations and rejected checksum tampering. Source default branch now retains only database/README.md and scripts/database/README.md in the moved package paths. Other implementation moves remain deferred.
