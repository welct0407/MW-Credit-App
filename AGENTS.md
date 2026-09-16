# AGENTS.md — AppSheet Development

AI Collection software has moved to C:\GitHub\MW-AI-Collection. For any collection work, first read that project's AGENTS.md and SERVICE_CATALOGUE.md; the catalogue is a default-deny boundary for programs and AI sessions. The collection-agent and mw-ai-collection paths here are compatibility junctions, not independent runtimes. AppSheet and reporting configuration work remains governed by this file.

This file governs Codex work on the shared AppSheet solution: the **OLTP Operations app**, the **OLAP Reporting app**, and the **Looker Studio dashboard**.

## Project release tracking — owner rule, 16 September 2026

- Use `Documents/Release_Tracker.md` as the project-wide R001, R002, R003… release register and source of the next available number. Read it before starting release work; reserve one number for a coherent scope and advance the next number. Publish the reservation before parallel sessions rely on it, and check for existing reservations to avoid duplicates.
- Keep the same release number across continuation chats and related features/refinements intended for one promotion batch. Independent releases get separate numbers; record dependencies between them. Never reuse cancelled numbers. Suggested owner chat title: `Rnnn — Feature name`; do not rename chats without a request.
- Maintain each release's content summary, status, dates, component versions, tested Git commit/Flyway manifest, approval, tests and rollback/change-log links. Include its number in change logs and completion messages. Distinguish development completion, owner acceptance and actual production deployment.
- Release numbers are separate from AppSheet versions and immutable Flyway migration numbers. A number, tracker entry or repository push does not authorize production changes. Documentation-only governance/tracker maintenance does not consume a product release number.
- Codex manages the end-to-end release record, implementation, testing, readiness recommendation, approved promotion and closure under Section 6. Owner acceptance and production authorization remain explicit decisions; one owner instruction may provide both when its scope is clear. Use the tracker for status and links, the release change log/checklist for exact scope and evidence, and the model documents for the current production reference and labeled development differences. Link evidence instead of duplicating it.

## Repository tooling and generated files

- Keep maintained scripts in `scripts/` and generated artifacts in `outputs/`. Track output documents, scripts and evidence in Git for recovery. The owner excluded C:\GitHub from Google Drive on 2026-09-10; do not assume uncommitted project files have a Drive backup. Exclude installed dependencies, Python caches and .tmp directories.
- Do not create dependency installations inside output folders. Use the single root `node_modules` junction configured by `scripts/setup-dependencies.ps1` and the bundled runtime recorded in `scripts/dependency-runtime.json`.
- Historical scripts in `scripts/reference/` are preserved for reference, not approved for automatic replay. Review their paths and write effects before adapting them.
- The owner removed the ten old output-local dependency folders on 2026-09-10. Use the shared root dependency junction and do not recreate per-output installations. Do not follow the root dependency junction when backing up or recursively cleaning this repository.

## Credential storage

- Store project credentials that must not be published to GitHub under `C:\Users\MWCredit\Documents\ChatGPT`, preferably in a project-named subfolder. This includes API keys, access/refresh tokens, app secrets, private keys, recovery/encryption keys and exported authentication/session files.
- Do not store these credentials anywhere under `C:\GitHub`, even in ignored local folders or .env files. Repository configuration may contain the external file path, but never the secret value. Examples and change logs use placeholders and paths only.
- When creating or migrating a project credential, use the external location, update its consumers, and verify the references without printing its contents. Preserve existing credentials until migration is verified; do not overwrite or regenerate a recovery key as a substitute for a lost one.
- Do not relocate application-managed sign-in stores such as Codex/GitHub/browser profiles as a side effect. Any project-owned credential export belongs in the external folder above.
- The folder's existence does not prove backup coverage. Keep its recovery/backup status explicit; database-only backups do not cover credentials, and C:\GitHub is excluded from Drive.

## 1. Project boundaries

