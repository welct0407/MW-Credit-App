# OLTP business process diagram

**Current reference annotation — 15 September 2026:** production OLTP is version **3.000070** and uses PostgreSQL through database-2. The current [model](AppSheet_Data_Model_Overview.md), [dictionary](AppSheet_Data_Dictionary.xlsx) and [environment inventory](Environment_Inventory.md) supersede historical source/version details below. The diagram remains a September 12 workflow synthesis; its three pages have not been recertified by executing a new loan lifecycle in this documentation task. Current actions and views are captured in outputs/documentation-reconciliation-20260915/app-model.json. Notification delivery and bot scheduling are not established by an action definition.

Open [OLTP_Business_Processes.drawio](OLTP_Business_Processes.drawio) in draw.io / diagrams.net. All shapes, connectors, text and three page tabs are editable.

1. **Loan lifecycle:** borrower setup, loan terms, automatic/manual charges, Collection, payments and loan outcomes.
2. **Payment processing:** six entry modes, validation, snapshots, frozen allocation, posting, reconciliation and retry.
3. **Controls and boundaries:** early closure, default qualifications, operational master data and the OLAP/Looker reporting boundary.

## Basis and interpretation

Prepared 12 September 2026 from repository documentation, using then-recorded OLTP version **3.000045**. That is the diagram's historical baseline, not the current app version. The business sequence is a synthesis, not a newly implemented workflow or evidence of user acceptance. Current configuration and later dated change logs supersede historical baselines.

| Source | Diagram content |
| --- | --- |
| [Data model overview](AppSheet_Data_Model_Overview.md), current charge-generation section and daily-installment section | Borrower/loan/charge relationships, loan types, charge-generation flag, due-date populations, closure restrictions and application ownership |
| [Universal payments production log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_PRODUCTION_2026-09-06.md) | Production adoption of Payments, Payment Allocations and traced Repayments |
| [Automation diagram log](../Change%20Logs/CHANGE_NOTES_AUTOMATION_PLAN_DIAGRAM_2026-09-07.md) | Six payment-entry modes, named processing steps, retry, notification transition and close/default guards |
| [Universal payments clone log](../Change%20Logs/CHANGE_NOTES_UNIVERSAL_PAYMENTS_CLONE_2026-09-05.md) and overview section 2.2 | Allocation ordering, interest-first split, duplicate/reconciliation guards, limitations and legacy default handling; interpreted with the production migration record |
| [Charge-generation flag log](../Change%20Logs/CHANGE_NOTES_CHARGE_GENERATION_FLAG_2026-09-08.md) | Disabled generation still permits manual Charges; grouped close/default shortcuts unavailable |
| [Loan duration log](../Change%20Logs/CHANGE_NOTES_LOAN_DURATION_VISIBILITY_2026-09-11.md) | Latest documented version baseline; no transaction workflow change attributed to this display fix |
| [Repository governance](../AGENTS.md) | Auditability, operational/reporting boundary and correction policy |

The diagram contains no borrower records, credentials, bank details or production amounts. Collection settings are shown only as OLTP configuration; external AI collection software is outside scope. No approval stage, disbursement integration, general-purpose reversal action or atomic transaction guarantee is invented. Manual entry of Charges is available in general; the flag-off branch emphasizes the alternative when automatic generation is disabled.

Payment Status is a settlement state; lateness is a separate due-date/overdue indicator. Receipt validation prevents ordinary overpayment, but exceptional historical overpaid/adjusted data needs separate reconciliation. The diagram does not define a new delinquency or default policy. Notification boxes describe documented triggers, not verified delivery or authorization to send.

## Review and maintenance

Visually checked all three pages in draw.io. Review the sequence and terminology against the current app before treating it as accepted. Read-only review should cover charge generation enabled/disabled, future-charge prepayment versus due-only bulk payment, Posted/Error/retry, and early closure/default restrictions. No financial record needs to be created or changed for diagram acceptance.

Rebuild with `node scripts/build-oltp-process-diagram.cjs` from the repository root. The generator overwrites the diagram, so preserve any manual draw.io edits before rebuilding. Visual verification evidence is in `outputs/oltp-process-diagram-20260912/`.

The editor import used the official [draw.io XML creation interface](https://www.drawio.com/docs/reference/supported-url-parameters/). The local `.drawio` is the authoritative deliverable; the browser session is a preview, not a linked GitHub editor.
