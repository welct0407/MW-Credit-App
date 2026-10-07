# Database ownership transfer — 7 October 2026

The owner moved the shared database package to [MW-Credit-App](https://github.com/welct0407/MW-Credit-App). AppSheet-Loan-Project owns overall project management. The owner explicitly deferred remaining implementation-code moves to a separate task.

The transferred source is current master a1cf24ccda21c6dde74edec19e9a792fd5dc2715: all 77 migrations, database configuration/runbook, promotion runners, tests, database CI and five required support modules. [Canonical database procedure](https://github.com/welct0407/MW-Credit-App/blob/main/database/README.md) · [Hashes and recovery](https://github.com/welct0407/MW-Credit-App/blob/main/database/OWNERSHIP.md).

Use MW-Credit-App commits/manifests for future SQL packages; coordinate overall releases here. Never relabel old manifest pins or create another Flyway history. No live database, financial data, credentials, services or AppSheet definitions changed in this transfer.

Retained Python/JavaScript helpers now read the canonical database source through scripts/database_location.py or scripts/database-location.mjs. Five support entry points forward to the new implementation. Set MW_CREDIT_APP_ROOT to its absolute checkout when repositories are not adjacent, including managed worktrees and Cloud environments. These adapters retain each consumer's existing authority boundaries. There is no second migration set or promotion runner here.

Historical commands and evidence stay pinned to their original commits. Private credentials and backups retain their existing paths. Dated one-off helpers require review of their assumptions and historical inputs before reuse; this transfer did not execute them.

Recovery: revert both source handovers together if needed; use the source Git pin and destination manifest. No database restore is required for a source move. The original dirty design checkout is preserved; removal uses an isolated current-master worktree. No product release number or production authority is created.
