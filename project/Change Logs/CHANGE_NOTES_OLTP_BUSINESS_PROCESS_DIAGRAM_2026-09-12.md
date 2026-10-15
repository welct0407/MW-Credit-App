# OLTP business process diagram — 12 September 2026

## Scope and purpose

Create an editable draw.io business process diagram of Loan Manager ผู้จัดการสินเชื่อ, saved in the repository Documents folder as explicitly requested. Documentation only; no AppSheet, Looker Studio, schema, financial row, permission, notification or collection-runtime changes.

## Files

- `Documents/OLTP_Business_Processes.drawio`: three editable process pages.
- `Documents/OLTP_Business_Processes.md`: source mapping, interpretation, review and rebuild instructions.
- `scripts/build-oltp-process-diagram.cjs`: dependency-free reproducible generator.
- `outputs/oltp-process-diagram-20260912/page-1.png`, `page-2.png`, `page-3.png`: draw.io visual verification.
- This Markdown change log.

No data-model changes were made; overview/dictionary updates are not applicable. The user-directed Documents location takes precedence over the usual outputs location for the final deliverable.

## Rollback point

Repository baseline: `b9dce4eee2f8e4a42c971c07eb4d1386fd030a77`; working tree was clean. Latest recorded app version 3.000045 is source context only, not newly observed. App/version and dashboard backups are not applicable because no live object is edited.

Rollback by reverting this task's commit with a normal new commit, preserving later work. Do not restore AppSheet versions or financial data for this documentation change.

## Checks and status

Built the three-page XML and opened it in the draw.io platform using its documented XML creation interface after the Device file chooser failed to open. Visually checked each page, repaired normalized line breaks and rerouted the retry connector around the control note. Checked XML structure, unique per-page cell IDs, valid connector endpoints, page bounds and Git whitespace. No live workflow, payment, bot, delivery or permissions test was executed.

Documentation artifact complete; user review/acceptance pending. No runtime downstream effects. Process arrows express business sequence or documented processing; they are not database transaction guarantees. Default handling explicitly distinguishes the documented legacy deletion exception from governance for routine corrections.

## Manual review

- Open all three tabs in draw.io and confirm labels, sequence and readability.
- Compare enabled/disabled charge generation, individual prepayment versus bulk due-only payment, and Posted/Error/retry handling with the current app.
- Confirm early closure/default restrictions and OLAP ownership boundaries.
- Report diagram corrections before considering it accepted; no production financial mutation is required.

Commit/push follow the owner's standing rule; GitHub recovery coverage is reported only after the push is verified.
