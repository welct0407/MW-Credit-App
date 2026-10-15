# C:\GitHub folder cleanup — 1 October 2026

Completed owner-requested cleanup of obsolete release worktrees. No product release or live service change.

Removed using non-forced `git worktree remove`:

| Folder | Retained commit |
| --- | --- |
| r026-pin | 8a76733761bb666dd96a08aa45282c1cde2c01a6 |
| AppSheet-Loan-R027-Pin | bc85f75f0a2777fd0f77d1915fd4515ce7c984eb |
| r028-pin | ab6c82a1fc4e24ca3c9c9c072a9c3954ab8a529d |
| r029-pin | de0a72a45e64051b5c816c5bce66522c4a33e4ea |
| r036-pin | 4a848fa15bb80b5ccf2fa1ce98f5fa417b89a24c |

Checks: releases were Released or closed in the tracker; all five worktrees had no tracked modifications, untracked or ignored files; non-following traversal found no reparse points; each pin was an ancestor of the recorded origin/master. Absolute targets were verified as direct children of C:\GitHub immediately before removal. Each folder's absence was verified afterward. Removed logical file content totals 1,361,397,475 bytes (about 1.27 GiB); actual allocated space reclaimed was not measured.

Rollback: recreate a detached worktree from the corresponding retained commit. Starting main-repository commit: 7a23d62c4da3886d130bc40fc4fdb187cefcb9c4. Existing main-repository modifications/untracked outputs were preserved and excluded from this maintenance commit.

Retained AppSheet-Loan-Project, MW-AI-Collection, MW-Integration-Agent, MW-Partner-Operations and Daily-Use. Daily-Use is a separate repository whose future use was not established. Retained .tmp.driveupload because its application-managed cache/recovery status was not verified. Worktree registrations outside C:\GitHub were outside cleanup scope and were not pruned.

Status: folder cleanup verified; no live app/database/report changes or manual workflow tests required. This log is the only source-file change.
