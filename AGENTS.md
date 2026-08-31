# AGENTS.md — AppSheet Development

This file governs Codex work on the shared AppSheet solution: the **OLTP Operations app**, the **OLAP Reporting app**, and the **Looker Studio dashboard**.

## 1. Project boundaries

- Treat every file under `sources/` as read-only reference material. Do not edit, rename, move, or delete these files.
- Put new deliverables outside `sources/`.
- Confirm the current AppSheet schema, app configuration, and dashboard setup before changing them. Do not invent table names, columns, expressions, metrics, app IDs, or test results.
- Do not expose credentials, personal data, bank details, borrower documents, or unrestricted production data. Use redacted or synthetic examples.
- Do not deploy to production, publish dashboards, send live notifications, or alter production financial records without the user's explicit approval.

## 2. Architecture and ownership

The solution uses one shared AppSheet database as the operational system of record.

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
