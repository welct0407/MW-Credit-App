# Collection Monitor design — 24 September 2026

## Scope and purpose

Design-only handoff requested by the owner for a new Metabase collection review tab, preserving the existing tab until later cutover. The primary use is keeping the page open to recognize borrowers by daily payment status.

## Deliverable

- [Design summary, wireframe and detailed execution handoff](../outputs/collection-monitor-design-20260924/DESIGN.md).
- This change log.

The design adapts the inspected Data Studio four-column layout into four colored status lanes with named borrowers, current receipts/remaining balances, compact monitoring metrics, refresh guidance and secondary detail. It documents overdue precedence and the different scopes of receipts, collection-set balances and charges dated today.

## Inspection and checks

- Inspected the owner's Data Studio Daily Collection page in personal Chrome; recorded layout, not private borrower values. Its incomplete/erroring data visuals are explicitly not a source of financial validation.
- Inspected existing Metabase dashboard 3 / tab 9 through the GUI and read-only API, including models 69, 73, 77 and 162. Reused maintained repayment/status SQL context.
- Checked official native dashboard, filter and table-formatting documentation; marked version-dependent behavior and proposed fallbacks.
- Checked Markdown structure, relative links and intended-file diff before publication. No live dashboard, model, database, AppSheet, permission, notification or schedule changes.

## Rollback and preservation

Starting commit: `dd22d81112d6496f28ac8fb8768405bdfa813621`; branch `master` / `origin/master`. Extensive unrelated dictionary edits existed before this task and were excluded from its commit. File-only rollback is to revert this task's documentation commit or remove these two new files while preserving later work. No live rollback point was needed for this read-only design task.

## Status and remaining work

Design handoff complete; implementation and final cutover are not performed. R025 was Open at inspection; executor must re-read the tracker and use the current Open development release. No release number was allocated/frozen and no product status was advanced by this documentation task.

Remaining execution checks: native layout/readability, source reconciliation, status edge cases, ordinary viewer links, refresh timing/load, errors and resume, date rollover, and owner acceptance. The design contains the concrete acceptance matrix and additive rollback/cutover rules.
