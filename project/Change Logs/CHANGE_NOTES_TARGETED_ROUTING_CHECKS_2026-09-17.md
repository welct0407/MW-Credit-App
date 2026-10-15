# Reuse notification and companion-link checks — 17 September 2026

Status: documentation updated; no live apps, links, recipients, bots or databases inspected or changed. Owner requested removal of routine notification/link validation from every development and production-promotion task because setup/refresh already covers it.

## Change

Updated AGENTS.md Sections 2, 6.1 and 6.3 to reuse established setup/refresh configuration and evidence for unchanged notification routes and same-environment companion links. Removed unconditional promotion link checks and the instruction to repeat DEV preparation for each development task. No fresh evidence or exception is needed merely because a new task/release/version starts.

Full setup/copy/refresh/replacement/restore checks remain. Outside those operations, only a changed recipient/link expression, app ID, routing dependency/called task or concrete routing issue triggers a check of the affected path. Unrelated fields, views, formulas or schedule-only changes do not trigger recipient/link audits. Changed routes still receive exact delta capture and validation; owner-only DEV delivery and DEV↔DEV / PROD↔PROD links remain required.

Aligned the preparation checklist's applicability and the refresh runbook's baseline-reuse instructions. Preserved refresh validation itself, target identity checks, zero-warning checks, rollback/version requirements, Flyway rules and production authorization.

## Checks and scope

Reviewed ordinary development, unrelated promotion, schedule-only edits, new/changed routes, known routing problems and refresh scenarios for consistent check triggers. Scoped diff and whitespace checks passed. No live test is applicable to this documentation task; no previous routing result is claimed freshly verified. Concurrent R005 files and existing release statuses are unchanged by this task.

Files: `AGENTS.md`, `Documents/Development_Environment_Preparation.md`, `Documents/Development_Refresh_Runbook.md` and this log. No product release number allocated. Changes are committed/pushed under standing authorization; the completion response records publication.

## Rollback

Pre-task Git point: `5b5c8841ffbfe8cb71b664cff57c2d6e4a8cbc29`. Reverse only this documentation diff with a new commit, preserve unrelated/later changes, and record the reversal here. No live configuration rollback is applicable.
