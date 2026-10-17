# Shared PostgreSQL model

MW-Credit-App owns immutable migrations, guarded runners and database CI. DEV `loan_manager_dev` and PROD `loan_manager_prod` share one Cloud SQL instance; latest verified migration is V95 in DEV and in PROD (PROD applied 17 October 2026, 04:09Z); V94 and V95 definitions carry evidence saying they were applied in DEV and PROD. V93 definitions carry evidence saying what the PROD readback confirmed and what is still the migration value. Use the complete target tuple in [environment inventory](../../../Environment_Inventory.md).

- `relations/`: columns, constraints, indexes, triggers, policies and dependencies.
- `routines/`: exact signatures/bodies and captured ownership/access metadata.
- `schemas/`, `sequences/`: namespace and sequence definitions.
- `settings/`, `settingss/`: bounded application capability/configuration records.

The PWA, native agent, workers and reporting consume this model. Preserve physical identifiers and compatibility providers still in use. AppSheet retirement does not authorize dropping SQL objects.

Provenance belongs to each object. Current migration source reconciles changed function bodies; unchanged catalog properties retain their original observation basis. Structural validation does not prove live grants or behavior. Capture only affected metadata when a change invalidates it, not the entire database for routine documentation.