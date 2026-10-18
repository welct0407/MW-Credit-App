# Development workflow and execution ownership

Owner revision: **17 October 2026**. Use the current capable workspace and established access. Do not create a handoff merely to follow an old host preference. [AGENTS](../../../AGENTS.md) lists the hard rules; this page owns the working method, records, local work and data boundaries behind them; the [PWA policy](PWA_Orchestration.md) owns checks; [Release Workflow](Release_Workflow.md) owns promotion and publication.

## Directory and instruction ownership

One repository, `welct0407/MW-Credit-App`, holds everything below with full history. The GitHub name and deploy identity are unchanged.

| Directory | Owns |
| --- | --- |
| `project/` (former AppSheet-Loan-Project) | Overall project management, current business references/dictionary and releases; project scripts and sanitized evidence |
| root (`apps/`, `services/`, `database/`, `infrastructure/`, `scripts/`, `docs/`, `tests/`) | PWA/API, application infrastructure, shared loan SQL migrations/runners/tests and promotion tooling |
| `integration-agent/` (former MW-Integration-Agent) | Debian integration code, service catalogue, systemd units and internal mw_agent state/migrations |
| Daily-Use (outside this repository) | General-purpose work with no more specific owner |
| MW-AI-Collection (outside this repository) | Separate scope governed by its own AGENTS and default-deny catalogue; junctions here are compatibility paths |

Choose by component directory, not active checkout. Read the owning instructions/catalogue only when working on that component. Confirm branch, commit and dirty state; preserve unrelated edits and use an existing suitable isolated checkout when needed. Worktrees do not isolate shared databases.

The root `database/` is the sole source owner of shared migrations, runners, tests and database CI. Use its [canonical database procedure](../../../database/README.md) and exact tested migration commit/manifest. Preserve existing Flyway histories and immutable migrations. Project tooling in `project/scripts/` locates the root through `database_location.py` or `database-location.mjs`; the default is the repository root, and `MW_CREDIT_APP_ROOT` is only an override. There is no second migration set. This ownership does not authorize moving credentials, data or services.

A local Windows checkout and a Cloud task each have their own checkout path. A Claude Code cloud environment provisions pinned tools and optional gcloud sign-in (`GCP_SA_KEY_B64`) through its setup script, maintained as [project/scripts/cloud-session-setup.sh](../../scripts/cloud-session-setup.sh); select only this repository when starting a session. Do not assume a Windows path, historical account profile or an old cloud environment ID exists elsewhere. The [environment inventory](../Environment_Inventory.md) owns actual service identities; verify the affected target before live action.

## Responsibilities and routing

| Surface | Use |
| --- | --- |
| Current Codex/local or Cloud workspace | Source edits, CLI/API/Terraform and authorized data work using available supported access |
| Authenticated browser | Only for work not supported adequately by a maintained API/tool; use the [service account mapping](../Service_Account_Browser_Mapping.md) |
| VM-01 | Windows/local tool and account-bound access requirements; preserve its existing work and sign-in stores |
| Debian | Persistent integration, chart and collector runtime; a controlled deployment target, not a duplicate development worker |

Use the approved Secret Manager/unattended identity route before requesting human CLI sign-in or credential files. Current operator configuration is owned by the root infrastructure/unattended-admin and scripts/Invoke-UnattendedAdmin.ps1. Its supported host/scope matters; do not assume every executor has equivalent rights. Keep any API exception bounded and reconcile Terraform afterward. Browser/manual fallback must not expand scope or bypass platform confirmations.

## Working method and task routing

- Follow the [AGENTS](../../../AGENTS.md) reading order. Do not read every historical output. Reuse context within a task. Answer a status or explanation question from the current continuation note or evidence; no live audit unless needed.
- Outside PWA product development, work directly by default; the owner can request particular agents or personal execution.
- The [project overview](../../README.md) introduces the project. Detailed documentation is rooted at three entry points: [standing rules](README.md), [living documents](../README.md) and the [Data Dictionary](../Data%20Dictionary/README.md), whose [object index](../Data%20Dictionary/index.json) locates every current definition. Follow standing rules until deliberately revised under owner direction; keep routine development updates in the living references. Do not append progress reports to rule documents. Keep these indexes linked to every current document and definition when an approved file is added, moved or removed.
- Use bounded searches and reads, batch independent operations and use maintained CLI/API tools. Prefer Terraform for infrastructure; use a documented API exception only when the provider cannot perform the reviewed change, then reconcile state. Do not use a GUI where a suitable supported tool exists.
- Make routine reversible decisions and finish authorized implementation, relevant verification, records and publication. Reuse scoped approvals; ask only for a missing decision or authority that materially changes the work. An approval should concern a concrete prepared result.
- Investigate a failure before changing limits or retrying. Once the affected checks pass, finish. Do no repeated audits, unchanged polling, ceremonial handoffs or full-suite runs merely for task closure.
- Give brief progress updates during longer work and state real blockers. Stop the task and its workers when asked.

