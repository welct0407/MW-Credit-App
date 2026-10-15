# Partners tab design — 26 September 2026

## Scope and purpose

Owner requested a Metabase Partners tab design with useful actual partner metrics/charts and a detailed implementation handover, excluding forecast information. Documentation only; no live dashboard, database, AppSheet, permissions or financial changes.

## Changed files

- `outputs/partners-tab-design-20260926/README.md`: concise design summary.
- `outputs/partners-tab-design-20260926/HANDOVER.md`: layout, metric/visual/filter/source contracts, implementation sequence, financial validation cases and recovery requirements.
- `Documents/README.md`: discoverable link to the proposal.
- This change log.

## Decisions and evidence

Grounded in the maintained Solution Design/Model Overview, R043 navigation, affected partner/capital/settlement dictionary records and SQL V15/V16/V18/V21/V22/V31/V34. Preserve historical profit allocation and per-repayment rounding, allocated expenses, Pending reservations and Cancelled reversal semantics. Separate contributed capital, net entitlement and cash custody. Current recorded balances ignore the selected activity period; actual period metrics use their own event dates. No forecast or invented partner return ratio is included.

Recorded risks for implementation: role A/B cardinality; historical versus current ratio; all-record current balances versus dated providers; future/undated Pending rows; null/unknown status reserved by SQL; archived Settlement Ledger model; independent rounding residuals; no verified pending-age timestamps. No live audit or financial reconciliation was performed.

## Rollback and unrelated work

Starting Git commit: `640db510d8a243635f209fcef34efeee0836f880`. Roll back this task's documentation through a normal revert if needed. No live rollback point required for a file-only design.

Pre-existing untracked work preserved: `Change Logs/CHANGE_NOTES_RISKS_REDESIGN_2026-09-24.md`, `outputs/r026-payment-health/`, and `outputs/risks-redesign-20260924/`. Do not stage or alter these for this task.

## Checks and status

Design and documentation review completed against the cited definitions. All 49 local link targets across the four intended files resolve; whitespace/diff checks passed. Only intended documentation files are committed/pushed; Git publication does not implement this design or authorize dashboard publication.

Live implementation, DEV financial fixtures, source parity, current metadata/permissions, browser account routing and desktop/mobile dashboard tests remain for the implementation task. No product release number allocated or status changed; implementer must read the sole Open release at start.
