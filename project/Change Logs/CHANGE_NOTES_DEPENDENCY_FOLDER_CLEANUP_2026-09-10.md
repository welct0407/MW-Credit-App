# Existing dependency cleanup — 2026-09-10

## Scope and authorization

Owner explicitly authorized step 4: delete existing node_modules folders under outputs/ in AppSheet-Loan-Project and report the size saving. Preserve the root node_modules junction and its external shared runtime. The previous instruction to skip backup remains in effect; Google Drive backup is owner-managed. No new backup, AppSheet/Looker configuration, collection runtime, financial record or source reference change is included.

## Rollback point

Repository HEAD before cleanup: 2814b2619f0df648979e321ac2ae7ef8ff1761f0. Dependencies had already been untracked, but historical commit faddade8999cadd67c521900f1b7c87bcd61f810 retains their previously tracked contents. The external runtime provides artifact-tool 2.8.59 and remains untouched. Historical Git content may not capture any previously untracked dependency files; exact restoration of those would require the owner's existing Drive backup, whose completion is not verified here. No additional archive is created.

## Implementation and verification

Inventory completed: 10 real node_modules directories beneath outputs/, containing 77,960 files totaling 3,373,552,180 bytes (3.14 GiB). No reparse points were found within the scanned output tree. Recorded SHA-256 hashes for 301 other output files totaling 79,690,396 bytes.

Deletion was NOT executed: automatic approval review rejected the native PowerShell recursive deletion command with "blocked by policy" and provided no more specific reason. No bypass was attempted. Actual space saving is zero. The root shared dependency junction is unchanged. Cleanup and post-deletion checks remain pending; this documentation change is local and not committed or pushed.

Subsequent owner completion: the owner manually deleted the ten folders and reported the reduced size. Read-only verification confirmed no node_modules folders or reparse points remain beneath outputs/. All 301 other output files match their pre-cleanup SHA-256 hashes. Their total size is 79,690,396 bytes (76.00 MiB). Removed logical file content totals 3,373,552,180 bytes (3.14 GiB); physical free-space change and Drive quota change were not measured. The root shared junction remains intact, and artifact-tool import plus in-memory workbook creation from an old output folder passed. Cleanup is complete; this log remains local, not committed or pushed. The owner is considering restoring outputs/ to Git tracking; ignore rules have not been changed in response to that proposal.

## Downstream effects and acceptance

Historical output scripts will resolve JavaScript imports from the shared repository-root junction after their local installations are removed. This does not establish that every historical script is compatible or safe to replay. Only read-only dependency checks are permitted during cleanup. No data-model overview or workbook change is required.

Owner should confirm the existing Drive backup remains healthy. Deletions may propagate through the owner's configured Drive sync; this task does not claim any cloud quota saving. Git history is unchanged and does not shrink.

## Recovery

Normally rerun scripts/setup-dependencies.ps1 to reconnect the shared runtime after recovery. To recover a particular old dependency installation, extract only its exact outputs/.../node_modules subtree from historical commit faddade to a separate staging directory, inspect it, and copy it back only if needed. Do not check out all old outputs over current documents and do not delete or alter the shared external runtime.

Final follow-up: owner authorized restoring outputs to Git with dependency/cache exclusions and committing/pushing the repository. This completed cleanup log is included in that publication; see CHANGE_NOTES_RESTORE_OUTPUT_TRACKING_2026-09-10.md for the current policy and verification.
