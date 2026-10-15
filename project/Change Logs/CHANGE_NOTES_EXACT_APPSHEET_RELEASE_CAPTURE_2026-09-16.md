# Exact AppSheet release capture and reconciliation — 16 September 2026

Status: documentation implemented; no live DEV/PROD configuration audited, corrected or deployed. Owner reported missed DEV changes in PROD and requested exhaustive exact configuration capture in AGENTS.md. No product release number allocated.

## Change

Strengthened AGENTS.md Sections 6.1, 6.3 and 6.4:

- Capture both DEV app baselines and saved definitions after each edit/coherent save batch; reconcile all property changes, including generated changes, warning fixes and refinements, before task handoff/completion.
- Require exact before/after property values and paths, complete added-object configuration, explicit removal/rename/reference handling, nested options, expression text, lists/order and unset/default states. Long values may be linked; private values stay outside Git. Narrative summaries and selected-property lists do not prove completeness.
- Discover changes from complete definitions, supplement export omissions with exact current-editor evidence, and map all differences to checklist rows or explicit dispositions. Check the reverse mapping and record coverage totals; unresolved/unmapped items block readiness. Preserve separate release ownership and intermediate refinements.
- Default each PROD target to the frozen tested DEV value, with individually recorded exact environment substitutions. Preserve DEV/PROD source, link, notification, permission and theme differences without permitting undocumented business/UI deviations.
- Validate every target against independently reloaded saved PROD values, and compare complete PROD before/after definitions for unintended changes. Already-matching items still require verification; zero warnings, a successful save or visual similarity cannot replace exact reconciliation.

## Checks and limits

Reviewed the diff for consistency with frozen release packages, other-release ownership, environment isolation, warning clearance, privacy, scope approval and existing model-documentation requirements. Whitespace/diff checks passed. Only AGENTS.md and this change log are included; concurrent R002 files are outside this task. No runtime test applies to this documentation change. The next development/promotion must produce the required captures and completeness evidence; existing missed settings are not identified or repaired by this task.

## Rollback

Pre-task repository point: `6375dde308cbf7cd76ddc529f428d721af9a39db`. Reverse only this task's documentation diff in a new commit and retain unrelated/later work. No live app/database recovery is needed. Publication follows standing commit/push authorization; the completion response records the result.
