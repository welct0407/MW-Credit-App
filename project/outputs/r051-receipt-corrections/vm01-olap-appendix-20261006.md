# R051 DEV OLAP final browser report — 6 October 2026

## Authority and stopped state

This appendix preserves the browser worker's exact final configuration evidence. The owner stopped Dots at09:44:44 UTC; STOP reached this worker at09:45:13. No subsequent edit/save/test occurred. Its last action only inspected Cash Pool Contributions. The owner's updated DEV feature scope remains authorized for their personally started VM-01 continuation; this report itself grants no independent financial-test window, production or permission expansion.

App `MW-OLAP-DEV-20260919`, canonical `9f3422be-bc87-4a5a-a42a-67528ee80393`; verified AppSheet account `welct0407@mw-credit.com` at09:35:48. Dots tab48 was the dedicated OLAP tab. Existing branch/PR15 owns repository evidence; browser worker made no repository changes.

Editor route: `https://www.appsheet.com/template/AppDef?appName=MW-OLAP-DEV-20260919-578763613&appId=9f3422be-bc87-4a5a-a42a-67528ee80393&quickStart=False`.

- Restorable baseline **1.000053** at09:36:02, Deployed, Save/Undo disabled. Baseline preview loaded/synced and displayed Analytics at09:36:19.
- Settlement batch **1.000054**, save09:40:50–09:41:01; Save/Undo disabled by09:41:20. Preview URL showed `appVersion=1.000053&version=1.000054`.
- One later unsaved delta below; final observed Save enabled. Do not silently discard/save it; reconcile with latest policy first.
- No financial form Save/Delete, fixture/source mutation, database submission, schema/binding/grant change, deployment toggle or production action. No independent DB fingerprint read.

## Verification boundary

A distinct full runtime sync after54 was **not observed**. Preview staying on Analytics with54 in its URL is not workflow acceptance. A09:43:57 screenshot showed a green editor indicator, but the explicit issue panel was not read; do not claim a fresh explicit “No issues found”. Expression Assistant accepted expressions and the editor save completed; no explicit expression test was run. Form validation, guidance visibility, mirror navigation, inline/bulk routes, another-session readback and financial-save preservation remain unverified.

## Saved54: Settlements.Amount ValidIf

Before:
```appsheet
AND([_THIS] > 0, OR(AND([_THIS] = LOOKUP([Row ID], "Settlements", "Row ID", "Amount"), [Ref Partner] = LOOKUP([Row ID], "Settlements", "Row ID", "Ref Partner")), [_THIS] <= [Ref Partner].[Net Profit Earned] - SUM(SELECT(Settlements[Amount], AND([Ref Partner] = [_THISROW].[Ref Partner], [Row ID] <> [_THISROW].[Row ID])))))
```
After:
```appsheet
AND([_THIS] > 0, OR(AND(IN([Row ID], Settlements[Row ID]), LOOKUP([Row ID], "Settlements", "Row ID", "Status") <> "Cancelled", [_THIS] = LOOKUP([Row ID], "Settlements", "Row ID", "Amount"), [Ref Partner] = LOOKUP([Row ID], "Settlements", "Row ID", "Ref Partner")), [_THIS] <= [Ref Partner].[Net Profit Earned] - SUM(SELECT(Settlements[Amount], AND([Ref Partner] = [_THISROW].[Ref Partner], [Row ID] <> [_THISROW].[Row ID], [Status] <> "Cancelled")))))
```
Current row excluded once, with no extra reservation add-back. Persisted non-Cancelled same amount/partner exception retained; reinstated Cancelled rows cannot use it. Positive constraint retained. Parent/source contract reports the existing table filter excludes Cancelled; this worker did not reread it and does not claim a newly fixed cancellation bug.

Amount Invalid value error: before blank; after:
```appsheet
"ยอดจ่ายต้องมากกว่า 0 และไม่เกินกำไรที่ยังจ่ายได้ กรุณาซิงค์เพื่อตรวจยอดล่าสุด / The settlement must be positive and within the available profit. Sync to check the latest amount."
```
Amount RequiredIf unchanged.

## Saved54: Ref Paid From Cash Account

