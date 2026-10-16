#!/bin/sh
# Disposable PostgreSQL lab for the integration-agent lab suites (AGT-TEST-01/04).
# Builds a throwaway UTF8 cluster on a non-5432 port under a root whose name contains
# "agent-state-lab-" (the suites refuse anything else), then prints the two variables
# the suites read. Nothing here touches a live instance. Run as a non-root user from
# the repository root, e.g.:
#   bash integration-agent/tests/lab/setup.sh
#   export MW_AGENT_LAB_MANIFEST=... MW_DML_TEST_DSN=...   (as printed)
#   (cd integration-agent && python -m unittest -v tests.test_postgres_state ...)
#   bash integration-agent/tests/lab/setup.sh stop        # tear the cluster down
set -eu

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
ROOT=${LAB_ROOT:-${RUNNER_TEMP:-/tmp}/agent-state-lab-ci}
PORT=${LAB_PORT:-15540}
PGBIN=${PGBIN:-/usr/lib/postgresql/18/bin}
PYTHON=${PYTHON:-python}
FLYWAY=${FLYWAY:-flyway}
# Unix sockets are limited to 107 bytes; keep them short even when LAB_ROOT is deep.
SOCKET=${LAB_SOCKET:-/tmp/mwpg-$PORT}
APPROVAL='-c mw_design.execution_approved=agent-postgresql-20260922-v1'
case "$ROOT" in *agent-state-lab-*) ;; *) echo "LAB_ROOT must contain agent-state-lab-" >&2; exit 1;; esac
[ "$PORT" -ne 5432 ] || { echo "LAB_PORT must not be 5432" >&2; exit 1; }

psql_as() { "$PGBIN/psql" -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }

if [ "${1:-}" = "stop" ]; then
  "$PGBIN/pg_ctl" -D "$ROOT/data" -m fast stop || true
  rm -rf "$ROOT" "$SOCKET"
  exit 0
fi

[ ! -e "$ROOT" ] || { echo "$ROOT exists; run '$0 stop' first" >&2; exit 1; }
mkdir -p "$ROOT" "$SOCKET"
"$PGBIN/initdb" -D "$ROOT/data" -U postgres --auth=trust --encoding=UTF8 --locale=C >"$ROOT/initdb.log"
"$PGBIN/pg_ctl" -D "$ROOT/data" -o "-h 127.0.0.1 -p $PORT -k $SOCKET" -l "$ROOT/postgres.log" -w start

# Central agent database: roles, mw_agent, migration history V1..Vn (then a no-op rerun).
PGOPTIONS="$APPROVAL" psql_as -d postgres -q -f "$REPO/integration-agent/database/setup/bootstrap.sql"
(cd "$REPO/integration-agent" && PYTHONPATH=src "$PYTHON" - "$PORT" <<'PY'
import sys, psycopg
from mw_integration_agent import state_migration
with psycopg.connect(host='127.0.0.1', port=int(sys.argv[1]), user='postgres', dbname='mw_agent', autocommit=True) as conn:
    print('central migrations:', state_migration.migrate(conn, 'database/migrations'))
    assert state_migration.migrate(conn, 'database/migrations')['applied'] == []
PY
)
psql_as -d postgres -q -c "ALTER ROLE mw_agent_worker LOGIN; ALTER ROLE mw_agent_relay LOGIN; ALTER ROLE mw_agent_auditor LOGIN;"
psql_as -d postgres -q -c "CREATE DATABASE loan_manager_prod TEMPLATE template0 ENCODING 'UTF8';"
psql_as -d postgres -q -c "CREATE DATABASE mw_dml_test_ci TEMPLATE template0 ENCODING 'UTF8';"

# Business database: app role fixtures (the _dev set from the shared script plus the _prod
# copies that V87/V88/V93 expect), Flyway to the current version, reviewer DML role and grants.
psql_as -d loan_manager_prod -q -f "$REPO/scripts/database/Test-AppRolePrerequisites.sql"
sed 's/_dev/_prod/g' "$REPO/scripts/database/Test-AppRolePrerequisites.sql" | psql_as -d loan_manager_prod -q
(cd "$REPO" && "$FLYWAY" -url="jdbc:postgresql://127.0.0.1:$PORT/loan_manager_prod" -user=postgres -password= \
  -configFiles=database/flyway.conf -locations=filesystem:database/migrations migrate >"$ROOT/flyway.log")
tail -n 2 "$ROOT/flyway.log"
(cd "$REPO/integration-agent" && PYTHONPATH=src "$PYTHON" - "$PORT" <<'PY'
import importlib.util, sys, psycopg
spec = importlib.util.spec_from_file_location('configure_reviewer_dml', 'scripts/configure-reviewer-dml.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with psycopg.connect(host='127.0.0.1', port=int(sys.argv[1]), user='postgres', dbname='loan_manager_prod') as conn:
    module.configure(conn, 'lab-password')
    conn.commit()
print('reviewer DML role configured')
PY
)
# The reviewer role is created after the Flyway chain here, so V93's role-guarded agent_audit grants
# did not see it; mirror V93 section 3 for that role (relay/auditor existed before migrate and got theirs).
psql_as -d loan_manager_prod -q -c "GRANT USAGE ON SCHEMA agent_audit TO mw_reviewer_dml; GRANT EXECUTE ON FUNCTION agent_audit.begin_operation(uuid,text,text,text,text,jsonb,text) TO mw_reviewer_dml; GRANT SELECT ON agent_audit.commits,agent_audit.row_changes TO mw_reviewer_dml;"

printf '{"host":"127.0.0.1","port":%s,"root":"%s"}\n' "$PORT" "$ROOT" >"$ROOT/manifest.json"
echo "MW_AGENT_LAB_MANIFEST=$ROOT/manifest.json"
echo "MW_DML_TEST_DSN=host=127.0.0.1 port=$PORT user=postgres dbname=mw_dml_test_ci"
