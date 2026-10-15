# Partners tab — design summary

Implementation status — delivered in R044: [Partners tab](https://reports.mw-credit.com/dashboard/3?tab=249), [saved implementation and verification](../r044-partners/README.md). No AppSheet change. The entitlement bridge uses the specified labelled table fallback. The following design remains the metric contract; delivery evidence supersedes implementation-pending language.

Date: 26 September 2026. **Proposed design; not implemented or published to Metabase.**

The Partners tab answers: **What has each partner contributed, earned and received, and what remains available to settle?** It contains actual recorded activity and current positions, with no forecast information.

| Section | Metrics and visuals |
| --- | --- |
| Current partner position | Five cards: net contributed capital, net profit earned to date, completed payouts to date, pending settlements, and net available to settle. A partner comparison table puts these balances side by side. |
| Capital and entitlement | Capital share by partner; an entitlement bridge from allocated interest through expenses, completed payouts and pending reservations to net available. |
| Actual activity | Four selected-period cards: allocated interest, allocated expenses, net profit earned, and completed payouts. Monthly net earnings versus payouts, monthly capital contributions/withdrawals, and a cumulative contributed-capital trend by partner. |
| Settlement follow-up | A current pending-settlement queue, independent of the activity period, with partner, amount and recorded transfer date. |
| Supporting detail | Capital transaction ledger and settlement ledger, with immutable record references and status filters. |

**Filters:** Partner = All by default; Activity period = this month through Bangkok today. Current balances and pending reservations stay current when the activity period changes. Capital shares always retain the full pool denominator.

**Layout:** current cards → partner comparison → capital share and entitlement bridge → period cards → actual-activity charts → pending queue → ledgers. Use whole-baht display, two-decimal percentages, exact amounts in drill-through, and a consistent partner colour across charts.

**Important distinctions:** capital withdrawals are separate from profit payouts; profit availability is separate from cash custody; pending is separate from paid; gross interest allocation is separate from net profit after allocated expenses. Negative balances remain visible.

The detailed [implementation handover](HANDOVER.md) defines every metric, filter, chart, source dependency, validation case, implementation step and remaining verification requirement. Existing allocation and settlement rules are preserved. This document authorizes no live changes.