- Treat every file under `sources/` as read-only reference material. Do not edit, rename, move, or delete these files.
- Put new deliverables outside `sources/`.
- Use the new AppSheet GUI for all testing, as reiterated by the owner on 13 September 2026. Use the current editor, new app interface, and current database UI; do not execute tests through the legacy editor or older Table Data / bot Test page. If a command opens an older testing page, close it and use a new-GUI workflow. Record any unavailable measurement rather than silently falling back to the old GUI.
- Confirm the current AppSheet schema, app configuration, and dashboard setup before changing them. Do not invent table names, columns, expressions, metrics, app IDs, or test results.
- Before changing a shared table, record its consumers and the app that owns the affected workflow. Partner management is owned by OLAP. Review both OLTP and OLAP schema, defaults, permissions, slices, forms/detail views, references and calculations, plus relevant export/Looker dependencies. Record rollback versions for each app before editing it. After regeneration, compare existing settings and formulas and verify the affected workflow in each consuming app. A known affected consumer left pending reconciliation is unfinished work, not a completed shared-table change. Document any unavailable downstream check and its practical limitation explicitly.
- **Owner priority, 13 September 2026:** First ensure the OLTP and OLAP apps work correctly after each relevant change. Downstream Data Studio / Looker Studio reports are secondary. Review direct downstream impacts, but do not expand routine app verification into a report audit or hold up otherwise verified app work for unrelated report checks. Test or change reports when the task explicitly includes them or evidence shows a direct impact; otherwise record their verification status separately. This priority does not waive backup requirements before report edits.
- Do not expose credentials, personal data, bank details, borrower documents, or unrestricted production data. Use redacted or synthetic examples.
- Do not deploy to production, publish dashboards, send live notifications, or alter production financial records without the user's explicit approval.

## 2. Architecture and ownership

There are two environments, DEV and PROD. Each contains one PostgreSQL database on its own Cloud SQL instance and two AppSheet apps, OLTP and OLAP, sharing that environment's database. The original AppSheet database is historical migration reference, not the current write target.

Verify app IDs and database host/instance bindings against `Documents/Environment_Inventory.md`; a database name alone does not establish environment identity. Cross-app links in either direction must stay within the environment: DEV OLAP ↔ DEV OLTP and PROD OLAP ↔ PROD OLTP. Check navigation actions, expressions, deep links and notification links after copies/restores and relevant edits, and in every promotion preflight/final check.

### DEV refresh from PROD

When the owner requests a DEV refresh, follow [Documents/Development_Refresh_Runbook.md](Documents/Development_Refresh_Runbook.md) for apps only, database only or both. Establish the scope, preserve unreleased work and record recovery before replacement. App refreshes copy PROD definitions, use DEV sources and companion links, retain current DEV theme colors and owner-only notification routing, and delete the old DEV apps only after replacement validation and recovery checks pass. Database refreshes use a logical PROD dump/restore into the existing DEV instance, including PROD Flyway history, then reapply only reviewed retained migrations. Complete the preparation checklist below and the runbook's validation/documentation gates. A reference to this procedure does not itself request or authorize a refresh.

### Development automation parity and isolation — owner rule, 16 September 2026

- DEV must have the same scheduled bots and automations as the released PROD baseline: definitions, events/conditions, schedules/time zones, processing and enabled/disabled states, except environment bindings and owner-only notifications. Changes under development are recorded against their release until promoted; do not overwrite them to force parity. Superseded processing and bots disabled in PROD stay disabled in DEV unless the release intentionally changes them.
- All DEV notifications, including reminders, error alerts and called-task notifications, must deliver exclusively to `welct0407@mw-credit.com`. Use `LIST("welct0407@mw-credit.com")` as the sole recipient expression for AppSheet push tasks. Inspect To/CC/BCC, dynamic recipients, called processes/tasks and other channels; no additional recipient may remain. This standing rule permits reviewed owner-only DEV delivery/testing and replaces earlier blanket-disable rules and release-specific notification exceptions. Preserve PROD recipient logic unless the approved release changes it.
- Before enabling or allowing copied/refreshed automation to execute, verify every source, destination and side effect. DEV jobs must write only DEV data; exports/webhooks must use verified development destinations and any notifications must remain owner-only. Unknown routes remain disabled while being corrected; record them as unresolved parity gaps, not an acceptable permanent baseline. If a channel cannot be isolated, record the blocker and obtain an explicit owner-approved exception. This does not authorize collection services or unrelated integrations.
- Apply `Documents/Development_Environment_Preparation.md` after every copy/refresh/replacement/restore and automation change. Inventory all bots and database/external schedules initially and after refresh; for ordinary edits recheck the changed paths and their dependencies against the last verified inventory. Save and reload states in the current editor; record versions/evidence before test writes. Unresolved isolation blocks execution of the affected paths; unresolved parity blocks declaring preparation complete.
- Coordinate AppSheet and database schedules so each business job has one active scheduler per environment. Never disable integrity/calculation triggers as a substitute for automation isolation. Temporary pauses for preparation or cutover must be recorded and reconciled to the intended final state.

