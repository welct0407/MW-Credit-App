# Dad cash-account initialization — 19 September 2026

## Scope and purpose

Initialized Dad's production TTB and SCB cash accounts using the owner's current balances and requested historical initiation dates. This was an operational data change only; no schema, app definition, automation or model object changed.

The verified target was production Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, Flyway `V24`, with PROD OLAP app `e74dd368-654f-44d7-bccf-83cf361d1cdb` used for the current-GUI readback.

## Reconciliation and changed records

Before initialization, Dad's holder balance was ฿21,780. Account-assigned inflows were ฿2,620 for TTB and ฿1,400 for SCB, while ten retained accountless historical ledger rows had a net value of ฿17,760: ฿15,870 dated 17 September and a net ฿1,890 dated 18 September.

The owner's initial current account balances totaled ฿22,690, requiring a documented ฿910 increase to Dad's holder ledger. The owner subsequently corrected SCB from ฿3,880 to ฿3,300. The initialization retained every historical accountless row unchanged and used its dated net amounts as the opening snapshots:

| Account | Initiation date | Opening snapshot | Initialization correction | Existing assigned inflows | Later correction outflow | Current balance |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Dad TTB | 2026-09-17 | ฿15,870 | ฿320 | ฿2,620 | ฿0 | ฿18,810 |
| Dad SCB | 2026-09-18 | ฿1,890 | ฿590 | ฿1,400 | ฿580 | ฿3,300 |

Created controlled manual-correction rows `dad-ttb-init-reconcile-20260917` and `dad-scb-init-reconcile-20260918`, each linked to its bank account and carrying an audit note. Created immutable account-cutover records with TTB dated one day before its first assigned receipt on 18 September and SCB dated one day before its first assigned receipt on 19 September.

After the SCB correction, Dad's account balances sum exactly to his holder cash on hand of ฿22,110. The ten earlier accountless rows remain intact; their net is represented by the dated opening snapshots instead of assigning individual historical receipts to banks without evidence.

### SCB correction refinement

The owner corrected Dad SCB's current balance from ฿3,880 to ฿3,300. Added account-specific manual-correction row `dad-scb-balance-correction-20260919`, dated 19 September 2026, as a ฿580 outflow from Dad SCB. The immutable opening snapshot and the earlier ฿590 initialization correction remain unchanged and auditable.

### Jame payment account refinement

The owner confirmed that Jame's ฿90 receipt dated 18 September 2026 belonged in Dad SCB. Payment `k9iBSTOeNfMQaEyEMZJM0u` was already posted to Dad but had no cash account, while Jame's separate 19 September ฿90 receipt was already correctly assigned to Dad SCB. Updated only the 18 September payment's receiving account and appended an audit note. The existing source trigger synchronized system cash-ledger row `cash:PAYMENT:k9iBSTOeNfMQaEyEMZJM0u` to Dad SCB. No repayment amount, allocation, payment date, holder or Dad total changed.

At readback after this refinement and other intervening production activity, Dad SCB was ฿3,840 and Dad's total cash position was ฿27,260. These are current readback values, separate from the earlier point-in-time initialization and SCB-correction balances above.

### Dad cash-in-hand initialization

Initialized existing active account `1094306f`, **Dad เงินสดในมือ**, with a ฿0 opening dated 18 September 2026, one day before its first transaction. The existing 19 September ฿5,000 Cash Handover from Dad TTB remains unchanged and now appears as the account's current-period inflow, producing a ฿5,000 current cash-in-hand balance.

The Jame ฿90 payment reclassification above had exposed a historical overlap: the payment was explicitly linked to SCB after its amount had already been incorporated into SCB's accountless opening snapshot. Reconciled SCB's protected cutover baseline from ฿0 to ฿90, with an appended audit note, so the payment remains assigned to SCB without being counted twice. The transaction temporarily paused only the cutover-protection trigger, restored it before commit and verified it active. No payment, repayment or cash-ledger row was changed by this initialization batch.

