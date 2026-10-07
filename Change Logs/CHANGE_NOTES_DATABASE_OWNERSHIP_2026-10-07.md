# Database ownership — 7 October 2026

Owner authorized moving the database package to MW-Credit-App; remaining implementation moves were explicitly deferred. AppSheet-Loan-Project retains overall project management.

Source baseline a1cf24ccda21c6dde74edec19e9a792fd5dc2715 in isolated codex/database-ownership worktree; unrelated dirty primary checkout preserved. Destination baseline 9c7b8209f8870114f2126e9bc551b11b8e93fcfb.

Remove canonical database source/CI, retain ownership pointers and four support-module forwarders, and route retained consumers to the new database source. Update active ownership documents and links. Historical release evidence stays here.

Rollback is a coordinated source revert using the recorded Git pin and transfer manifest, not live database restoration. No live SQL, financial writes, credential moves or service deployment. Verification/publication results will be recorded at closure.