ValidIf before:
```appsheet
SELECT(Cash Accounts[Row ID], OR(AND([Active], [Ref Cash Holder] = "ch:lisa"), [Row ID] = [_THISROW].[Ref Paid From Cash Account]))
```
ValidIf after:
```appsheet
SELECT(Cash Accounts[Row ID], AND([Ref Cash Holder] = "ch:lisa", OR([Active], AND(IN([_THISROW].[Row ID], Settlements[Row ID]), [Row ID] = LOOKUP([_THISROW].[Row ID], "Settlements", "Row ID", "Ref Paid From Cash Account"), OR([_THISROW].[Status] <> "Completed", LOOKUP([_THISROW].[Row ID], "Settlements", "Row ID", "Status") = "Completed")))))
```
Uses persisted account rather than proposed self-value. All candidates Lisa-owned. Unchanged inactive saved account retained while not entering Completed; unchanged historical Completed accounts retained. Entering Completed requires active account. Reconcile with V60 guard_source_cash_account if policy changes.

RequiredIf before:
```appsheet
AND([Status] = "Completed", OR(NOT(IN([Row ID], Settlements[Row ID])), LOOKUP([Row ID], "Settlements", "Row ID", "Status") <> "Completed"))
```
RequiredIf after:
```appsheet
AND([Status] = "Completed", OR(NOT(IN([Row ID], Settlements[Row ID])), LOOKUP([Row ID], "Settlements", "Row ID", "Status") <> "Completed", [_THIS] <> LOOKUP([Row ID], "Settlements", "Row ID", "Ref Paid From Cash Account")))
```
Unchanged historical Completed blank-account metadata remains allowed. Entering Completed or changing/clearing a Completed account requires an account.

EditableIf retained:
```appsheet
OR(NOT(IN([Row ID], Settlements[Row ID])), IN([Status], LIST("Pending", "Completed")))
```
Initial Value retained:
```appsheet
ANY(SELECT(Cash Accounts[Row ID], AND([Active], [Default Account], [Ref Cash Holder] = "ch:lisa")))
```
Invalid value error: before blank; after:
```appsheet
"เลือกบัญชี Lisa ที่เปิดใช้งานก่อนยืนยันโอน / Select an active Lisa account before completing the transfer."
```

## Saved54: Complete Transfer action

Only if before:
```appsheet
[Status] = "Pending"
```
Only if after:
```appsheet
AND([Status] = "Pending", OR(AND(ISNOTBLANK([Ref Paid From Cash Account]), [Ref Paid From Cash Account].[Active], [Ref Paid From Cash Account].[Ref Cash Holder] = "ch:lisa"), COUNT(SELECT(Cash Accounts[Row ID], AND([Active], [Default Account], [Ref Cash Holder] = "ch:lisa"))) > 0))
```
Outputs retained:
```appsheet
Status = "Completed"
Transfer Date = TODAY()
Ref Paid From Cash Account = IF(AND(ISNOTBLANK([Ref Paid From Cash Account]), [Ref Paid From Cash Account].[Active], [Ref Paid From Cash Account].[Ref Cash Holder] = "ch:lisa"), [Ref Paid From Cash Account], ANY(SELECT(Cash Accounts[Row ID], AND([Active], [Default Account], [Ref Cash Holder] = "ch:lisa"))))
```
Needs confirmation remains TRUE; confirmation retained:
```appsheet
"ยืนยันว่าได้โอนเงินเรียบร้อยแล้วหรือไม่? Confirm that the transfer has been completed?"
```
Active-default fallback preserved. Gate prevents display if neither selected nor default eligible account exists. No new amount-reservation action check.

## Saved54: Settlement Guidance

New app-only virtual Show/Text column `Settlement Guidance`; App formula `""`; Show TRUE(default). No DB column/source. Content:
```appsheet
CONCATENATE("กำไรที่ยังจ่ายได้ (ซิงค์ล่าสุด) / Available profit (last sync): ", [Ref Partner].[Net Profit Earned] - SUM(SELECT(Settlements[Amount], AND([Ref Partner] = [_THISROW].[Ref Partner], [Row ID] <> [_THISROW].[Row ID], [Status] <> "Cancelled"))), ". ยอดจ่ายใหม่หรือยอดที่แก้ไขต้องเป็นบวกและไม่เกินกำไรที่ยังจ่ายได้ / New or changed amounts must be positive and within available profit. การยืนยันโอนต้องใช้บัญชี Lisa ที่เปิดใช้งาน กรุณาแก้ไข บันทึก และซิงค์ก่อน / Entering Completed requires an active Lisa account. Edit, save and sync first. ใช้ Reverse/Cancel เพื่อเปลี่ยนสถานะ / Use Reverse/Cancel for status transitions.")
```
Visibility in actual detail/form not tested; column orders/slices may need inclusion. The initial temporary static App formula was replaced by `""` before54 save; only the final configuration above is intended.

