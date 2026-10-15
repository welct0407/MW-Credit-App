# Production business cash opening balance — 18 September 2026

## Lisa reconciliation — completed 18 September

Owner approved the model-derived 78,540-baht adjustment and then explicitly changed its effective date to **18 September 2026** before the write. Inserted `opening-lisa-20260918`, Opening Balance, inflow to `ch:lisa`, amount 78,540. No 17 September Lisa opening was inserted. This supersedes the earlier 900-baht suggestion below, which considered only post-cutover movements and was not an appropriate reconstruction of the opening cash position.

Basis from production at 17 September close: partner A net available 37,689 + B 45,478 + available capital 8,634 = business cash 91,801; less Dad 15,870 gives Lisa 75,931. Lisa already had historical expense cash outflows of 2,609, so the required opening adjustment is 78,540. Today's additional loan outflow 1,000 and receipt 100 result in current Lisa balance **75,031**. Today's effective date intentionally leaves her historical 17 September ledger balance unreconciled; this is a current-date opening correction, not income or contributed capital.

Verified production host and holder identity; locked cash ledger, rejected any prior Lisa opening/correction, checked pre-write balance -3,509, inserted using the existing controlled-adjustment guard, and asserted post-write 75,031 before commit. Saved SQL readback confirms date 18 September, amount 78,540, Lisa 75,031, Dad 15,870, Tommy zero and no reimbursement due. No app configuration or schema changed. GUI sync was not independently repeated for this entry.

Fresh backup before mutation: private `r005-20260917/lisa-opening-before-20260918.dump`, SHA256 `E7F632DB4F630B26B0CF18EDE4F84D5949A6E9367321D4F7EEBF1070EAFB796B`. Isolated public/assessment_lab restore and normalized schema comparison passed. Initial rehearsal hit an empty inherited connect_timeout; explicit timeout fixed the local retry before production mutation. Recovery uses an owner-authorized counter-adjustment retaining history; do not restore over later financial writes. Starting Git 45d91e7; clean tree.

Status: **Applied and verified.** The owner authorized one production data write: an initial business cash-on-hand entry of **฿15,870 for Dad dated 17 September 2026**. Lisa was read for a recommendation only; no Lisa opening row was written.

## Scope and target

- Environment: production PostgreSQL `loan_manager_prod` on `appsheet-pg-prod-20260914` / `34.21.174.215` (V21).
- Shared consumers: production OLTP Loan Manager **3.000172** and production OLAP Loan Business Insights **1.100122**.
- Table: `Cash Ledger`.
- Inserted row: `opening-dad-20260917`; Movement Date `2026-09-17`; Movement Type `Opening Balance`; Amount `15870`; Ref To Cash Holder `ch:dad`; Entry Origin `Manual`; Source Type `Manual`; Source Key `MANUAL:opening-dad-20260917`.
- Notes and Created By identify this as an owner-authorized SQL adjustment. The controlled transaction-local setting required by the V21 guard was used.

## Backup and rollback

- Existing verified restorable production baseline: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/production-before.dump`, SHA-256 `B989EC1248F14C508197909BAFD4E7D5C3DFD8CE251A230C79438479A6918135`; the isolated restore rehearsal passed. Do not restore it over later financial writes without a new owner-authorized recovery decision.
- Row-level before-image for the affected custody data: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-cash-opening-20260918/before.json`, SHA-256 `C7C650CBB707EA14DCF772A2B7B216C43BB3A6B67781D1EE1A8200B99556565F`.
- Post-write evidence: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/business-cash-opening-20260918/after.json`, SHA-256 `79AC9F9DA78CCF1F1C486122C4BFB187D088575B457D669A45B330F07D10268E`.
- Targeted rollback is a reviewed forward correction that preserves the opening row and adds an auditable counter-entry if the owner later changes the amount. Do not delete the ledger row.

## Lisa recommendation

At the time of the write, production contained two Lisa custody movements: **฿1,000 loan disbursement out** and **฿100 payment receipt in**. The SQL `Cash Holder Balances` view therefore reports Lisa Cash In **฿100**, Cash Out **฿1,000**, Current Balance **−฿900**, Business Cash Held **฿0**, and Reimbursement / Advance Due **฿900**. If the intended opening balance is the amount needed to bring Lisa's current balance to zero after these current movements, the suggested Lisa opening amount is **฿900**. This is a recommendation only and remains unwritten.

## Verification

- Atomic SQL preconditions checked the active `ch:dad` identity and rejected any conflicting existing row before insert.
- SQL readback confirmed the exact row and holder balances: Dad Current Balance / Business Cash Held **฿15,870**; Lisa Current Balance **−฿900** / Reimbursement Due **฿900**; Tommy **฿0**.
- Production OLTP synced successfully. Its Business Cash Held dashboard visibly shows **Dad ฿15,870**.
- Production OLAP synced successfully. Cash Position visibly shows the three ledger rows (Dad opening, Lisa loan outflow, Lisa receipt inflow) and holder summary values Dad **฿15,870**, Lisa Business Cash Held **฿0** / Current Balance **−฿900** / Reimbursement Due **฿900**, Tommy **฿0**.
- No AppSheet configuration, schema, notification, loan, payment, expense, settlement or Lisa data was changed.

## Remaining manual checks

None for this data-only write. Future cash movements should continue through the existing OLAP Cash Position workflow; Opening Balance remains controlled SQL administration by design.
