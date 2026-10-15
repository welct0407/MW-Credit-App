# AGENTS.md — MW Credit development

Owner revision: **15 October 2026, Asia/Bangkok**. This is a small PWA used by two people, including the owner. Prefer simple, reversible solutions and short delivery cycles. Do not introduce enterprise process, extra services or speculative compliance requirements.

## Working method and task routing

- For PWA product development, use the six-agent process in [PWA orchestration](Documents/Rules/PWA_Orchestration.md#six-agent-development-process) automatically in every conversation. This is standing owner authorization to delegate to Agents A–F; do not wait for another request. The main conversation orchestrates. Run bounded waves when concurrency is limited, reuse existing workers, and respect a task-specific personal-execution request. Documentation-only work and read-only answers use only the roles that help.
- Start with this file, the relevant continuation note, affected files and Git status/starting commit. Read the current release row before product development; read other documents only when triggered below. Reuse context within a task.
- The [project overview and roadmap](README.md) introduces the project. Detailed documentation is rooted here through three entry points: [standing rules](Documents/Rules/README.md), [living documents](Documents/README.md), and the [Data Dictionary](Documents/Data%20Dictionary/README.md), whose [object index](Documents/Data%20Dictionary/index.json) locates every current definition. Follow standing rules until deliberately revised under owner direction; keep routine development updates in the living references. Do not append progress reports to rule documents. Keep these indexes linked to every current document/definition when an approved file is added, moved or removed.
- Keep the complete evolving-document set current as a required part of each development batch, using the [documentation maintenance step](Documents/Rules/Development_Workflow.md#required-documentation-maintenance). Update every affected existing document before completion; unchanged facts need no cosmetic rewrite. Reuse existing documents. Optional new documents require explicit owner approval; the technical records required to perform and verify an authorized deployment or migration are already covered by that instruction and need no separate file-creation approval.
- Use bounded searches/reads, batch independent operations and use maintained CLI/API tools. Prefer Terraform for infrastructure; use a documented API exception only when the provider cannot perform the reviewed change, then reconcile state. Do not use GUI where a suitable supported tool exists.
- Make routine reversible decisions and finish authorized implementation, relevant verification, records and publication. Reuse scoped approvals; ask only for a missing decision or authority that materially changes the work. An approval should concern a concrete prepared result.
- Investigate a failure before changing limits or retrying. Once the affected checks pass, finish. No repeated audits, unchanged polling, ceremonial handoffs or full-suite runs merely for task closure.
- Keep brief progress updates during longer work and state real blockers. Stop the task and its workers when asked.

| Trigger | Read only what applies |
| --- | --- |
| Status or explanation | Current continuation/evidence; no live audit unless needed |
| Product development or promotion | Current [release row](Documents/Release_Tracker.md#current-development-release), affected source; [PWA orchestration](Documents/Rules/PWA_Orchestration.md) for the automatic six-agent process and check selection |
| Promotion or recovery | [Release workflow](Documents/Rules/Release_Workflow.md) or [recovery](Documents/Rules/Release_Recovery_Runbook.md); existing release record |
| Live target/access change | Affected [environment inventory](Documents/Environment_Inventory.md) entry and owning access/runbook |
| Cross-repository/host work | [Development workflow](Documents/Rules/Development_Workflow.md); destination AGENTS/catalogue |
| Delegation/model selection | [Model mapping](Documents/Rules/Model_Work_Mapping.md); do not reload it for routine solo execution |
| SQL change | MW-Credit-App's database/README.md and affected migrations/tests |
| DEV setup or owner-requested refresh | [Preparation](Documents/Rules/Development_Environment_Preparation.md) or [refresh](Documents/Rules/Development_Refresh_Runbook.md) |
| Business/model/dashboard change | Affected design/dictionary/runbook only |

## Ownership and environments

Keep the repositories separate and the current primary folder unchanged:
- **AppSheet-Loan-Project:** project management, current business references and release records. Its name is retained.
- **MW-Credit-App:** PWA, API, shared SQL migrations/runners/tests, application infrastructure and tooling.
- **MW-Integration-Agent:** Debian integration runtime and its own service catalogue. AI Collection has separate instructions/catalogue; compatibility junctions here are not runtimes.

PWA/API/integration services own current operation. AppSheet is retired; retained cloud definitions are disabled and are not active dependencies or delivery gates. See [retirement evidence](outputs/r057-appsheet-retirement/README.md). Do not reactivate it without scoped owner authorization. Preserve shared SQL/GCS, receipt contents and compatibility identifiers; do not rename them merely because they contain “AppSheet”.

DEV and PROD use separate databases, `loan_manager_dev` and `loan_manager_prod`, on a shared Cloud SQL instance. Verify project/instance/database, service and storage prefix for the affected action; host alone is insufficient. Shared-instance changes can affect both environments. Preserve DEV delivery isolation, service identities and one scheduler owner per job/environment. Never disable integrity/calculation triggers for isolation.

## Authority, data and recovery

- An owner instruction such as “move to production”, “move to prod”, “deploy to production” or “promote this release” is the production approval for the requested scope. Proceed through required preparation, tested schema migrations (including tables/columns within that scope), deployment and verification without asking for a second approval. This includes necessary backups/restore verification, standard temporary maintenance permissions and their restoration, and required technical records. Record the instruction in the existing release evidence; do not require magic wording or separate approval for each command, migration, phase or file.
- Ask only when a material action falls outside that authorized scope or the intended production scope is genuinely unclear. Unrelated financial corrections, forced live notifications, destructive recovery and unrelated service activation are not implied by a deployment instruction. Technical access alone is not authority. Preserve required tests, target checks, backup/recovery and migration guards; these are execution requirements, not repeat owner-approval gates.
- Use synthetic/disposable data for tests. Owner-only DEV notification tests remain authorized after verifying actual recipient isolation. Do not manufacture a production payment or notification to validate a release.
- Preserve authorization checks, immutable keys, relationships, retry/idempotency behavior, audit and financial reconciliation. Supported ordinary source CRUD remains the prototype correction interface where implemented dependencies stay consistent; do not impose a new reversal framework or silently regenerate historical charges.
- Reconcile unknown payment/send outcomes before retrying. Preserve later user writes, journals and other tasks' work.
- Establish rollback once for the affected change batch: Git baseline for files; prior artifact/configuration for deployment; verified restorable backup for production database changes. UI-only releases need no database dump or restore rehearsal.
- Keep shared migrations immutable and increasing. Use the canonical guarded runner with the exact tested migration commit/manifest; never use `clean`, `repair`, checksum edits or automatic baselining to hide drift. Test actual restricted roles for changed access behavior. Include only affected current consumers and relevant previous PWA/API versions, not retired AppSheet parity.

## Credentials and local work

Use Secret Manager and established workload/unattended identities. Read secret references, not payloads, unless execution requires them; never print values. Do not ask the owner to recreate credentials before checking the owning access procedure and existing secure references. Do not regenerate a lost recovery key.

Keep secrets, state/plans, private exports, borrower data and backups outside every repository, including ignored directories. Preserve application-managed sign-in stores. Use the current user's established private location, not an assumed historical profile path. Consult [scripts guidance](scripts/README.md) only for affected runtime/credential work.

`sources/` is read-only. Maintained tools belong in `scripts/`; sanitized evidence in `outputs/`. Reuse installed tools and root dependencies; do not create per-output dependency copies. Preserve all pre-existing uncommitted work. Clean only this task's verified disposable paths under [local storage policy](Documents/Rules/VM01_Local_Storage.md); failed cleanup is reported, not worked around.

## Delivery and records

Follow the [PWA policy](Documents/Rules/PWA_Orchestration.md): focused checks during development; one consolidated broad run only when the combined change warrants it; promote tested artifacts; one bounded deployed smoke. A valid existing CI run can satisfy promotion. No extra design document, independent reviewer, device matrix or owner testing round for every small change. Required repository checks still apply; never claim a skipped check passed or bypass a validator.

Use the single Open release for product work. Freeze only when authorized promotion starts, pin the package, then publish the coordinated next-number handoff in the [tracker](Documents/Release_Tracker.md). Frozen corrections stay with that release; new features use the Open successor. Capture independently before later shared DEV changes. Documentation/governance-only work requires no product release or deployment.

Keep records proportional:
- Record each coherent task/batch in an existing appropriate change log or development record: purpose, changed scope, checks, recovery and outcome. Read-only answers need none. Optional new logs, plans, reports or handoffs still require explicit owner approval; do not add duplicate documents merely because technical deployment records are authorized.
- Reuse the existing promotion record based on the [compact template](scripts/releases/templates/promotion-checklist.md) and runner manifest. If required deployment/migration records are missing, create them under the existing DEV/PROD task authorization without asking again. This covers the minimal promotion package/checklist, tested SQL manifest, backup/recovery metadata, temporary-permission/restoration records, isolation preflight, deployment receipts and required verification/cleanup evidence. Keep private records/backups outside Git and do not bypass validators.
- Review coverage of all evolving documents through their index and update every affected owner document, including the tracker at release transitions, before closing the batch. Use source/diff/evidence to identify impact; no unrelated live audit, cosmetic rewrite or per-document no-change entry is required.
- Update exact current model definitions for schema/behavior/access changes through the [dictionary helper](scripts/dictionary/README.md); validate the affected dictionary batch. No dictionary rebuild for UI-only or policy edits. Retired AppSheet objects are not mirrored for new PWA changes.
- Update the monitoring visual guide when its dashboards change. Change architecture prose only when architecture/business meaning changes.
- Keep current references concise and current. Delete unused/superseded documentation rather than maintaining history copies; Git retains prior versions. Retain only evidence needed for active recovery, pending work or current source provenance.

## Automatic commit and push

After coherent completion, review the intended diff, run relevant checks and commit/push only task changes to the configured branch under standing publication authority. Preserve unrelated dirty work; exclude secrets, backups and dependencies. Use normal pushes, verify the remote result and report publication failures honestly. Documentation alone needs no product CI/deployment. No force-push or history rewriting.

Publication does not authorize production effects or merging. Respect scoped merge/branch-cleanup authority, stacked PRs and active work; preserve unique history before deleting any branch. Final release evidence receives a unique annotated Rnnn tag after required deployment verification; never move an existing tag. Routine documentation tasks need no release tag.
