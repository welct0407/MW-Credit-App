# Drive scope and repository size — 2026-09-10

Owner reported excluding C:\GitHub from Google Drive because scanning consumed too much CPU and manually deleting the unrecoverable collection snapshots. This task measured local files and updated recovery documentation; it did not change Drive settings, delete staging files, alter Git history, or modify AppSheet/Looker objects.

Measured C:\GitHub file content: 1,774,350,322 bytes (1.65 GiB), before these small documentation edits. AppSheet-Loan-Project: 229,325,524 bytes (218.70 MiB), including 141.59 MiB of .git. MW-AI-Collection: 699,275,518 bytes (666.88 MiB), including 665.12 MiB of .git. The sibling .tmp.driveupload folder contains 845,749,280 bytes (806.57 MiB) across 100 files. Directory traversal did not follow the shared root node_modules junction. These are logical file sizes, not allocated disk blocks or GitHub-hosted repository sizes.

Updated AGENTS.md and scripts/README.md: GitHub is the recovery path for committed/pushed AppSheet project files; uncommitted files no longer have assumed Drive coverage. The separate collection database backup destination G:\My Drive\MW-AI-Collection-Backups remains present and is outside C:\GitHub.

Rollback point: 66ea0b31d9647ea860172b7dc5622a5ea4f82c4d; prior working tree was clean. Restore only this task's documentation edits after checking later changes. App/report backups and data-model updates are not applicable. No commit/push performed in this task.

Checks: non-following size inventory, Git status in both repositories, absence of collection legacy snapshot directory, and presence of separate mounted Drive backup destination. Drive exclusion is owner-reported; its settings and server-side synchronization were not independently verified. The .tmp.driveupload folder was not classified as safe to delete or removed. Owner should verify the separate daily database backup remains visible on Drive and commit/push project work requiring recovery coverage.
