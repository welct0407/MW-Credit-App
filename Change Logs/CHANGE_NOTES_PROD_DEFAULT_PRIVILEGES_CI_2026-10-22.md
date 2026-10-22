# Change notes — PROD default privileges in the disposable migration test, 22 October 2026

## Purpose
The first R089 PROD attempt at V103 failed its own ACL self-check: PROD's default privileges give `mw_integration_agent` `EXECUTE` on every routine `postgres` creates in `public`, which `REVOKE ALL ... FROM PUBLIC` does not remove. DEV and the disposable CI cluster have no such default, so CI passed. The disposable migration test now replays PROD's recorded default privileges, so the next migration meets them in CI first.

## Changes
- `scripts/database/Test-ProdDefaultPrivileges.sql` (new): a disposable-cluster fixture with steps `apply`, `pause`, `resume` and `remove`. `apply` creates a fixture role `mw_integration_agent` and the R085 defaults verbatim from the [R085 change note](../integration-agent/Change%20Logs/CHANGE_NOTES_CONVERSATION_SPEED_2026-10-21.md) (postgres: tables and sequences in `public`, `agent_audit`, `assessment_lab`, `monitoring`; routines in the first three; `mw_business_audit_owner`: all three). `pause` and `resume` reproduce the owner-approved R089 pause of the `public` routines default around V103 (PROD row of the [Environment Inventory](../project/Documents/Environment_Inventory.md)). `remove` revokes the defaults and drops the role, so later test SQL is unchanged. It refuses any database other than `loan_manager_dev` and any role it did not create.
- `scripts/database/Test-MigrationsCloud.py`: migrates in segments from `migration_plan()`: to V101, `apply`; to V102, `pause`; to V103, `resume`; then the rest and `remove`. A `--pre-target` fixture runs at its version first; chains older than V101 have no replay.
- `scripts/database/test_prod_default_privileges.py` (new, runs in the `guards` job): the replay order.
- `database/README.md`: the PROD-like default privilege paragraph and the rule for new migrations that create functions as `postgres`.
- No migration, PROD read or PROD write. Shared migrations are untouched.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest discover -s scripts/database -p "test_*.py"` | 53 tests pass |
| `Test-MigrationsCloud.py --sql-only` as `postgres` | 103 migrations, idempotent rerun, `public-functions.sql` matches, SQL batch (including `Test-LedgerAccess.sql`, which creates its own `mw_integration_agent`) passes |
| Same run without the V103 pause (temporary copy, deleted) | Fails at V103 with `V103: pwa_notify_history_content_v1 must be the notify owner's pinned definer executable only by mw_notify_api_dev`, the PROD error |
| `npm run check:docs` | 0 failures, 0 warnings |
| Pull request `Development checks` | Not run: no pull request opened; the branch push triggers `database.yml` |

## Not run
The full `Test-CI.ps1` groups and the concurrency scripts were not run locally (lean check routine); the `database.yml` run on the push covers them. The Windows route `Test-Migrations.ps1` does not replay the defaults.

## Recovery
Revert the commit. No database or live state changed.

## Open questions
None.

## Remaining work
- When PROD's default privileges change, add the change to `PROD_DEFAULTS` and the fixture from that change's promotion record.
