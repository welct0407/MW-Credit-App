# Forecast & Planning — design summary

27 September 2026 · **Proposed design; no live implementation or dashboard publication.**

Purpose: **How much interest and cash could the existing loan book produce by month-end, what could reduce that outcome, and how much room remains for planned lending?**

The latest repository evidence has Forecast & Partners at tab 11 and a separate actual-only Partners tab at tab 249. Keep partner allocations and settlements on Partners. This proposal replaces the forecast content only after an explicitly authorized cutover; first implementation should use an additive review tab.

| Section | Proposed information and visuals |
| --- | --- |
| Month-end outlook | Five cards: interest received MTD, remaining interest under the selected scenario, projected month-end interest, gap to an optional interest target, and principal receipts under the scenario. |
| Progress and scenarios | Cumulative actual interest with a projected extension to month-end; an actual-to-projection bridge; Schedule / Planning / Stress comparison. Clearly identify today as partial and scenarios as assumptions. |
| Upcoming receipts | Weekly principal and interest due for the remaining month; separate already-overdue amounts, today's unpaid amounts and future dues. Existing posted schedules take precedence over simulated obligations. |
| Forecast drivers | Top borrower contributions with Others; loan-type composition; forecast exposure associated with current overdue/default/modified-schedule flags. Flags explain exposure and do not become payment probabilities. |
| Funding plan | Current business cash, projected month-end cash and shortfall against a chosen reserve, plus a cash bridge. This section activates only with verified cash coverage and explicitly entered remaining outflow assumptions. |
| Supporting detail | One loan-level forecast table, with borrower drill-through, expected dates, recorded versus simulated amounts, scenario receipts, assumptions and exceptions. A compact coverage/status panel explains omissions. |

**Time basis:** current Bangkok month, actual posted receipts through today at query time; remaining receipts are still unpaid as of the same cutoff. No arbitrary historical forecast selector in V1.

**Controls:** Planning interest collection %, Planning principal collection %, overdue recovery %, optional interest target, and a separate funding-plan input group. Initial Planning assumptions are 100% of valid current/future scheduled dues and 0% overdue recovery, visibly labelled an unadjusted schedule case. Stress is an illustrative 20 percentage-point reduction in both collection assumptions, floored at zero, with no overdue recovery. These are proposed starting settings, not estimated probabilities or owner-approved targets.

**Design discipline:** gross interest is not net profit; principal receipts are not income; forecast dues are not guaranteed cash; partner entitlement is not business cash. Unknown inputs remain unavailable. Do not count new lending income or repeat borrowing that has not been contracted.

**Visual style:** compact cards; blue actuals; teal Planning; grey Schedule; orange Stress; a dashed projected line; whole-baht labels; percentages to one decimal; exact amounts in detail. Use two charts per desktop row and a single-column mobile reading order.

**Recommended scope:** deliver the interest/receipt outlook, scenarios, drivers and detail first. Deliver the funding section in the same implementation only when its cash source and inputs reconcile; otherwise explicitly label it deferred. Daily cash low points, next-month forecasts, behavioral prediction and forecast accuracy history are later extensions.

The [implementation handover](HANDOVER.md) contains the formulas, source evidence, schedule rules, filters, visual specification, implementation sequence, recovery and acceptance cases. No product release is allocated by this documentation task; the implementer must use the then-current Open release.
