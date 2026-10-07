# MW Credit App

Own the PWA, API, app infrastructure and development tooling here. The owner authorized infrastructure preparation on 7 October 2026, reusing existing Cloud SQL and GCS and putting runtime secrets in Secret Manager.

- Preserve parallel AppSheet operation. No financial writes, scheduler activation or production application cutover is authorized by infrastructure setup.
- This repository owns the complete shared SQL migration history, database runners/tests and database CI following the owner-authorized transfer on 7 October 2026. AppSheet-Loan-Project retains overall project management. Read database/README.md and database/OWNERSHIP.md before database work. Never create another Flyway history, edit applied migrations, run clean/repair or bypass exact tested commit/hash and production approval/backup guards.
- Preserve DEV/PROD identity checks and compatibility with both old AppSheet and new PWA during parallel operation. New tables/columns require scoped owner approval. Production writes require explicit scoped authorization and a verified restorable backup; a repository transfer authorizes no live database changes.
- Run scripts/database/Test-CI.ps1 for database runner/migration changes, using only disposable local databases. Keep current project release coordination in AppSheet-Loan-Project; pin MW-Credit-App commits for SQL packages.
- Terraform owns new infrastructure. Treat the existing database instance and receipt bucket as external dependencies. Never destroy or replace them.
- Secrets, local Terraform state, saved plans and authentication exports stay outside every repository. Use IAM/OIDC credentials and Secret Manager. Never commit real .env files.
- Work in branches, check changes, maintain Change Logs and commit/push intended work. Preserve unrelated changes. No force push.
- Use synthetic data for CI. Live readiness probes may use SELECT 1/current identity and the dedicated mw-credit-app/dev/health/ storage prefix only.
