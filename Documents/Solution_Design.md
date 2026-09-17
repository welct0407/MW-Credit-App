# Solution design rules

Read the affected section when designing or changing app workflows, the model or reporting. [AGENTS.md](../AGENTS.md) contains standing execution rules. This document describes ownership and design constraints, not live versions; use the environment inventory and affected model records for actual configuration.

## Prototype scope

The loan solution is a prototype, not a production accounting, statutory reporting or regulatory-compliance system. Optimize for the owner's stated business behavior, usability, iteration speed, learning value, internal consistency and reversibility. Simplified or experimental financial logic is acceptable when intentional, understandable and documented.

Accounting/regulatory practices are optional design references unless explicitly requested for the change. Label recommendations and obtain authorization before expanding scope to implement them. Do not claim accounting compliance, regulatory approval, legal sufficiency or production readiness unless independently established and expressly in scope. Financial correctness means implementing and reconciling the documented prototype logic.

## OLTP Operations app

Name: **Loan Manager ผู้จัดการสินเชื่อ**. Owns day-to-day operational workflows and transaction entry: reliable forms/navigation, clear status/ownership, entry validation, safe actions/approvals/automation, and relevant offline/sync behavior. Use the fewest calculations needed for operational work.

Small operational totals, alerts and record indicators are acceptable. Broad historical aggregation and management reporting belong in OLAP. Keep validation at the point of entry without duplicating expensive analytics.

## OLAP Reporting app

Name: **Loan Business Insights**. Owns historical/cross-entity analytics, management and partner reporting, partner management/allocation/settlement, loan assessment, portfolio analysis, reporting review and curated downstream feeds.

Prefer read-only or tightly controlled interactions. Do not duplicate operational editing for convenience, or let heavy expressions degrade OLTP sync/form performance. Shared-table design must identify the workflow owner and reconcile affected consumers in both apps.

## Model and business logic

- Use stable immutable keys and correct `Ref` relationships; preserve grain and referential integrity. New physical tables/columns follow AGENTS.md's justification/approval rule.
- Payments, allocations, settlements, reversals and loan assessments must remain traceable, auditable and reconcilable across affected apps/reports.
- Derive partial/paid/unpaid/overpaid/default/delinquency states from valid posted amounts, reversals/adjustments, due dates, grace rules and a defined as-of date. A payment row's existence alone does not establish those states.
- Actions and bots must handle duplicate execution without duplicated effects or loops. Correct financially material records with auditable reversal, void or adjustment instead of routine physical deletion.
- Use virtual columns only for lightweight row-level calculations. Put expensive aggregation/historical analytics in OLAP or a justified reporting structure.

## Looker Studio dashboard

Name: **Loan Reports - Mobile**. Presentation/exploration over governed metrics, not an alternate transaction system or the sole location for critical business rules. Each metric needs a documented source, grain, date basis, filter population and refresh cutoff; totals must reconcile with the governed source.

Preserve the page order unless the owner requests a change:

1. Overview
2. Cash Analysis
3. Borrowers Analysis
4. Business Performance
5. Portfolio / Risk
6. Daily Collection Tracking
7. Borrower Insight

App workflows take priority. Review direct downstream impacts, but test/edit reports only when explicitly in scope or directly affected; record limitations rather than auditing unrelated reports. Back up the affected report before editing, including when a task also changes AppSheet.
