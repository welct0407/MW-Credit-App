# DEV refresh instructions — 16 September 2026

Status: documentation completed; no refresh, live app/database change, app deletion, notification, script execution or scheduled automation performed. No product release number allocated. Owner requested a future-use runbook for apps-only, database-only or combined refresh, referenced by AGENTS.md.

## Changes

- Added `Documents/Development_Refresh_Runbook.md`, linked from AGENTS.md, the development preparation checklist and document index.
- Defined scope selection, shared-DEV maintenance, preservation/reapplication of unreleased work, compatibility checks, backups and recovery. The prior conversation's logical database refresh is retained; its older blanket DEV freeze does not override current frozen-release governance.
- Database procedure uses a PROD logical dump, DEV database replacement, restored PROD Flyway history, DEV ownership/grants and reviewed pending migrations. It preserves DEV instance/credential configuration and explicitly rejects the schema-only export runner as a full refresh backup. Includes Cloud SQL extension/job review and restore-time ownership flags.
- App procedure copies PROD definitions, rebinds all DEV sources, remaps both companion links, captures/reapplies each current DEV theme, and preserves automation with owner-only notifications. Validated replacements precede deletion of old DEV app definitions; backing data/files are retained. Database-only scope does not delete apps.
- Added validation, cutover, incomplete-state reporting, recovery and documentation requirements without creating a new refresh runner or duplicating the automation inventory.

## Evidence and checks

Read the referenced Parallel Development Promotion conversation, current AGENTS.md, release tracker, environment inventory, preparation checklist, database environment configuration and schema-export implementation. Verified technical guidance against official Cloud SQL and PostgreSQL documentation linked in the runbook. Live identities, theme colors, schedules, backup restorability and compatibility will be verified at execution time; none are claimed verified here.

Reviewed all three modes and the six requested app-refresh steps, local documentation links, whitespace and the scoped diff. No runtime test is applicable to instructions-only work. The next actual refresh must execute and record the runbook checks, including recovery and old-app deletion gates. No existing release status or environment inventory was changed.

## Rollback

Pre-task Git rollback point: `8aee71286b7ecf127cc01c3624ef7dc084aa8f1b`. Revert only this task's documentation additions with a new commit, preserving intervening work, and record the reversal here. No AppSheet/report/database rollback is needed because no live object changed. Commit/push follows standing authorization; publication outcome is reported in the completion message.
