# Cloud SQL PostgreSQL proof of concept

Status: configuration prepared, awaiting owner credential entry and instance creation, 14 September 2026. No SQL instance or AppSheet SQL connection created yet. Production migration is planning only.

## Authorized sequence

1. Provision an isolated Google Cloud SQL PostgreSQL test instance.
2. Use a new AppSheet test app to update one source record. A synchronous PostgreSQL trigger updates a second table and inserts a third. Verify all three after the originating sync without manually requesting another sync.
3. After connector correctness passes, make another isolated loan-app/database copy, migrate to SQL and reconcile the app configuration and workflows.
4. Compare storage-only performance first; evaluate SQL-side receipt processing separately.
5. Prepare a production migration and rollback plan for owner review, without production cutover.

## Environment discovery

Google Cloud project selected in the authenticated console: My First Project, `clever-oasis-508610-n7`. Cloud console showed an active free trial with 90 days remaining. No existing instance was shown; the initial onboarding screen offered instance creation. Compute Engine API and Cloud SQL Admin API enablement completed sufficiently to unlock the creation form.

Prepared, not submitted: instance `appsheet-pg-test-20260914`, Enterprise edition, PostgreSQL 18, Singapore asia-southeast1, single zone, db-f1-micro shared core (0.614 GB), 10 GB SSD with automatic growth, automated backups and PITR, deletion protection, SSL-only, public IP with an empty authorized-network list, Data API off. Query Insights is disabled for this machine selection. Console summary estimates $0.02/hour rounded for compute/storage, approximately $14.60 per 730 hours in the displayed currency; backup and traffic are additional, and currency was not independently verified. This is a small connectivity POC size, not certified sizing for loan performance tests. Password remains blank for owner entry; creation not clicked. No paid-account activation requested.

Draft executable schema is scripts/cloud-sql-poc-schema.sql. It has not been executed or validated by a PostgreSQL engine. It uses three separate public-schema tables, a synchronous AFTER UPDATE trigger and explicit revision/event uniqueness. An intentional exception occurs after both downstream writes to test rollback. Initial seed writes occur before trigger installation. Before execution, verify the target database is dedicated and empty, then configure a scoped app role separately.

AppSheet remains UI-only for app testing, using the current editor/client. Cloud SQL service API enablement is infrastructure setup, not enabling the previously declined AppSheet app API. No production AppSheet version is changed in this preparation.

## Proposed synthetic schema and acceptance tests

New objects, not claims about an existing schema:

- `poc_source`: stable text key, input value and requested revision. One synthetic row starts at revision 0.
- `poc_projection`: same stable key, last applied revision and derived value. Seeded before testing, then updated by the source trigger.
- `poc_events`: one record per source/revision, recording the applied value; a unique key prevents duplicate revision events.

Source updates require revision to advance exactly one step when input changes. A duplicate save of the same revision/value has no new effects. A stale or conflicting revision fails. The trigger updates the projection and inserts an event within the source transaction. A deliberately invalid value raises an exception to verify complete rollback. AppSheet may edit only the source; projection/events are read-only app tables. No bots are used for propagation.

Record initial and final values in all three tables for each test: successful update, repeat unchanged save, second revision, rejected invalid update, and recovery. Distinguish immediate optimistic client state, state after the originating sync, and state after an additional manual sync if one becomes necessary. A second sync needed for correctness is a failed same-sync result, not a pass. Test configured cache/sync settings explicitly; do not infer behavior from PostgreSQL commit alone.

## Migration and benchmark controls

Before migrating loan tables, record current OLTP/OLAP versions and shared-table consumers. Preserve source keys, references, types, defaults, permissions, slice memberships and formulas. Keep notification/scheduled bots isolated. Partner management remains OLAP-owned. Check direct reporting/export dependencies without expanding into an unrelated report audit.

Use separate control and SQL copies with the same synthetic fixture, equivalent configuration and unchanged business logic for the storage comparison. Measure Save-to-visible-Posted and normal sync latency with repeated interleaved runs; report median, range and slow cases. Then test SQL receipt processing as a separate candidate, including all six allocation methods, ordering, exact/partial balances, rejected input, duplicate/retry, concurrent same-borrower requests and rollback. Do not treat database query duration as end-to-end app latency.

Production planning will include app acceptance, data reconciliation, a controlled write pause, final data copy, connection switch for both apps, verification, and a rollback procedure that accounts for any new SQL-side writes. A simple connection switch back is insufficient after new production writes. Cutover requires separate owner approval.

## Credentials, documentation and recovery

Credentials belong outside Git under `C:\Users\MWCredit\Documents\ChatGPT`, never in this output directory. Cloud charges/access settings must be concrete and reviewed before consequential provisioning. No public unrestricted database access is proposed. Persist exact nonsecret settings and evidence as they become available. Update model overview/dictionary when the test app schema is implemented. No live test results are claimed at this stage.
