# Metabase dictionary

The [models](models/) directory contains the model and field records already present in the Excel dictionary. Grain, IDs, field metadata, definitions and source references are preserved as recorded, with `imported-unreconciled` status. This migration did not inspect Metabase or establish a complete current inventory.

Future additions can use `models/`, `questions/`, `dashboards/` and `snippets/` under this namespace. Follow the [shared format](../../FORMAT.md), use the exact instance reference as the component once established, and preserve stable object IDs. Link maintained SQL/query definitions and release evidence; avoid duplicating executable source as a second owner. Existing imported model names remain their migration identities until a separately scoped identity/reconciliation update.
