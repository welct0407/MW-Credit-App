# AppSheet PostgreSQL connector proof of concept

14 September 2026. Test-only app **SQL Sync POC TEST 20260914**, ID `374d4905-1439-41ff-8257-e952beb8f3ee`, final version **1.000008**. Initial rollback version 1.000003; before adding the Ref relationship, 1.000007. Production unchanged. Owner acceptance pending.

## Result

**Passed the synchronous three-table propagation proof with full sync.** Updating a source row through the new AppSheet desktop GUI updated a second table and inserted into a third via a PostgreSQL trigger. After the originating successful sync, both downstream changes appeared without another manual sync. The restricted SQL login worked with source-column-only update grants.

This establishes connector feasibility for the tested pattern. It does not yet establish loan-app performance gains, complete loan correctness, concurrent receipt handling, offline behavior or acceptance of a production migration.

## Configuration and method

Cloud SQL `appsheet-pg-test-20260914`, database `appsheet_sync_poc`, PostgreSQL 18.6 micro instance in Singapore. AppSheet datasource `database-1` (30882513), SSL Require. Restricted login `appsheet_poc` reads the three synthetic tables and updates only source input/revision. The SQL SECURITY DEFINER trigger writes downstream in the same transaction. Exact schema and access scripts are in `scripts/cloud-sql-poc-*.sql`.

App source updates only; downstream tables read-only. Cache, delta sync, quick sync and delayed sync OFF; automatic updates ON; sync on start OFF. New desktop design ON. UI-only AppSheet tests, no AppSheet API or legacy Table Data / bot Test page. App versions 1.000007 and 1.000008 captured from the rendered app documentation. Version 1.000008 adds `poc_events[source_id]` Ref to `poc_source[id]`, `IsAPartOf=false`, and generated `Related poc_events = REF_ROWS("poc_events", "source_id")`.

## Executed tests

| Test | Observed result | Outcome |
| --- | --- | --- |
| Initial state | SYNC-001 input/revision 0/0; projection 0/0; no events | Baseline verified |
| First save: input 10, revision 1 | Source 10/1, projection 20/1, event SYNC-001-1 with 10/20 after originating sync | Pass |
| Save unchanged 10/1 | One event remains | Pass at UI level; AppSheet may omit an unchanged SQL UPDATE |
| Second save: 7/2 | Projection 14/2 and second event appear without extra sync | Pass |
| Deliberate failure: -1/3 | AppSheet reports SQL P0001 rejection. SQL readback remains source 7/2, projection 14/2, two events | Atomic rollback passed |
| Client failure handling | Optimistic -1/3 remains as one unsynced change; error visible | Important client behavior, not server corruption |
| Discard rejected synthetic change | New-GUI pending-change manager discards that single failed change; sync restores 7/2 | Recovery passed |
| Valid recovery: 11/3 | Projection 22/3 and third event appear after originating sync | Pass |
| Uppercase UUID-shaped key: 13/1 | Exact uppercase source and downstream key strings retained; projection 26, matching event | Pass |
| Mixed-case UUID-shaped key: 17/1 | Exact mixed-case source and downstream key strings retained; projection 34, matching event | Pass |
| Parent reference navigation, both case fixtures | Event source_id link opens the correct parent with expected input/revision | Pass at 1.000008 |
| Reverse related records, both fixtures | Correct parent displays exactly its one related event | Pass at 1.000008 |
| Final SQL readback | Three source/projection pairs all projection_matches=true; five expected events | Pass |

Prior transactional SQL tests also passed unchanged-update idempotence, revision conflict, recovery and restricted-write denials. Those engine tests rolled back their fixtures. The UI tests above retained their final synthetic records; do not rerun the original zero-baseline engine script without preparing a separate suitable fixture. See ENGINE_TEST_RESULTS.md for the earlier results.

## UUID case handling

Existing AppSheet identifiers will remain **text/varchar with exact original case** in the loan migration. All referencing values must use the same preserved strings. No `LOWER`, `UPPER`, trimming, UUID casts or regenerated IDs in the migration path.

PostgreSQL accepts uppercase UUID input but its native `uuid` output uses the standard lowercase form. This loses the original textual representation. Preserving strings avoids that conversion and also accommodates existing non-UUID keys. [PostgreSQL UUID documentation](https://www.postgresql.org/docs/current/datatype-uuid.html), checked 14 September 2026.

Test fixtures and final database values:

| Exact source ID | Input | Revision | Projection | Event count |
| --- | ---: | ---: | ---: | ---: |
| A1B2C3D4-1111-4222-8333-ABCDEF123456 | 13 | 1 | 26 | 1 |
| b2C3d4E5-2222-4333-8444-aBcDeF234567 | 17 | 1 | 34 | 1 |
| SYNC-001 | 11 | 3 | 22 | 3 |

The exact-case SQL foreign keys, AppSheet forward Ref and reverse related rows worked for both UUID-shaped fixtures. This does not test two keys differing **only** in case or certify every AppSheet comparison operator. Before bulk migration, compare every key and Ref exactly, check duplicates, case-fold collisions and orphans, and verify newly created references plus existing navigation. Any collision must be investigated without silently normalizing it.

## Timing interpretation

Single observed UI Save-to-sync-completion samples: second save **2.337 s**, recovery **2.516 s**, mixed-case save **2.419 s**. Browser automation observation overhead is included; these are synthetic connector observations, not a controlled workload benchmark. The first-save timing included inter-call delay and is excluded. SQL final readback was 16.8 ms, not write latency.

**No quantified improvement against the loan app is claimed.** Its 18–19 second receipt workflow performs different work on different data. A storage-only comparison and then a separate SQL business-logic experiment are still needed. The tiny micro instance is a connectivity baseline, not validated target sizing.

## Limitations and next stages

1. Create another isolated loan copy after recording current OLTP/OLAP versions and dependencies. Preserve original formulas for the storage-only comparison; isolate live notifications and scheduled bots.
2. Map all tables, data types, keys/Refs, defaults, file references, SQL permissions, slices and app-specific behavior. Reconcile exact strings and financial totals before workflow tests. All consumers of any migrated shared test table need reconciliation; OLAP retains partner ownership.
3. Repeat interleaved control/SQL runs with identical fixtures and correctness checks. Report medians, ranges and sample counts. Test SQL receipt processing separately if storage-only gains are insufficient.
4. Cover all six allocation methods, partial/full/overpayments, retry, reversal behavior, concurrent edits, interrupted sync and stale client state. The synthetic revision guard is a POC mechanism, not an implemented loan concurrency design.
5. Produce the production cutover plan with backups, write pause, reconciliation, two-app switch, acceptance and rollback including any post-cutover writes. No production cutover is authorized here.

## Owner review and rollback

Review the new app: open both case fixtures and their related events; change a synthetic source value with revision incremented by one and verify downstream results after sync. A negative value intentionally fails; inspect the error and recover the single test change. Review whether that pending-change behavior is acceptable for the eventual loan UI.

Restore app version 1.000007 to remove the added Ref/reverse view; 1.000003 is the initial app rollback point. App restoration does not undo SQL records or DDL. Disconnect the POC through `ALTER ROLE appsheet_poc NOLOGIN` if needed; removing shared account datasource/network entries requires checking their then-current consumers. No data destruction performed. OLTP, OLAP and Looker were unaffected and were not re-tested by this standalone POC.

Evidence: `ui-test-evidence.json` (26 redacted observations), both app-config snapshots, case-fixtures SQL, schema/access/readback scripts. Canonical model overview and dictionary's separate **SQL Sync POC** sheet record the final test inventory. No secret values are stored in this report or repository.
