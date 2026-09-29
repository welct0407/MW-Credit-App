# R048 upcoming charges — handover

**DEV complete, 29 September 2026.** OLTP 1.000151 / OLAP unchanged 1.000045 / SQL V55. R048 remains Open; no production authorization or deployment.

The [detailed implementation, verification, rollback and promotion handover](IMPLEMENTATION.md) records the delivered design. The [original design](../oltp-upcoming-charges-design-20260929/HANDOVER.md) retains the decision history. Exact saved configuration is in [app metadata](app-config-observations.json) and [SQL definitions](postgresql-affected-definitions.json).

The two entry points are Upcoming Charges (tomorrow through T+7, date groups and daily sums) and Collection → borrower (today's charges, then a Date/Total Charge summary, then upcoming details for the first five distinct future due dates within three months, then receipts). Auto-off loans use recorded settlement charges only. Forecasts are read-only and refresh on sync.

Next step is owner DEV review. Any later promotion must use the integrated R048 release process described in the implementation record; no new implementation remains for the requested scope.

Latest presentation: issue-only messages, partner-language menu title, whole-baht amounts and fixed Thai / English labels/Basis values. Owner cosmetics from1.000143 preserved; see the top section of the implementation record.

Latest refinement removes the visible Context section, titles the portfolio Upcoming Charges, shortens the detail heading, and adds the two-column summary. Owner1.000146 cosmetics preserved. V55 is additive; see summary-refinement.json and the top implementation section.

Upcoming Charges is now the direct menu table, not a dashboard; its redundant child view was removed. See direct-view-refinement.json.
