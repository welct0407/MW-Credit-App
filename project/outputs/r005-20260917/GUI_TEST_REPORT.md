# R005 DEV workflow verification — 18 September 2026

**Implemented and tested in DEV; Not ready to promote.** SQL V20, OLTP 1.000120, OLAP 1.000120. Production remains V19 / OLTP 3.000156 / OLAP 1.100106. Owner acceptance and production authorization have not been given. Cash Ledger, Cash Position and Record Cash Transfer are OLAP-owned, as requested.

## Executed current-GUI tests

All records below are labeled synthetic DEV fixtures. No real lending, cash transfer or opening balances occurred. SQL readbacks are separate from GUI observations. The maintained `scripts/r005-final-evidence.mjs` asserts eight groups of captured results; [assertions](gui-assertions.json). Existing isolated SQL regression, retry/concurrency, rollback and restored-backup evidence remains applicable to immutable V20.

| Check | Expected and observed | Evidence |
|---|---|---|
| Handover validation | Only Cash Handover and Expense Reimbursement offered. Dad/Lisa directions; no same-holder route. Zero and fractional baht rejected. | Private GUI form captures; SQL test suite |
| Handover creation/correction | Dad → Lisa 100, then 120 using the same ledger Row ID. No source financial record created. | `gui-handover-sql-readback.jsonl`, later readbacks |
| Positive manual expense | Blank initial payer; positive amount cannot save without a payer. Dad, Lisa, Tommy available. Tommy expense 100 gives Tommy outflow 100 and unchanged 60/40 allocation. | `gui-expense-tommy-sql-readback.jsonl` |
| Reimbursement | Lisa → Tommy 100; optional expense selector permits the positive Tommy expense. Tommy balance returns to zero. Expense and 60/40 allocation unchanged. | `gui-reimbursement-sql-readback.jsonl` |
| First-day lending | Gross Lisa outflow 1,000 and separate Lisa receipt 35, net -965. First-day receipt receiver is not editable. | `gui-firstday-sql-readback.jsonl` |
| Closure and automatic rebate | Existing Close Loan action creates its normal 1,000 receipt and a Lisa-funded referral expense of 4. No separate closure movement. | `gui-closure-before-receiver-correction.jsonl` |
| Receiver correction | Closing receipt changed Dad → Lisa through OLTP quick edit. Same system ledger identity; allocation and repayment hashes identical before/after. | `gui-receiver-correction-readback.jsonl`, assertions |
| Expense payer correction | Positive 10 expense Dad → Lisa follows the source edit without changing allocation. | `gui-expense-dad-readback.jsonl`, `gui-expense-lisa-readback.jsonl` |
| Negative adjustment | Negative 10 with blank payer removes derived cash, giving seven total rows and Lisa balance 51. Specifying Lisa creates 10 inflow; expense allocation remains -6/-4. | `gui-negative-accounting-only-readback.jsonl`, `gui-negative-recovery-and-rebate-readback.jsonl` |
| Pending settlement | Explicit Pending amount 1 creates no cash. The earlier capture with NULL status is an intermediate form mistake, not a claimed Pending test. | `gui-settlement-explicit-pending-readback.jsonl` |
| Completed settlements | Existing Confirm Transfer action for Tommy and completed Lisa settlement each create 1 outflow from Lisa with no To Cash Holder. | `gui-settlement-both-partners-final-readback.jsonl` |
| Normal receipt / Dad default | New partial receipt defaults to Dad; 10 posts and credits Dad once. | `gui-normal-receipt-dad-form.txt`, `gui-normal-dad-readback.jsonl` |
| Direct Lisa receipt | New partial receipt explicitly selects Lisa; 20 posts and credits Lisa once. | `gui-direct-lisa-form.txt`, `gui-direct-lisa-before-default.jsonl` |
| Default | Existing Default Loan action closes the second synthetic loan with Defaulted=Y. Ledger remains 14 rows; balances and existing source movements unchanged. Both test loans are closed. | `gui-default-result.txt`, `gui-default-final-readback.jsonl` |
| Final OLAP source/protection | Ledger system row has no Edit/Delete. Linked Payment receiver is read-only. Related Cash Ledgers has no Add; the main cash dashboard retains Record Cash Transfer. | `gui-final-system-ledger-protection.txt`, `gui-final-olap-payment-readonly-related-ledger.txt` |
| Final dashboard | Three holders, held cash, signed balance and advance due above date-descending recent ledger; whole-baht currency. Summary Wide layout checked after Reset Dashboard. | `gui-cash-position-final.png`, `gui-cash-position-final.txt` |
| Historical preservation / reconciliation | Zero old receiver/payer assignments, historical cash rows, duplicate system sources and holder balance mismatches. | All readbacks and assertions |