### Database development and promotion — owner rule, 15 September 2026

- Manage all PostgreSQL DDL, indexes, constraints, views, functions, triggers and approved data backfills through Flyway and this GitHub repository. Use `database/migrations/V<version>__<description>.sql` and the runners in `scripts/database/`; follow `database/README.md`.
- Capture existing schema before adoption. Explicitly baseline an existing database only after its normalized schema matches the reviewed baseline. Never enable automatic baselining or run a schema creation script against populated production tables.
- Applied migration files are immutable. Add a higher version for every change, including function or trigger revisions. Do not use `repair`, `clean`, checksum edits or out-of-order migrations to conceal drift. Emergency manual changes must be documented and reconciled into a reviewed migration before ordinary development resumes.
- Apply and test changes in development first, using the new AppSheet GUI for affected OLTP/OLAP workflows. Record data correctness, performance measurements where relevant, and owner acceptance. Promote the exact tested commit and migration hashes; never copy development financial data into production as part of schema promotion.
- Before production writes, verify a restorable backup, review schema drift and consumer dependencies, record rollback/forward-fix instructions, and obtain explicit owner approval for that release. A command-line approval reference records approval; it does not grant it. Repository push or CI success does not authorize production deployment.
- Keep credentials outside Git in the established Documents/ChatGPT folder. Use the configured direct public-IP SSL connection; no proxy or instance upgrade is required by this workflow. Instance sizing, network policy, users/credentials and AppSheet editor configuration are separate from Flyway migrations and must be documented separately.
- Flyway's `public.flyway_schema_history` is deployment metadata, not an AppSheet business table. Do not add it to either app. Complete the existing model-documentation and change-log requirements for any business-model changes.

### OLTP Operations app
Name: Loan Manager ผู้จัดการสินเชื่อ
The OLTP app owns day-to-day operational workflows and transactional data entry. Optimize it for:

- fast, reliable forms and navigation;
- clear workflow status and ownership;
- validation at the point of entry;
- safe actions, automations, and approvals;
- offline/sync behavior where relevant; and
- the fewest calculations needed to complete operational work.

Keep analytics in this app minimal. Small operational totals, alerts, and record-level indicators are acceptable; broad historical aggregation and management reporting are not.

### OLAP Reporting app
Name: Loan Business Insights
The OLAP app owns computation-heavy and analysis-oriented experiences, including:

- historical and cross-entity analytics;
- management and partner reporting;
- partner allocation and settlement;
- loan assessment and portfolio analysis;
- reporting-oriented review workflows; and
- curated data feeds for downstream consumers.

Prefer read-only or tightly controlled interactions. Do not duplicate operational editing merely for convenience. Heavy expressions must not degrade OLTP sync or form performance.

### Looker Studio dashboard
Name: Loan Reports - Mobile
Looker Studio is the presentation and exploration layer for governed metrics. Its page order is:

1. **Overview**
2. **Cash Analysis**
3. **Borrowers Analysis**
4. **Business Performance**
5. **Portfolio / Risk**
6. **Daily Collection Tracking**
7. **Borrower Insight**

Looker Studio must consume curated, documented fields and grains. It must not become an alternate transaction system or the only location where critical business rules exist.

## 3. Essential implementation rules

