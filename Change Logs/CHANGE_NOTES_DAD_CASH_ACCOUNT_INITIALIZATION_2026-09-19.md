# Dad cash-account initialization — 19 September 2026

## Scope and purpose

Initialized Dad's production TTB and SCB cash accounts using the owner's current balances and requested historical initiation dates. This was an operational data change only; no schema, app definition, automation or model object changed.

The verified target was production Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, Flyway `V24`, with PROD OLAP app `e74dd368-654f-44d7-bccf-83cf361d1cdb` used for the current-GUI readback.

## Reconciliation and changed records

Before initialization, Dad's holder balance was ฿21,780. Account-assigned inflows were ฿2,620 for TTB and ฿1,400 for SCB, while ten retained accountless historical ledger rows had a net value of ฿17,760: ฿15,870 dated 17 September and a net ฿1,890 dated 18 September.

The owner-provided current account balances total ฿22,690, requiring a documented ฿910 increase to Dad's holder ledger. The initialization retained every historical accountless row unchanged and used its dated net amounts as the opening snapshots:

| Account | Initiation date | Opening snapshot | Initialization correction | Existing assigned inflows | Current balance |
| --- | --- | ---: | ---: | ---: | ---: |
| Dad TTB | 2026-09-17 | ฿15,870 | ฿320 | ฿2,620 | ฿18,810 |
| Dad SCB | 2026-09-18 | ฿1,890 | ฿590 | ฿1,400 | ฿3,880 |

Created controlled manual-correction rows `dad-ttb-init-reconcile-20260917` and `dad-scb-init-reconcile-20260918`, each linked to its bank account and carrying an audit note. Created immutable account-cutover records with TTB dated one day before its first assigned receipt on 18 September and SCB dated one day before its first assigned receipt on 19 September.

After initialization, Dad's account balances sum exactly to his holder cash on hand of ฿22,690. The ten earlier accountless rows remain intact; their net is represented by the dated opening snapshots instead of assigning individual historical receipts to banks without evidence.

## Backup and rollback

Before the write, created the private production dump `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\dad-accounts-init-before-20260919.dump`, SHA-256 `BF6DE83E1155DC1D61F7CC0ACA1D5771079E1E46045BD24C0EB97C2A471199E9`. An isolated restore succeeded with normalized schema equivalence for `public`, `assessment_lab` and Flyway history. Cloud SQL instance settings and the cron extension remain outside this logical-backup scope.

Account openings are immutable by design. Future balance differences should use documented account-specific compensating corrections. Changing the initialization metadata itself requires a separately authorized, coordinated database recovery; never restore the backup over later production activity without that recovery decision.

## Verification

- Rehearsed the full transaction and all assertions under rollback before committing the identical guarded transaction.
- Locked affected financial source, ledger, account and cutover tables during both phases.
- Verified the historical accountless ledger count, net amount and row fingerprint did not change.
- Verified TTB is initialized with opening ฿15,870, Cash In ฿2,940 and Current Balance ฿18,810.
- Verified SCB is initialized with opening ฿1,890, Cash In ฿1,990 and Current Balance ฿3,880.
- Verified Dad's holder Current Balance and Business Cash Held are both ฿22,690 and equal the sum of the two initialized account balances.
- Synced the current production OLAP app. Cash Account Summary displays both accounts as initialized with the exact opening, inflow and current balances above; Cash Holder Summary displays Dad at ฿22,690 with no reimbursement or advance due.

## Status

Complete and verified in production on 19 September 2026. No manual test remains.
