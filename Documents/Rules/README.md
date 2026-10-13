# Standing rules and procedures

These documents prescribe how work must be performed. Follow them together with [AGENTS.md](../../AGENTS.md) until deliberately revised under owner direction. They are stable instructions, not a development journal. Keep release progress, current deployments, implementation facts and test results in the [evolving project documents](../README.md) or their owning evidence records.

Every development batch must keep the entire evolving-document set current through the [required maintenance step](Development_Workflow.md#required-documentation-maintenance). Update affected existing documents; create no new document without explicit owner approval.

| Rule or procedure | Reference |
| --- | --- |
| Automatic six-agent development, checks and evidence reuse | [PWA orchestration](PWA_Orchestration.md) |
| Agent roles, models and reasoning settings | [Model mapping](Model_Work_Mapping.md) |
| Repository ownership, execution routes and data boundaries | [Development workflow](Development_Workflow.md) |
| Release freeze, promotion and publication | [Release workflow](Release_Workflow.md) |
| Failed deployment, rollback and hotfix | [Release recovery](Release_Recovery_Runbook.md) |
| DEV setup and recipient isolation | [Development preparation](Development_Environment_Preparation.md) |
| Owner-requested DEV refresh | [Development refresh](Development_Refresh_Runbook.md) |
| Alert diagnosis and bounded recovery authority | [Grafana alert runbook](Grafana_Alert_Troubleshooting_Runbook.md) |
| Local storage and task cleanup | [VM-01 storage](VM01_Local_Storage.md) |
| Generate the current dictionary upload | [Dictionary export](Data_Dictionary_Export.md) |

“Standing” does not freeze an obsolete procedure forever. Make an explicit rule/procedure revision when the owner changes the working method; keep ordinary status updates in Documents. Current identities, dashboard configuration, account assignments and exact data contracts remain in their evolving references.
