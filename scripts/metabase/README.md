# Metabase with local Cloud SQL Auth Proxy

Deployed on 22 September 2026. Build this directory as the Railway Metabase service root. It preserves Metabase v0.63.18.1 and adds official Cloud SQL Auth Proxy v2.25.4. The wrapper waits for the authenticated connection test and forwards shutdown to both processes. Failure of either process fails the container. The warehouse connection pool is capped at three; the reporting role allows eight connections to accommodate rolling deployments and short validation connections without using the instance's general capacity.

Keep the existing Railway PostgreSQL application-database variables, Java heap and Bangkok timezone. Add these runtime secrets/settings only after preserving the application database and recovery material outside Git:

- `CSQL_PROXY_INSTANCE_CONNECTION_NAME`: verified GCP project:region:instance.
- `CSQL_PROXY_JSON_CREDENTIALS`: dedicated service-account JSON, scoped to Cloud SQL Client on the intended instance.
- `MB_ENCRYPTION_SECRET_KEY`: one generated and privately retained key. Never regenerate it during redeployment.

For an existing unencrypted Metabase database, stop Metabase and run `/app/run_metabase.sh enable-encryption` once with the retained key before normal startup. Merely adding the variable causes a startup failure in this version. This conversion completed successfully; the temporary pre-deploy command was removed. Do not repeat it on ordinary deployments.

The obsolete direct Docker-image source was disconnected so it cannot replace the proxy image. Deploy explicitly with `railway up scripts/metabase --path-as-root --service 2959d509-c829-4420-8650-e72827d88170 --project c8e57452-36dc-41f1-8d00-856b521a96c7 --environment df3ba125-0d62-446a-b4d8-5196780982c9`. The build context contains no secrets. Railway `redeploy` repeats a deployment's captured manifest; use a new deployment when changing service settings.

The reporting source uses `127.0.0.1:5432`, database `loan_manager_prod`, and a dedicated restricted PostgreSQL login. Disable Metabase's separate PostgreSQL SSL option for this loopback source: the proxy supplies TLS to Cloud SQL. The application database remains on its existing Railway connection. No public TCP service or Cloud SQL allowlist expansion is needed.

Use Railway's `/api/health` HTTP health check and existing public port 3000. Verify deployment logs, the actual source database/user, allowed report queries and denied base-table/write access before publishing the dashboard. This is distinct from the proxy startup connection test, which proves IAM/network availability only.

Rollback: retain the encryption key and current application-DB password when rolling back container code. A pre-encryption application-database restore requires the corresponding pre-encryption configuration, followed by reconciling the rotated application-DB login. Never restore the old exposed password. Remove the reporting source before revoking its column grants/login and Cloud SQL identity. The application database is the recovery authority for questions, users and permissions.

`reporting-role.sql` provisions the authorized one-time role and nine view-column grants; it deliberately fails if the role already exists. `Install-BorrowerPoc.ps1` creates missing questions/dashboard and leaves existing layout untouched. `Verify-BorrowerPoc.ps1` compares all results with direct restricted PROD SQL without saving borrower rows. These scripts require a temporary administrator API key stored outside Git; the setup key is revoked after verification. Provisioning is not an automatic deployment step.

See [connection plan](../../outputs/metabase-poc-20260922/connection-plan.md) for exact target and current status. Authoritative references: [Metabase image entrypoint](https://github.com/metabase/metabase/blob/v0.63.18.1/bin/docker/run_metabase.sh), [Cloud SQL proxy flags](https://github.com/GoogleCloudPlatform/cloud-sql-proxy/blob/main/docs/cmd/cloud-sql-proxy.md).