The direct-receipt/default fixture used guarded SQL DML in `Set-R005SyntheticChargeRequest.ps1` to request one existing daily charge after the scheduled time had passed. After both receipts fully paid that charge, its synthetic Interest Due was set from 30 to 40 to make the existing default action eligible. This is fixture preparation, not an AppSheet configuration change or a new business rule. Default itself ran through the current GUI. No ordinary DEV loan was touched by that fixture script. Both test loans now have closed status and cannot receive scheduled daily charges.

Final synthetic custody balances: Dad -110 (held 0 / due 110), Lisa -891 (held 0 / due 891), Tommy 0. These are test positions, not actual balances. Synthetic borrower has AI Collection disabled. Fixtures are retained for evidence; no destructive cleanup was performed.

## Configuration, automation and diagnostic evidence

- [Exact configuration checklist](configuration-checklist.json): 5,009 OLTP + 1,940 OLAP baseline-to-candidate exported property differences, each linked to per-save evidence; all 6,949 mapped. This includes generated notification processing schemas, reverse refs, source navigation, Reporting Loans slice membership, intermediate warnings and dashboard refinements. It is a candidate record, not a production authorization or frozen accepted package.
- AppSheet history identifies OLAP 1.000098 and OLTP 1.000118 as **System / Editor refresh / Automatic consistency check**, with exact internal deltas retained in `dev-olap-version98-history.txt` and `dev-oltp-version118-history.txt`. OLTP 118 includes generated payer View Ref visibility ALWAYS. These recover attribution; they do not fabricate unavailable full historical exports. The readonly OLAP 98 editor was inspected without restoring it.
- The owner-approved limited R005 export-coverage exception applies to omitted appdoc settings and unset/inherited states. Exports omit full bot definitions, access/sharing and some editor-only state. Private editor supplements are retained. Unknown omitted coverage is not represented as verified; exact historical appdoc exports for the two automatic versions were unavailable from their current-editor links.
- DEV's four baseline notification bots are enabled at OLTP 120; all reviewed tasks and called notification branches route solely to the owner. Obsolete financial processing bots stay disabled; daily AppSheet charge schedule is active and duplicate SQL cron is inactive. OLAP hourly analytics refresh is enabled and export disabled, matching the read-only PROD OLAP current-editor inventory checked on 18 September. No R005 cash-ledger bot was introduced. End-device delivery and scheduled execution after this candidate have not been verified. Launch Automation Monitor opened the older interface; it was closed rather than used as a test substitute.
- Both saved/reloaded DEV editors show **No issues found** at version 1.000120. [OLTP diagnostics](dev-oltp-final-diagnostics.txt), [OLAP diagnostics](dev-olap-final-diagnostics.txt). Deployment Check displays only “app is deployed” and Return to prototype state, with no rerun control. No deployment-state change or legacy testing was used to bypass this limitation. Under the owner's zero-warning/deployment-check gate, unavailable deployment verification keeps the release **Not ready**.
- Current cash objects use DEV database-3; OLTP does not contain Cash Ledger or Cash Holder Balances. Companion navigation remains within DEV. Looker was not edited: no existing metric grain or source was changed; direct report UI verification is not performed and does not substitute for app tests.

## Remaining acceptance/readiness items

1. Obtain an available current-editor deployment-check result for both apps; no exception to that gate is currently approved.
2. Verify changed notification execution/delivery through an available current interface or owner receipt; retain owner-only routing.
3. Review the candidate's exact intended PROD values and editor-only supplements, including any required environment substitutions, before freezing the AppSheet promotion package. The limited coverage exception does not imply blanket verification of unexported settings.
4. Owner testing: open OLAP Cash Position, review holder totals and ledger details, try Record Cash Transfer with synthetic data, and review OLTP Received By / Paid By behavior. Owner acceptance and any future production promotion remain explicit decisions.

Rollback starts from DEV OLTP 1.000110 / OLAP 1.000096 and the verified pre-V20 backup recorded in the release log. Retain SQL ledger evidence and use a reviewed higher migration or explicitly authorized coordinated restore. Never restore old financial data over subsequent writes merely to undo UI configuration.
