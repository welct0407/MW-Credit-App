# Owner-requested DEV refresh

A refresh is exceptional, not part of normal development or promotion. Use the current PWA/API configuration and canonical MW-Credit-App database runners. No AppSheet copies, regeneration, editor checks or application-mode changes.

## Scope and recovery

Confirm whether the request replaces DEV data, deployed code/configuration or both. Preserve unreleased work, fixtures, migration pins and DEV configuration. Check current consumers and schema compatibility. Record a usable private DEV backup before replacement and identify source and destination by the full project/instance/database tuple; the destructive target must be DEV.

Coordinate only the affected shared DEV writers/jobs. Keep PROD writers, frozen packages and other tasks intact. Do not discard unreleased work without authorization.

## Database refresh

1. Quiesce affected DEV writers and delivery jobs. Obtain the authorized private PROD logical backup/restore input through the database procedure; never put personal/financial data in Git.
2. Inspect extensions, owners/grants, settings and copied job metadata. Restore with the maintained reviewed runner/options, preserving business objects and Flyway history. Prevent any restored scheduler, notification or external integration from executing.
3. Reapply DEV identities/grants and selected unreleased immutable migrations in order; inspect the entire pending set. Never baseline, repair, alter checksums or replay old seed scripts to hide drift.
4. Re-establish actual DEV API/storage/recipient boundaries under [preparation](Development_Environment_Preparation.md). Email overrides alone do not protect push or agent channels.
5. Validate history/schema, affected role access and the relevant PWA/API/agent behavior using synthetic test data. Resume only the recorded intended DEV writers/jobs after isolation is verified.

Use MW-Credit-App's database/README.md for exact commands, supported extensions and recovery. Historical pg_cron/AppSheet schedules are not current instructions.

## Code/configuration refresh and closure

Deploy the intended pinned DEV artifact/configuration; preserve DEV URLs, theme/environment indicators, authentication/access, secrets and storage isolation. Reapply retained work deliberately and rerun only evidence invalidated by the refresh.

On failure leave the affected DEV path contained and recover the captured state; do not touch PROD as a workaround. Update the existing log and changed inventory/differences only. Report DEV ready, incomplete or rolled back, including actual owner checks. Refresh does not automatically approve an unreleased feature or grant promotion authority.
