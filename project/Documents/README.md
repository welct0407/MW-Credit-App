# MW Credit documentation

Read [AGENTS.md](../../AGENTS.md) first, then only the reference needed for the task. Documentation has two sets.

## 1. Standing rules — Documents/Rules

[Rules and procedures](Rules/README.md) govern development, the automatic six-agent process, model assignments, release/promotion/recovery, DEV preparation/refresh, alert response, dictionary export and local storage. Follow them until deliberately revised under owner direction. Keep routine progress and deployment updates out of these documents.

## 2. Evolving project documents — Documents

Keeping this entire set current is a required part of each development batch under the [documentation maintenance step](Rules/Development_Workflow.md#required-documentation-maintenance). Review coverage of the full index and update every affected existing reference before completion; unchanged facts need no cosmetic edits. Update each fact in its owning document; Git retains superseded versions. Optional new documents need explicit owner approval. Required technical records for an authorized deployment/migration, including release manifests and recovery/deployment receipts, need no separate approval.

| Current information | Reference |
| --- | --- |
| Project background, overview and roadmap | [Project README](../README.md) — living entry point of `project/`; the [repository README](../../README.md) covers the app |
| Current operation and outstanding work | [Development changes](Development_Changes.md) |
| Open release and release transitions | [Release tracker](Release_Tracker.md) |
| Architecture and business behavior | [Solution design](Solution_Design.md), [PWA data model](PWA_Data_Model_Overview.md). Runtime facts start in the **Current state** sections of Solution design (PWA/API), [database/README.md](../../database/README.md) and [integration-agent/README.md](../../integration-agent/README.md) |
| Exact data/API definitions | [Data Dictionary](Data%20Dictionary/README.md), [complete object index](Data%20Dictionary/index.json) — its existing structured subfolder remains here. An optional local upload snapshot is ignored by Git; see the [export procedure](Rules/Data_Dictionary_Export.md) |
| Environments, service bindings and verified deployments | [Environment inventory](Environment_Inventory.md) |
| Current human accounts and browser assignments | [Service/account mapping](Service_Account_Browser_Mapping.md) |
| Monitoring operation, dashboards and bridge configuration | [Monitoring](Resource_Monitoring.md), [visual guide](Resource_Monitoring_Dashboard_Guide.md), [event bridge](Grafana_MCP_Events_Bridge.md) |
| Infrastructure ownership and remaining cleanup | [Adoption matrix](../outputs/r057-infrastructure-adoption/README.md) |

Maintained tools live in [scripts](../scripts/README.md); release evidence and task results live in their existing outputs/change-log records. Use the [promotion template](../scripts/releases/templates/promotion-checklist.md) when promotion is authorized. Keep the current dictionary's format and system guides with its structured definitions; they describe that evolving data contract.