## Development, review, promotion and rollback

- Implement in the owning directory against the affected DEV or disposable path. No new live environment or copy for every change.
- Automatically use the [six-agent PWA process](PWA_Orchestration.md#six-agent-development-process) and [model mapping](Model_Work_Mapping.md) for product development, without another delegation request. Assign bounded work in waves to the named workers (Archie, Byte, Chase, Dewey, Echo, Forge), each started once per session and reused for every later task, preserve one writer per surface, and use proportional checks with reusable results. Documentation-only/read-only tasks may use fewer roles; honor explicit personal-execution requests.
- Promotion authority is in the [Release workflow](Release_Workflow.md#promotion). Promote only the tested source/artifact/configuration; Hosting, Cloud Run, worker package and SQL are separate components, so change only those required.
- Preserve current native scheduler ownership and environment isolation. Do not disable existing business operation merely for a source/doc edit.
- Recover with pinned native artifacts and the [recovery runbook](Release_Recovery_Runbook.md). A rollback does not reverse accepted payments or messages. Establish rollback once for the affected change batch: the Git baseline for files, the prior artifact/configuration for deployment, and a verified restorable backup for production database changes. A UI-only release needs no database dump or restore rehearsal.
- Complete the required documentation maintenance step below before closing the batch. Reuse existing records; optional new documents require approval, while required deployment/migration records are covered by the authorized task.

## Required documentation maintenance

Documentation is part of development completion, not an optional later task. At planning, use the complete evolving-document index in [Documents/README](../README.md) to map the requested change to its owning references. At closeout, check the final source/configuration diff and actual results against that full set, then update every affected existing document. Unchanged facts remain unchanged; this coverage check requires neither a live audit nor a new checklist or per-document no-change entry.

| Evolving reference | Keep current as development progresses |
| --- | --- |
| [Project README](../../README.md) | Project background, capability overview and roadmap milestones; update material changes without duplicating detailed release/runtime records |
| [Development Changes](../Development_Changes.md) | Current operation, active scope, remaining work, limitations and delivery-tooling status; a release's sections are pruned at its closure |
| [Release Tracker](../Release_Tracker.md) | Open/Frozen/Released state, numbering and pending release actions, without deployment pins; change state only at the authorized transition |
| [Solution Design](../Solution_Design.md) | Implemented architecture, component ownership and business meaning. Its **Current state** section is the first place to update runtime facts for the PWA and API |
| [PWA Data Model](../PWA_Data_Model_Overview.md) | Relationships, command/user-flow semantics and source-correction behavior |
| [Database README](../../../database/README.md) | Its **Current state** section is the first place to update runtime facts for the database (migrations, runners, roles) |
| [Integration agent README](../../../integration-agent/README.md) | Its **Current state** section is the first place to update runtime facts for the integration agent |
| [Data Dictionary](../Data%20Dictionary/README.md) | Exact affected data/API/model definitions, system guides and coverage limits; use the helper and validate the affected batch |
| Local dictionary upload snapshot | Only when a local snapshot exists (it is ignored by Git): regenerate it through the [export procedure](Data_Dictionary_Export.md) after included source content changes |
| [Environment Inventory](../Environment_Inventory.md) | Verified service bindings, identities and deployment versions. It is the only place for deployment pins; distinguish planned from applied/verified state |
| [Service/account Mapping](../Service_Account_Browser_Mapping.md) | Confirmed account/profile assignments and access routes |
| [Resource Monitoring](../Resource_Monitoring.md) | Current monitoring operation, resource ownership and known limitations |
| [Dashboard Guide](../Resource_Monitoring_Dashboard_Guide.md) | Actual dashboard panels, metric meanings, UX and coverage limits |
| [Events Bridge](../Grafana_MCP_Events_Bridge.md) | Current bridge contracts, configuration, recovery and unresolved limitations |
| [Documents index](../README.md) and its linked current work/evidence records | Accurate navigation, ownership and outstanding work; update existing infrastructure/credential/release records when affected |

Dewey (Agent D) owns this maintenance step for the six-agent process, obtaining facts from Archie, Byte, Echo and Forge. Chase (Agent C) checks changed documentation against the implemented behavior and test evidence; the orchestrator confirms coverage and completion before publication. For smaller documentation tasks or explicit personal execution, the executor performs these responsibilities directly. Summarize updated references and genuine gaps once in the existing task/development record. `npm run check:docs` ([below](#records-change-notes-and-retention)) must pass before publication. Do not declare the batch complete while affected documentation remains stale.

### Records, change notes and retention

Keep records proportional:

- Record each coherent task or batch once: one change note under `Change Logs/` (root app) or `integration-agent/Change Logs/`, using the template below (a new note file needs no approval), or an entry in the existing development record; plus only the affected owning references and dictionary records. One promotion record plus the required machine manifest suffices. Read-only answers need no record.
- Optional new logs, plans, reports or handoffs need explicit owner approval (below). Do not add duplicate documents merely because technical deployment records are authorized.
- Update exact current model definitions for schema, behavior or access changes through the [dictionary helper](../../scripts/dictionary/README.md) and validate the affected batch. UI-only or policy edits need no dictionary rebuild. Retired AppSheet objects are not mirrored for new PWA changes.
- Update the [monitoring visual guide](../Resource_Monitoring_Dashboard_Guide.md) when its dashboards change. Change architecture prose only when architecture or business meaning changes.
- Keep current references concise and current. Delete unused or superseded documentation instead of keeping history copies; Git retains prior versions.
- Maintained project tools belong in `project/scripts/`; sanitized evidence in `project/outputs/`. An evidence file stays only while a current document, README or maintained runtime script cites it. One-off release scripts and archived scripts do not keep evidence alive. Delete the rest; Git keeps history.
- Keep a change note while its release is Open or one of the three most recently Released releases, or while a current document links to it. Delete older notes; Git keeps them. Before deleting a note, repoint links to it to a commit permalink.
- Pruning happens at [release closure](Release_Workflow.md#promotion): the session that marks a release Released deletes its Development Changes sections, out-of-window notes and uncited evidence, and lists the deletions in that release's record.
- Run `npm run check:docs` (`node scripts/check-docs.mjs`; CI runs it on every event) before pushing documentation changes. It fails on broken relative links or anchors in Markdown, on deployment pins (Cloud Run revisions, image digests, Hosting version ids) in current documents outside the Environment Inventory, and on change notes dated from 18 October 2026 that miss the template headings. It warns on change notes older than 14 days that no current document links to, on evidence nothing current cites and on `AGENTS.md` over 800 words; release closure clears the warnings. Fix a failure; never bypass it or narrow the check's scope to hide a real pin or link.

Change-note template. Use these headings, in this order, with plain short sentences:

```markdown
# Change notes — <subject>, <date>

## Purpose
Why this batch exists, in one or two sentences.

## Changes
One bullet per changed area, naming the files or objects.

## Checks
| Command | Result |
| --- | --- |
| `<command as run>` | Pass or fail, with the key number |

## Not run
Checks skipped and why. A skipped check is not a pass.

## Recovery
How to undo the batch: Git baseline, prior artifact or configuration, backup reference.

## Open questions
Only decisions the owner still has to make.

## Remaining work
What is left, or "none".
```

### New documents require owner approval

Update existing documents by default. Optional new documents, including additional logs, plans, handoffs, reports, dictionary document files and export copies, require explicit owner approval. An explicit owner request to create a particular document is sufficient; do not ask again when that approval already exists.

Required technical records for an authorized DEV or PROD deployment/migration are an explicit exception: create or update the minimal promotion package/checklist, tested SQL manifest, backup/recovery metadata, maintenance-permission/restoration record, isolation preflight, deployment receipt and required verification/cleanup evidence without separate approval. The deployment/migration instruction already approves these necessary records, including private tool-generated JSON files and their containing backup directories. Preserve private-storage and validation requirements; do not pause an authorized migration merely because its runner must create a record.

For an optional new document outside that exception, prepare the proposed path/title, purpose and content in chat or an existing record, then request approval before creation. Continue independent authorized work while waiting. Updating an existing generated dictionary snapshot is permitted; a new dictionary export copy still needs approval. Keep rules in Rules and ongoing facts in Documents. Production scope, safeguards and when to ask about a real scope expansion are defined in [AGENTS](../../../AGENTS.md#hard-rules).

## Debian runtime and deployment boundaries

The recorded target is vm-mw-credit-agent, Debian, project clever-oasis-508610-n7, asia-southeast1. Confirm the specific instance/current installed package for a change; a repository HEAD is not runtime evidence.

| Component | Owning reference |
| --- | --- |
| Integration source/package/configuration/journals | [Operations](../../../integration-agent/docs/OPERATIONS.md), [service catalogue](../../../integration-agent/SERVICE_CATALOGUE.md) |
| Journal/database recovery | [PostgreSQL operations](../../../integration-agent/docs/POSTGRESQL_OPERATIONS.md) |
| Tunnel and SQL proxy | Integration systemd/configuration and root Terraform ownership |
| Charts and monitoring collector | [Monitoring](../Resource_Monitoring.md) and affected maintained scripts |

Private service config remains under /etc; mutable integration state under /var/lib/mw-integration-agent; installed package/source under /opt. Use the existing strict-host SSH/IAP/Tailscale route documented for the current executor. Never disable host checks, add public SSH ingress or expand IAM to bypass an access failure.

Deploy the exact tested package with a usable prior package/configuration and journal-compatible recovery. Preserve service switches, cutoffs and one worker/scheduler owner. The Windows partner worker remains paused; no second production worker in a development checkout. Never replay the historical SQLite updater or reset journals.

## Data operations and access boundaries

Use native API/SQL routes. AppSheet APIs, API-key retrieval, app IDs and app editor operations are retired, not fallback access.

- Use synthetic or disposable data for tests; never copy DEV financial data into PROD. Owner-only DEV notification tests remain authorized after verifying actual recipient isolation. Never manufacture a production payment or notification to validate a release.
- Verify project/instance/database, service and storage prefix for the affected action; the host alone is insufficient. Shared-instance changes can affect both environments. Verify the intended role; distinguish DEV, PROD restricted reader, administrator and mw_agent. Use bounded reads and avoid returning personal/financial data.
- Preserve authorization checks, immutable keys, relationships, retry/idempotency behavior, audit and financial reconciliation. Supported ordinary source CRUD stays the prototype correction interface where implemented dependencies stay consistent; add no new reversal framework and do not silently regenerate historical charges. Preserve later user writes, journals and other tasks' work.
- Before authorized PROD writes, establish the applicable verified restorable backup, intended records/affected counts and recovery. Use tested transaction/concurrency/idempotency safeguards.
- Reconcile unknown outcomes before retries. Never replay uncertain payments or sends. Preserve financial/integrity triggers and later transactions.
- Migrations are immutable and increasing. Use the canonical guarded runner with the exact tested migration commit/manifest; never use `clean`, `repair`, checksum edits or automatic baselining to hide drift. Test the actual restricted roles for changed access behavior. Include only affected current consumers and the relevant previous PWA/API versions, not retired AppSheet parity.
- For changed migrations, runners or tests follow [Each change](../../../database/README.md#each-change); reuse its `Test-CI.ps1` result at promotion while the inputs remain valid.
- Scoped data corrections do not require a PWA deployment ceremony. Schema/functions still use immutable migrations in the root `database/`.

## Environments and infrastructure ownership

- DEV and PROD use separate databases, `loan_manager_dev` and `loan_manager_prod`, on a shared Cloud SQL instance. Preserve DEV delivery isolation, service identities and one scheduler owner per job and environment. Never disable integrity or calculation triggers for isolation.
- PWA, API and integration services own current operation. AppSheet is retired; retained cloud definitions are disabled and are not active dependencies or delivery gates (see the [retirement evidence](../../outputs/r057-appsheet-retirement/README.md)). Do not reactivate it without scoped owner authorization. Preserve shared SQL/GCS, receipt contents and compatibility identifiers; do not rename them merely because they contain "AppSheet". No editor checks, parity, copies, upgrade or coexistence requirements apply.
- Terraform owns infrastructure configuration within the adopted roots. Shared SQL and receipt assets must not be destroyed or replaced. The Azure VM controller remains excluded; unattended admin access does not authorize runtime or business changes.

## Credentials and local work

- Use Secret Manager and established workload or unattended identities. Read secret references, not payloads, unless execution requires them; never print values. Check the owning access procedure and existing secure references before asking the owner to recreate a credential. Do not regenerate a lost recovery key.
- Keep secrets, state and plans, private exports, borrower data and backups outside the repository, including ignored directories. Preserve application-managed sign-in stores. Use the current user's established private location, not an assumed historical profile path. Consult the [scripts guidance](../../scripts/README.md) only for affected runtime or credential work.
- Preserve all pre-existing uncommitted work. Reuse installed tools and root dependencies; do not create per-output dependency copies. Clean only this task's verified disposable paths under the [local storage policy](VM01_Local_Storage.md); report a failed cleanup instead of working around it. Never delete another task's work, secrets, backups or application-managed state.

## Handoff and fallback contract

Handoff only when another executor is actually needed. Pass outcome, branch/paths, target identity, existing authority, pins/recovery, passed checks and next action in a short note. Share secret references, never values. The receiver inspects new evidence rather than repeating the sender's whole audit.

If access is unavailable, identify the exact restriction and continue independent work. Use available tools first; leave only the unsupported step to the owner. Do not create another credential, host or service merely to get around a failed route.

Historical routing reviews, capability snapshots and permissions-setting proposals remain in Git tag R057; they are dated evidence, not current task gates. This document changes no live access, account setting or deployment.
