# VM-01 ideaadmin profile cleanup — 11 October 2026

## Scope and authorization

The owner initially requested preparation to retire the MWCredit Windows profile, then directed that ideaadmin disk cleanup come first and explicitly confirmed that all tests were complete and their temporary folders should be removed. MWCredit migration is deferred; its files were not changed.

Starting AppSheet-Loan-Project commit: `4cbf6d8038cc20f21a11e4d6a2bf70cec6543018`, branch `codex/pwa-rebuild-design`. Existing unrelated modified/untracked files were preserved. This is local maintenance, with no product release or live environment change.

## Changes

- Added `scripts/maintenance/Clear-IdeaadminTestArtifacts.ps1`, restricted to explicit disposable-test naming patterns directly beneath ideaadmin's Temp and AppSheetLoanTools directories. It rejects running PostgreSQL, skips process-referenced folders, validates absolute parents, refuses reparse points throughout each target, and verifies deletion. Without `-Apply` it only inspects/plans.
- Removed owner-authorized disposable PWA database rehearsal, collection-test, migration-test and temporary UI/browser test folders, including synthetic diagnostics. Their identity was checked against MW-Credit-App test runners. Source tests and published test evidence remain intact.
- Removed the regenerable npm `_cacache` download cache (approximately 0.812 GiB).
- Removed 20 leftover `terraform-provider<digits>` temporary downloads totaling 845,802,101 bytes after confirming Terraform was not running.
- Preserved installed Node/Python/PostgreSQL/Flyway tools, private restores/backups, credentials, browser sign-ins, Codex chats/worktrees and project source. Unclassified temporary files and handoffs were retained.

## Verification and recovery

- Windows process inspection found no running PostgreSQL before test-folder removal. Stale PID files alone were not treated as live servers.
- Cleanup script parsed without errors; bundled Node reported v24.19.0 and PostgreSQL client reported 18.6 after cleanup began.
- Deleted synthetic clusters/caches have no backup by design: recreate them using the applicable test runner or package download. No production data or recovery backup was removed.
- Cleanup completed successfully: **299 disposable test folders removed, zero skipped**. C: free space rose from **5.977 GiB to 23.724 GiB**, approximately **17.75 GiB reclaimed** across the test-folder and cache/download cleanup. Disk free space is a live measurement and may change with other activity.
- Repository publication contains only the scoped cleanup helper and this sanitized log; unrelated existing work is excluded.

## Deferred MWCredit retirement

Read-only inspection found the AppSheet repository's `node_modules` junction still targets MWCredit's bundled runtime, and maintained database tooling contains MWCredit credential-path references. MWCredit also retains private project/recovery material and disabled legacy Windows worker tasks. Windows reported that profile unloaded. These findings do **not** establish deletion readiness: migrate and verify dependencies/recovery and reconcile tasks before deleting the profile. Current cleanup does not claim to complete that separate work.

## Follow-up: independent ideaadmin development

Starting commit `6ea7b7375e6b7a3a9573a34d4a3568f66a358136`. The owner resumed dependency migration, then explicitly changed the outcome: retain no copied MWCredit profile/archive material; make ideaadmin work independently. The owner confirmed OneDrive is synced and accessible elsewhere. This later scope supersedes the proposed archive/migration approach above.

### Final changes

