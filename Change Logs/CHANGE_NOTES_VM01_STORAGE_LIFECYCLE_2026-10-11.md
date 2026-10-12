# VM-01 development storage lifecycle — 11 October 2026

## Scope and baseline

The owner reports MWCredit removed and requests a development methodology that cleans disposable files after each completed job. Whole-toolchain validation will be performed by the owner before further development. Starting AppSheet commit: `e741d8de7f4d317773ef5d23187aaa5495ac74fa`; MW-Credit-App: `92bf9d6dcb66f030799174b6d8cc3c0e0ba02d13`. Existing unrelated modified/untracked work is preserved. Governance and maintenance only; no product release, database operation, deployment, app change or scheduled cleaner.

## Findings and changes

- Confirmed the old profile directory is absent. Bounded, read-only traversal skipped reparse points. Measured ideaadmin Temp 0.041 GiB, npm cache below 0.001 GiB, MWCredit tool root 3.518 GiB, AppSheetLoanTools 1.742 GiB, bundled `.cache` 1.299 GiB and application-managed `.codex` 2.507 GiB. These are apparent file sizes, not a complete allocated-disk audit. Installed tools and application state were retained for the owner's validation.
- The canonical migration runner stops PostgreSQL in `finally` but deliberately retains each disposable cluster for diagnosis. Repeated successful tests therefore require explicit closeout cleanup. No database runner was changed or rerun in this task.
- Added `Documents/VM01_Local_Storage.md`, linked from AGENTS, scripts guide and documentation map. Established task-owned scratch, reuse of dependencies, evidence/publication before deletion, seven-day diagnostic review dates, a 15 GiB free-space planning threshold and review of completed-task scratch above 1 GiB. These thresholds trigger review, not blanket deletion. Credentials, recovery material, active work, application state and published evidence remain protected.
- Added the same closeout obligation by reference to MW-Credit-App AGENTS while preserving its existing uncommitted process instructions. Future task completion includes cleanup or an explicit retained exception. New/changed temporary producers should clean their own successful scratch; current runners use the documented closeout helper.
- Hardened `Clear-IdeaadminTestArtifacts.ps1`: applying cleanup now needs exact absolute `-TargetPaths` or explicit `-AllCompletedTests`. Inventory prints eligible paths; absent roots are tolerated; linked ancestors are rejected in addition to existing process/descendant-link guards. Ordinary task closeout must not select unrelated tasks' files.

## Checks, cleanup and exceptions

- PowerShell parsing passed. Synthetic checks passed for preview preservation, rejecting unscoped Apply, rejecting an out-of-scope target, deleting only selected paths, preserving an unselected sibling, and skipping a directory containing a junction. Removed all three synthetic test directories after checking; no fixture remains.
- No existing allowlisted disposable folders were found in the inspected Temp inventory; PostgreSQL was not running. No broad Temp/cache/application-data wipe performed.
- An attempt to delete only migration before-images matching Git recovery blobs was rejected by execution policy before running: `blocked by policy`, without further explanation. No before-images were deleted. Do not claim this attempted cleanup succeeded.
- Retained exception: `C:\Users\ideaadmin\Documents\ideaadmin-independent-20261011`, approximately 0.002 GiB, contains current-repository before-images, PATH rollback and prior validation logs. Owner/task: ideaadmin profile migration. Keep the unpublished PartnersTab before-image until its unrelated changes are safely published; keep relevant rollback/failure diagnostics through final owner tool validation. Review on **18 October 2026**, remove redundant copies after recovery/diagnostic needs are resolved. This is not an MWCredit profile archive.
- Unrelated PWA test-results/output folders remain owned by their existing tasks; no new proof of completion/ownership was inferred from their names. Their owners must apply the new closeout rule.
- Final C: free space measured approximately **68.835 GiB**. Whole-toolchain validation remains deliberately deferred to the owner; this task's focused cleanup-helper checks do not claim development access parity.

## Recovery and publication

Policy/helper rollback is a normal revert of this task's commit. Disposable synthetic fixtures contain no unique data. Current profile installed tools, credentials and application history were not deleted. Publish only the listed policy/helper/docs and this sanitized log; preserve unrelated changes. MW-Credit-App has its corresponding change log and only this task's AGENTS addition staged separately from the pre-existing edits.
