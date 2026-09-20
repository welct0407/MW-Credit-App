# Promotion checklist workbook for owner review

Date: 20 September 2026. Starting commit: `5cecc67580a8a401c7dc8e4d8a147f119f161edf`; working tree clean. Status: review draft, not an adopted replacement for AGENTS/runbooks. No product release reserved and no live operations performed.

## Scope and deliverable

The owner requested a comprehensive, editable Excel checklist to review/add/remove activities before adopting it as the token-efficient promotion procedure. [Review workbook](../outputs/promotion-checklist-review-20260920/DEV_to_PROD_Promotion_Checklist_REVIEW.xlsx) has 57 activity rows and 21 document rows, with stable IDs, applicability, completion criteria, status/disposition, review decisions and notes/evidence. Excel tables support filtering and row insertion; headers and identity columns are frozen. All activity statuses start Not started and document dispositions Pending. Review decisions start Review, not assumed owner acceptance.

The draft covers DEV readiness evidence, integrated capture, exact Flyway pins and compatible SQL, controlled RC preparation, corresponding PROD themes, deployed app modes, scheduled guard first-use/reuse, approvals, App Upgrade, basic PROD validation, each document's closure, publication/tagging, retention and conditional recovery. Current R009 database-driven notifications take precedence over the previous direct-DEV-recipient proposal: distinct Login Email identifies the actor and Partner Email controls delivery. No implementation/runtime status is inferred from policy.

Sources: current AGENTS, Release Workflow, Promotion Documentation Checklist, Release Recovery Runbook, database README Each change, and promotion template. The Documents tab copies the current document register and verifies inventory with the maintained documentation helper. Detailed sources are consulted only for triggered activities; valid evidence is reused and optional whole-app/per-property comparisons remain optional. An explicit conditional row handles a necessary unlisted activity without silently expanding execution scope.

## Files and recovery

- Workbook and compact review inventory under `outputs/promotion-checklist-review-20260920/`.
- Maintained builder: `scripts/releases/build-promotion-review.mjs`; refuses to overwrite an existing workbook so later owner edits remain safe. Do not regenerate over owner feedback.
- This log. No active runbook, AGENTS, model workbook, database, apps or release status changed.

Recovery: revert only this task's new files/commit while preserving any later owner edits to the workbook. Existing procedures remain authoritative until owner review and subsequent adoption.

## Verification and handoff

Artifact Tool authored/exported the workbook. Rendered both sheets and corrected title/row clipping. Saved XLSX package checks verified two filterable tables, 57/21 unique IDs, expected initial statuses, four validation dropdown ranges and frozen headers/identity columns; no error cells. All 21 Documents paths matched the register, without missing or uncatalogued files. No formulas/calculated completion claim, live tests or native Excel execution were needed for this draft. Final publication is reported in the task response.

Next: owner edits Review decision/Notes or the checklist text/adds/removes rows. After review, reconcile the approved checklist with AGENTS and runbooks and define it as the execution source without duplicating competing inventories. No adoption is claimed by this draft.

## Efficiency review — 20 September 2026

Starting commit: `34106853212e382c9aedf8c5120f8cb6a9d6851e`; clean working tree. Owner requested fewer unnecessary steps/checks and improved token/time efficiency. Inspected the actual workbook and its editable fields before changing it; no owner feedback was present. The workbook remains a review draft, with no live operation or active-runbook adoption.

- Consolidated 57 activity rows into 24, retaining original anchor IDs and recording all old-to-new mappings in the review inventory. Removed separate repeat-read/version/approval/reporting tasks and combined coherent evidence checks, not just stage headings.
- Reduced activity instructions from 1,587 to 693 whitespace-delimited words (56%). This measures text reduction, not a measured runtime/token saving.
- Routine promotion accepts valid DEV tests and final diagnostics; no new audit merely to begin promotion. RC and PROD each receive one focused validation pass. Setup, guard experiments, SQL, external checks and recovery run only on their explicit triggers. Detailed recovery branches remain in the existing recovery runbook instead of being recopied into seven checklist items.
- Retained necessary authorization, rollback, exact migration pins, source/substitution verification, scheduled containment, zero editor issues, immediate pre-upgrade drift checks and publication gates. Unchanged recipient routing and external assets reuse evidence.
- Kept all 21 document rows with concise update triggers. Batch-classify untouched conditional/history rows with reasons; read only triggered contents. Model overview/dictionary remain paired. No routine diagram redraw or workbook rebuild.

Updated the existing workbook, compact inventory and this log; added a bounded inspect/edit script and labeled the original builder historical. Preserved both tabs, editable review/status/note fields, tables, filters, panes and styling. Rollback is the previous Git workbook/log plus preservation of any later user feedback; the private working snapshot under ignored `.tmp` is not publication evidence.

Validation: rendered the input and revised main/top/closure/document views; reviewed legibility. Checked the saved XLSX for 24/21 unique row IDs, unchanged initial statuses/review values, four non-overlapping dropdown ranges, two filterable tables, frozen headers/ID columns, editable sheets and zero error cells. Verified all 57 original IDs map once and all document identities/rules/dispositions/feedback survive. Corrected overlapping imported validation ranges before final export. No live tests or unrelated release-helper suite was needed. Commit/push verification is reported in the task response.