Final current balances at this readback are Dad TTB ฿18,510, Dad SCB ฿3,750 and Dad เงินสดในมือ ฿5,000, totaling Dad's holder balance of ฿27,260 exactly.

## Backup and rollback

Before the write, created the private production dump `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\dad-accounts-init-before-20260919.dump`, SHA-256 `BF6DE83E1155DC1D61F7CC0ACA1D5771079E1E46045BD24C0EB97C2A471199E9`. An isolated restore succeeded with normalized schema equivalence for `public`, `assessment_lab` and Flyway history. Cloud SQL instance settings and the cron extension remain outside this logical-backup scope.

Before the later SCB correction, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\dad-scb-correction-before-20260919.dump`, SHA-256 `1018B7A2851E0F863F8009177ED40283F4AE9F1F2901BA001CB9046816131056`, with the same logical-backup scope.

Before the Jame account refinement, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\jame-scb-reclass-before-20260919.dump`, SHA-256 `354FC1C932C3DE4A9A42DD7ED7C17107616B2668B8D46779896F452B7F2DF7B8`, with the same logical-backup scope.

Before the cash-in-hand initialization, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\dad-cash-in-hand-init-before-20260919.dump`, SHA-256 `05A8F3B1DA3B10CF79D7BDB1FBEB06FA5DF029D4E324DE902E25E5F564BAB2DF`, with the same logical-backup scope.

Account openings are immutable by design. Future balance differences should use documented account-specific compensating corrections. Changing the initialization metadata itself requires a separately authorized, coordinated database recovery; never restore the backup over later production activity without that recovery decision.

## Verification

- Rehearsed the full transaction and all assertions under rollback before committing the identical guarded transaction.
- Locked affected financial source, ledger, account and cutover tables during both phases.
- Verified the historical accountless ledger count, net amount and row fingerprint did not change.
- Verified TTB is initialized with opening ฿15,870, Cash In ฿2,940 and Current Balance ฿18,810.
- Rehearsed the later ฿580 SCB correction under rollback before committing it.
- Verified SCB is initialized with opening ฿1,890, Cash In ฿1,990, Cash Out ฿580 and Current Balance ฿3,300.
- Verified Dad's holder Current Balance and Business Cash Held are both ฿22,110 and equal the sum of the two initialized account balances.
- Synced the current production OLAP app. Cash Account Summary displays TTB ฿18,810 and SCB ฿3,300 as initialized; Cash Holder Summary displays Dad at ฿22,110 with no reimbursement or advance due. Cash Ledger Recent displays the dated ฿580 manual correction.
- Rehearsed the 18 September Jame payment account correction under a serializable transaction and rollback before repeating the guarded transaction and committing it.
- Verified the payment and its system cash-ledger row both reference Dad SCB, with the original ฿90 amount, 18 September payment date, posted status and Dad holder preserved.
- Synced the current production OLAP app after the refinement. Dad SCB displays opening ฿1,890, Cash In ฿2,530, Cash Out ฿580 and Current Balance ฿3,840; Dad's holder Current Balance remains ฿27,260 after intervening production activity.
- Rehearsed the cash-in-hand initialization and SCB overlap reconciliation under a serializable transaction and rollback before repeating the guarded transaction and committing it.
- Verified the cutover-protection trigger was active before commit, the existing ฿5,000 TTB-to-cash ledger row was unchanged and all three Dad accounts were initialized.
- Synced the current production OLAP app. Cash Account Summary displays Dad เงินสดในมือ with Opening ฿0, Cash In ฿5,000, Cash Out ฿0, Current Balance ฿5,000 and Initialized Y. It displays Dad TTB ฿18,510 and Dad SCB ฿3,750; Cash Holder Summary displays Dad ฿27,260 with no reimbursement or advance due.

## Status

Complete and verified in production on 19 September 2026. No manual test remains.
