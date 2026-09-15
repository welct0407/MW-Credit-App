-- Read-only verification after the production instance resize finishes.
SELECT current_setting('max_connections')::int AS max_connections,
       current_setting('superuser_reserved_connections')::int AS superuser_reserved_connections,
       current_setting('reserved_connections')::int AS reserved_connections,
       current_setting('max_connections')::int
         - current_setting('superuser_reserved_connections')::int
         - current_setting('reserved_connections')::int AS ordinary_connection_slots,
       (SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend') AS current_client_connections,
       pg_postmaster_start_time() AS server_started_at;

SELECT rolname, rolconnlimit
FROM pg_roles WHERE rolname = current_user;

SELECT datname, datconnlimit
FROM pg_database WHERE datname = current_database();
