# MW Credit documentation

Read [AGENTS.md](../AGENTS.md) and only the reference needed for the task. Current documents describe the running PWA; Git retains superseded instructions.

| Need | Reference |
| --- | --- |
| Current operation, open work and release number | [Current work](Development_Changes.md), [release tracker](Release_Tracker.md) |
| Fast development and promotion | [PWA policy](PWA_Orchestration.md), [release workflow](Release_Workflow.md), [promotion record](../scripts/releases/templates/promotion-checklist.md) |
| Repository, host and access ownership | [Development workflow](Development_Workflow.md), [service accounts](Service_Account_Browser_Mapping.md) |
| Agent roles | [Automatic six-agent process](PWA_Orchestration.md#six-agent-development-process), [model mapping](Model_Work_Mapping.md) |
| Architecture and business model | [Solution design](Solution_Design.md), [PWA data model](PWA_Data_Model_Overview.md) |
| Exact data/API contracts | [Dictionary](Data%20Dictionary/README.md), [export](Data_Dictionary_Export.md) |
| Runtime identities | [Environment inventory](Environment_Inventory.md) |
| DEV setup or requested refresh | [Preparation](Development_Environment_Preparation.md), [refresh](Development_Refresh_Runbook.md) |
| Recovery | [Release recovery](Release_Recovery_Runbook.md) |
| SQL migrations | [Database procedure](https://github.com/welct0407/MW-Credit-App/blob/codex/r057-infrastructure-adoption/database/README.md) |
| Infrastructure ownership and remaining cleanup | [Adoption matrix](../outputs/r057-infrastructure-adoption/README.md) |
| Monitoring | [Operations](Resource_Monitoring.md), [visual guide](Resource_Monitoring_Dashboard_Guide.md), [alerts](Grafana_Alert_Troubleshooting_Runbook.md), [bridge](Grafana_MCP_Events_Bridge.md) |
| Tools and storage | [Scripts](../scripts/README.md), [VM-01 storage](VM01_Local_Storage.md) |

Update owning facts once. Do not append old release narratives or duplicate deployment evidence in current references.
