#!/bin/sh
set -eu

password_file=/etc/mw-integration-agent/secrets/postgres-password.txt
if [ ! -r "$password_file" ]; then
  echo "database credential is unavailable" >&2
  exit 1
fi

password=$(cat "$password_file")
trap 'unset password' EXIT HUP INT TERM
PGPASSWORD=$password psql \
  --host=127.0.0.1 --port=5432 --dbname=loan_manager_prod --username=mw_integration_agent \
  --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 <<'SQL'
SELECT 'identity=' || current_database() || '|' || current_user;
SELECT 'default_read_only=' || current_setting('transaction_read_only');
SELECT 'partners_rows=' || count(*) FROM public."Partners";
SELECT 'persistent_insert_privilege=' || has_table_privilege(current_user, 'public."Partners"', 'INSERT');
BEGIN;
SET TRANSACTION READ WRITE;
CREATE TEMPORARY TABLE mw_agent_write_probe (probe_id text PRIMARY KEY);
INSERT INTO mw_agent_write_probe VALUES ('rollback-only');
SELECT 'temporary_write_rows=' || count(*) FROM mw_agent_write_probe;
ROLLBACK;
SELECT 'temporary_table_after_rollback=' || (to_regclass('pg_temp.mw_agent_write_probe') IS NOT NULL);
SQL