- **Prototype design principle:** This loan solution is a prototype, not a production accounting, statutory reporting, or regulatory-compliance system. Do not assume that accounting standards, lending regulations, statutory disclosures, or production-grade compliance controls are mandatory design requirements unless the user explicitly requests them for a specific change.
- Optimize prototype changes for the user's stated business behavior, usability, speed of iteration, learning value, and internal consistency. Simplified or experimental financial logic is acceptable when it is intentional, understandable, reversible, and documented.
- Treat accounting and regulatory practices as optional design references or risk considerations, not automatic acceptance criteria. Clearly label them as recommendations and ask before expanding a task to implement them.
- Do not describe prototype calculations, reports, or workflows as accounting-compliant, regulator-approved, legally sufficient, or production-ready unless that status has been independently established and the user has explicitly placed it in scope.
- Keep operational workflows and validation in OLTP, heavy calculations and reporting logic in OLAP, and presentation/exploration in Looker Studio.
- Use stable, immutable table keys and proper `Ref` relationships. Preserve the existing data grain and referential integrity.
- AppSheet configuration changes are generally acceptable. New database tables or columns require strong business and technical justification, dependency analysis, and user approval.
- Keep financially important rules traceable and consistent across OLTP, OLAP, and Looker Studio. Payments, allocations, settlements, reversals, and loan assessments must remain auditable and reconcilable.
- Treat partial payment, paid, unpaid, overpaid, and default/delinquency as explicit business states based on valid posted amounts, reversals/adjustments, due dates, grace rules, and a defined as-of date. Do not infer them merely from the existence of a payment row.
- Actions and bots must be safe against duplicate execution and automation loops. Do not physically delete financially material records as a routine correction; use an auditable reversal, void, or adjustment process.
- Use virtual columns only for lightweight, row-level calculations. Put expensive aggregation and historical analytics in OLAP or a justified reporting structure.
- Looker Studio metrics must have a defined source, grain, date basis, filter population, and refresh cutoff. Dashboard totals must reconcile with the governed source.

## 4. Mandatory backup before development

Before making any change, establish and record a rollback point:

- **AppSheet:** note the current AppSheet version number for every affected app before editing. Record it in the change notes so the previous version can be restored.
- **Looker Studio:** create a copy of the affected report as a backup before editing. Record the backup report name and creation date in the change notes.
- For a change affecting both AppSheet and Looker Studio, complete both backup steps first.
- If Codex cannot confirm that the required backup exists, it must stop before making the change and ask the user to create or confirm it.

## 5. Mandatory documentation updates

Documentation is part of the change itself, not an optional follow-up. Codex must complete the applicable documentation updates in the same task before reporting the change as complete.

### 5.1 Change log for every change

- After every implementation, configuration, dashboard, automation, governance, or documentation change, create or update a Markdown change-log file under `Change Logs/`.
- Follow the existing `CHANGE_NOTES_<SUBJECT>_<YYYY-MM-DD>.md` naming pattern unless the change already has a corresponding change-log file.
- Record the date, scope, purpose, files or AppSheet/Looker objects changed, rollback point, checks performed, manual testing required, status, and rollback instructions.
- Update the same change-log file when manual testing, acceptance, deployment, rollback, or follow-up work changes the status.
- Markdown files in `Change Logs/` are the authoritative change history. Do not use the Excel workbook's `Change Log` worksheet as the primary change log.

### 5.2 Data-model documentation

- Any change to the OLTP or OLAP data model, including shared base tables, physical columns, virtual columns, types, expressions, keys, labels, `Ref` relationships, slices, slice filters, slice permissions, slice-column membership, or app-specific availability, must be reflected in both:
  - `Documents/AppSheet_Data_Model_Overview.md`; and
  - `Documents/AppSheet_Data_Dictionary.xlsx`.
- Keep the Markdown overview focused on architecture, purpose, ownership, relationships, assumptions, and governance. Keep the Excel workbook as the detailed row-level inventory.
- Update both documents together and keep table names, column names, expressions, OLTP/OLAP availability, relationships, slices, and reconciliation status consistent between them.
- If the live AppSheet configuration has not been reconciled, label the affected documentation as pending reconciliation rather than presenting it as verified.
- A data-model change is incomplete until the overview, workbook, and applicable Markdown change log have all been updated and checked for consistency.

## 6. Release development and production promotion

Use one release change log with a linked checklist/evidence folder when needed; small releases may keep everything in that log. Maintain the record as work happens, not by reconstructing the release at deployment. Scale tests to the changed behavior and affected dependencies; do not create duplicate reports or audit unrelated features.

### 6.1 Develop and capture the release

