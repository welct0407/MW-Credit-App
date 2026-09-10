# Automatic repository publication — 2026-09-10

Owner requested commit/push of pending work and a standing rule in both projects. AGENTS.md now requires normal commit/push after each completed task or authorized development/maintenance run that changes repository files, following checks and documentation. Read-only tasks, ignored runtime updates and borrower/reviewer operational events do not trigger commits. Secrets and excluded data remain excluded; unrelated work is preserved. This does not grant deployment or runtime-service authority.

This publication also includes the previously documented credential-storage rule and pending repository/backup documentation. It includes the owner-reported Drive exclusion and the repository-size report. No AppSheet, Looker or data-model objects change.

Rollback point: 66ea0b31d9647ea860172b7dc5622a5ea4f82c4d, plus the already documented pending changes. Revert the resulting commits selectively to undo this publication; do not reset over newer work. Restoring deleted backup scripts must not recreate a schedule without an owner request.

Validation: review staged paths/diffs and Git whitespace checks before publication; verify remote branch matches local HEAD after pushing. The cleanup's three retained database-recovery tests previously passed using temporary databases. No live operations or deployment are performed. Manual follow-up remains verification of owner-managed Azure coverage and restore capability; no manual application testing is required for this Git policy.

Status: implementation complete; publication verification pending below.
