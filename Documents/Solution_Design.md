# Solution design rules

Read the affected section when designing or changing app workflows, the model or reporting. [AGENTS.md](../AGENTS.md) contains standing execution rules. This document describes ownership and design constraints, not live versions; use the environment inventory and affected model records for actual configuration.

## Scope

Prototype boundaries and execution rules are defined in [AGENTS](../AGENTS.md#3-essential-implementation-rules). This file owns application responsibility and reporting design decisions.

## OLTP Operations app

Name: **Loan Manager ผู้จัดการสินเชื่อ**. Owns day-to-day operational workflows and transaction entry: reliable forms/navigation, clear status/ownership, entry validation, safe actions/approvals/automation, and relevant offline/sync behavior. Use the fewest calculations needed for operational work.

Small operational totals, alerts and record indicators are acceptable. Broad historical aggregation and management reporting belong in OLAP. Keep validation at the point of entry without duplicating expensive analytics.

**R010 production:** the Cash Statement is a bounded operational exception: OLTP loads 15 Bangkok dates of SQL-calculated account statements and daily summaries, with a private per-Partner account/date preference. SQL computes balances before applying the recent window; full historical review and cash administration stay in OLAP. This adds no financial editing workflow. See [model overview](AppSheet_Data_Model_Overview.md#current-r010-behavior).

## OLAP Reporting app

Name: **Loan Business Insights**. Owns historical/cross-entity analytics, management and partner reporting, partner management/allocation/settlement, loan assessment, portfolio analysis, reporting review and curated downstream feeds.

Prefer read-only or tightly controlled interactions. Do not duplicate operational editing for convenience, or let heavy expressions degrade OLTP sync/form performance. Shared-table design must identify the workflow owner and reconcile affected consumers in both apps.

## Model ownership

Business behavior and relationships are explained in the [Model Overview](AppSheet_Data_Model_Overview.md); exact values belong in the dictionary. Integrity, auditability and correction rules follow AGENTS.

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

## Business and ecosystem diagrams

- [OLTP lifecycle diagram](OLTP_Business_Processes.drawio): three editable pages cover loan lifecycle, payment processing and controls/ownership. Update only depicted behavior, not version numbers, formula refinements or presentation-only changes. Its synthesis baseline is 12 September; current business explanations/verified release evidence take precedence. It does not claim fresh lifecycle or delivery acceptance.
- [Ecosystem diagram](Loan_Business_Ecosystem.drawio): the app/database pair, partner assistant services, access/recovery and public-site context. As confirmed on 16 September, Azure hosts the partner worker; Tailscale provides private RDP; Outlook fallback and Looker are in use. Borrower-location sheets are a historical import, not a live feed. The privacy site is published; custom-domain mapping is not inferred. AI Collection was excluded from this drawing by owner request; this does not alter that separate project's authority. Dormant facilities are not active release dependencies.

Generation/asset instructions are in [scripts guide](../scripts/README.md#diagram-maintenance). Original provenance and interpretation are preserved in the archive: [OLTP](archive/2026-09-20/OLTP_Business_Processes.md), [ecosystem](archive/2026-09-20/Loan_Business_Ecosystem.md). These archived companions are no longer maintained in parallel.
