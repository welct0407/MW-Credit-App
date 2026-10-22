# Change notes — Railway security incident credential rotation, 22 October 2026

## Purpose
Railway disclosed on 22 October 2026 (incident QH8L8B3E) that customers' environment variables may have been read in decrypted form, and it revoked every API token. The owner approved replacing the Metabase credentials and the two dead Railway monitoring tokens.

## Changes
- Railway monitoring: workspace token in Secret Manager `mw-railway-grafana-monitoring-token` v1, now set on Grafana datasource `mw-railway-monitoring` (`bearerToken`, datasource version 2). New project token `mw-debian-pitr-health`, created through the Railway API, in `mw-railway-pitr-token` v1 and in `/etc/mw-resource-monitoring/railway-pitr-token.txt`. Railway had removed the workspace SSH key, so the Debian public key was registered again as `mw-debian-pitr-health`.
- Reporting source: new `metabase_borrower_reader` password (`mw-metabase-reporting-password` v1), set through the Cloud SQL Admin API on `mw-credit-pg-20261017`; Metabase database 2 updated through the API.
- Chart: new bearer key (`mw-report-charts-key` v1). The digest is in `/etc/mw-report-charts/config.json`, `mw-report-charts.service` was restarted, and only the iframe on dashboard 3 dashcard 1501 was changed.
- Cloud SQL key: the owner created key `43b5a81c…` for `metabase-cloudsql@` in Cloud Shell under a temporary project policy exception, which was removed and verified enforced again. It is stored in `mw-metabase-cloudsql-sa-key` v1.
- Metabase deploy: `CSQL_PROXY_JSON_CREDENTIALS`, `MB_ENCRYPTION_SECRET_KEY` (new key, `mw-metabase-encryption-key` v2) and `MB_ENCRYPTION_SECRET_KEY_OLD` set through the Railway API, with a pre-deploy `rotate-encryption-key` command. `mw-metabase-encryption-key` v1 holds the old, compromised key, kept for rollback only.
- Records: `project/Documents/Resource_Monitoring.md`, `project/Documents/Environment_Inventory.md`, `project/scripts/metabase/README.md` (rotation steps), `project/outputs/r030-custom-matrix/README.md`, `infrastructure/grafana/operational-secret-references.json`.

## Checks
| Command | Result |
| --- | --- |
| Live Railway GraphQL query through `mw-railway-monitoring` (`/api/ds/query`) | Pass: project data returned; datasource health OK |
| `metabase_pitr.probe()` on vm-mw-credit-agent as `mwagent` | Pass: status 1, archive age 23 s, 15 backup sets |
| Saved question 276 after the reporting password change | Pass: completed, 1 row |
| `charts.mw-credit.com/api/matrix` with the old and the new key | Pass: 401 for old, 200 for new; dashboard 3 still has 272 dashcards and the same tabs |
| Effective `iam.disableServiceAccountKeyCreation` and `iam.managed.disableServiceAccountKeyCreation` after the owner's Cloud Shell step | Pass: enforced, no project override |

## Not run
- Metabase redeploy: queued in Railway's slow deploy queue since 11:19 UTC; result not yet verified.
- Rotation of the Metabase application-database password: not done. It needs shell access in Railway Postgres; the database has no public endpoint and Railway rotated the backup-bucket credentials itself.
- No access-log review for misuse of the old credentials yet.

## Recovery
- Reporting password, chart key, Railway tokens: add a Secret Manager version and repeat the step. Old values are not restored, because they are exposed.
- Encryption key: if the deploy fails after the pre-deploy step, set `MB_ENCRYPTION_SECRET_KEY` to `mw-metabase-encryption-key` v2. If the pre-deploy step failed, the stored data still uses v1.
- Cloud SQL key: until the old key is disabled, the previous deployment keeps working with it.

## Open questions
- Whether to revoke Metabase API key 3 ("Report development", admin). It was kept by owner instruction until the report migration ends; Metabase stores only a hash of it.

## Remaining work
- Verify the Metabase deploy, then disable old key `baf7f71a…`, clear the pre-deploy command and `MB_ENCRYPTION_SECRET_KEY_OLD`, and revoke the temporary Metabase admin key `incident-rotation` (ID 5).
- Review Cloud SQL and Metabase logs for use of the old credentials.
