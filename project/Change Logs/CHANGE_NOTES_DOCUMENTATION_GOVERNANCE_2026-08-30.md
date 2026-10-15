# Change Notes: Documentation Governance

## Change control

- **Date:** 2026-08-30
- **Status:** Implemented
- **Scope:** Project-level Codex instructions in `AGENTS.md`
- **Purpose:** Make change logs and data-model reference updates mandatory parts of every applicable development task.
- **AppSheet rollback point:** Not applicable; no AppSheet configuration was changed.
- **Looker Studio backup:** Not applicable; no Looker Studio report was changed.

## Changes made

- Added a mandatory Markdown change log under `Change Logs/` for every implementation, configuration, dashboard, automation, governance, or documentation change.
- Defined the existing `CHANGE_NOTES_<SUBJECT>_<YYYY-MM-DD>.md` filename pattern.
- Established Markdown files in `Change Logs/` as the authoritative change history.
- Required every OLTP or OLAP data-model change to update both `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`.
- Defined the data-model objects covered by the rule, including shared tables, physical and virtual columns, expressions, relationships, slices, permissions, and app-specific availability.
- Added documentation verification to the normal change-completion workflow.

## Verification performed

- Confirmed that `Change Logs/`, `Documents/AppSheet_Data_Model_Overview.md`, and `Documents/AppSheet_Data_Dictionary.xlsx` exist in the project.
- Reviewed the new instructions for consistent paths, scope, and completion criteria.
- No OLTP or OLAP data-model object changed, so the model overview and data dictionary were not modified for this governance-only change.

## Manual testing required

None. On the next project change, confirm that Codex creates or updates the applicable Markdown change log and, for a data-model change, updates both model-reference documents.

## Rollback instructions

Revert the `Mandatory documentation updates` section and related workflow steps in `AGENTS.md`, then remove this change-log file if the documentation policy is intentionally withdrawn.
