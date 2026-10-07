# Database ownership transfer — 7 October 2026

MW-Credit-App is the sole owner of the shared loan database migrations, promotion runners, database tests and CI. AppSheet-Loan-Project retains overall project management, release coordination, dictionary/business references and historical evidence. The owner explicitly deferred moving remaining implementation code to a separate task.

## Preserved package and interfaces

Transferred 77 migrations (V1–V77), the database configuration/tool pins/runbook, scripts/database, database CI and four directly required database support modules. The source is AppSheet-Loan-Project commit a1cf24ccda21c6dde74edec19e9a792fd5dc2715, which includes the newer R051/V77 closure. The older local design checkout was not used as the database source.

[Source manifest](../outputs/database-transfer-20261007/source-manifest.json) records every imported file's original SHA256. Migration bytes and database/.gitattributes are preserved. Other transferred files may receive documented path/ownership updates. Git history stays available in the original repository; this transfer does not rewrite history.

Run the same commands from the MW-Credit-App checkout:

```powershell
. ./scripts/Enter-Dev.ps1
./scripts/database/Test-CI.ps1
./scripts/database/Invoke-Flyway.ps1 -Environment development -Command info
./scripts/database/Invoke-Flyway.ps1 -Environment development -Command validate
```

Only disposable tests were authorized for this transfer. The live info/validate examples above are future operational commands, not a claim they were executed. Production promotion still requires the exact tested clean MW-Credit-App commit, complete migration hashes, actual owner approval and verified backup references. Old release manifests remain valid historical evidence but must not be relabeled with new repository commits. Prepare a fresh manifest after future DEV validation; do not bypass the commit guard.

DEV and PROD retain their database identities and existing public.flyway_schema_history. No baseline, repair, clean, live migration, schema change, financial write, credential rotation or service deployment is part of this move. V78 or later must be allocated only after checking current history and coordinated work.

## Tooling and private files

Common.ps1 accepts MW_DB_TOOL_ROOT to reuse an existing trusted tool installation. Without it, the original LocalAppData/AppSheetLoanTools default remains. Enter-Dev.ps1 selects the installed VM-01 tools. Test-CI.ps1 retains Windows and established Linux disposable-test routes.

Existing external credential/backup paths containing AppSheet-Loan-Project are intentionally retained. Their names do not establish source ownership; moving or regenerating private credentials/recovery artifacts would be a separate operation. The cloud production adapter remains restricted to its reviewed V58 transport/package assumptions; its historical scope has not been broadened by moving it. Use the approved runner appropriate to the actual release and environment.

## Retained consumers

Four small compatibility entry points in the old repository forward to the canonical support modules here. Other retained Python/JavaScript helpers use its database_location.py/database-location.mjs adapters to read this database package, while keeping their management outputs in the old repository. Set MW_CREDIT_APP_ROOT to the absolute new checkout when repositories are not adjacent (including managed worktrees). There is no second SQL migration copy or live runner in the management repository.

Release-specific helpers are dated tools, not generally reusable operations. Their historical inputs/outputs remain in the project-management repository or private storage; review their pinned assumptions and paths before reuse. In particular, historical dictionary-generation scripts target frozen artifacts and must not be replayed automatically. No such dated live helper was executed to test the move.

## Recovery

Source recovery pin: a1cf24ccda21c6dde74edec19e9a792fd5dc2715. Destination baseline: 9c7b8209f8870114f2126e9bc551b11b8e93fcfb. Revert ownership changes as a coordinated repository change if needed; never edit the migration history or restore a live database to undo a source relocation. Preserve unrelated uncommitted work. Publish destination before completing source removal; both repository changes form one handover.
