# Change notes — Railway security incident credential rotation, 22 October 2026

## Purpose
Railway disclosed on 22 October 2026 (incident QH8L8B3E) that customers' environment variables may have been read in decrypted form, and it revoked every API token. The owner approved replacing the Metabase credentials and the two dead Railway monitoring tokens.

## Changes
- Railway monitoring: workspace token in Secret Manager `mw-railway-grafana-monitoring-token` v1, now set on Grafana datasource `mw-railway-monitoring` (`bearerToken`, datasource version 2). New project token `mw-debian-pitr-health`, created through the Railway API, in `mw-railway-pitr-token` v1 and in `/etc/mw-resource-monitoring/railway-pitr-token.txt`. Railway had removed the workspace SSH key, so the Debian public key was registered again as `mw-debian-pitr-health`.
- Reporting source: new `metabase_borrower_reader` password (`mw-metabase-reporting-password` v1), set through the Cloud SQL Admin API on `mw-credit-pg-20261017`; Metabase database 2 updated through the API.
- Chart: new bearer key (`mw-report-charts-key` v1). The digest is in `/etc/mw-report-charts/config.json`, `mw-report-charts.service` was restarted, and only the iframe on dashboard 3 dashcard 1501 was changed.
- Cloud SQL key: the owner created key `43b5a81c…` for `metabase-cloudsql@` in Cloud Shell under a temporary project policy exception, which was removed and verified enforced again. It is stored in `mw-metabase-cloudsql-sa-key` v1.
- Metabase deploys, all set through the Railway API with the workspace token:
  - Deployment `05c5945d` failed in pre-deploy without changing anything (the new key reached `rotate-encryption-key` empty through `run_metabase.sh`).
  - Deployment `7a12caf1` put the new Cloud SQL key in place. The old key `baf7f71a…` was then disabled and deleted.
  - Deployment `a4d7151e` was a deliberately failing diagnostic. It confirmed that both key variables reach the pre-deploy shell.
  - Deployment `407582d3` rotated the encryption key to `mw-metabase-encryption-key` v2 by calling `java` directly.
  - Afterwards the pre-deploy command and `MB_ENCRYPTION_SECRET_KEY_OLD` were removed. Deleting the variable triggered one more restart (deployment `79e97ca2`, live at 13:19 UTC), with the same configuration. `mw-metabase-encryption-key` v1 holds the old, compromised key, kept for rollback only.
- Temporary credentials: Metabase API key 5 (`incident-rotation`) revoked; its secret and the unused `mw-railway-incident-ops-token` deleted.
- Records: `project/Documents/Resource_Monitoring.md`, `project/Documents/Environment_Inventory.md`, `project/scripts/metabase/README.md` (rotation steps), `project/outputs/r030-custom-matrix/README.md`, `infrastructure/grafana/operational-secret-references.json`.

## Checks
| Command | Result |
| --- | --- |
| Live Railway GraphQL query through `mw-railway-monitoring` (`/api/ds/query`) | Pass: project data returned; datasource health OK |
| `metabase_pitr.probe()` on vm-mw-credit-agent as `mwagent` | Pass: status 1, archive age 23 s, 15 backup sets |
| Saved question 276 after the reporting password change | Pass: completed, 1 row |
| `charts.mw-credit.com/api/matrix` with the old and the new key | Pass: 401 for old, 200 for new; dashboard 3 still has 272 dashcards and the same tabs |
| Effective `iam.disableServiceAccountKeyCreation` and `iam.managed.disableServiceAccountKeyCreation` after the owner's Cloud Shell step | Pass: enforced, no project override |
| After deployment `7a12caf1`: `/api/health`, question 276, chart; then again after disabling key `baf7f71a…` | Pass: 200, completed, 200; question 276 still completed |
| Deployment `407582d3` pre-deploy log | Pass: `Encryption key rotation OK` |
| After deployment `407582d3`: `/api/health`, `GET /api/database/2` details, question 276, chart | Pass: 200, details decrypted, completed, 200 |
| Railway service config after cleanup | Pass: pre-deploy command empty, original variable set, no extra deployment |
| Temporary Metabase key after revocation | Pass: 401 |

## Not run
- Rotation of the Metabase application-database password: not done. It needs shell access in Railway Postgres; the database has no public endpoint and Railway rotated the backup-bucket credentials itself.
- No access-log review for misuse of the old credentials yet.

## Recovery
- Reporting password, chart key, Railway tokens: add a Secret Manager version and repeat the step. Old values are not restored, because they are exposed.
- Encryption key: stored data now uses `mw-metabase-encryption-key` v2. An application-database restore from before 12:40 UTC on 22 October needs v1.
- Cloud SQL key: the old key is deleted. Create a replacement key with the owner's Cloud Shell procedure in `project/scripts/metabase/README.md`.

## Follow-up elsewhere
- Since the first fresh start at 12:12 UTC, Metabase memory sits at about 1.9 of 2.0 GB (about 1.4 GB before), and the Grafana memory-pressure alert fires. The memory limit, replica count and `JAVA_OPTS` are unchanged. The owner assigned this alert to another session.

## Open questions
- Whether to revoke Metabase API key 3 ("Report development", admin). It was kept by owner instruction until the report migration ends; Metabase stores only a hash of it.

## Remaining work
- Review Cloud SQL and Metabase logs for use of the old credentials.
- Optional: rotate the Metabase application-database password.
