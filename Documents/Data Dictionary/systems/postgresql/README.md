# PostgreSQL current metadata

The two databases share one Cloud SQL instance. Use [Environment Inventory](../../../Environment_Inventory.md) for the complete host/instance/database tuple and [run evidence](../../../../outputs/dictionary-reconciliation-20260924/README.md) for capture times, SSL/read-only assertions and coverage.

- `relations/`: tables, views and materialized-view metadata, exact columns, constraints, indexes, triggers, policies and catalog-discovered view dependencies. Internal integrity triggers are identified separately by their `internal` flag.
- `routines/`: full definitions and exact argument signatures, return types, volatility, security/settings, ownership and privileges. Overloads remain separate.
- `schemas/` and `sequences/`: exact namespace/ownership/ACL and sequence configuration/ownership. No custom types/domains/enums were found in these captures.
- `settings/`: database attributes/settings, extensions, default privileges, relevant roles and recursive memberships, job definitions, Flyway metadata and empty-inventory evidence for other inspected categories.

PROD has 58 relations and 90 routines; DEV has 56 and 83. `pg_cron` and its metadata/routines are PROD-only by the documented shared-instance design. System namespaces are excluded; extension-owned objects found in user namespaces are recorded as metadata, not audited vendor internals. The `assessment_lab` namespace contains five routines; the assessment source relations are in `public`. No business rows or sequence current values were queried.

Exact DEV differences retain ACL/ordinal/internal-trigger identifiers and literal line endings. Six routine body differences are line-ending-only; no normalization changes the saved canonical text. Their presence is not evidence of a missing migration. Full Flyway V39 validation passed in both databases.

`recorded-logic/`, imported aliases and old `reporting/` records remain dated/historical evidence. Follow their current-definition references; do not treat them as competing live declarations. This audit changes no schema, permissions, jobs or financial data. Static dependency checks do not prove dynamic SQL behavior or financial correctness.
