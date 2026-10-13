# MW Credit App

Small two-user PWA. This repository owns PWA/API, shared SQL migrations/runners/tests and infrastructure; AppSheet-Loan-Project owns project coordination. Keep repositories separate.

## Execution

- Read Git status/starting commit, relevant continuation and affected source. Preserve unrelated uncommitted work. Work directly by default; the owner can request particular agents or personal execution.
- Follow the [PWA delivery policy](https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/PWA_Orchestration.md). Focused checks during implementation; one consolidated broad run when warranted. Reuse valid input-equivalent CI/artifacts for promotion. No duplicate CI for docs/merge/closure; required automated checks still apply.
- Read database/README.md for SQL work, the owning infrastructure README for infrastructure, and docs/Development.md for tooling. Do not read every historical output.
- AppSheet is retired. No editor checks, parity, copies, upgrade or coexistence requirements. Preserve shared SQL/GCS and receipt compatibility identifiers still used by native consumers.

## Authority and integrity

- Production deployment, live financial writes, forced notifications, new tables/columns and destructive operations require scoped owner authorization; reuse existing approval covering the action.
- Keep immutable increasing migrations and exact tested commit/hash guards. Never clean/repair/rebaseline to hide drift. Use synthetic disposable databases for tests; never copy DEV financial data into PROD.
- Preserve DEV/PROD target/identity isolation, authorization, idempotency, journals and financial reconciliation. Resolve unknown outcomes before retrying.
- Establish recovery once for affected assets. UI-only releases need no database dump. Production DB changes require verified restorable backup.
- Terraform owns infrastructure configuration within the adopted roots. Shared SQL/receipt assets must not be destroyed/replaced. Azure VM controller remains excluded; unattended admin access does not authorize runtime/business changes.
- Use Secret Manager and established IAM/OIDC/unattended identities. Keep secrets, plans/state, authentication exports and private data outside every repository.

## Completion

- Run scripts/database/Test-CI.ps1 for changed SQL migrations/database runners/tests, using disposable local databases; reuse the result at promotion while inputs remain valid.
- Update one concise change log and only affected owning references/dictionary records. One promotion record plus required machine manifest suffices.
- Review, commit and push intended files; preserve unrelated work, no force push. Publication does not authorize deployment or merge.
- Follow the project VM-01 storage policy for owned temporary files. Reuse root dependencies. Never delete another task's work, secrets, backups or application-managed state.