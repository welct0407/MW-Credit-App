# PostgreSQL current metadata

The two databases share one Cloud SQL instance. Use [Environment Inventory](../../../Environment_Inventory.md) for the complete host/instance/database tuple and [run evidence](../../../../outputs/dictionary-reconciliation-20260924/README.md) for capture times, SSL/read-only assertions and coverage.

- `relations/`: tables, views and materialized-view metadata, exact columns, constraints, indexes, triggers, policies and catalog-discovered view dependencies. Internal integrity triggers are identified separately by their `internal` flag.
- `routines/`: full definitions and exact argument signatures, return types, volatility, security/settings, ownership and privileges. Overloads remain separate.
- `schemas/` and `sequences/`: exact namespace/ownership/ACL and sequence configuration/ownership. No custom types/domains/enums were found in these captures.
- `settings/`: database attributes/settings, extensions, default privileges, relevant roles and recursive memberships, job definitions, Flyway metadata and empty-inventory evidence for other inspected categories.

After R026 V40, PROD and DEV each have 56 relations and 83 routines. The unused PROD `pg_cron` extension and its sole disabled job were removed; DEV already omitted it. All non-cron business catalog sections are unchanged. The shared instance preload flag remains on pending restart coordination. [Verified retirement](../../../../outputs/r026-dictionary-fixes/database-verification.json). System namespaces are excluded. The `assessment_lab` namespace contains five routines; the assessment source relations are in `public`. No business rows or sequence current values were queried.

Exact DEV differences retain ACL/ordinal/internal-trigger identifiers and literal line endings. Six routine body differences are line-ending-only; no normalization changes the saved canonical text. Their presence is not evidence of a missing migration. Full Flyway V39 validation passed in both databases.

`recorded-logic/`, imported aliases and old `reporting/` records remain dated/historical evidence. Follow their current-definition references; do not treat them as competing live declarations. This audit changes no schema, permissions, jobs or financial data. Static dependency checks do not prove dynamic SQL behavior or financial correctness.
