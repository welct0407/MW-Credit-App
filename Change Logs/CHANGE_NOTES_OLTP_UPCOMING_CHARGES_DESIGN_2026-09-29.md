# OLTP upcoming charges design

29 September 2026. Status: **Design completed; implementation intentionally deferred.**

## Scope and decisions

Owner requested a new OLTP seven-day upcoming-charge screen and a borrower-level preview immediately after today's Collection charges, grouped by date with daily sums. Owner clarified the borrower preview means the next five distinct due dates across all their loans, capped at three calendar months ahead, whichever limit is reached first. The final three-month direction supersedes the briefly suggested one-month cap; never extend the preview to find additional dates.

Created the [implementation handover](../outputs/oltp-upcoming-charges-design-20260929/HANDOVER.md) with date/remaining-amount semantics, recorded-first automatic/manual schedule rules, proposed read-only SQL/AppSheet objects, exact Collection placement, access/sync handling, dependencies, acceptance cases and rollback. Tomorrow through today + 7 is the documented seven-day default. Additive SQL views reuse the existing V53 forecast function with a three-calendar-month end date bounded by its existing 93-day guard, retaining reporting's existing month-end behavior. No extended-horizon engine is proposed.

No live app, database, report, source financial record or notification change. Proposed objects are not deployed definitions. Dictionary/current-state model documents, environment inventory and release tracker remain unchanged because no implementation occurred. R048 was the Open release inspected; no release/migration number was allocated or frozen. Later implementation must use the then-current Open release.

## Recovery and verification

Starting Git commit: `64e92dd1b17fc656cbead26fa99e94bc94425de6`. Existing unrelated modified and untracked report files were preserved and excluded from this commit. Revert only this design's two Markdown files to recover; no live backup required for documentation-only work.

Checked affected maintained dictionaries, Collection/receipt evidence, V8/V48/V53 SQL and Solution Design. Reviewed official AppSheet grouping and reference-view documentation. Verified local handover links, intended diff and whitespace before scoped commit/push. No runtime checks are claimed; all GUI/SQL/financial scenario tests remain in the handover for implementation. Repository publication uses the current branch's configured upstream under standing owner authorization.
