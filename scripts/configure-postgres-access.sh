#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root" >&2
  exit 1
fi
if [ "$#" -ne 1 ] || [ ! -s "$1" ]; then
  echo "usage: configure-postgres-access.sh ADMIN_PASSWORD_FILE" >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "postgresql-client is required" >&2
  exit 1
fi

admin_password_file=$1
secret_dir=/etc/mw-integration-agent/secrets
role_password_file=$secret_dir/postgres-password.txt
install -d -o root -g mwagent -m 0750 "$secret_dir"
if [ ! -s "$role_password_file" ]; then
  umask 0077
  openssl rand -base64 36 >"$role_password_file"
fi
chown root:mwagent "$role_password_file"
chmod 0640 "$role_password_file"

admin_password=$(cat "$admin_password_file")
role_password=$(cat "$role_password_file")
escaped_password=$(printf '%s' "$role_password" | sed "s/'/''/g")
trap 'unset admin_password role_password escaped_password; rm -f "$admin_password_file"' EXIT HUP INT TERM

PGPASSWORD=$admin_password psql \
  --host=127.0.0.1 --port=5432 --dbname=loan_manager_prod --username=postgres \
  --set=ON_ERROR_STOP=1 --quiet <<SQL
DO \$body\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mw_integration_agent') THEN
    CREATE ROLE mw_integration_agent LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
\$body\$;
ALTER ROLE mw_integration_agent PASSWORD '$escaped_password';
ALTER ROLE mw_integration_agent SET default_transaction_read_only = on;
ALTER ROLE mw_integration_agent SET statement_timeout = '30s';
GRANT CONNECT, TEMPORARY ON DATABASE loan_manager_prod TO mw_integration_agent;
GRANT USAGE ON SCHEMA public TO mw_integration_agent;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mw_integration_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mw_integration_agent;
SQL

echo "Dedicated production role configured with SELECT and TEMPORARY only."
