# Database ownership — 7 October 2026

Owner authorized moving database scripts/history/promotion tooling into MW-Credit-App and making AppSheet-Loan-Project the overall project-management repository. Owner explicitly selected moving remaining implementation code separately.

Transferred the complete current V1–V77 package from AppSheet-Loan-Project a1cf24ccda21c6dde74edec19e9a792fd5dc2715, including database CI and required support modules. Destination baseline 9c7b8209f8870114f2126e9bc551b11b8e93fcfb. Original local design checkout was stale and had unrelated work; source removal uses a clean managed worktree of current master.

Changes: database/, scripts/database/, four analysis/dictionary support modules, database CI, migration transfer integrity check, VM-01 tool-root override and owning documentation. The old repository receives pointers and temporary cross-repository dependency adapters for retained helpers. No live DB, schema, financial data, credentials, service or scheduler mutation.

Rollback: preserve original Git history/source manifest and revert the two repository handovers together. No database restoration is needed for this source-only move. See database/OWNERSHIP.md.

Verification pending: complete migration hash comparison, runner checks, disposable database CI, retained consumer syntax/path checks and repository publication. Local initialization initially failed with Windows status -1073741515 before any database was created; remote Windows CI will independently exercise the same maintained runner. No live runner fallback is permitted.
