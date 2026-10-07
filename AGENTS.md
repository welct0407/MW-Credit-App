# MW Credit App

Own the PWA, API, app infrastructure and development tooling here. The owner authorized infrastructure preparation on 7 October 2026, reusing existing Cloud SQL and GCS and putting runtime secrets in Secret Manager.

- Preserve parallel AppSheet operation. No financial writes, scheduler activation or production application cutover is authorized by infrastructure setup.
- Shared SQL migrations remain owned by AppSheet-Loan-Project. Pin its package; never create another Flyway history or edit its immutable migrations here.
- Terraform owns new infrastructure. Treat the existing database instance and receipt bucket as external dependencies. Never destroy or replace them.
- Secrets, local Terraform state, saved plans and authentication exports stay outside every repository. Use IAM/OIDC credentials and Secret Manager. Never commit real .env files.
- Work in branches, check changes, maintain Change Logs and commit/push intended work. Preserve unrelated changes. No force push.
- Use synthetic data for CI. Live readiness probes may use SELECT 1/current identity and the dedicated mw-credit-app/dev/health/ storage prefix only.
