# Universal payments clone migration runbook

Date: 6 September 2026. Configuration checkpoint: **v1.000068**. Data-model inventory checkpoint: **v1.000065** (unchanged by the subsequent temporary recovery test and receipt-card action selection). The user accepted the clone results and authorized production migration on 6 September 2026. Production is now deployed at v3.000002; the production change log records implementation, backup, validation and remaining coverage.

## Environments and rollback

| Environment | Identity | Recorded version |
| --- | --- | --- |
| Source OLTP | Loan Manager ผู้จัดการสินเชื่อ; app `93844270-6aa5-420b-a960-bcdf08abd357` | v2.300005 before copying; source was not edited |
| Test OLTP | LoanMgr Payments TEST 20260905; app `1b901dff-2e47-477c-8d2c-28aad5556102` | Pre-edit rollback v1.000002; current v1.000068 |
| Test database | Money Payments TEST 20260905; `eEwpmrK1Zr4_ao2UcQzF42` | Separate native database; 12 tables, eight loaded by test OLTP |

[Open test app](https://www.appsheet.com/start/1b901dff-2e47-477c-8d2c-28aad5556102?platform=desktop) · [Open test database](https://www.appsheet.com/dbs/database/eEwpmrK1Zr4_ao2UcQzF42/table/7rco54zfAb4EEbaVFZpkJc)

The clone remains undeployed. Three notification bots remain disabled. OLAP and Looker Studio were not changed. App version restoration restores configuration, not physical columns or deleted data. A clean database reset requires a fresh isolated copy. Preserve the test evidence before any reset. Before a later production migration, inspect the then-current production version and source IDs and record a fresh rollback point; do not assume v2.300005 is still current.

## Authoritative implementation sources

- [Change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md): exact locations, before/after settings, corrections, temporary changes, versions and rollback.
- [Data-model overview](AppSheet_Data_Model_Overview.md), section 2.2, and [data dictionary](AppSheet_Data_Dictionary.xlsx), sheets **Payments Clone** and **Payments Clone Slices**: 54 affected column definitions and 45 ordered slice memberships. Existing production sheets retain their dated baseline.
- [Final core action expressions](../outputs/universal-payments-20260905/action_checkpoint_v1.000052.json): 18 core action definitions and four allocation helpers. Later default/delete/action changes are recorded in the log; this JSON alone is not the complete migration.
- [Later configuration expressions](../outputs/universal-payments-20260905/configuration_checkpoint_after052.json): Interest Due validation, default entry guard and receipt-level notification template.
- [Execution report](../outputs/universal-payments-20260905/functional-test-results.md): observed scenario results, including initial failures and corrected retests.

Read later corrections before applying an earlier log entry. In particular, the initial Text fields, bot conditions, related-row processing checks, duplicate Automation Entry helper and temporary generator overrides are superseded.

## Accepted migration checklist (production execution recorded separately)

1. **Reconcile and back up.** Confirm the current OLTP/database and inspect changes since the recorded source version. Preserve keys and existing financial rows. Capture a fresh app rollback version and a recoverable database copy before physical migration. Confirm the production maintenance/sync cutover and notification recipients. The clone's copied data and attachment-copy choice are not a production migration procedure.
2. **Create the physical schema.** Create Payments and Payment Allocations and add the two optional payment links to Repayments, using the dictionary's exact names/types. Preserve system Row ID. Create all six relationship columns as native **Reference**. Choose Payment Date and Allocation Order as the respective new-table native labels before configuring relationship fields; do not reproduce Text staging. Source IDs in production must point to the intended production database, never the clone IDs.
3. **Load and reconcile the app schema.** Load the two tables and regenerate affected tables. Inspect every new Ref target. Required IsPartOf: Payments.Ref Borrower and Payment Allocations.Ref Payment. Cross-links remain IsPartOf false. Preserve the original Loan→Borrower, Charge→Loan and Repayment→Charge ownership. Verify all existing expressions and clear any unwanted regenerated Loans Close Date/Due Date defaults back to their pre-migration values.
4. **Apply column definitions and slices.** Configure the receipt fields, snapshot fields, frozen amounts, four helper VCs, reconciliation VCs, creator/field locks and generated reverse references from the 54-row dictionary. Keep historical/default repayment trace links optional. Reconcile Related Payments membership at the end of Visible Borrowers and Todays Collection Board without replacing their filters or permissions. Add the narrowly scoped Charges.Interest Due validation exception for zero Posted snapshots.
5. **Install processing and retry actions.** Apply the final core expressions in dependency order: freeze/post allocation and snapshot charge helpers; receipt snapshot/freeze/post/reconcile/close actions; five-step processing group; Retry. Preserve snapshot order (charge date descending, source ordinal descending), interest-before-principal split, zero snapshots and duplicate/current-balance/completeness checks. Reconciliation must compare stored components, links and counts as well as totals. Do not create the deleted Payment - Automation Entry action.
6. **Replace entry points.** Full, partial, Receive All, Lump Sum, first-day and Loan Close must create Payments. Preserve the existing default adjustment repayment path and financial rollup formulas. Apply the system Add/Edit/Delete guards, four default retention/deletion changes (ACT-028), direct Loan/Charge delete guards (ACT-029), and default entry guard/confirmation (ACT-032). Receipt-generated repayments remain protected; historical/default rows with blank Ref Payment retain their documented behavior.
7. **Configure automations.** Payments - Process Receipt uses Payment queued or retried on Payments Adds/Updates, Deletes off, bypass security filters false, condition `[Status] = "Processing"`, and the five-step processing group. Trigger other bots and Wait for execution to complete are true. Preserve/verify first-day bot chaining. Replace the per-repayment notification event with the documented Payment Posted transition and Payments-context task. Separately review when to enable notifications; the clone isolation switches must not be copied blindly. Scheduled delivery and notification delivery have not been tested in the undeployed clone.
8. **Configure views.** Payments is a menu Deck sorted Payment Date descending then Created At descending, primary Ref Borrower, secondary Status, summary Amount Received. Its manual card action list is Delete, Edit, Payment - Retry (each governed by its action condition). Payments_Form order: Ref Borrower, Payment Date, Ref Target Charge, Amount Received, Payment Method, Bank Reference, Notes; auto-save/reopen off. Collection's manual bar includes Receive All Charges followed by Receive Lump Sum. Retain the complete ownership VC even though Visible Allocations shows only positive rows.
9. **Validate before cutover.** Run the execution report's successful scenarios against fresh disposable data and the remaining matrix below. Reconcile receipt amount = planned = posted and P/I components, charge/loan totals and collection date basis. Verify manual acceptance. At cutover, require clients to sync to the intended definition. Reconcile OLAP/reporting with the same cutoff before relying on downstream results; no OLAP or dashboard migration has been implemented by this task.

## Excluded from migration

Do not migrate synthetic borrower/loan/charge/payment keys or rows, the intentionally preserved failed LS25 fixture, diagnostic status interventions, A7 manual repair, supplemental A1 test interest, discarded Error receipt, borrower cleanup, or empty starter-row cleanup. Do not migrate temporary generator guards/dates/visibility, the paused receipt-bot state, or the TEST-PARTIAL-RECOVERY15 allocation suppression. Those test controls were restored. Native database currency display is inherited and can differ from the app's baht formatting; no currency conversion was implemented.

## Remaining acceptance coverage

| Area | Required next check | Boundary |
| --- | --- | --- |
| Offline and sync loss | Submit while offline, reconnect, interrupt mid-sync, reopen client and verify one final receipt/repayment set | Requires controlled device/network testing; not established by desktop online tests |
| Simultaneous users | Submit two stale clients against the same borrower/charge, then retry any Error receipts | Guards are not atomic locks; native deterministic repayment keys were unavailable in the inspected action picker |
| Access roles | Test intended operational users and any read-only users, direct links and hidden actions | Authenticated owner session only has been exercised |
| Scheduling | Verify Daily 00:05 at the expected date/time boundary, generation population, catch-up and duplicate prevention | Clone is undeployed; manual fixture generation is not scheduled execution evidence |
| Notifications | Confirm one notification per Posted transition, recipients, Thai/English text, deep link, retry and metadata-edit behavior | Template/event configured but all delivery disabled; no messages sent |
| Long-running failure | Test server failure during snapshots/freezing/posting and a stale charge balance after freezing | Controlled single suppressed-post test passed; not every infrastructure failure was reproduced |
| Corrections | Review existing historical/default adjustments, date changes and any approved reversal/void convention | A new general reversal engine was not introduced; routine correction must not use borrower deletion |
| Performance and navigation | Mobile form/layout, realistic sync volumes, hidden borrower regression, all existing reporting shortcuts and attachment paths | Copied file attachments were not included; owner desktop coverage does not establish mobile/attachment behavior |
| Downstream totals | Reconcile OLAP and governed dashboard fields at a defined sync cutoff, including partial/error receipts and default losses | OLAP/Looker unchanged; unchanged repayment grain reduces migration impact but does not replace reconciliation |
| User acceptance | User walks through daily operation and confirms behavior and wording | Required by AGENTS.md before acceptance or production deployment |

The finite tests provide evidence for their recorded inputs. They do not prove all possible scenarios. Keep this matrix and the authoritative change log current as the remaining cases are executed.

## Production execution record

Completed migration to original OLTP v3.000002 and original Money database. Full backup app243eb391-5f6d-4720-a7e2-f0dc67151e78 with databaseSAYscSVuS847EarNTaAiwc; app rollback v2.300005. Both new tables are empty after synthetic validation cleanup. Production notifications/scheduler restored; release candidate returned to prototype state. OLAP loads its prior schema with a source warning; recent reporting snapshots were refreshed and reconciled. See [the authoritative production change log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md). Remaining matrix items above remain unexecuted unless that log explicitly records a result.


## Copy retirement — 6 September 2026

At the user's request, the test app, release candidate and isolated test database were deleted after production implementation. The full production backup app/database pair is the only retained AppSheet backup. Earlier references to accessing the clone/candidate are historical; local test records and configuration checkpoints remain. Production and OLAP were retained without configuration changes. See [copy cleanup log](../Change%20Logs/CHANGE_NOTES_LOAN_MANAGER_COPY_CLEANUP_2026-09-06.md) for exact IDs and final verified inventory.
