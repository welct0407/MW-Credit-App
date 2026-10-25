# AGENTS.md — MW Credit

Owner revision: **25 October 2026, Asia/Bangkok**. MW Credit is a small PWA used by two people, including the owner. Prefer simple, reversible solutions and short delivery cycles; no enterprise process, extra services or speculative compliance requirements.

## Hard rules

- **Authority.** Production deployment, live financial writes, forced notifications, new tables or columns and destructive operations need scoped owner authorization; reuse an existing approval that covers the action. An owner instruction such as "move to production" or "promote this release" approves the requested scope, including tested schema migrations in that scope, backups, standard temporary maintenance permissions and required technical records; proceed without a second approval. It does not imply unrelated financial corrections, forced live notifications, destructive recovery or unrelated service activation. Technical access alone is not authority. Ask only for a missing decision or authority that materially changes the work.
- **Credentials.** Use Secret Manager and the established workload or unattended identities. Read secret references, not payloads, unless execution requires them. Never print a secret value.
- **Data.** Use synthetic or disposable test data; never copy DEV financial data into PROD. Keep secrets, state and plans, private exports, borrower data and backups out of Git, including ignored directories. Preserve authorization checks, immutable keys, audit, idempotency and financial reconciliation; reconcile an unknown payment or send outcome before retrying.
- **PROD.** Verify project, instance, database, service and storage prefix before a live action; the host alone is insufficient. DEV and PROD are separate databases (`loan_manager_dev`, `loan_manager_prod`) on one shared Cloud SQL instance; keep their targets and identities isolated. A production database change needs a verified restorable backup. Never disable integrity or calculation triggers.
- **Migrations.** Shared SQL migrations are immutable and increasing. Use the canonical guarded runner with the exact tested commit and manifest; never use `clean`, `repair`, checksum edits or automatic baselining to hide drift.
- **Publication.** After coherent completion, commit and push only the task's changes to the configured branch; no force-push or history rewriting; preserve unrelated uncommitted work. Never move an existing release tag. Publication does not authorize production effects or merging.
- **Records.** Update every affected existing document in the same batch and record the batch once: a change note file (no approval needed) with the [template](project/Documents/Rules/Development_Workflow.md#records-change-notes-and-retention), or an entry in the existing development record; read-only answers need none. Development and release records ride the next code push or the release's closure PR ([exceptions](project/Documents/Rules/PWA_Orchestration.md#lean-check-routine)). Optional new documents need explicit owner approval.
- **AppSheet** is retired, not a dependency or delivery gate ([retirement evidence](project/outputs/r057-appsheet-retirement/README.md)); do not reactivate it without scoped owner authorization.
- **AI Collection** is a separate scope with its own instructions and catalogue; compatibility junctions are not runtimes.
- **PWA product development** uses the [six-agent process](project/Documents/Rules/PWA_Orchestration.md#six-agent-development-process) automatically; this is standing owner authorization to delegate to the named team Archie, Byte, Chase, Dewey, Echo and Forge (Agents A–F). Start each worker once per session and give it every later task in that session; do not create a new worker per task. Other work is done directly by default.
- **`integration-agent/`** follows [its AGENTS](integration-agent/AGENTS.md) (default deny, no Instagram browser automation, own catalogue and change notes); its stricter runtime and safety rules win.

## Repository layout and ownership

One repository, `welct0407/MW-Credit-App`; the three former repositories are archived read-only. Choose by directory, not by active checkout, and read a directory's own instructions only when working there.

| Path | Owns |
| --- | --- |
| `project/` | Project management, business references, release records, dictionary, maintained scripts and sanitized evidence |
| root (`apps/`, `services/`, `database/`, `infrastructure/`, `scripts/`, `docs/`, `tests/`) | PWA, API, shared SQL migrations/runners/tests, application infrastructure and tooling |
| `integration-agent/` | Debian integration runtime and service catalogue |

## Where to read more

Start with this page, the continuation note, the affected files and Git status, then only the page the task triggers.

| Trigger | Read |
| --- | --- |
| Working method, records, local work, environments, cross-directory or host work, local storage cleanup | [Development workflow](project/Documents/Rules/Development_Workflow.md); [VM-01 storage](project/Documents/Rules/VM01_Local_Storage.md); the destination AGENTS or catalogue |
| Product development or promotion | Current [release row](project/Documents/Release_Tracker.md#current-development-release); [PWA orchestration](project/Documents/Rules/PWA_Orchestration.md) for checks |
| Delegation or model selection | [Model mapping](project/Documents/Rules/Model_Work_Mapping.md); not for routine solo execution |
| Promotion, tags, publication; rollback, hotfix | [Release workflow](project/Documents/Rules/Release_Workflow.md); [Release recovery](project/Documents/Rules/Release_Recovery_Runbook.md) |
| Live target or access change | Affected [environment inventory](project/Documents/Environment_Inventory.md) entry and the owning access runbook |
| SQL change | [database/README.md](database/README.md) and the affected migrations and tests |
| DEV setup or owner-requested refresh | [Preparation](project/Documents/Rules/Development_Environment_Preparation.md) or [refresh](project/Documents/Rules/Development_Refresh_Runbook.md) |
| Business, model or dashboard change | The affected design, dictionary or runbook only |
| Infrastructure or tooling | The owning infrastructure README; [docs/Development.md](docs/Development.md); [project scripts](project/scripts/README.md) for runtime or credential work |
| Overview and indexes | [Project README](project/README.md), [documents](project/Documents/README.md), [rules](project/Documents/Rules/README.md) |
