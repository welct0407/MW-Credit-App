# Documentation map

Start with [AGENTS task routing](../AGENTS.md#working-method-and-task-routing), not a full document read. The [master Markdown checklist](../scripts/releases/templates/promotion-checklist.md) is copied once per release; its filled copy is the sole promotion/documentation checklist for that release.

| Need | Reference |
| --- | --- |
| Which release to use for new development / status | [Current development release](Release_Tracker.md#current-development-release) and tracker history |
| Open DEV work | [Development Changes](Development_Changes.md) |
| Current identities/settings | [Environment Inventory](Environment_Inventory.md) |
| Service login account / browser profile | [Service account and browser mapping](Service_Account_Browser_Mapping.md) |
| Business/design decisions and diagrams | [Solution Design](Solution_Design.md) |
| Proposed Debian receipt picture capture and AppSheet viewing | [Receipt storage implementation handover — 27 September 2026](../outputs/receipt-storage-design-20260927/HANDOVER.md) — design only; private GCS archive, agent metadata and lightweight Payment image references |
| Proposed Borrower Portfolio / Detail pages and implementation handover | [Borrower pages design — 25 September 2026](../outputs/borrower-pages-design-20260925/HANDOVER.md) — design only; pending owner review |
| Partners tab, actual metrics and implementation handover | [Partners tab design — 26 September 2026](../outputs/partners-tab-design-20260926/HANDOVER.md) — delivered in R044; actual metrics, no forecast content |
| Forecast & Planning page | [Design summary](../outputs/forecast-planning-design-20260927/README.md) and [implementation handover — 27 September 2026](../outputs/forecast-planning-design-20260927/HANDOVER.md) — delivered in R045; [implementation and verification](../outputs/r045-forecast-planning/IMPLEMENTATION.md) |
| Model explanations | [Model Overview](AppSheet_Data_Model_Overview.md) |
| Exact model/configuration values across ecosystem systems | [Data Dictionary](Data%20Dictionary/README.md) |
| Instructions for a thorough OLTP/OLAP/PostgreSQL dictionary reconciliation | [Execution prompt](Data_Dictionary_Reconciliation_Prompt.md) |
| Verified 24 September OLTP/OLAP/PostgreSQL metadata, coverage and findings | [Reconciliation evidence](../outputs/dictionary-reconciliation-20260924/README.md), [AppSheet guide](Data%20Dictionary/systems/appsheet/README.md), [PostgreSQL guide](Data%20Dictionary/systems/postgresql/README.md) |
| One-file dictionary upload for ChatGPT feature design | [Double-click export instructions](Data_Dictionary_Export.md) |
| Triggered promotion implementation detail | [Release Workflow](Release_Workflow.md) |
| Failure/hotfix handling | [Release Recovery](Release_Recovery_Runbook.md) |
| DEV setup or changed routing | [DEV Preparation](Development_Environment_Preparation.md) |
| Requested apps/DB refresh | [DEV Refresh](Development_Refresh_Runbook.md) |
| SQL migrations | [Database procedure](../database/README.md#each-change) |
| Release record tooling | [Release helpers](../scripts/releases/README.md) |
| Correct app logos / restoration | [Logo resources](../resources/README.md) |
| How to read every resource dashboard visual | [Resource Monitoring Dashboard Guide](Resource_Monitoring_Dashboard_Guide.md) |
| Resource monitoring setup, access and recovery | [Resource Monitoring](Resource_Monitoring.md) |
| Dated changes/tests/decisions | [Change Logs](../Change%20Logs/) |
| Dormant analysis/export pilot | [Feature reference](reference/Daily_Loan_Analysis_Automation.md) |
| Historical evidence | [Archive index](archive/README.md) — excluded from routine work |

Update this map when paths or purposes change. Version/status facts belong in the tracker/inventory, policy in AGENTS, and completed history in release evidence. Read/update only documents affected by the task.
