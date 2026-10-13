# AGENTS.md — MW Credit development

Owner revision: **14 October 2026, Asia/Bangkok**. This is a small PWA used by two people, including the owner. Prefer simple, reversible solutions and short delivery cycles. Do not introduce enterprise process, extra services or speculative compliance requirements.

## Working method and task routing

- Work directly by default. Use an agent only for a useful independent task under existing authorization; the six-role roster is available, not a mandatory pipeline. When the owner requests personal execution, do not delegate.
- Start with this file, the relevant continuation note, affected files and Git status/starting commit. Read the current release row before product development; read other documents only when triggered below. Reuse context within a task.
- Use bounded searches/reads, batch independent operations and use maintained CLI/API tools. Prefer Terraform for infrastructure; use a documented API exception only when the provider cannot perform the reviewed change, then reconcile state. Do not use GUI where a suitable supported tool exists.
- Make routine reversible decisions and finish authorized implementation, relevant verification, records and publication. Reuse scoped approvals; ask only for a missing decision or authority that materially changes the work. An approval should concern a concrete prepared result.
- Investigate a failure before changing limits or retrying. Once the affected checks pass, finish. No repeated audits, unchanged polling, ceremonial handoffs or full-suite runs merely for task closure.
- Keep brief progress updates during longer work and state real blockers. Stop the task and its workers when asked.

