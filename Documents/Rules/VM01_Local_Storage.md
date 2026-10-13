# VM-01 local storage and task cleanup

Owner rule, 11 October 2026. Applies to Windows development work under ideaadmin. The owner has removed MWCredit; the subsequently requested [tool validation](../../Change%20Logs/CHANGE_NOTES_VM01_TOOL_VALIDATION_2026-10-11.md) records passing checks and remaining private-configuration limits. This policy changes task closeout, not production retention or service operation.

## Storage by purpose

| Material | Location and lifecycle |
| --- | --- |
| Useful scripts, source, manifests and instructions | Owning repository under `C:\GitHub`; commit/push intended changes and verify the upstream commit. Do not leave a second working collection in Documents or Downloads. |
| Concise sanitized evidence and final deliverables | Owning repository `outputs/<task>/` and its change log. Keep representative final evidence and meaningful failure findings; remove task-owned intermediate renders, duplicate exports and verbose raw logs after extracting the findings. Preserve referenced published evidence. |
| Disposable task scratch | Prefer one uniquely named `outputs/.tmp/<task>/` directory for nonsecret scratch. Existing test runners may use their established Temp/tool-root directories; record their exact paths for closeout. Never mix temporary synthetic databases with private restores. |
| Installed dependencies and browsers | Reuse the documented tool installation, lockfile and shared bundle. The project-management repository uses its one root dependency junction; PWA uses its own lockfile installation. No output-local installs, repeated full runtime copies or unbounded per-task environments. Keep the active version; retire an old version only after consumers are updated and replacement validation succeeds. |
| Private credentials, activation configuration and recovery material | Outside Git in `C:\Users\ideaadmin\Documents\ChatGPT/<project>/` or the owning runbook's established location. These are not disposable because scripts are on GitHub. Recovery/production retention rules take precedence. Never upload secrets as evidence. |
| Application-managed sign-ins, browser profiles, Codex chats/plugins/runtime | Leave in the application's managed location. Do not recursively wipe `.codex`, `.cache`, AppData or browser data. Use supported maintenance only after identifying a concrete growth source; no automatic deletion of chat history/worktrees. |

## Required completion steps

1. During work, record the exact task-owned scratch/download/cluster paths and any helper processes. Reuse dependencies; avoid reinstalling merely to check availability. New or changed temporary-work producers should use `finally`/equivalent to stop owned processes and remove their successful scratch output. Preserve failure evidence deliberately, not by retaining every successful run.
2. Before cleanup, save concise results and useful scripts, check the intended Git diff, publish authorized source/evidence and verify the remote commit. Preserve uncommitted work and any before-image containing changes not recoverable from Git. A pushed script is not a backup of generated data, credentials or private configuration.
3. Stop only this task's helpers. Remove its disposable databases, isolated test-browser profiles, downloaded installers/archives after successful installation, intermediate renders and redundant source before-images. Resolve each absolute target; verify its allowed parent and ownership; reject reparse points in the target/ancestors/descendants. Never traverse the root dependency junction or use a broad profile/Temp wipe.
4. Existing Windows migration tests currently stop PostgreSQL but retain their `migration-test-<guid>` directory for diagnosis. Closeout must remove the completed task's recorded directories using the maintained cleanup helper below. No database-runner behavior was changed by this policy. Apply the same ownership check to rehearsal and UI scratch directories.
5. If diagnosis still needs local files, record exact path, purpose, owner/task, approximate size and a review date within seven days in the continuation note. At the next task closeout, review overdue entries and delete only after diagnosis/evidence needs are resolved. Dates prompt review; they never authorize blind deletion of active work or recovery data. If cleanup is blocked by a running process/lock or uncertain ownership, record it as pending rather than silently carrying files forever.
6. Record cleanup count, retained exceptions and C: free space in the task log. Add this evidence to the same coherent publication. Final task delivery includes cleanup status. Ordinary version/build/tool checks remain proportional to the change; this policy does not require rerunning all development tests.

## Existing test cleanup helper

From AppSheet-Loan-Project:

```powershell
# Read-only inventory; reports exact eligible paths.
./scripts/maintenance/Clear-IdeaadminTestArtifacts.ps1
# After this task's tests and owned processes finish, use exact paths from its run.
./scripts/maintenance/Clear-IdeaadminTestArtifacts.ps1 -TargetPaths @('<absolute-task-directory>') -Apply
```

Only documented synthetic-test name patterns directly inside ideaadmin Temp, AppSheetLoanTools or MWCredit/database-tools are eligible. The latter is a tool folder under ideaadmin, not the deleted user profile. The helper refuses any running PostgreSQL and skips process-referenced or linked trees. A broad `-AllCompletedTests -Apply` requires explicit confirmation that all eligible test jobs are complete; ordinary closeout always selects exact task paths. Files outside the allowlist need separately reviewed task-scoped cleanup.

## Growth checks without a background cleaner

Check free space before a large download/build/database rehearsal and at task closeout. If C: has less than 15 GiB free, or the job would cross that floor, first reclaim completed scratch or plan sufficient space; do not start another large batch blindly. If more than 1 GiB of scratch remains for a completed task, explain and resolve it or record the dated retention exception. These are workflow review thresholds, not quotas or permission to delete protected data.

Keep package caches bounded through the package manager when their measured growth warrants it; avoid repeatedly clearing useful caches after every command. Do not download duplicate browser/tool versions for every task. Review installed duplicates only after the owner's final tool validation establishes which paths are required. Local logs needed beyond one task require rotation/size limits in the owning producer. No scheduled cleaner, new monitoring service or blanket retention timer is enabled.
