# SDLC efficiency — 17 September 2026

Status: Implemented and locally verified; repository publication recorded by the task's Git commit. Governance/tooling only; no product release number allocated and no DEV/PROD refresh or promotion performed.

## Continue here

- Done: concise AGENTS release rules, linked detailed workflow, test tiers/evidence reuse, batched documentation, structured delta/checklist/continuation tools and guarded dictionary helper.
- Next: use the relevant workflow stage for subsequent work. New releases start a structured delta; current R005 may continue its existing equivalent records without conversion.
- Decisions: owner authorized implementation of these efficiency recommendations. No live application changes, production authorization or model/settings changes are implied.
- Evidence: [verification artifacts](../outputs/sdlc-efficiency-20260917/README.md); [tool usage](../scripts/releases/README.md).

## Scope and purpose

Reduce repeated context loading, documentation copying, broad verification and unnecessary test reruns while preserving complete release deltas, zero-warning gates and production authorization.

- [AGENTS.md](../AGENTS.md): shortened Section 6 to essential rules and a runbook route, retaining its subsection numbers. Section 5.2 explicitly batches affected overview/dictionary updates per completed development batch and promotion. Unrelated project rules are preserved.
- [Release workflow](../Documents/Rules/Release_Workflow.md): retains detailed capture, freeze, promotion and closure requirements; adds change-based test tiers, explicit evidence invalidation/reuse, short continuation notes and a single exact-value delta source. Starting diagnostics may reuse evidence for the same saved versions; final diagnostics remain mandatory.
- [Documentation index](../Documents/README.md) and [scripts index](../scripts/README.md): routes to workflow/tools and replaces stale full-definition wording with changed-property evidence.
- `scripts/releases/`: local JSON delta validator, checklist/continuation generator, saved DEV/PROD observation comparator, optional test-input fingerprints and existing-row dictionary updater. Includes a synthetic template, usage instructions and repeatable tests.

Tool results describe supplied evidence, not autonomous live discovery or release certification. Codex must still reconcile its edit record and generated/dependent changes. Full exports remain optional. Existing Flyway runners, current-GUI tests, route-check triggers, exact frozen PROD validation, backups and explicit scoped production approval remain in force. Test fingerprints do not cover uncaptured live state. No forced migration of active release records or global model/Fast-mode changes.

## Checks and results

- Eight automated delta/CLI tests passed: exact DEV/PROD observations, missing values, types/order/absence, environment substitutions, stale candidate/revision, wrong app identity, malformed/duplicate records, fingerprint invalidation, CLI failure codes and evidence overwrite protection.
- Twelve synthetic dictionary checks passed: unique/missing/ambiguous keys, stale-value guard, duplicate cell, missing header, formula overwrite rejection, export/import values/formulas, source byte preservation, exact delta target and unaffected row/formula preservation. Before/after PNGs inspected; no clipping or unintended layout changes. Formula-error scan found no entries.
- Protected AGENTS sections, local links and intended Git diff checked; details are in `verification-summary.json`. Root instructions reduced from 5,348 to 3,873 whitespace-delimited words (about 28%). This is an instruction-size reduction, not a measured credit-saving claim.
- No live app, DB, refresh, delivery or financial tests were appropriate for this governance/tooling task. The production model overview/dictionary and R005 files were not edited. The workbook helper was exercised only on synthetic fixtures; review actual workbook previews/native features before adopting its candidate output.

## Rollback

Starting Git commit: `2b103e5`. Revert only this task's publication commit in a new commit, preserving later and concurrent work. Restore the previous Section 6/5.2 and remove only this task's new workflow/tool/evidence files if abandoning the tooling; do not reset the shared working tree or revert R005. No app/database rollback is needed. Generated dictionary candidates never overwrite their input workbook.
