# SQL prerequisite results — 14 September 2026

Synthetic appsheet_sync_poc only, PostgreSQL 18.6, observed through Cloud SQL Studio. These establish SQL behavior, not AppSheet same-sync behavior or end-to-end speed.

| Test | Expected and observed | Result |
|---|---|---|
| Installation | Three tables and one function visible; successful DDL | Pass |
| Initial state | Source 0/rev0, projection 0/rev0, zero events | Pass |
| First update | Input10/rev1 produces derived20/rev1 and one event | Pass |
| Identical repeat | No additional event | Pass |
| Negative input | Exception after downstream writes; all three retain previous valid state | Pass |
| Conflicting revision | Changed input without advancing revision rejected | Pass |
| Recovery | Input7/rev2 produces derived14/rev2 and two events | Pass |
| Engine test rollback | Initial zeros/no events restored | Pass |
| Restricted role propagation | Source update triggers both downstream writes | Pass |
| Direct projection update | insufficient_privilege caught | Pass |
| Direct event deletion | insufficient_privilege caught | Pass |
| Source key mutation by restricted role | insufficient_privilege caught | Pass |
| Final readback | SYNC-001 0 0 0 0 0 true; source/projection match, zero events | Pass |

The assertion batch in scripts/cloud-sql-poc-engine-validation.sql returned “Engine preflight assertions passed; rolling test writes back”, with 55.6 ms reported. The role batch in scripts/cloud-sql-poc-access-validation.sql returned “Restricted role assertions passed; rolling test writes back”, with 36.4 ms. Installation reported 53.2 ms; one readback reported 3.0 ms. These single SQL Studio observations have no repeated samples or client/network timing. No performance gain can be calculated from them.

The first permission test could not SET ROLE because managed Cloud SQL postgres is not a superuser. A temporary SET TRUE membership inside the rolled-back transaction enabled actual scoped testing without retaining membership. A separate accidental schema rerun failed on existing poc_source with all statements aborted; installed schema remained intact.

Remaining: password authentication, AppSheet connector UPDATE compatibility, originating-sync visibility, optimistic/stale display handling, rejected-update queue recovery, end-to-end measurements, concurrent requests and migrated loan workflows. No production data exercised.
