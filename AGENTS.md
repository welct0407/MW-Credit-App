# AGENTS.md — AppSheet Development

AI Collection software has moved to C:\GitHub\MW-AI-Collection. For any collection work, first read that project's AGENTS.md and SERVICE_CATALOGUE.md; the catalogue is a default-deny boundary for programs and AI sessions. The collection-agent and mw-ai-collection paths here are compatibility junctions, not independent runtimes. AppSheet and reporting configuration work remains governed by this file.

This file governs Codex work on the shared AppSheet solution: the **OLTP Operations app**, the **OLAP Reporting app**, and the **Looker Studio dashboard**.

## Project release tracking — owner rule, 16 September 2026

- Use `Documents/Release_Tracker.md` as the project-wide R001, R002, R003… release register and source of the next available number. Read it before starting release work; reserve one number for a coherent scope and advance the next number. Publish the reservation before parallel sessions rely on it, and check for existing reservations to avoid duplicates.
- Keep the same release number across continuation chats. Independent releases get separate numbers. Never reuse cancelled numbers. Suggested owner chat title: `Rnnn — Feature name`; do not rename chats without a request.
- Maintain each release's content summary, status, dates, component versions, tested Git commit/Flyway manifest, approval, tests and rollback/change-log links. Include its number in change logs and completion messages. Distinguish development completion, owner acceptance and actual production deployment.
- Release numbers are separate from AppSheet versions and immutable Flyway migration numbers. A number, tracker entry or repository push does not authorize production changes. Documentation-only tracker maintenance does not consume a product release number.

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

The production OLTP and OLAP apps use the shared PostgreSQL database on Cloud SQL. Development apps use the separate development instance. The original AppSheet database is historical migration reference, not the current write target.

### Development automation isolation — owner rule, 15 September 2026

- **R002 owner exception, 16 September 2026:** Development notifications may be enabled only after every recipient path is verified to deliver exclusively to the owner, `welct0407@mw-credit.com`. Use the sole recipient expression `LIST("welct0407@mw-credit.com")` for reviewed AppSheet push tasks; inspect To/CC/BCC, called tasks/processes, dynamic recipients and other channel destinations as applicable. This exception permits owner-only development notification testing and supersedes the blanket notification-disable rule below only for reviewed owner-only routes. It does not authorize production recipient changes, notifications to borrowers/partners/other users, unrelated exports, or collection services. Unknown/unverified destinations remain disabled. Recheck after every copy/refresh/restore and bot change; record saved states and evidence before test writes.
- This rule applies to every development app/environment, including future copies, refreshes, replacements and version restores. Never inherit production bot enablement without review.
- Bots that are not essential to the business process being tested, or could confuse users through notifications or other outward-facing activity, must remain disabled in development. This includes email/push/chat notifications, reminders and unsolicited exports. Do not enable them merely to match production.
- Before any test write or making a refreshed development app available, inventory every bot and its event, process, tasks and destinations. Enable only explicitly reviewed essential business-processing bots whose effects are confined to development. New, unknown or unreviewed bots default to disabled. Review essential bots for embedded notification/export tasks as well; an essential calculation does not authorize user-facing side effects.
- Apply the preparation checklist in `Documents/Development_Environment_Preparation.md` after every copy/refresh/restore, and after adding or changing a development bot. Save and verify disabled states in the current AppSheet editor, record app versions and evidence in the change log, and verify development sources and cross-app links before testing.
- Preparation is incomplete while a nonessential/confusing bot is enabled or its state/destination is unverified. A production cutover or app-version restore does not waive this gate. These are AppSheet configuration controls, separate from Flyway; do not disable essential database integrity or calculation triggers as a substitute.

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

## 6. Change and verification workflow

Codex must:

1. Inspect the current configuration and dependencies before implementation.
2. Confirm and record the required backup/version information.
3. Make the smallest practical, reversible change and preserve unrelated work.
4. Perform only safe checks available in the working environment, such as reviewing expressions, dependencies, and configuration consistency. Do not claim that the live app or dashboard has been fully tested when it has not.
5. Complete the mandatory documentation updates in Section 5 and verify that the documented names, scope, status, and rollback information match the implemented change.
6. Give the user a concise manual testing checklist covering the changed workflow, important edge cases, permissions, calculations, and dashboard reconciliation as applicable.
7. Wait for the user's manual testing feedback before treating the change as accepted or proceeding with production deployment.
8. Finish with a summary of what changed, the recorded rollback point, documentation updated, possible downstream effects, checks performed, items requiring manual testing, and rollback instructions.

When instructions conflict, prioritize data protection, consistency with the user's defined prototype rules, dependency integrity, auditability, least privilege, and reversibility. In this project, financial correctness means faithfully implementing and reconciling the user's documented prototype logic; it does not automatically require compliance with external accounting standards or regulatory rules. Ask the user before an irreversible, high-risk, or materially ambiguous change.

## Automatic commit and push — owner rule, 10 September 2026

- After each completed user task or authorized automated development/maintenance run that changes repository files, complete the relevant checks and change-log updates, then commit and push the task's changes to the current branch's configured upstream before reporting completion. The owner gives standing permission; no additional commit/push confirmation is needed. An explicit instruction to leave changes local overrides this default.
- Use completion of a coherent change as the trigger, not every message or tool call. Read-only requests and runs that change only ignored runtime data require no commit. Operational borrower/reviewer events do not authorize source changes or Git operations.
- Inspect the working tree and staged diff. Stage only the task's intended files; preserve unrelated work. Keep credentials, private runtime data, databases, backups and installed dependencies excluded under the project's rules. Never force-add ignored files to satisfy this policy.
- Use a descriptive commit message and a normal push. Do not force-push, rewrite published history, or overwrite unrelated changes. If checks fail or publishing is blocked, preserve the work, report the blocker and distinguish local commits from changes actually pushed. Do not claim GitHub recovery coverage until the push is verified.
- This permission covers repository publication only; it does not authorize production deployment, live financial operations, notifications or expansion of service boundaries. In long tasks, a coherent, checked checkpoint may also be committed and pushed when useful.
