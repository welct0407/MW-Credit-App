# Saved AppSheet configuration — V7

Current development OLTP and OLAP 1.000036. Rollback OLTP 1.000032, OLAP 1.000034. Fresh current editor/appdoc inspected before and after save. Production untouched.

## OLTP actions

`Wrapped Action - Close Loan` ordered actions now contain only `Receive All Remaining Charges`. Existing confirmation and visibility condition retained:

```appsheet
AND([Auto Charge Enabled],
 AND([Loan Type]="ดอกเบี้ยรายวัน",[Loan Status]="ยังไม่ปิดยอด",
 [Outstanding Principal]>0,
 COUNT(SELECT(Payments[Row ID],
 AND([Ref Borrower]=[_THISROW].[Ref Borrowers],
 IN([Status],LIST("Processing","Error")))))=0))
```

Confirmation: `ยืนยันปิดยอดเงินกู้และรับชำระเงินทั้งหมดหรือไม่? Close this loan and receive the final payment?`

`Receive All Remaining Charges` remains hidden, ADD_RECORD_TO Payments:

| Column | Assignment |
| --- | --- |
| Status | `"Processing"` |
| Ref Borrower | `[Ref Borrowers]` |
| Ref Target Loan | `[Row ID]` |
| Amount Received | `[Outstanding Principal] + SUM(SELECT(Charges[Interest Remaining], [Ref Loans] = [_THISROW].[Row ID])) + [Accrued Interest]` |
| Payment Date | `TODAY()` |
| Payment Method | `"Bank Transfer"` |
| Allocation Method | `"Loan Close"` |
| Created By | `USEREMAIL()` |
| Created At | `NOW()` |

Ref Target Loan replaces the old Ref Target Charge assignment. SQL derives Ref Target Charge and the authoritative amount before posting. Amount assignment is a current UI estimate.

Only if:

```appsheet
AND([Auto Charge Enabled], [Loan Type] = "ดอกเบี้ยรายวัน",
[Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0,
COUNT(SELECT(Payments[Row ID],
AND([Ref Borrower] = [_THISROW].[Ref Borrowers],
IN([Status], LIST("Processing", "Error"))))) = 0)
```

`Create Final Charge`, `Add Principal to Today's Charge`, and `Add Outstanding Principal to Charge` remain hidden with **Only if FALSE**. Old assignments remain for coordinated rollback. Dependency review found the Close wrapper called the first two and the second called the third. The distinct `Default - Create Final Charge` workflow is unchanged.

## OLTP validation

Payments.Ref Target Charge Required_If:

```appsheet
OR(IN([Allocation Method], LIST("Single Full", "Single Partial", "First-day Auto")),
AND([Allocation Method] = "Loan Close", ISBLANK([Ref Target Loan])))
```

Payments.Amount Received Valid_If:

```appsheet
OR(IN([Row ID], Payments[Row ID]),
AND([Allocation Method] = "Loan Close", ISNOTBLANK([Ref Target Loan]),
[Ref Target Loan].[Ref Borrowers] = [Ref Borrower],
[_THIS] > 0, [_THIS] = ROUND([_THIS])),
AND([_THIS] > 0, [_THIS] = ROUND([_THIS]), [_THIS] <= [Eligible Outstanding],
IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close")),
[_THIS] = [Eligible Outstanding], TRUE)))
```

Other method validation, Eligible Charges formula, Show_If and error wording retained. SQL fills the target charge before the existing posting/notification lookups use it.

## Shared references and downstream consumers

Payments.Ref Target Loan is nullable Ref Loans.Row ID, no default/app formula, Key/Label/IsPartOf false. OLTP Editable_If `FALSE` prevents user edits while permitting action assignment; static Read-Only is No. OLAP Read-Only Yes and financial-table READ_ONLY remain. Display name `="เงินกู้ที่ปิดยอด / Closing Loan"`.

Loans.Related Payments is generated read-only List Ref: `REF_ROWS("Payments", "Ref Target Loan")`. OLAP Reporting Loans automatically includes this VC; existing filter/actions/permissions unchanged. Inline View Ref (Ref Target Loan) generated in both. Manual form/detail orders retained. Payments.Row ID key/read-only/UNIQUEID() unchanged despite regeneration metadata differences described in REPORT.

Four owner-only notification bots are unchanged from [V6 configuration](../core-payment-20260915/appsheet-configuration.md). No additional notification approval is implied for other destinations. OLAP exports/schedules and nonessential development bots stay disabled.
