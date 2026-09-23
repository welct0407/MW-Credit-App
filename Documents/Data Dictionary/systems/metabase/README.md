# Metabase dictionary

The [models](models/) directory contains the model and field records already present in the Excel dictionary. Grain, IDs, field metadata, definitions and source references are preserved as recorded, with `imported-unreconciled` status. This migration did not inspect Metabase or establish a complete current inventory.

Future additions can use `models/`, `questions/`, `dashboards/` and `snippets/` under this namespace. Follow the [shared format](../../FORMAT.md), use the exact instance reference as the component once established, and preserve stable object IDs. Link maintained SQL/query definitions and release evidence; avoid duplicating executable source as a second owner. Existing imported model names remain their migration identities until a separately scoped identity/reconciliation update.

The scoped canonical cash-page update is documented under `dashboards/loan-reports.yaml`, `snippets/`, and `models/income-events.yaml`. Seven imported models carry an archived lifecycle; Daily Income Ledger is superseded by Income Events at the same card ID. Imported field evidence remains historical. Daily Cash Snapshots adds three verified stored-flow fields. Unaffected imported objects remain unreconciled.
