# Shared PostgreSQL development

MW-Credit-App owns migrations, database runners/tests and CI. AppSheet-Loan-Project owns release coordination. Current consumers are native PWA/API/workers, Debian integration and governed reporting. AppSheet editor, RC and parity steps are retired.

DEV and PROD use separate business databases on one shared instance. Verify the full target tuple and affected consumers. Latest verified deployed version is V92 in DEV and PROD (R062, 15 October 2026); choose new versions from the actual migration directory and pending work, never from a stale document.

Use existing Secret Manager/unattended access procedures. Keep credentials/backups outside Git. New tables/columns and production changes require scoped owner authorization; reuse existing explicit approval. Never clean/repair, alter applied checksums or create competing history.

## Each change

For changes to migrations or database tests/runners, run `pwsh -NoProfile -File scripts/database/Test-CI.ps1` before publication, in addition to affected feature tests. This is the same entry point used by GitHub Actions and rebuilds an empty disposable database through the latest migration. Keep older fixtures compatible with new required fields: `Test-CashAccountFixtures.sql` supplies synthetic accounts, and each source insert explicitly selects its account. Do not weaken production guards or top up a live balance to repair CI. Branch/PR builds remain enabled; release tags reuse the tested commit without a duplicate workflow run.

These steps apply to SQL changes, not app-only or documentation-only edits. Work in coherent migration batches: run the relevant checks on the completed candidate and rerun only where later edits or changed dependencies invalidate them. Reuse applicable passing evidence under the [release workflow](https://github.com/welct0407/AppSheet-Loan-Project/blob/master/Documents/PWA_Orchestration.md#evidence-reuse-and-exact-candidate-identity); do not reinstall tools or rebuild a disposable database after every intermediate edit. Migration-chain checks below remain required for a changed migration candidate.

1. Create the next unused monotonically increasing `V<version>__description.sql` after all applied/reserved versions. Include functions/triggers in versioned migrations too. Preserve text Row IDs and case. Review transaction behavior, locks, dependencies and forward-fix SQL. Prefer **expand/contract**: additions first, old/new app compatibility during cutover/rollback, destructive removal in a later tested release. Include compatibility with affected current consumers and rollback versions in relevant tests. Do not include `BEGIN`/`COMMIT` unnecessarily; Flyway normally wraps PostgreSQL migrations in a transaction. Nontransactional operations require separate documented handling.
2. Use the migration-chain proof from `Test-CI.ps1`; run `scripts/database/Test-Migrations.ps1` separately only when that proof is unavailable/invalidated. It starts a temporary, empty PostgreSQL server bound only to loopback, rebuilds migrations, validates, checks repeat execution is a no-op and verifies checksum mutation is rejected. It stops the server and leaves diagnostic files outside Git. No production data is used.
3. Apply in development with `Invoke-Flyway.ps1 -Environment development -Command migrate`, then `validate`. Test affected native PWA/API/agent/worker flows. Cover changed calculations, refs, permissions, trigger-generated results after commit and financial reconciliation; record results and any required owner acceptance.
4. Update the Markdown change log and model documents when applicable; commit and push the exact intended files. CI rebuilds against disposable PostgreSQL, never Cloud SQL.
5. From the clean tested commit, run `New-Release.ps1 -ValidationReference 'path or link to accepted test evidence'` before later migrations advance DEV. This requires development validation and no pending/invalid migrations, and writes a release manifest outside Git. A reference must describe actual completed validation, not a placeholder. Pin this commit/manifest and target version in the frozen release package, retaining a sanitized manifest/hash record in Git. Later documentation commits do not replace the deployment commit. The runner uses the complete migration set in that checkout: every pending migration through its target must be in the approved batch or an explicitly approved prerequisite; it does not select migrations by R-number.
6. Before promotion, compare current production schema with the expected pre-release schema (export via `Export-Schema.ps1`; inspect drift). Verify a restorable backup, review migration files and application dependencies, and obtain explicit owner approval. Flyway `validate` checks migration history/checksums, **not** arbitrary live-schema drift or business correctness.
7. Promote the same clean commit:

```powershell
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command migrate `
  -ReleaseFile 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/release-COMMIT.json' `
  -ApprovalReference 'actual owner approval for this release' `
  -BackupReference 'verified Cloud SQL backup or restore point'
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command validate
```

The runner rejects mismatched commits/hashes, dirty checkouts and missing approval/backup references. These are operator safeguards, not an authorization service: the agent must verify the referenced evidence. No push triggers production deployment. Use a clean checkout of the pinned commit when the working branch has advanced; do not bypass manifest checks or disturb later DEV work. After promotion verify SQL history/schema and affected app workflows against the frozen package, not current DEV; capture results and update the release checklist/change log. Failed migrations require investigation, not automatic `repair` or retries of financial backfills.


## Recovery and delivery

Prefer compatible additive migrations before dependent API/worker delivery. An app rollback does not undo SQL or financial writes. Use a forward fix or separately authorized verified restore; preserve later transactions. Follow the project release recovery runbook. No app-only/documentation-only migration or database backup is required.

Use one promotion record and the guarded runner manifest. Existing validated evidence remains reusable while source, dependency and environment assumptions remain valid. No AppSheet copies, source rebinding or App Upgrade.
