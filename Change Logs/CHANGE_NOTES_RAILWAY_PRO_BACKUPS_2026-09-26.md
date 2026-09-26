# Railway Pro and automated backups — 26 September 2026

Owner authorized upgrading to Pro and configuring backups. Starting Git commit: bb97328bd865bda346638ddea180a251daba3688. Existing unrelated untracked work preserved.

## Changes and verification

- Upgraded the existing Gmail-owned Railway workspace to Pro through the $20 immediate-charge confirmation using its existing payment method. Reloaded Plans verified "You're on the Pro Plan", including $20 monthly usage credits.
- Target: MW Credit Metabase project c8e57452-36dc-41f1-8d00-856b521a96c7, production environment df3ba125-0d62-446a-b4d8-5196780982c9, Postgres service 6ba627ff-bc6d-41e7-8182-6c0f1fb03998 and volume efc35075-261e-4d4f-b91f-f10ff0c06228.
- Enabled daily (24 hours / 6 days retention), weekly (7 days / 27 days retention), and monthly (30 days / 89 days retention) volume snapshots. Reopened schedule editor and verified all three selections persisted. Railway controls execution time; the UI showed next backup in 12 hours.
- Created an initial manual backup. Railway listed 2026-09-26 12:40 (local Bangkok), 275 MB, with Restore available. No restore drill performed.
- PITR remains off; this batch configures scheduled volume snapshots, not continuous WAL recovery. Both services displayed Online. No restore or service redeployment was initiated.

## Scope and recovery

The backed-up PostgreSQL volume contains the Metabase application database: dashboards, questions, models, users, permissions and saved application settings. It excludes Cloud SQL business data, Railway environment variables/encryption key, and the external Debian chart service. Existing private recovery credentials must be retained separately. Backup storage incurs metered usage.

Previous state: Hobby plan, no volume backup schedule, no backups, PITR off. Schedule settings are reversible in Backups; a future plan downgrade is a separate owner decision. Do not remove the new backup as routine rollback. No business schema or dashboard definition changed.

Evidence: [saved schedule screenshot](../outputs/railway-backups-20260926/backup-schedules.png). Environment inventory updated. Status: configuration complete; first backup available. First scheduled execution and restore drill have not yet been tested.
