# Automation Plan Diagram Update — 7 September 2026

## Status

Complete. Updated the existing Google Drive file `Automation Plan.drawio` in place. File ID: `133gRy6oZS9QQSXl1MgFuSy2D-yAPH-wk`. The Drive file name, sharing location, OLAP page and file identity were preserved.

## Purpose and source

The OLTP page still documented the pre-universal-payment design, including direct creation of Repayments from Charge actions. It was reconciled to the production universal-payment implementation using:

- `CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md`;
- `CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md`;
- `Documents/Universal_Payments_Clone_Migration_Runbook.md`; and
- `outputs/universal-payments-20260905/action_checkpoint_v1.000052.json` plus `configuration_checkpoint_after052.json`.

The diagram records the implemented OLTP configuration through the production v3.000002 rollout. OLTP v3.000003 was subsequently observed during read-only KPI comparison, but no action or bot change was attributed to that save.

## Changes to the OLTP page

Replaced the stale OLTP canvas with a structured flowchart using the file's existing draw.io method: flowchart start shapes for bots, rounded rectangles for actions, terminators for outcomes, orthogonal connectors, and separate OLTP/OLAP pages.

Added or corrected these entry paths:

- `Receive Payment` → `Common - Create Full Payment from Charge` → Payments row using `Single Full`.
- `Receive Partial Payment` → `Payments_Form` using `Single Partial`.
- `Receive All Charges` → Payments row using `Receive All`.
- `Receive Lump Sum` → `Payments_Form` using `Lump Sum`.
- `Wrapped Action - Close Loan` → `Create Final Charge` → `Add Principal to Today's Charge` → `Receive All Remaining Charges` → Payments row using `Loan Close`.
- `Create First Day Charge` → `New Loan Payment - Create First-Day Charge` → `Auto Receive First-Day Charge` → `Payment - Create First-Day Receipt` → Payments row using `First-day Auto`.

Added the complete common receipt-processing path:

1. Bot `Payments - Process Receipt`, event `Payment queued or retried`.
2. Grouped action `Payment - Process Receipt`.
3. `Payment - Create Snapshots` calling `Payment - Snapshot Charge` for eligible Charges.
4. `Payment - Freeze Plan` calling `Payment - Freeze Allocation` for stored snapshots.
5. `Payment - Post Plan` calling `Payment - Post Allocation`, which creates traced Repayments.
6. `Payment - Reconcile`, producing `Posted` or `Error`.
7. `Payment - Close Paid Loans` calling `Set Loan Closed` for fully paid loans.
8. `Payment - Retry`, returning an Error receipt to Processing and re-entering the bot.

Added the revised notification flow:

- Bot name remains `Notification - Charge Received`.
- Its event is now `Payment Posted` on Payments, rather than one notification per Repayment.
- The task uses Payments context and sends one app notification per posted receipt.

Retained and clarified the existing daily-charge and default-loan flows. A note records that Close Loan and Default Loan are guarded while the borrower has a Processing/Error receipt. A safety note records the snapshot-completeness, duplicate-link and reconciliation checks. A legend distinguishes bots, grouped actions, ordinary actions, Payments forms/rows and terminal states.

## OLAP page

No changes. OLAP has no universal-payment processing actions or bots. Its existing Daily Analytics rebuild flow remains as previously drawn.

## Rollback point

The Drive file's immediately preceding revision is the rollback point. The diagram was edited in place with autosave enabled; diagrams.net showed the workspace account online and `Last change less than a minute ago`. Restore the preceding Google Drive revision to undo this documentation-only change.

## Verification

- Reloaded the Drive-backed diagrams.net file after autosave.
- Confirmed the same file ID and OLTP page ID remained open.
- Confirmed the saved canvas still contains `Receive Lump Sum`, `Payments - Process Receipt`, `Payment - Retry`, `Event: Payment Posted`, the five numbered processing steps, and the 7 September source note.
- Visually reviewed the full page at 25% zoom: sections, connector paths, labels, legend and page boundaries render without overlapping the editor controls.
- No AppSheet configuration, database row, notification, bot execution, OLAP automation, Drive sharing setting or extra Drive copy was changed.

