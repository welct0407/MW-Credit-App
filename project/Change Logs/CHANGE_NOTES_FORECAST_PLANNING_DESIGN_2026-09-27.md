# Forecast & Planning design — 27 September 2026

## Scope and purpose

Owner requested a Forecast & Planning tab design, useful metrics/charts, a design summary and detailed implementation handover. Created repository Markdown artifacts grounded in the current maintained source definitions and release evidence. This is documentation-only work; no product release allocated and no live report, SQL, AppSheet, financial records or notification change.

## Changed files

- `outputs/forecast-planning-design-20260927/README.md`: concise design summary.
- `outputs/forecast-planning-design-20260927/HANDOVER.md`: scope, source evidence, cutoff/population, metric formulas, schedule precedence, scenario inputs, 15 visual sections, source contracts, synthetic acceptance cases, rollout and recovery.
- `Documents/README.md`: navigation entry for the new design.
- This change log.

## Decisions and limits

Partners now has its own delivered page; the proposal keeps actual partner reporting there. Forecast distinguishes posted gross interest, outstanding obligations, simulated future schedules and assumed receipts. Funding requires verified canonical cash and explicit future flow inputs. No probability calibration, historical forecast accuracy, arbitrary historical as-of forecast or speculative new lending income is claimed. Source inspection is repository-based, not live verification; implementation must verify current identities/definitions. Scenario settings are proposed, not owner-approved business targets.

## Rollback and unrelated work

Starting Git: `b5efd78be9f047b2ec8f5bb6350dbb3bd268c5b9`. Initial unrelated untracked work: `Change Logs/CHANGE_NOTES_RISKS_REDESIGN_2026-09-24.md`, `outputs/r026-payment-health/`, and `outputs/risks-redesign-20260924/`; preserved and excluded from publication. Rollback is a scoped revert of this documentation commit, preserving later edits. No live backup required for documentation-only work.

## Verification and status

Design deliverables complete. All relative links in both design artifacts resolve; the synthetic scenario/cash examples were recalculated and match; Git whitespace checks passed. Scope and source references were reviewed against the inspected repository definitions. Implementation tests listed in the handover are future acceptance criteria, not passing live evidence. No live manual tests apply to this documentation task. Publish these four intended files to the configured current-branch upstream; final response records the verified publication result.
