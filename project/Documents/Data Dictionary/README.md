# Current ecosystem data dictionary

Start with the affected system/object. The dictionary documents the PWA/API and shared SQL setup; retired AppSheet definitions, workbook imports and closed DEV snapshots are removed.

| Need | Reference |
| --- | --- |
| Every current dictionary definition | [Complete object index](index.json) — each entry's `file` path is relative to this folder |
| PWA pages, API, agent, receipts, push and jobs | [PWA contracts](systems/pwa/README.md) |
| SQL tables, views, routines and permissions | [PostgreSQL](systems/postgresql/README.md) |
| Reporting models | [Metabase](systems/metabase/README.md) |
| Monitoring configuration | [Grafana](systems/grafana/README.md) |
| Business meaning | [PWA data model](../PWA_Data_Model_Overview.md) |
| Environments and deployed versions | [Environment inventory](../Environment_Inventory.md) |
| Find/read/update/export | [Tool guide](../../scripts/dictionary/README.md) |
| File contract | [Format](FORMAT.md), [registry](catalog.yaml) |
| Known coverage limits | [Register](unresolved.yaml) |

Exact SQL identifiers are preserved, including compatibility names still used by the PWA. Per-object provenance states how a value is known; a source review is not a fresh database capture. Latest verified deployment is V95 in DEV (17 October 2026) and V93 in PROD. The V95 definitions (`agent_audit.begin_operation`, `agent_audit.capture_change`, `public.attach_payment_receipt_evidence` and the `agent_audit.commits.database_session_role` default) are recorded at PROD scope from the migration source and match the DEV run; they become live PROD values with the PROD migration. The V94 definitions (`pwa_job_runs` without the lease state, `pwa_job_run_v1`, the ten routines calling `pwa_lock_key_v1`, `payment_crud_prepare`) are recorded at PROD scope from the migration source and match the DEV readback; they become live PROD values only after the PROD migration. The V93 definitions (ledger definer, four indexes, `a000_blank_refs`, `pwa_lock_key_v1`, `monitoring`) are recorded at PROD scope; the PROD readback after the migration confirms the owner, definer flag, "Cash Ledger" ACL and extension. Function EXECUTE ACLs and the `public` schema ACL are migration values. Source definitions for changed routines take precedence over older capture text.

The object index covers every registered YAML definition under `systems/`; use its system, kind, name and scope fields to select an entry, then open its `file` path or use the linked tool guide's find/read commands. System guides below this root explain their contracts; the index supplies complete object-level navigation without duplicating hundreds of links in AGENTS.md.

Update only affected objects, rebuild the navigation index when necessary and validate the coherent batch. Never include credentials, borrower records or financial transaction data. There is no maintained Excel mirror or historical overlay.
