# Flyway database development and promotion — 2026-09-15

## Scope and purpose

Owner requested Flyway and the existing GitHub repository for PostgreSQL DDL/functions and development-to-production promotion, with the requirement recorded in AGENTS.md. Added versioned migrations, pinned free Flyway tools, explicit environment targets, schema export/adoption guards, release manifests, local disposable PostgreSQL tests and GitHub CI. No business logic or AppSheet configuration changes are included.

## Rollback points and access

- Existing repository checkpoint before this task: `95f87b3` (includes the separate capacity task; preserved).
- Private schema snapshots before adoption: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/development-schema-20260915-115441.sql` and production export on 2026-09-15. The production/development normalized schemas matched exactly before enrollment.
- Original 73 AppSheet network entries retained. Owner explicitly approved `20.198.200.25/32` on both instances. Added `Flyway-owner-workstation-20260915` only; SSL required and public IP retained. No proxy or machine upgrade. Production was left alone during downsizing and accessed after the owner confirmed it online.
- Existing external postgres password reused; no credentials added to Git. Private export/credential backup coverage is not established by this Git commit.

## Files and objects

- `database/migrations/V1__existing_schema.sql`: schema-only baseline (14 tables, 2 views, 6 functions, 10 triggers, 13 foreign keys). Preserves current logic, including assessment_lab and blank-ref handling; no financial row imports.
- `database/flyway.conf`, `environments.json`, `toolchain.json`, `.gitattributes`, `README.md`.
- `scripts/database/`: installation, schema normalization/export, read-only aggregate audit, guarded runner, release preparation and disposable integration test.
- `.github/workflows/database.yml`: rebuild/validation on a temporary Windows runner; no Cloud SQL credentials or automatic production deployment.
- `AGENTS.md`: mandatory Flyway workflow and corrected current PostgreSQL architecture.
- New live object is solely `public.flyway_schema_history` (deployment metadata, excluded from AppSheet). Business schema/model and app versions are unchanged, so no dictionary regeneration or workbook model edit is required.

## Verification and status

- Flyway OSS 13.6.0 installed with official release SHA-256 verification; portable PostgreSQL 18.6 installed from official EDB distribution.
- Live DEV and PROD schema exports matched V1 exactly. Direct connections verified encrypted.
- Local empty PostgreSQL rebuild: 1 migration applied; reconstructed schema matched baseline; validation passed; second migrate executed 0 migrations.
- Checksum mutation correctly reported `CHECKSUM_MISMATCH`. This Flyway build returned process exit 0 with failed validation JSON, so runner/tests explicitly inspect JSON success/error fields as well as exit codes.
- Development explicit baseline at version 1 and validation passed; development migrate was a no-op (0 migrations).
- Production explicitly baselined at version 1 after a second fresh schema equality check. Release readiness recognizes Flyway 13.6.0's `Ignored (Baseline)` state only for V1 skipped by the baseline marker.
- Tested release manifest creation and production promotion command: successful no-op, 0 migrations executed. Missing production approval reference was rejected. Both live databases validated successfully at version 1.
- Post-adoption schema exports still match V1 exactly after excluding history. All 14 table row-count/content fingerprints remained unchanged across final checks in both environments. Development's first aggregate fingerprint was captured after its initial baseline enrollment; production's was captured before enrollment. No business-table DML was issued by this task.
- Production read-only inspection confirms PostgreSQL 18.6 and `max_connections=100` after the other session's capacity change. This task did not alter that setting.
- GitHub workflow run on commit `ae3bff6` is running; final result will be recorded after completion.
- Tests validate migration mechanics and schema preservation. They do not establish functional acceptance of any future business change. This task makes no application behavior change; owner may optionally sync both apps as a smoke check. Future releases require affected OLTP/OLAP tests and owner acceptance before production promotion.

## Rollback and continuing workflow

To discontinue this tooling, stop invoking Flyway; the metadata table can remain harmlessly in place. Do not remove its history after subsequent migrations. Revert repository tooling with a normal reviewed Git revert if necessary. The new network entry can be removed through Cloud SQL Connections without changing the original AppSheet entries. No application-data rollback is needed for metadata-only adoption.

Future changes use a new versioned SQL file, dev migration and acceptance evidence, then the exact committed release manifest plus verified production backup and explicit owner approval. Record the real approval/backup references; placeholders never authorize a deployment. Inspect live schema drift separately because Flyway validation is not a live-schema comparison. No automatic clean, repair, undo, production deployment or financial backfill is provided.
