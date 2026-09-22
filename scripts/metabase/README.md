# Metabase with local Cloud SQL Auth Proxy

Prepared deployment source; not yet deployed. Build this directory as the Railway Metabase service root. It preserves Metabase v0.63.18.1 and adds the official Cloud SQL Auth Proxy v2.25.4. The wrapper waits for the authenticated connection test and forwards shutdown to both processes. Failure of either process fails the container.

Keep the existing Railway PostgreSQL application-database variables, Java heap and Bangkok timezone. Add these runtime secrets/settings only after preserving the application database and recovery material outside Git:

- `CSQL_PROXY_INSTANCE_CONNECTION_NAME`: verified GCP project:region:instance.
- `CSQL_PROXY_JSON_CREDENTIALS`: dedicated service-account JSON, scoped to Cloud SQL Client on the intended instance.
- `MB_ENCRYPTION_SECRET_KEY`: one generated and privately retained key. Never regenerate it during redeployment.

The reporting source uses `127.0.0.1:5432`, database `loan_manager_prod`, and a dedicated restricted PostgreSQL login. Disable Metabase's separate PostgreSQL SSL option for this loopback source: the proxy supplies TLS to Cloud SQL. The application database remains on its existing Railway connection. No public TCP service or Cloud SQL allowlist expansion is needed.

Use Railway's `/api/health` HTTP health check and existing public port 3000. Verify deployment logs, the actual source database/user, allowed report queries and denied base-table/write access before publishing the dashboard. This is distinct from the proxy startup connection test, which proves IAM/network availability only.

Rollback: restore the prior Railway image/deployment and captured variables. Retain the encryption key while any Metabase database details use it. Remove a newly added reporting source before revoking its role/Cloud SQL identity. The original application database remains the recovery authority for questions, users and permissions.

See [connection plan](../../outputs/metabase-poc-20260922/connection-plan.md) for exact target and current status. Authoritative references: [Metabase image entrypoint](https://github.com/metabase/metabase/blob/v0.63.18.1/bin/docker/run_metabase.sh), [Cloud SQL proxy flags](https://github.com/GoogleCloudPlatform/cloud-sql-proxy/blob/main/docs/cmd/cloud-sql-proxy.md).