| Trigger | Read only what applies |
| --- | --- |
| Status or explanation | Current continuation/evidence; no live audit unless needed |
| Product development or promotion | Current [release row](Documents/Release_Tracker.md#current-development-release), affected source; [PWA delivery policy](Documents/PWA_Orchestration.md) for check selection |
| Promotion or recovery | [Release workflow](Documents/Release_Workflow.md) or [recovery](Documents/Release_Recovery_Runbook.md); existing release record |
| Live target/access change | Affected [environment inventory](Documents/Environment_Inventory.md) entry and owning access/runbook |
| Cross-repository/host work | [Development workflow](Documents/Development_Workflow.md); destination AGENTS/catalogue |
| Delegation/model selection | [Model mapping](Documents/Model_Work_Mapping.md); do not reload it for routine solo execution |
| SQL change | MW-Credit-App's database/README.md and affected migrations/tests |
| DEV setup or owner-requested refresh | [Preparation](Documents/Development_Environment_Preparation.md) or [refresh](Documents/Development_Refresh_Runbook.md) |
| Business/model/dashboard change | Affected design/dictionary/runbook only |

## Ownership and environments

Keep the repositories separate and the current primary folder unchanged:
- **AppSheet-Loan-Project:** project management, current business references and release records. Its name is retained.
- **MW-Credit-App:** PWA, API, shared SQL migrations/runners/tests, application infrastructure and tooling.
- **MW-Integration-Agent:** Debian integration runtime and its own service catalogue. AI Collection has separate instructions/catalogue; compatibility junctions here are not runtimes.

PWA/API/integration services own current operation. AppSheet is retired; retained cloud definitions are disabled and are not active dependencies or delivery gates. See [retirement evidence](outputs/r057-appsheet-retirement/README.md). Do not reactivate it without scoped owner authorization. Preserve shared SQL/GCS, receipt contents and compatibility identifiers; do not rename them merely because they contain “AppSheet”.

DEV and PROD use separate databases, `loan_manager_dev` and `loan_manager_prod`, on a shared Cloud SQL instance. Verify project/instance/database, service and storage prefix for the affected action; host alone is insufficient. Shared-instance changes can affect both environments. Preserve DEV delivery isolation, service identities and one scheduler owner per job/environment. Never disable integrity/calculation triggers for isolation.

## Authority, data and recovery

- Production deployment, financial data changes, forced live notifications, new schema tables/columns, destructive recovery and service activation require scoped owner authorization. Existing explicit authorization covering the action is sufficient; do not ask again at each step. Technical access is not authority.
- Use synthetic/disposable data for tests. Owner-only DEV notification tests remain authorized after verifying actual recipient isolation. Do not manufacture a production payment or notification to validate a release.
- Preserve authorization checks, immutable keys, relationships, retry/idempotency behavior, audit and financial reconciliation. Supported ordinary source CRUD remains the prototype correction interface where implemented dependencies stay consistent; do not impose a new reversal framework or silently regenerate historical charges.
- Reconcile unknown payment/send outcomes before retrying. Preserve later user writes, journals and other tasks' work.
- Establish rollback once for the affected change batch: Git baseline for files; prior artifact/configuration for deployment; verified restorable backup for production database changes. UI-only releases need no database dump or restore rehearsal.
- Keep shared migrations immutable and increasing. Use the canonical guarded runner with the exact tested migration commit/manifest; never use `clean`, `repair`, checksum edits or automatic baselining to hide drift. Test actual restricted roles for changed access behavior. Include only affected current consumers and relevant previous PWA/API versions, not retired AppSheet parity.

## Credentials and local work

Use Secret Manager and established workload/unattended identities. Read secret references, not payloads, unless execution requires them; never print values. Do not ask the owner to recreate credentials before checking the owning access procedure and existing secure references. Do not regenerate a lost recovery key.

Keep secrets, state/plans, private exports, borrower data and backups outside every repository, including ignored directories. Preserve application-managed sign-in stores. Use the current user's established private location, not an assumed historical profile path. Consult [scripts guidance](scripts/README.md) only for affected runtime/credential work.

`sources/` is read-only. Maintained tools belong in `scripts/`; sanitized evidence in `outputs/`. Reuse installed tools and root dependencies; do not create per-output dependency copies. Preserve all pre-existing uncommitted work. Clean only this task's verified disposable paths under [local storage policy](Documents/VM01_Local_Storage.md); failed cleanup is reported, not worked around.

## Delivery and records

Follow the [PWA policy](Documents/PWA_Orchestration.md): focused checks during development; one consolidated broad run only when the combined change warrants it; promote tested artifacts; one bounded deployed smoke. A valid existing CI run can satisfy promotion. No extra design document, independent reviewer, device matrix or owner testing round for every small change. Required repository checks still apply; never claim a skipped check passed or bypass a validator.

Use the single Open release for product work. Freeze only when authorized promotion starts, pin the package, then publish the coordinated next-number handoff in the [tracker](Documents/Release_Tracker.md). Frozen corrections stay with that release; new features use the Open successor. Capture independently before later shared DEV changes. Documentation/governance-only work requires no product release or deployment.

Keep records proportional:
- One concise change log per coherent task/batch: purpose, changed scope, checks, recovery and outcome. Read-only answers need none.
- One release promotion record based on the [compact template](scripts/releases/templates/promotion-checklist.md), plus the machine-readable manifest required by the delivery runner. Reuse existing records; no duplicate batch/design/checklist/continuation files.
- Update the tracker at release transitions and owning documents only when their facts change. No mandatory readback or no-change entry for every document.
- Update exact current model definitions for schema/behavior/access changes through the [dictionary helper](scripts/dictionary/README.md); validate the affected dictionary batch. No dictionary rebuild for UI-only or policy edits. Retired AppSheet objects are not mirrored for new PWA changes.
- Update the monitoring visual guide when its dashboards change. Change architecture prose only when architecture/business meaning changes.
- Keep current references concise and current. Delete unused/superseded documentation rather than maintaining history copies; Git retains prior versions. Retain only evidence needed for active recovery, pending work or current source provenance.

## Automatic commit and push

After coherent completion, review the intended diff, run relevant checks and commit/push only task changes to the configured branch under standing publication authority. Preserve unrelated dirty work; exclude secrets, backups and dependencies. Use normal pushes, verify the remote result and report publication failures honestly. Documentation alone needs no product CI/deployment. No force-push or history rewriting.

Publication does not authorize production effects or merging. Respect scoped merge/branch-cleanup authority, stacked PRs and active work; preserve unique history before deleting any branch. Final release evidence receives a unique annotated Rnnn tag after required deployment verification; never move an existing tag. Routine documentation tasks need no release tag.