## Exactly one unsaved delta

Cash Ledger.Ref Business Expense Invalid value error: before blank; pending value:
```appsheet
"หากระบุค่าใช้จ่าย ให้เลือกค่าใช้จ่ายของ Tommy ที่มียอดมากกว่า 0 หรือเว้นว่างเมื่อไม่เชื่อมรายการ / If linking an expense, choose a positive Tommy-paid expense, or leave the link blank."
```
Accepted during permitted same-call retry09:43:09–09:43:30; dialog closed, then grid scroll failed technically. Save remained enabled; no later save. Link optionality/cap unchanged. Reconcile this message with09:43:27 owner policy before saving.

Existing properties read, unchanged:
```appsheet
ValidIf = IF([Entry Origin] = "System", LIST([_THIS]), SELECT(Business Expenses[Row ID], AND([Amount] > 0, [Ref Paid By Cash Holder] = "ch:tommy")))
Required = FALSE
ShowIf = OR([Entry Origin] = "System", [Movement Type] = "Expense Reimbursement")
EditableIf = AND([Entry Origin] = "Manual", OR(NOT(IN([Row ID], Cash Ledger[Row ID])), IN([Movement Type], LIST("Cash Handover", "Expense Reimbursement"))))
```

## Exact approval / technical failures

At09:42:41 a configuration-only call adding that message, closing dialog and scrolling was denied: **`JavaScript execution did not receive approval`**. Parent supplied exact transcript evidence; one permitted same-call retry passed approval, with no alternate route. The subsequent scroll failed: **`Accessibility element 177 is covered by INPUT or otherwise not hittable`**. No other approval retry.

A prior RequiredIf attempt hit a read-only grid field because a regex selected the first match: **`Cannot focus a read-only element`**. Fresh dialog inspection found the proper field, edited before54. This was a technical focus failure, not a denial or data write.

## Other groups unchanged

Existing From-account ValidIf was read:
```appsheet
SELECT(Cash Accounts[Row ID], OR(AND([Active], [Ref Cash Holder] = [_THISROW].[Ref From Cash Holder]), AND(IN([_THISROW].[Row ID], Cash Ledger[Row ID]), [Row ID] = [_THISROW].[Ref From Cash Account])))
```
Its edit exception uses proposed self-value and may admit a newly selected incompatible account. Review persisted-account exception and holder/movement rules. To-account ValidIf was not opened; similar behavior is suspected only. Neither changed.

Existing RequiredIf, unchanged:
```appsheet
From Account RequiredIf = AND(NOT(IN([Row ID], Cash Ledger[Row ID])), ISNOTBLANK([Ref From Cash Holder]))
To Account RequiredIf = AND(NOT(IN([Row ID], Cash Ledger[Row ID])), ISNOTBLANK([Ref To Cash Holder]))
```
CONTRIBUTION: grid inspection only; Amount ValidIf not opened. Existing withdrawal-at-date validator stays; no unsupported later-transaction lock. CASH_ACCOUNT: no columns/actions inspected or changed. READONLY_MIRRORS: no changes or navigation tests; Payment/Expense exact DEV navigation pending, prior Loan/Charge passes remain dated.

## Continuation checks

Use main handover and owner's updated authority. Verify current saved state/unsaved text, correct Chrome work account and canonical DEV ID. Reconcile concurrent work before saving. Check explicit diagnostics, guidance inclusion/visibility, amount reservation/Cancelled/current-row cases, historical Completed blank-account metadata, Complete Transfer selected/default/neither-account cases and retained confirmation. Financial clicks require the coordinated data window and containment/recovery.

Review the one unsaved reimbursement message against the relaxed policy; no rejected flag/view plan should be implemented. Then finish account/movement, contribution, cash-account and mirror guidance; preserve permitted behavior. Full final-version sync, detail/form/inline/bulk entry points and exact mirror links remain required. For later financial tests record exact IDs/source-child-cash preservation and reconcile unknown outcomes before retry; no shared restore for cleanup. Publish exact deltas/evidence on the existing branch/PR15, keeping R051 incomplete while gaps remain.
