# Production data connectivity — 2026-09-20

## Scope and purpose

Configure the Debian integration VM to authenticate to the production PostgreSQL database and production OLTP AppSheet API. Preserve AppSheet as the operational write boundary: raw SQL access is limited to reads and temporary objects, and AppSheet edits remain disabled until a reviewed mapping exists.

Starting Git commit: `efa0c39a244afb8d92363114ea629fce559550c5`.

## Changes

- Advanced the service catalogue to revision 2 and enabled bounded AppSheet reads plus database connectivity.
- Added a standard-library AppSheet client and `appsheet-probe`, requiring the official endpoint, a configured production app UUID, and a bounded `Top(...)` selector.
- Added configuration validation for AppSheet and database identities, loopback-only SQL transport, and secret paths beneath `/etc/mw-integration-agent/secrets`.
- Added a Debian PostgreSQL client prerequisite and a role setup script for `mw_integration_agent` with SELECT and TEMPORARY privileges only, read-only transactions by default, and a 30-second statement timeout.
- Kept the AppSheet key and database password outside Git.

## Rollback

Set `appsheet_enabled=false` and `database_enabled=false`, remove the two VM secret files, revoke/drop `mw_integration_agent`, and revert with a normal follow-up commit. The connectivity test does not require restoring production data because it creates only a transaction-scoped temporary table and rolls back.

## Checks and status

Ten unit tests pass, including bounded-selector and no-row-output checks. Live AppSheet and PostgreSQL results will be recorded after deployment. No AppSheet edit, durable SQL DML, schema change, financial write, notification, or schedule is authorized by this change.
