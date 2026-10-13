# Development workflow and execution ownership

Owner revision: **14 October 2026**. Use the current capable workspace and established access. Do not create a handoff merely to follow an old host preference. [AGENTS](../../AGENTS.md) owns authority/data protections; [PWA policy](PWA_Orchestration.md) owns checks; [Release Workflow](Release_Workflow.md) owns promotion.

## Repository and instruction ownership

| Repository | Owns |
| --- | --- |
| AppSheet-Loan-Project | Overall project management, current business references/dictionary and releases; remaining non-database implementation stays until a separately authorized move |
| MW-Credit-App | PWA/API, application infrastructure, shared loan SQL migrations/runners/tests and promotion tooling |
| MW-Integration-Agent | Debian integration code, service catalogue, systemd units and internal mw_agent state/migrations |
| Daily-Use | General-purpose work with no more specific owner |
| MW-AI-Collection | Separate scope governed by its own AGENTS and default-deny catalogue; junctions here are compatibility paths |

Keep current primary folder and repositories separate. Choose by component, not active checkout. Read the owning instructions/catalogue only when working on that component. Confirm branch, commit and dirty state; preserve unrelated edits and use an existing suitable isolated checkout when needed. Worktrees do not isolate shared databases.

MW-Credit-App is the sole source owner of shared migrations, runners, tests and database CI. Use its [canonical database procedure](https://github.com/welct0407/MW-Credit-App/blob/codex/r057-infrastructure-adoption/database/README.md) and exact tested migration commit/manifest. Preserve existing Flyway histories and immutable migrations. Retained tooling here locates that checkout through `scripts/database_location.py` or `scripts/database-location.mjs`; set `MW_CREDIT_APP_ROOT` when it is not adjacent. There is no second migration set here. Remaining implementation-code moves are deferred; this ownership does not authorize moving credentials, data, services or repositories.

Windows roots currently use C:/GitHub; a Cloud task has its own checkout. Do not assume a Windows path, historical account profile or an old cloud environment ID exists elsewhere. The [environment inventory](../Environment_Inventory.md) owns actual service identities; verify the affected target before live action.

## Responsibilities and routing

| Surface | Use |
| --- | --- |
| Current Codex/local or Cloud workspace | Source edits, CLI/API/Terraform and authorized data work using available supported access |
| Authenticated browser | Only for work not supported adequately by a maintained API/tool; use the [service account mapping](../Service_Account_Browser_Mapping.md) |
| VM-01 | Windows/local tool and account-bound access requirements; preserve its existing work and sign-in stores |
| Debian | Persistent integration, chart and collector runtime; a controlled deployment target, not a duplicate development worker |

Use the approved Secret Manager/unattended identity route before requesting human CLI sign-in or credential files. Current operator configuration is owned by MW-Credit-App's infrastructure/unattended-admin and scripts/Invoke-UnattendedAdmin.ps1. Its supported host/scope matters; do not assume every executor has equivalent rights. Keep any API exception bounded and reconcile Terraform afterward. Browser/manual fallback must not expand scope or bypass platform confirmations.

## Development, review, promotion and rollback

- Implement in the owning repository against the affected DEV or disposable path. No new live environment or copy for every change.
- Automatically use the [six-agent PWA process](PWA_Orchestration.md#six-agent-development-process) and [model mapping](Model_Work_Mapping.md) for product development, without another delegation request. Assign bounded work in waves, preserve one writer per surface, and use proportional checks with reusable results. Documentation-only/read-only tasks may use fewer roles; honor explicit personal-execution requests.
- Promote only the tested source/artifact/configuration under existing scoped authority. Hosting, Cloud Run, worker package and SQL are separate components; change only those required.
- Preserve current native scheduler ownership and environment isolation. Do not disable existing business operation merely for a source/doc edit.
- Recover with pinned native artifacts and the [recovery runbook](Release_Recovery_Runbook.md). A rollback does not reverse accepted payments or messages.
- Complete the required documentation maintenance step below before closing the batch. Reuse existing records; creating a new document requires explicit owner approval.

## Required documentation maintenance

Documentation is part of development completion, not an optional later task. At planning, use the complete evolving-document index in [Documents/README](../README.md) to map the requested change to its owning references. At closeout, check the final source/configuration diff and actual results against that full set, then update every affected existing document. Unchanged facts remain unchanged; this coverage check requires neither a live audit nor a new checklist or per-document no-change entry.

| Evolving reference | Keep current as development progresses |
| --- | --- |
| [Development Changes](../Development_Changes.md) | Current operation, active scope, remaining work, limitations and delivery-tooling status |
| [Release Tracker](../Release_Tracker.md) | Open/Frozen/Released state, numbering and pending release actions; change state only at the authorized transition |
| [Solution Design](../Solution_Design.md) | Implemented architecture, component ownership and business meaning |
| [PWA Data Model](../PWA_Data_Model_Overview.md) | Relationships, command/user-flow semantics and source-correction behavior |
| [Data Dictionary](../Data%20Dictionary/README.md) | Exact affected data/API/model definitions, system guides and coverage limits; use the helper and validate the affected batch |
| Existing dictionary upload snapshot | Regenerate through the [export procedure](Data_Dictionary_Export.md) when included source content changes; do not leave an outdated snapshot after changing its inputs |
| [Environment Inventory](../Environment_Inventory.md) | Verified service bindings, identities and deployment versions; distinguish planned from applied/verified state |
| [Service/account Mapping](../Service_Account_Browser_Mapping.md) | Confirmed account/profile assignments and access routes |
| [Resource Monitoring](../Resource_Monitoring.md) | Current monitoring operation, resource ownership and known limitations |
| [Dashboard Guide](../Resource_Monitoring_Dashboard_Guide.md) | Actual dashboard panels, metric meanings, UX and coverage limits |
| [Events Bridge](../Grafana_MCP_Events_Bridge.md) | Current bridge contracts, configuration, recovery and unresolved limitations |
| [Documents index](../README.md) and its linked current work/evidence records | Accurate navigation, ownership and outstanding work; update existing infrastructure/credential/release records when affected |

Agent D owns this maintenance step for the six-agent process, obtaining facts from A/B/E/F. Agent C checks changed documentation against the implemented behavior and test evidence; the orchestrator confirms coverage and completion before publication. For smaller documentation tasks or explicit personal execution, the executor performs these responsibilities directly. Summarize updated references and genuine gaps once in the existing task/development record. Do not declare the batch complete while affected documentation remains stale.

### New documents require owner approval

Update existing documents by default. Do not create a new document in any repository, folder, format or external destination without explicit owner approval for that document. This includes change logs, plans, handoffs, reports, checklists, release records/manifests, dictionary document files and new export copies. A template, tool, development request, delegated assignment or release/publication approval is not document-creation approval. An explicit owner request to create the particular document is sufficient; do not ask again when that approval already exists.

If no existing document can hold required information, prepare the proposed path/title, purpose and content in chat or an existing record, then request approval before creating it. Continue independent authorized work while waiting. If a validator requires a missing document/manifest, leave that dependent step pending; never bypass the validator or claim completion. Updating an existing generated snapshot is permitted; a missing snapshot or differently named copy requires creation approval. Keep rules in Rules and ongoing facts in Documents.

## Debian runtime and deployment boundaries

The recorded target is vm-mw-credit-agent, Debian, project clever-oasis-508610-n7, asia-southeast1. Confirm the specific instance/current installed package for a change; a repository HEAD is not runtime evidence.

| Component | Owning reference |
| --- | --- |
| Integration source/package/configuration/journals | [Operations](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/OPERATIONS.md), [service catalogue](https://github.com/welct0407/MW-Integration-Agent/blob/main/SERVICE_CATALOGUE.md) |
| Journal/database recovery | [PostgreSQL operations](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/POSTGRESQL_OPERATIONS.md) |
| Tunnel and SQL proxy | Integration systemd/configuration and MW-Credit-App Terraform ownership |
| Charts and monitoring collector | [Monitoring](../Resource_Monitoring.md) and affected maintained scripts |

Private service config remains under /etc; mutable integration state under /var/lib/mw-integration-agent; installed package/source under /opt. Use the existing strict-host SSH/IAP/Tailscale route documented for the current executor. Never disable host checks, add public SSH ingress or expand IAM to bypass an access failure.

Deploy the exact tested package with a usable prior package/configuration and journal-compatible recovery. Preserve service switches, cutoffs and one worker/scheduler owner. The Windows partner worker remains paused; no second production worker in a development checkout. Never replay the historical SQLite updater or reset journals.

## Data operations and access boundaries

Use native API/SQL routes. AppSheet APIs, API-key retrieval, app IDs and app editor operations are retired, not fallback access.

- Verify project/instance/database and intended role; distinguish DEV, PROD restricted reader, administrator and mw_agent. Use bounded reads and avoid returning personal/financial data.
- Before authorized PROD writes, establish the applicable verified restorable backup, intended records/affected counts and recovery. Use tested transaction/concurrency/idempotency safeguards.
- Reconcile unknown outcomes before retries. Never replay uncertain payments or sends. Preserve financial/integrity triggers and later transactions. Supported ordinary source CRUD remains valid under its implemented semantics.
- Use Secret Manager references and workload identities; never expose secret payloads. Private plans/state/backups/exports stay outside repositories. Preserve existing app-managed sign-in stores.
- Scoped data corrections do not require a PWA deployment ceremony. Schema/functions still use immutable migrations in MW-Credit-App.

## Handoff and fallback contract

Handoff only when another executor is actually needed. Pass outcome, repository/branch/paths, target identity, existing authority, pins/recovery, passed checks and next action in a short note. Share secret references, never values. The receiver inspects new evidence rather than repeating the sender's whole audit.

If access is unavailable, identify the exact restriction and continue independent work. Use available tools first; leave only the unsupported step to the owner. Do not create another credential, host or service merely to get around a failed route.

Historical routing reviews, capability snapshots and permissions-setting proposals remain in Git tag R057; they are dated evidence, not current task gates. This document changes no live access, account setting or deployment.
