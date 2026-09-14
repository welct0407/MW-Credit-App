# Cloud SQL PostgreSQL POC — 14 September 2026

Status: preparation checkpoint; awaiting owner password entry and instance creation. User authorized infrastructure setup, a three-table AppSheet/SQL sync proof, a subsequent isolated migration/performance comparison, and production migration planning. Production cutover is not authorized.

Cloud project: My First Project (`clever-oasis-508610-n7`), verified in the authenticated console. Enabled required Compute Engine API and Cloud SQL Admin API; creation form became available. Prepared instance appsheet-pg-test-20260914: PostgreSQL 18 Enterprise, Singapore, db-f1-micro, single zone, 10 GB SSD, backups/PITR/deletion protection, SSL-only, public IP with no authorized networks, Data API off. Console rounded compute/storage estimate $0.02/hour plus backup/traffic. No SQL instance, credential, SQL schema, AppSheet connection or app change yet. Password blank and Create instance not submitted; browser-control credential handoff required.

Files: outputs/cloud-sql-poc-20260914/IMPLEMENTATION_PLAN.md, scripts/cloud-sql-poc-schema.sql and this log. Purpose: preserve scope, concrete configuration, synthetic trigger draft, test criteria and recovery requirements before provisioning. SQL draft not executed; no database-engine test claimed.

Rollback point: no existing app or database edited; no app version restore required for this preparation. Newly enabled infrastructure services can remain enabled without an instance; do not disable project services without checking other consumers. Future app changes require recorded versions first.

Checks: read repository instructions; inspected Cloud SQL onboarding and selected project. Live tests pending provisioning and connector access. All existing OLTP/OLAP/Looker objects unchanged. Owner review: eventual cost/configuration and access setup; final test results before any production decision.