1. Read/reserve the release number, define intended behavior and acceptance checks, and identify affected apps, shared consumers and prerequisites. Inspect current definitions/schema and record starting versions and rollback points under Section 4. Complete DEV preparation before test execution.
2. Implement the smallest practical, reversible change in DEV. Capture before/after AppSheet definitions and exact changed properties, including additions, modifications, removals and follow-up refinements. Store sanitized, reproducible evidence in Git; keep private raw exports outside Git. Record SQL through immutable Flyway migrations and their hashes. Separately record configuration Flyway does not manage.
3. Maintain a checklist with stable item IDs and one row per changed object/property and consuming app (SQL rows may link exact migration/object definitions). Record: release/component/environment; object/property and operation; before value; final tested DEV value/version; intended PROD value including environment substitutions; DEV test/evidence; actual PROD before value/version; observed saved PROD value/version; production verification evidence and status. Use Pending, Verified, Blocked or Owner-approved exception with reason/approval reference; keep DEV and PROD results separate. Exact expressions/long definitions may be linked instead of repeated. A summary such as "Borrowers updated" is insufficient.
4. Cover every affected layer: physical/virtual columns, types/keys/labels/Refs, defaults/formulas/validation, Show/Editable conditions, permissions/security filters, slices and their membership, forms/details and explicit column orders, navigation/actions, bots/tasks/schedules/destinations, formatting and dashboard membership/order. Trace each changed user-facing field through every consuming slice, form/detail and actual entry point. Regeneration or column existence does not prove visibility. Include directly affected export/report dependencies under Section 1's AppSheet-first priority.
5. Reconcile captured changes against the release's logs, model inventory and all refinements; classify unexplained differences before freezing. Shared DEV can contain other releases: retain their ownership and dependencies, and never include them implicitly or overwrite their work. A saved whole-app version is evidence, not permission to copy unrelated DEV configuration into PROD.

### 6.2 Test, recommend readiness and freeze

1. Test each development change through the current AppSheet GUI and appropriate SQL/configuration checks. Cover the normal workflow, relevant boundaries/invalid input, permissions, calculations, sync/readback and affected consumers in both apps. Add duplicate/retry/concurrency, scheduled execution, owner-only delivery or performance checks when that behavior changes. Use synthetic/redacted DEV data and the existing test runners; do not rerun unrelated suites without a reason.
2. Record expected/actual results, versions, evidence and unavailable checks honestly. Separate configuration inspection, executed tests and owner feedback. At the end of each development task state **Ready to promote**, **Ready subject to listed checks/owner decision**, or **Not ready**, with reasons, remaining risks and a short owner testing checklist. A task recommendation covers its scope; batch readiness requires all release items and dependencies to be reconciled. Wait for owner feedback before recording acceptance; do not claim tests that were not run.
3. Before promotion, freeze the tested release package: checklist and intended PROD values, saved DEV app definitions/versions, test evidence, accepted scope/limitations, exact implementation Git commit, Flyway manifest/hashes and target version, dependency order and coordinated rollback/forward-fix instructions. Record its revision in the change log/tracker. For database releases, run `New-Release.ps1` from the clean tested commit while DEV still represents that candidate, before later migrations advance DEV; retain a sanitized manifest/hash record in Git and the runner's original manifest externally. Subsequent documentation commits do not change the pinned deployment commit.
4. Freeze scope, not the entire DEV environment. Later development may continue after capture; promotion and validation use the frozen release package, never current DEV as the acceptance baseline. A change to the candidate requires a new recorded revision, affected tests and renewed acceptance/approval for the changed scope. Retain the prior evidence. If a missing manifest or mixed DEV state prevents isolating the tested candidate, reconstruct and validate it in an isolated test setup or resolve the dependency before promotion; do not bypass runner checks or reset active DEV work.

### 6.3 Approve and promote the complete batch

