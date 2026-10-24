# PostgreSQL lab for the integration-agent suites

`setup.sh` builds the disposable cluster that the lab suites need (AGT-TEST-01/04). It never touches a live instance: a UTF8 PostgreSQL 18 cluster on a non-5432 port, under a root whose name contains `agent-state-lab-` (the suites refuse anything else and check `SHOW data_directory` against the manifest).

What it creates, in order:

1. `bootstrap.sql` on `postgres` with `PGOPTIONS='-c mw_design.execution_approved=agent-postgresql-20260922-v1'` (roles, `mw_agent`).
2. `state_migration.migrate()` on `mw_agent` (V1..Vn), then a second run that must apply nothing.
3. `LOGIN` on `mw_agent_worker`, `mw_agent_relay`, `mw_agent_auditor` (trust auth, no passwords).
4. Database `loan_manager_prod` (the `mw_dml_test_ci` database left with the Instagram conversation, R091).
5. In `loan_manager_prod`: `scripts/database/Test-AppRolePrerequisites.sql` plus a `_dev`→`_prod` copy of it (V87/V88 expect the `_prod` roles), Flyway `migrate` with `database/flyway.conf`. The lab also needs `mw_ledger_owner_<env>` from `Test-AppRolePrerequisites.sql` before V93.
6. `manifest.json` (`host`, `port`, `root`).

Prerequisites: PostgreSQL 18 binaries (`PGBIN`, default `/usr/lib/postgresql/18/bin`), Flyway 13.6.0 on `PATH` (or `FLYWAY=`), a Python with the package's pinned dependencies (`PYTHON=`), and a non-root user (`initdb` refuses root).

Variables: `LAB_ROOT` (default `$RUNNER_TEMP/agent-state-lab-ci` or `/tmp/agent-state-lab-ci`), `LAB_PORT` (default 15540), `LAB_SOCKET` (default `/tmp/mwpg-<port>`; Unix sockets are limited to 107 bytes).

Run, from the repository root:

```
bash integration-agent/tests/lab/setup.sh
export MW_AGENT_LAB_MANIFEST=$LAB_ROOT/manifest.json
cd integration-agent && python -m unittest -v tests.test_postgres_state \
  tests.test_notice_acknowledgement tests.test_operator_audit_postgres \
  tests.test_operator_execution_postgres tests.test_receipt_audit_postgres tests.test_state_migration_postgres \
  tests.test_statement_snapshot
bash integration-agent/tests/lab/setup.sh stop
```

The suites take a few seconds; the setup takes a few minutes (Flyway). `.github/workflows/agent-tests.yml` runs the same recipe in its `lab` job.
