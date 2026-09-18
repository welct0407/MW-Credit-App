# Promotion documentation coverage — 18 September 2026

Status: Implemented, tested and documentation reviewed. Governance/tooling improvement plus repair of R006's omitted development-difference entry; no new product release number or live operation.

## Changes

- [Canonical checklist](../Documents/Promotion_Documentation_Checklist.md) accounts for all **20 files** now in Documents: **3 always-required records**, **13 conditional references**, **4 historical records**. It includes both editable diagrams, their narratives, current/historical workbooks, design/pilot documents and procedural runbooks.
- Always update/verify the release tracker, environment inventory and development differences. Model/formula changes require paired overview/dictionary reconciliation. Other documents have explicit impact triggers; archived documents remain preserved. One disposition and evidence/reason per file replaces a generic docs tick, without requiring a whole-folder content audit or no-op edits.
- [AGENTS.md](../AGENTS.md), [release workflow](../Documents/Release_Workflow.md), documentation index and tracker guidance require the named rows before Released. Documentation-only incompleteness is distinguished from failed production validation; later DEV work and existing runtime evidence are preserved.
- The existing delta CLI now includes documentation rows. `scripts/releases/documentation.mjs` can generate them independently for existing/SQL-only releases. Both use the canonical Markdown register and recursive path inventory; new/missing paths appear for resolution. Generation leaves rows Pending and does not certify their contents or change any status.
- [Development Changes](../Documents/Development_Changes.md) now contains R006's retrospective DEV checkpoint and explicit closure at PROD OLTP **3.000173**, backed by its four Verified saved comparisons, original observations and release log. Added the correction to R006's log. This repairs the known omission; no fresh workbook inspection or whole-R006 documentation certification is claimed.

## Verification

Eleven Node tests passed, including all existing delta tests, generated CLI document rows, complete real-folder coverage, detection of new/missing paths and rejection of duplicate/malformed register rows. [Test results](../outputs/promotion-documentation-20260918/tool-tests.txt) and a [synthetic generated checklist](../outputs/promotion-documentation-20260918/example-promotion-checklist.md) are retained. The example is R000, not a release reservation or completed documentation audit.

Reviewed each file's role using its current index/reference annotations and affected contents; paired diagram/workbook roles were established from their maintained references. No binary document was edited. Local links/anchors, register-versus-folder coverage and intended Git changes were checked. Counts/checks are in [verification.json](../outputs/promotion-documentation-20260918/verification.json). R006 evidence confirms all four App formula targets Verified at 3.000173; no new live verification was performed. No fresh Deployment Check, route audit or unrelated regression suite was added.

## Recovery

Starting commit: `233d382b94de3521f2db576e1a4b7b1427b0998a`. Revert only this task's publication commit to restore prior guidance/tool behavior, preserving unrelated/later work. Preserve the repaired R006 history if only reverting tooling. No app/database rollback is needed. Publication follows the standing commit/push rule.
