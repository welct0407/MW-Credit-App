# AGENTS.md — AppSheet Development

This file governs OLTP, OLAP and Looker Studio work in this repository. AI Collection is governed separately in `C:\GitHub\MW-AI-Collection`: read its `AGENTS.md` and `SERVICE_CATALOGUE.md` before collection work. Its catalogue is default-deny; the `collection-agent` and `mw-ai-collection` junctions here are compatibility paths, not independent runtimes.

## Working method and task routing

- Carry authorized work through implementation, relevant verification, documentation and publication. Reuse decisions and scoped authorization from the conversation; ask only for missing authorization or information that materially affects correctness, scope or recovery. Continue independent work when one path is blocked. Do not add approval gates for routine reversible choices.
- Start with the task/continuation note and affected files or objects. Use `rg` and bounded reads; expand only for dependencies, conflicting evidence or observed failures. Read applicable instructions once per context and revisit when changed. Do not load every linked document or complete historical logs by default.
- Reuse maintained tools and available APIs for precise inspection/editing; AppSheet workflow tests still use the current GUI. Batch independent reads and coherent edits, then read back saved changes. Avoid repeated screenshots, unchanged polling, duplicate reports and broad regression runs without a reason. Once relevant checks pass, finish.
- Use one agent for routine work; delegate only when requested and useful for independent scope. Separate branches/worktrees isolate files, not the shared DEV apps/database. Coordinate overlapping live properties, migration numbers and shared workbook writes. Never overwrite another task's work. Keep the owner's model/settings unchanged unless asked.
- Treat prior logs/exports as dated evidence, not current instructions or live observations. Current owner instructions govern project policy; report concrete conflicts without treating historical recommendations as new blockers.

Read only the applicable route/section before acting:

