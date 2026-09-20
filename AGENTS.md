# AGENTS.md — AppSheet Development

This file governs OLTP, OLAP and Looker Studio work in this repository. AI Collection is governed separately in `C:\GitHub\MW-AI-Collection`: read its `AGENTS.md` and `SERVICE_CATALOGUE.md` before collection work. Its catalogue is default-deny; the `collection-agent` and `mw-ai-collection` junctions here are compatibility paths, not independent runtimes.

## Working method and task routing

- Carry authorized work through implementation, relevant verification, documentation and publication. Reuse decisions and scoped authorization from the conversation; ask only for missing authorization or information that materially affects correctness, scope or recovery. Continue independent work when one path is blocked. Do not add approval gates for routine reversible choices.
- Start with the task/continuation note and affected files or objects. Use `rg` and bounded reads; expand only for dependencies, conflicting evidence or observed failures. Read applicable instructions once per context and revisit when changed. Do not load every linked document or complete historical logs by default.
- Reuse maintained tools and available APIs for precise inspection/editing; AppSheet workflow tests still use the current GUI. Batch independent reads and coherent edits, then read back saved changes. Avoid repeated screenshots, unchanged polling, duplicate reports and broad regression runs without a reason. Once relevant checks pass, finish.
- Use one agent for routine work; delegate only when requested and useful for independent scope. Separate branches/worktrees isolate files, not the shared DEV apps/database. Coordinate overlapping live properties, migration numbers and shared workbook writes. Never overwrite another task's work. Keep the owner's model/settings unchanged unless asked.
- Archives and dormant references are excluded from routine release reads/updates. Read them only for a specific historical question or an affected/resumed feature. Keep current facts in their owning reference and link evidence instead of copying policy.
- Treat prior logs/exports as dated evidence, not current instructions or live observations. Current owner instructions govern project policy; report concrete conflicts without treating historical recommendations as new blockers.

Read only the applicable route/section before acting:

