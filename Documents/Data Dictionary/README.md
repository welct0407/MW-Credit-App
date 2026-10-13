# Current ecosystem data dictionary

Start with the affected system/object. The dictionary documents the PWA/API and shared SQL setup; retired AppSheet definitions, workbook imports and closed DEV snapshots are removed.

| Need | Reference |
| --- | --- |
| PWA pages, API, agent, receipts, push and jobs | [PWA contracts](systems/pwa/README.md) |
| SQL tables, views, routines and permissions | [PostgreSQL](systems/postgresql/README.md) |
| Reporting models | [Metabase](systems/metabase/README.md) |
| Monitoring configuration | [Grafana](systems/grafana/README.md) |
| Business meaning | [PWA data model](../PWA_Data_Model_Overview.md) |
| Environments and deployed versions | [Environment inventory](../Environment_Inventory.md) |
| Find/read/update/export | [Tool guide](../../scripts/dictionary/README.md) |
| File contract | [Format](FORMAT.md), [registry](catalog.yaml) |
| Known coverage limits | [Register](unresolved.yaml) |

Exact SQL identifiers are preserved, including compatibility names still used by the PWA. Per-object provenance states how a value is known; a source review is not a fresh database capture. Latest verified deployment is V91. Source definitions for changed routines take precedence over older capture text.

Update only affected objects, rebuild the navigation index when necessary and validate the coherent batch. Never include credentials, borrower records or financial transaction data. There is no maintained Excel mirror or historical overlay.