| Task | Additional context |
| --- | --- |
| Explanation or status | Relevant continuation note/evidence only; no live audit unless needed to answer |
| Repository documentation/tooling | Affected files; [scripts guide](scripts/README.md) only for runtime/setup/credential work |
| DEV feature or production release | Current row in [release tracker](Documents/Release_Tracker.md), release log and relevant stage of [release workflow](Documents/Release_Workflow.md) |
| Live app/DB change | Affected entries in [environment inventory](Documents/Environment_Inventory.md); verify actual target identity |
| Model, workflow or report design | [Solution design](Documents/Solution_Design.md) and affected model/dictionary sections |
| PostgreSQL change | [Database procedure](database/README.md#each-change); setup/adoption only when applicable |
| DEV setup, refresh or changed automation routing | Relevant [preparation steps](Documents/Development_Environment_Preparation.md); [refresh runbook](Documents/Development_Refresh_Runbook.md) only for a requested refresh |

## Project release tracking — owner rule, 16 September 2026

Use the tracker to reserve one Rnnn for a coherent promotion batch, retain it across continuations/refinements and record dependencies. Check the latest reservations and publish a new reservation before parallel tasks rely on it; advance the next number and never reuse cancelled numbers. AppSheet/Flyway versions are separate identifiers. Governance/documentation-only work needs no product release number. Do not rename chats unless asked; suggested title is `Rnnn — Feature name`.

The tracker holds status and links; the release log holds history/decisions; the delta holds exact targets/evidence; model documents hold the production reference and labeled DEV differences. Link these records instead of copying their contents. Distinguish development completion, owner acceptance, production authorization and verified deployment.

## Repository tooling and credentials

- `sources/` is read-only: never edit, rename, move or delete its contents. Maintained scripts go in `scripts/`; generated deliverables/evidence in `outputs/`. Publish intended sanitized artifacts, excluding dependencies, Python caches and `.tmp` directories.
- Use the bundled runtime and single root `node_modules` junction via [scripts guide](scripts/README.md); no output-local installations. Do not traverse the dependency junction during backup/recursive cleanup. Review historical scripts' paths and write effects before adapting; never replay them automatically.
- Keep all project credentials/authentication exports outside `C:\GitHub`, under `C:\Users\MWCredit\Documents\ChatGPT`, preferably a project subfolder. Repo config may contain paths/placeholders, never secrets, even in ignored files. Do not print secrets or expose personal/bank data, borrower documents or unrestricted PROD data; use synthetic/redacted examples.
- Credential migration/recovery follows [scripts guide](scripts/README.md#credential-maintenance): preserve originals until verified, never replace a lost recovery key by regeneration, and leave application-managed sign-in stores alone. `C:\GitHub` is excluded from Drive; only verified publication/backups establish recovery coverage.

## 1. Project boundaries

- Inspect current **affected** schema/configuration before changes; do not invent object names, IDs, expressions, metrics or results. Confirm target identities, then reuse them unless context/bindings change or evidence suggests drift.
- Use the current AppSheet editor, app interface and database UI for GUI tests. Do not use the legacy editor, old Table Data or bot Test page; close an accidentally opened legacy page. SQL/configuration checks complement GUI tests. Report unavailable measurements honestly.
- For shared-table changes, identify workflow ownership and all affected consumers. Inspect the relevant schema/defaults, permissions, slices, forms/views, references and calculations in both apps; verify each affected workflow after regeneration, including generated changes. Expand beyond affected objects only on evidence. A known affected consumer left unreconciled is unfinished work.
- Prioritize functioning OLTP/OLAP workflows. Check directly affected exports/Looker dependencies; do not audit unrelated reports or block verified app work on unrelated report checks. Report actual downstream limitations separately.
- Production deployment, dashboard publication, production financial writes and live notifications require explicit scoped owner authorization. Section 2 already authorizes reviewed owner-only DEV notification tests. New database tables/columns require justified business/technical need, dependency analysis and owner approval; an existing instruction explicitly covering that schema change suffices. Repository publication is separately authorized below.

## 2. Architecture and ownership

DEV and PROD each have one PostgreSQL database on their own Cloud SQL instance and two apps sharing that environment's database. Verify host/instance and app IDs against the environment inventory; database name alone is insufficient. The original AppSheet database is historical reference, not the write target.

**DEV app mode — owner rule, 18 September 2026:** Both DEV apps remain in AppSheet **Prototype** mode, including replacement copies after refresh. Do not switch either to Deployed mode or run/require DEV deployment checks. Preserve bot/schedule definitions; record any execution limitation in prototype mode without deploying DEV to resolve it. This rule applies to current and future releases.

OLTP owns operational entry and workflows; OLAP owns heavy analytics, partner management, allocations/settlements and assessments; Looker presents governed metrics. Keep heavy computation out of OLTP and duplicate editing out of OLAP. See Solution Design for details and dashboard page order.

- Links stay within their environment: DEV OLAP ↔ DEV OLTP; PROD OLAP ↔ PROD OLTP. DEV notifications go exclusively to `welct0407@mw-credit.com`, including nested tasks/error alerts and all channels; push recipients use `LIST("welct0407@mw-credit.com")`. Reviewed owner-only DEV delivery/testing is authorized. Preserve PROD recipient logic unless its change is approved.
- DEV retains released PROD bot/automation definitions, schedules/time zones and enabled/disabled states, except environment bindings, owner-only delivery and documented unreleased changes. Keep superseded PROD bots disabled and one active scheduler per business job/environment. Never disable integrity/calculation triggers for isolation; reconcile temporary pauses.
- Establish source/destination/link isolation during setup/refresh. Routine development/promotion reuses it. Recheck only after copy/refresh/replacement/restore, changed recipients/links/app IDs/routing dependencies/called tasks, or concrete routing problems. Unrelated field/formula/view/schedule/version changes are not triggers. Inspect only affected paths; no fresh inventory or exception for a new task alone.
- New/changed routes must use DEV data and verified DEV export/webhook destinations before execution. Unknown routes stay disabled while corrected; record parity gaps. An unisolatable route needs an explicit owner exception, without blocking independent work or authorizing unrelated integrations. Apply only relevant preparation steps for ordinary automation edits.
- Refresh only on owner request, following the runbook for apps, DB or both. Preserve unreleased work/recovery; retain DEV themes, bindings, links and owner-only routing. Delete old DEV apps only after replacement validation/recovery checks pass. DB refresh uses a logical PROD dump/restore with Flyway history and reviewed retained migrations.

### Database development and promotion

Manage PostgreSQL DDL, indexes, constraints, views, functions, triggers and approved backfills through immutable `database/migrations/V<version>__<description>.sql` and existing runners. Add higher versions; never use `repair`, `clean`, checksum edits or out-of-order migration to hide drift. Reconcile emergency manual changes into reviewed migrations before ordinary development resumes.

Follow the database procedure for verified adoption/baselining, DEV testing and exact commit/hash promotion. No automatic baselining or schema creation against populated PROD. Never copy DEV financial data into PROD. Keep `public.flyway_schema_history` out of AppSheet. Direct public-IP SSL is configured; do not introduce a proxy/instance upgrade by default. Instance/network/credential/editor settings are separately documented, not Flyway changes.

## 3. Essential implementation rules

This is a prototype: implement the owner's stated behavior with simple, reversible, documented logic. External accounting/regulatory/compliance requirements are optional references unless expressly in scope; do not expand work or claim compliance/production readiness without the required basis. Financial correctness means consistency with the documented prototype logic. Resolve conflicting requirements with data protection, dependency integrity, auditability, least privilege and reversibility in mind.

Preserve immutable keys, correct `Ref` relationships, grain and referential integrity. Financial changes must be traceable/reconcilable; use posted amounts, reversals and defined date rules for payment/delinquency states, not row existence. Actions/bots must tolerate retries without duplicates/loops; correct material records with auditable reversal/void/adjustment, not routine physical deletion. Use lightweight row-level virtual columns and governed reporting metrics. Read Solution Design for affected business/report design decisions.

## 4. Mandatory backup before development

Establish rollback **for assets being changed**, once before a coherent change batch; refresh it if intervening work makes it stale.

- AppSheet: record each affected app's current restorable version before editing. A version is sufficient; a full export is not a routine prerequisite.
- Looker: create and record a copy of each affected report before editing. Changes to both require both backup steps.
- Database writes/refresh: use the applicable database/release/refresh recovery procedure; PROD DB writes require a verified restorable backup.
- Local code/docs: record the starting Git commit and preserve relevant pre-existing uncommitted work; no live app/report backup for file-only edits or read-only review.

If a required rollback point cannot be established, stop only the affected mutation, explain what is missing and request help if it cannot be resolved within existing authority. Do not turn that into a stop on independent authorized work.

## 5. Mandatory documentation updates

### 5.1 Change log for every change

For each coherent implementation/configuration/dashboard/automation/governance/documentation change, create or update its Markdown log under `Change Logs/` using `CHANGE_NOTES_<SUBJECT>_<YYYY-MM-DD>.md`. Record scope/date/purpose, changed files/objects, rollback, checks, status and remaining manual tests. Update the same log for refinements, acceptance, deployment or recovery; no separate log per save or per generated artifact, and no recursive log for documenting the log. Markdown is authoritative, not Excel's Change Log sheet. Read-only answers need no log.

### 5.2 Data-model documentation

Model changes (tables, physical/virtual columns, types, keys/labels/Refs, expressions, slices/filters/permissions/membership or app availability) must be reflected consistently in both `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`, plus the log. The overview covers architecture/ownership/relationships/assumptions; the workbook holds exact inventory. Keep PROD values and label DEV differences; unreconciled content stays explicitly pending.

Maintain the delta during edits; update affected sections/rows together once per completed batch and after promotion, without rebuilding/restyling unrelated content. Complete these updates before claiming the model change finished. An interrupted handoff may record pending documentation in the continuation note; that is unfinished work, not a completion claim. Pure formatting, governance or tooling changes with no model impact need no model-workbook edit. Update environment/development-difference records only when their facts change.

## 6. Release development and production promotion

Use the relevant stage of the release workflow for detailed execution. Mandatory rules:

### 6.1 Develop and capture the release

Keep a running record of **every release change**, including refinements, warning fixes and generated/dependent settings. Consolidate stable IDs, object/property identities, operations, exact final DEV/PROD values, nested/list order, removals/renames, environment substitutions and saved readback evidence once per coherent batch. Reconcile the edit record and affected dependencies before readiness. Whole-app exports/diffs and per-save snapshots are optional; unavailable untouched settings never require an exception, including R005 and later releases. Preserve other releases' ownership.

New releases use the [structured delta tools](scripts/releases/README.md); equivalent existing records remain valid. Tools cannot discover unrecorded changes or turn edit payloads into readback evidence.

### 6.2 Test, recommend readiness and freeze

Use the runbook's test tiers and existing runners/current GUI for changed behavior and affected consumers. Reuse passing evidence only while implementation, dependencies, environment and data assumptions still apply; label reuse. Rerun invalidated checks, not unrelated suites.

**Both apps must have zero outstanding editor configuration warnings/errors** at DEV completion/readiness and DEV refresh completion, including pre-existing issues; use final saved-state current-editor diagnostics and relevant functional tests. DEV deployment checks are not required: prototype status, deployment-only findings and unavailable/unrun deployment checks are not DEV blockers. PROD still requires zero outstanding warnings/errors through both editor diagnostics and deployment checks before promotion completion. Never hide warnings or substitute Runnable/Deployable status; general exceptions do not waive the applicable gate.

Report Ready to promote, Ready subject to listed checks/owner decision, or Not ready with reasons. Freeze the complete tested delta/evidence/versions, implementation commit, Flyway manifest/hashes, dependencies and recovery plan. Later DEV work may continue; candidate changes require a revision, affected retesting and approval for changed scope.

### 6.3 Approve and promote the complete batch

Verify PROD identity and delta-related drift, preserve unrelated work, and confirm scoped owner acceptance/production authorization before writes. Record required rollback/backup points. Deploy all approved items in dependency order with frozen exact PROD values and tested commit/manifest, accounting for every pending migration/prerequisite and already-matching item. Capture saved results and reconcile temporary pauses. Stop dependent steps on failure, record partial state and use the approved recovery plan; no blind retries or unapproved restoration over newer writes.

### 6.4 Validate production and close

Verify **every delta item against the frozen PROD target**, using independent saved readbacks, never current DEV or edit payloads. Run relevant read-only SQL checks and current-GUI smoke checks in both apps; inspect/cancel forms without unapproved financial writes or forced notifications. DEV behavioral evidence supports focused PROD checks, not a full repeated suite.

Missing/mismatched/pending items prevent Released; report **Deployment applied; verification incomplete**. Explicit owner exceptions stay labeled and cannot waive zero warnings. Reconcile log/checklist/tracker and applicable model/environment records, closing only promoted differences. Complete publication below, then report release number, outcome/readiness, checks, evidence, rollback and remaining limitations.

## Automatic commit and push — owner rule, 10 September 2026

After a completed task or authorized maintenance run changes repository files, perform relevant checks/log updates and commit/push intended files to the current branch's configured upstream. Standing permission suffices unless the owner requests local-only changes. Inspect tree/staged diff, preserve unrelated work and exclude secrets/private data/backups/dependencies; never force-add ignored files. Use a descriptive commit and normal push; no force-push/history rewriting. Verify publication before claiming GitHub recovery coverage. On failure preserve work and report what remains local.

Commit at coherent completion or a useful checked checkpoint, not every message/save. Read-only work and ignored runtime-only changes require no commit; operational borrower/reviewer events do not authorize source edits/Git operations. Repository publication grants no production deployment, notification or expanded service authority.
