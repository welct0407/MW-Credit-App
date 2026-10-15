# Lisa Cash Account Initialization — 20 September 2026

## Scope and purpose

Initialized Lisa's existing production cash account `7d587fc5-483b-4bd8-9bd7-facf5baab2b3` against production Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, at Flyway V26. Starting repository commit: `eba6f4571fe86cbf3aa584c323e547933a8636fc`.

The account cutover is dated 17 September 2026, one day before its first account transaction. Its opening balance is ฿75,931, the verified Lisa holder balance before the 18 September activity. Existing 18 September receipts total ฿7,400 and loan disbursements total ฿4,500, producing the unchanged current balance of ฿78,831.

## Production changes

- Created the immutable account cutover for Lisa with Opening Balance ฿75,931, Baseline Cash In ฿0 and Baseline Cash Out ฿0.
- Retained the three already assigned 18 September receipts totaling ฿7,300.
- Assigned the existing ฿100 posted receipt `fd6:fd6:D3UV03cugnGXrNmwWdc9sh` to Lisa's account and appended an audit note. Its amount, payment date, holder, allocations and repayments were unchanged.
- Assigned the two existing 18 September loan disbursements `D3UV03cugnGXrNmwWdc9sh` and `QoRhfx242qUHQOgS7A47UT`, totaling ฿4,500, to Lisa's account. Their amounts, dates and borrower relationships were unchanged.
- The source triggers synchronized the corresponding system cash-ledger rows. Earlier accountless expenses and the owner-authorized historical opening row remain unchanged and are represented by the 17 September opening balance.

The posted-loan account guard was paused only inside the locked transaction for the two exact legacy rows, restored before commit and verified active. The cutover guard remained active and accepted the controlled initialization insert.

## Backup and rollback

Before the write, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\lisa-account-init-before-20260920.dump`, SHA-256 `C5E7C5651311472311EFED26F7A68F7FA142902B82061F6F810C1CF9C6FB840B`. The restore matched the normalized `public` and `assessment_lab` schema, including Flyway history; Cloud SQL cron extension and instance settings are outside the logical-backup scope.

The account opening is immutable. Any rollback requires a separately reviewed coordinated database recovery; never restore this backup over later production activity without reconciling subsequent writes.

## Verification

- Rehearsed the complete guarded change under a serializable transaction and rollback before repeating it and committing.
- Verified the account cutover date, three corrected source/account links, three synchronized system ledger links and active source/cutover guards.
- Verified SQL balances: Opening ฿75,931; Cash In ฿7,400; Cash Out ฿4,500; Current Balance ฿78,831.
- Verified Lisa's account current balance equals Lisa's holder Current Balance and Business Cash Held of ฿78,831, with reimbursement/advance due ฿0.
- Synced the current production OLAP app. Cash Account Summary displays Lisa with the exact balances above and Initialized Y; Cash Holder Summary displays Lisa at ฿78,831.

## Status

### Owner-authorized opening correction — 21 September 2026

Owner confirmed the omitted 280 personal profit withdrawal and explicitly authorized direct opening updates without adding an adjustment transaction. Completed historical settlements total 115,470: 84,510 (owner identifies 84,230 August profit plus 280 September profit) and 30,960. Both are pre-cash-tracking sources without settlement ledger rows. Net unsettled profit already deducts these settlements; the owner's explanation reconciles the 280 cash excess.

In production on shared instance appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_prod, reduced Lisa account cutover Opening Balance from 75,931 to 75,651 and matching historical holder opening `opening-lisa-20260918` from 78,540 to 78,260. Appended old/new values and reason to both audit notes. No new ledger row, settlement, income or expense was posted. Creation audit and keys were retained. Paused only the two relevant immutability guards inside the locked transaction and restored both before commit; independent readback confirmed enabled. No schema definition changed.

Fresh private backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/lisa-opening-280-before-20260921.dump`; SHA-256 `7FBB383C3CE292653D9A977345B9BBCFF179FE9586130F2EECA1A60F3A7EAD9F`. Existing restore runner successfully restored public/assessment_lab and compared normalized schema; instance/cron settings are excluded. Recovery requires coordinated reversal of both opening values; do not restore over later activity.

Rollback rehearsal and committed transaction verified Lisa holder/account balances 78,651, Dad 35,340, Tommy 0, total cash 113,991 equal to expected cash 113,991 (11,992 remaining capital plus 101,999 net unsettled profit). Gap is zero. Ledger row count and unrelated ledger fingerprints were unchanged. Independent post-commit SQL readback passed; app GUI sync was not performed for this data-only correction. Starting Git commit b61640eb344589be9b650eb65b29ca635acf18dd. No app/model configuration changed.

Complete and verified in production. This was an operational data correction and initialization; it changed no schema or AppSheet configuration.