1. Recheck current PROD identities, app definitions, schema/migration history, automation and within-environment links against the package's expected starting state. Review drift and intervening releases; preserve unrelated PROD changes. Resolve overlapping changes and update/retest the candidate where necessary instead of blindly replacing whole apps. DEV-to-PROD mappings must explicitly retain PROD database bindings, companion app IDs, access rules and production recipients.
2. Confirm owner acceptance and explicit authorization for this package/revision before production writes. Record current rollback versions for each affected app, a verified restorable database backup for database writes, report backups where applicable, and the ordered deployment/recovery plan. State any required write pause or temporary scheduler pause. Existing specific approval suffices; a release number, approval-reference string or push does not grant approval.
3. Apply all included changes as one managed release batch in the dependency-safe order recorded in the package; database and two app saves are not a single atomic transaction. Promote only the exact tested commit/manifest through the existing runners. Review every pending migration from PROD's current version to the candidate target: all must belong to this approved batch or an explicitly approved prerequisite. Do not silently include another release, skip an intervening migration, edit applied files or run from a newer checkout containing later migrations.
4. Apply each AppSheet/configuration item using the frozen intended PROD value, recording saved versions and evidence as it is completed. Reconcile regenerated metadata, slice membership and individual view column orders. Preserve production automation/recipient behavior except approved changes; reconcile temporary pauses before closure. Never copy DEV financial/test data.
5. On failure, record exactly what was applied and stop dependent steps. Assess current state before retrying; use the coordinated rollback or reviewed forward fix within the approved scope. Do not replay financial operations or restore a database over newer writes without explicit recovery authorization. Partial application is not a completed release.

### 6.4 Validate production and close

1. Reload saved PROD definitions and verify **every checklist item against the frozen intended PROD value**, including removals, environment substitutions, sources, both directions of companion links and automation states/destinations. For SQL, verify migration history/hashes, affected schema objects and appropriate read-only correctness checks. Flyway validation alone does not detect all schema drift or establish business correctness. Never compare directly with current DEV to decide whether the release is complete.
2. In the current production GUI, sync/open both apps and exercise the affected entry points, checking field visibility, labels/order, references, permissions and intended read-only/edit access. Inspect forms without saving and cancel them. Reuse accepted DEV behavioral tests as supporting evidence; do not repeat the entire DEV suite in production. Production financial writes, mutating actions and forced notification tests require separate explicit authorization. Record unavailable role/device/conditional or write-dependent checks and their practical limits; configuration checks cannot be described as successful delivery/execution.
3. Do not mark Released while a required item is missing, mismatched, Pending or Blocked. Use **Deployment applied; verification incomplete** for partial application/validation and list outstanding items. Only an explicit owner-approved exception may close an otherwise unverified item; retain its reason, impact and approval, and report it as an exception, never as verified. New defects/corrections must remain linked to the release and be retested; do not silently drop scope to close the batch.
4. After validation, reconcile the final checklist, release tracker and change log; update the environment inventory, development differences and both model documents when applicable. Close only the promoted release's differences, preserving later DEV work. Record actual deployment date, PROD app/SQL versions, pinned commit/manifest, owner acceptance/approval, results, exceptions and rollback instructions. Keep these distinct from development completion.
5. Finish the required commit/push and report the release number, implemented and verified scope, readiness or deployment status, documentation/evidence, rollback point and any remaining owner checks/downstream limitations. A documentation-only methodology change requires no live app tests or product release number; it does not assert that existing environments already satisfy the new policy.

When instructions conflict, prioritize data protection, consistency with the user's defined prototype rules, dependency integrity, auditability, least privilege, and reversibility. In this project, financial correctness means faithfully implementing and reconciling the user's documented prototype logic; it does not automatically require compliance with external accounting standards or regulatory rules. Ask the user before an irreversible, high-risk, or materially ambiguous change.

## Automatic commit and push — owner rule, 10 September 2026

- After each completed user task or authorized automated development/maintenance run that changes repository files, complete the relevant checks and change-log updates, then commit and push the task's changes to the current branch's configured upstream before reporting completion. The owner gives standing permission; no additional commit/push confirmation is needed. An explicit instruction to leave changes local overrides this default.
- Use completion of a coherent change as the trigger, not every message or tool call. Read-only requests and runs that change only ignored runtime data require no commit. Operational borrower/reviewer events do not authorize source changes or Git operations.
- Inspect the working tree and staged diff. Stage only the task's intended files; preserve unrelated work. Keep credentials, private runtime data, databases, backups and installed dependencies excluded under the project's rules. Never force-add ignored files to satisfy this policy.
- Use a descriptive commit message and a normal push. Do not force-push, rewrite published history, or overwrite unrelated changes. If checks fail or publishing is blocked, preserve the work, report the blocker and distinguish local commits from changes actually pushed. Do not claim GitHub recovery coverage until the push is verified.
- This permission covers repository publication only; it does not authorize production deployment, live financial operations, notifications or expansion of service boundaries. In long tasks, a coherent, checked checkpoint may also be committed and pushed when useful.