| Task | Additional context |
| --- | --- |
| Explanation or status | Relevant continuation note/evidence only; no live audit unless needed to answer |
| Repository documentation/tooling | Affected files; [scripts guide](scripts/README.md) only for runtime/setup/credential work |
| DEV feature or production release | Current [tracker](Documents/Release_Tracker.md) row and release log; for promotion use its filled copy of the [single master checklist](scripts/releases/templates/promotion-checklist.md). Read runbook detail only for a triggered step. |
| Live app/DB change | Affected entries in [environment inventory](Documents/Environment_Inventory.md); verify actual target identity |
| Model, workflow or report design | [Solution design](Documents/Solution_Design.md) and affected model/dictionary sections |
| PostgreSQL change | [Database procedure](database/README.md#each-change); setup/adoption only when applicable |
| DEV setup, refresh or changed automation routing | Relevant [preparation steps](Documents/Development_Environment_Preparation.md); [refresh runbook](Documents/Development_Refresh_Runbook.md) only for a requested refresh |

## Project release tracking — owner rule, 16 September 2026

Use the tracker to reserve one Rnnn for a coherent promotion batch, retain it across continuations/refinements and record dependencies. Check the latest reservations and publish a new reservation before parallel tasks rely on it; advance the next number and never reuse cancelled numbers. AppSheet/Flyway versions are separate identifiers. Governance/documentation-only work needs no product release number. Do not rename chats unless asked; suggested title is `Rnnn — Feature name`.

The tracker holds status and links; the release log holds a concise complete scope/change record and decisions; the machine-readable manifest ties Git, Flyway and DEV/RC/PROD versions together. Link exact technical evidence where useful; a per-property AppSheet delta is optional, not a manual deployment recipe or routine promotion gate. Model documents hold the production reference and labeled DEV differences. Avoid duplicate inventories. Distinguish development completion, owner acceptance, production authorization and verified deployment.

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

Release candidates (RCs) are temporary AppSheet copies, not a third database environment. They are prepared from integrated DEV, mapped to PROD, validated and frozen before App Upgrade into the existing PROD app IDs. A PROD-bound RC has production effects: contain its writes/notifications/schedules independently of the intended PROD definition. Follow the release workflow; DEV owner-only notification permission does not authorize RC production delivery.

**RC scheduled bots:** Preserve intended bot enablement/schedules and install a persistent `CONTEXT("AppName")` allowlist guard for each app's canonical DEV and PROD internal names, before any scheduled business side effect. RC names are never allowed; a schedule may fire but must skip business work. Keep this guard through App Upgrade, with no post-upgrade enablement edits. Follow the [scheduled-bot procedure](Documents/Release_Workflow.md#scheduled-bot-execution-guard) for placement, first-use runtime verification, reuse and refreshed DEV identities. This documents the required implementation, not a claim that existing bots are already guarded.

**App modes — revised owner rule, 19 September 2026:** DEV, RC and PROD apps use **Deployed** mode. DEV and PROD run their intended scheduled business jobs; RC scheduled business execution is blocked by the canonical-app guard while retaining enabled definitions for App Upgrade. Notifications remain enabled: DEV uses owner-only Partner delivery data; RC/PROD use PROD Partner data with shared recipient expressions. Do not disable RC bot definitions as a normal deployment substitution, which could disable PROD schedules on upgrade. Initial deployment checks apply when first deploying/replacing an app; no repeat Deployment Check or mode toggle for an already-Deployed app. This supersedes the earlier DEV Prototype rule; this documentation update performs no live transition.

OLTP owns operational entry and workflows; OLAP owns heavy analytics, partner management, allocations/settlements and assessments; Looker presents governed metrics. Keep heavy computation out of OLTP and duplicate editing out of OLAP. See Solution Design for details and dashboard page order.

- Links stay within their environment: DEV OLAP ↔ DEV OLTP; PROD OLAP ↔ PROD OLTP. **R009 owner revision:** notification routing is database-driven. Partners.Login Email identifies each distinct sign-in; Partners.Email is the delivery address and may be shared. Resolve the recorded transaction actor to Partner Row ID, exclude that partner, then deduplicate nonblank delivery addresses. Never exclude by delivery email or use the bot runner as the actor. Unmapped actors produce no recipients and must be investigated before accepting affected tests. Keep existing channels/event conditions. DEV Partner delivery addresses point only to `welct0407@mw-credit.com`; preserve distinct Login Email values. Apply/recheck this DEV-only data override after database refresh before jobs resume. Shared recipient expressions require no DEV-to-RC substitution; inspect only changed routes or remaining documented legacy overrides. Reviewed owner-only DEV delivery/testing is authorized; PROD promotion remains separately authorized.
- DEV retains released PROD bot/automation definitions, schedules/time zones and enabled/disabled states, except environment bindings, owner-only delivery and documented unreleased changes. Keep superseded PROD bots disabled and one active scheduler per business job/environment. Never disable integrity/calculation triggers for isolation; reconcile temporary pauses.
- Establish source/destination/link isolation during setup/refresh. Routine development reuses it. Recheck after copy/refresh/replacement/restore, changed recipients/links/app IDs/routing dependencies/called tasks, or concrete routing problems. Every RC copy/rebind is such a trigger: verify its complete source mapping and PROD substitutions once, then reuse that frozen evidence until invalidated. Unrelated field/formula/view/schedule/version changes in ordinary DEV tasks are not triggers.
- New/changed DEV routes must use DEV data and verified DEV export/webhook destinations before execution. Unknown routes stay disabled while corrected; record parity gaps. An unisolatable route needs an explicit owner exception, without blocking independent work or authorizing unrelated integrations. Apply only relevant preparation steps for ordinary automation edits; RC PROD routes follow Section 6.
- Refresh only on owner request, following the runbook for apps, DB or both. Preserve unreleased work/recovery; retain DEV themes, bindings, links and owner-only routing. Delete old DEV apps only after replacement validation/recovery checks pass. DB refresh uses a logical PROD dump/restore with Flyway history and reviewed retained migrations.

### Database development and promotion

Manage PostgreSQL DDL, indexes, constraints, views, functions, triggers and approved backfills through immutable `database/migrations/V<version>__<description>.sql` and existing runners. Add higher versions; never use `repair`, `clean`, checksum edits or out-of-order migration to hide drift. Reconcile emergency manual changes into reviewed migrations before ordinary development resumes.

Follow the database procedure for verified adoption/baselining, DEV testing and exact commit/hash promotion. No automatic baselining or schema creation against populated PROD. Never copy DEV financial data into PROD. Keep `public.flyway_schema_history` out of AppSheet. Direct public-IP SSL is configured; do not introduce a proxy/instance upgrade by default. Instance/network/credential/editor settings are separately documented, not Flyway changes.

Prefer expand/contract: migrate compatible additions before RC PROD-source verification/App Upgrade, keeping the previous and new app versions usable during cutover and app rollback. Defer destructive removal until a later tested release. App restoration does not undo SQL or financial writes; recovery follows the [release recovery runbook](Documents/Release_Recovery_Runbook.md).

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

Exact model/configuration changes (tables, columns, types, keys/Refs, expressions, filters/permissions/membership or availability) update affected rows in `Documents/AppSheet_Data_Dictionary.xlsx` and the release log. Update `Documents/AppSheet_Data_Model_Overview.md` only when architecture, relationships, ownership or its explanation of business behavior changes; no forced prose edit for an exact formula change that leaves that explanation correct. Keep PROD values and label open DEV differences. Preserve dated evidence in release logs/archive, not accumulating narratives in current-state files.

Maintain the concise change record and necessary technical evidence during edits; update applicable sections/rows once per completed batch and after promotion, without rebuilding/restyling unrelated content. Complete these updates before claiming the model change finished. An interrupted handoff may record pending documentation in the continuation note; that is unfinished work, not a completion claim. Pure formatting, governance or tooling changes with no model impact need no model-workbook edit. Update environment/development-difference records only when their facts change.

## 6. Release development and production promotion

**Execution contract, revised 20 September 2026:** all future promotions, including remaining work in existing releases, use one filled copy of the [master Markdown checklist](scripts/releases/templates/promotion-checklist.md) under `outputs/<release>/promotion-checklist.md`. The copy contains the release details, applicable activities and documentation closure; no parallel Excel or document checklist. Execute applicable rows only, reusing valid evidence. The [release workflow](Documents/Release_Workflow.md) supplies implementation detail, not extra routine gates. Add only a concrete scope/failure-driven missing activity to the same copy; do not invent unrelated checks or seek approval again when existing scope covers it. Preserve historical release methods/evidence. This governance change authorizes no live promotion.

### 6.1 Develop and capture the release

Keep a concise record of all included features/fixes, affected components, dependencies, tests, decisions and rollback, including meaningful refinements/generated changes. App Upgrade removes the need to transcribe every AppSheet property into a deployment checklist. Link saved versions and existing implementation evidence; retain exact values only where needed for model documentation, critical logic, environment substitutions, external/manual steps or troubleshooting. Full exports, per-save snapshots and exhaustive per-property deltas are optional. Preserve other releases' ownership and reconcile scope before copying RC.

Use [release templates and optional delta tools](scripts/releases/README.md). Every production release has a manifest and concise change record. Tools cannot discover unrecorded changes or manufacture live evidence. Integrate all batch features and prior PROD fixes in DEV before testing/copying. Independent feature copies are development aids, never successive PROD upgrade sources; whole-definition upgrade does not merge changes. Resolve unrelated unreleased configuration before copying a candidate.

### 6.2 Test, recommend readiness and freeze

Use the runbook's test tiers and existing runners/current GUI for changed behavior and affected consumers. Reuse passing evidence only while implementation, dependencies, environment and data assumptions still apply; label reuse. Rerun invalidated checks, not unrelated suites.

**Both apps must have zero outstanding editor configuration warnings/errors** at DEV readiness, refresh completion and PROD closure, including pre-existing issues. Use final saved-state diagnostics and relevant tests. Run the initial deployment check when first deploying a DEV/replacement/RC app; resolve applicable findings before deployment. Already-Deployed apps require no repeat Deployment Check: never toggle to Prototype, repeatedly search for a control or block closure on its absence. Deployed status alone does not verify a release. Never hide editor warnings; general exceptions do not waive the editor gate.

Report Ready to promote, Ready subject to listed checks/owner decision, or Not ready with reasons; distinguish DEV completion from RC promotion readiness. Briefly freeze shared DEV edits while recording the tested versions/commit, Flyway manifest/hashes and copying integrated DEV into named `MW-OLTP-Rnnn-RCk` / `MW-OLAP-Rnnn-RCk` candidates for the included apps. Record an unchanged companion explicitly. After reproducible capture, DEV can resume; validation never uses subsequently changed DEV.

During RC preparation, rebind every table/source to PROD and record exact necessary substitutions: PROD companion IDs, integrations/access and branding. R009 data-driven recipient expressions remain identical; PROD contact data controls RC/PROD delivery. Confirm required Login Email schema/mapping exists before RC verification. Restore only documented legacy DEV literals on routes not yet converted; never restore superseded creator-by-delivery-email logic. Reuse established coverage for untouched routes. **After DEV → RC copy, set each RC's theme to its corresponding PROD app's exact captured theme/color values** (OLTP → PROD OLTP; OLAP → PROD OLAP). Validate mappings, scheduled guard, editor issues and initial RC deployment check; deploy RC and freeze its final identity/version. A later configuration fix requires a new RC and affected retesting.

### 6.3 Approve and promote the complete batch

Confirm scoped owner acceptance/production authorization, current PROD baseline, backup/rollback versions and dependency order before PROD writes or RC production effects. Use the existing Flyway runner with the exact tested commit/manifest; account for all pending migrations. Immediately before upgrade, confirm PROD has not changed since the accepted baseline and the frozen RC still has its recorded version. Reconcile intervening PROD changes into a new integrated candidate; whole-definition replacement cannot preserve them automatically.

**Normal AppSheet promotion is App Upgrade from the approved PROD-mapped immutable RC into the existing PROD app. Never manually recreate release settings in PROD or upgrade directly from ordinary DEV.** Record each app's source/target and before/after versions; two upgrades and SQL are not atomic. Stop dependent steps on failure; use [recovery/hotfix instructions](Documents/Release_Recovery_Runbook.md). Emergency manual changes require scoped authorization, exact evidence and reconciliation into DEV before the next candidate. Do not patch a failed normal upgrade by silently hand-editing PROD.

### 6.4 Validate production and close

For App Upgrade, use **limited basic PROD validation**: confirm source RC/target identity and saved version, final sources and necessary environment substitutions, Deployed state, both-app editor diagnostics, load/sync and representative changed entry points. Confirm scheduled guard permits PROD and excludes RC. Reuse DEV behavioral tests; no exhaustive per-property readback, full-app diff, repeated DEV suite or repeated recipient audit. Use targeted checks for changed recipient logic/identity prerequisites; reuse established routing coverage. Check SQL migrations and external/manual steps independently; expand checks only for observed mismatch, changed critical behavior or a concrete uncertainty. Never compare against later DEV or perform unauthorized financial writes/forced notifications.

Missing/mismatched/pending required checks prevent Released; optional property comparisons are not an additional gate. Report **Deployment applied; verification incomplete**. Explicit owner exceptions stay labeled and cannot waive zero warnings. Complete documentation closure in the release’s single checklist: always update/verify `Release_Tracker.md`, `Environment_Inventory.md` and `Development_Changes.md`, and add only documents affected by scope. Record a concise impact decision for untouched categories. No per-release archive dispositions, full Documents inventory or independent documentation checklist. Update the documentation map only when files/purposes change. Close only promoted differences and reconcile the manifest/log/evidence. Documentation closure is required before Released. Commit/push final evidence, create/push the unique final Rnnn tag at that evidence commit and verify publication; never move an existing tag. Retain frozen RC recovery evidence and prevent RC execution. Report outcome, checks, tag/evidence, rollback and limitations.

## Automatic commit and push — owner rule, 10 September 2026

After a completed task or authorized maintenance run changes repository files, perform relevant checks/log updates and commit/push intended files to the current branch's configured upstream. Standing permission suffices unless the owner requests local-only changes. Inspect tree/staged diff, preserve unrelated work and exclude secrets/private data/backups/dependencies; never force-add ignored files. Use a descriptive commit and normal push; no force-push/history rewriting. Verify publication before claiming GitHub recovery coverage. On failure preserve work and report what remains local.

Commit at coherent completion or a useful checked checkpoint, not every message/save. Read-only work and ignored runtime-only changes require no commit; operational borrower/reviewer events do not authorize source edits/Git operations. Repository publication grants no production deployment, notification or expanded service authority.
