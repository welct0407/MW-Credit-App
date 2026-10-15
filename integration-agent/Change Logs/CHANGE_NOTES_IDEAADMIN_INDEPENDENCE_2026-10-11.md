# ideaadmin independent development — 11 October 2026

Owner scope: remove Windows development dependencies on the MWCredit profile. The owner subsequently declined all copied old-profile data/history and requested cleanup of those copies. This changes local development paths only; no live runtime deployment or activation is authorized or performed.

Starting commit: `c98724e6cc21bf4f49e766e4b2ee9c923eba4dd2`. Updated 4 maintained files by substituting the Windows profile path with ideaadmin. SQL migrations, historical evidence and unrelated work are unchanged. No credential values are committed or migrated. Existing credentials available only in MWCredit require fresh setup before the affected live helpers can be used.

Changed files:
- `scripts/backup-agent-database.py`
- `scripts/configure-reviewer-dml.py`
- `scripts/provision-agent-database.py`
- `scripts/verify-reviewer-dml-restored.ps1`

Verification: source-before comparison confirmed path substitutions only; applicable PowerShell/Python/JSON syntax checks passed. Overall VM checks, runtime/dependency details and final database CI status are recorded in AppSheet-Loan-Project `Change Logs/CHANGE_NOTES_VM01_PROFILE_CLEANUP_2026-10-11.md`. Rollback: revert this commit's path changes; current-repository before-images are retained privately in ideaadmin's maintenance folder. The original MWCredit profile remains untouched by deletion. Preserve its retired worker pause; no copied state is activated.