- Repointed the repository's shared `node_modules` junction to ideaadmin's bundled dependencies. Updated the bundle record to 26.1009.11318 / artifact-tool 2.8.91 after successful module import and in-memory workbook creation; setup helper readback passes.
- Changed 286 maintained source/configuration/current-instruction files across AppSheet-Loan-Project (184), MW-Credit-App (91), MW-AI-Collection (1), MW-Integration-Agent (4), and MW-Partner-Operations (6) from the old Windows profile path to ideaadmin. Historical outputs, archives, reference scripts and immutable SQL migrations were excluded. Existing changes to PartnersTab.mjs remain unstaged; only the profile substitution is staged for this task.
- Repointed two existing local `.venv/pyvenv.cfg` files to ideaadmin's identical Python 3.12.14 runtime; both interpreters execute successfully. Freshly installed documented `psycopg[binary]==3.2.9` under ideaadmin's AppSheetLoanTools/python-deps; the copied package tree was removed first.
- Removed nine old-profile/retired Windows scheduled-task registrations, including the three already-disabled legacy partner tasks. No worker was started; no service/production runtime was changed. Final old-profile task count and inspected current-user/system startup-path reference count are zero.
- Removed all six copied private-project subdirectories, the incomplete profile-state archive and its task exports, and all four copied SSH files. Empty copy roots were removed. Neither current Codex history nor sign-ins were replaced. The original MWCredit profile remains.
- Returned seven temporarily relocated Git worktrees to their original MWCredit locations when the owner declined preservation. Two contain local changes; these remain solely with the original profile, not in an ideaadmin archive. They are dormant worktrees, not the current checkout's runtime. Deleting the old profile will lose that local-only material unless the owner separately preserves it; stale registrations can then be pruned.

### Verification and limits

- 285 maintained files checked: zero remaining old-profile paths; path-only comparison passed apart from the separately documented bundle README update. All 91 changed PowerShell files parsed, and changed Python/JSON files passed compile/parse checks.
- Existing ideaadmin Google Cloud and Azure CLI sign-in identities were verified; machine-installed Azure, Google Cloud, Tailscale, draw.io and the repository's Cloudflare binary do not depend on the old profile. Git publication is checked below.
- No credential or SSH-key migration remains. Helpers requiring old private database/API credentials deliberately have no populated replacement secret files; they need fresh credential setup before live use. Local source/tooling verification is not a claim of live administrative access parity. No financial writes, notification tests, deployments or credential rotations were performed.
- The old DEV Terraform `dev.activation.tfvars` exists only in MWCredit and was not retained under ideaadmin. Added a fail-closed check to MW-Credit-App's DEV plan wrapper, verified to stop before authentication/Terraform when that file is absent. Re-establish the approved activation configuration before infrastructure planning; silently omitting it could produce an incorrect desired state. Terraform cloud state itself is not moved or changed.
- Codex history was not imported. Official documentation identifies local transcripts under CODEX_HOME, but this task found no documented cross-profile history-merge procedure. The owner explicitly declined retaining the proposed archive.
- The first canonical disposable database CI run failed its two-second interest-reallocation contention assertion while copy/hash/archive I/O was active. Its threshold was unchanged; the retry after that I/O stopped passed the canonical database CI.
- Automatic approval initially rejected broad copied-directory cleanup and then content-match-only cleanup because provenance was not established by those checks. The owner renewed authorization; the explicitly session-created destinations were removed and absence verified. No requested cleanup remains blocked by that review.

Task-local source before-images and test logs are in `C:\Users\ideaadmin\Documents\ideaadmin-independent-20261011`; these are current-repository maintenance records, not copied MWCredit profile data. Source rollback uses Git or those before-images. No backup of removed profile copies is retained by owner request. The old profile itself was not deleted.

### Closure scope revised by owner

The owner deferred all remaining tool validation until after deleting MWCredit. PWA TypeScript/Vite build and isolated Chromium/Chrome/Edge launch checks already passed. Azure controller TypeScript check found its local tsc dependency absent; install its locked npm dependencies and recheck later. This does not establish full tool/workflow validation.

Added Set-IdeaadminToolPath.ps1 and applied nine existing tool directories to ideaadmin's user PATH with private rollback/readback. New terminals may be needed. Updated the remaining current Terraform private-path instruction in MW-Credit-App docs/Development.md while preserving its unrelated edits. Extended the disposable-test cleanup helper to the current PWA database-tools root. All old credentials/SSH keys/activation configuration remain uncopied by owner instruction; fresh setup is required for those operations. Actual profile deletion remains the owner's next step.

Final cleanup removed 36 disposable test folders, zero skipped; C: free space measured 24.519 GiB. The original MWCredit profile was not deleted.
