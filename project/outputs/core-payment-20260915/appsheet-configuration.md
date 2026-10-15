# Development AppSheet configuration — V6

Saved OLTP 1.000032 / OLAP 1.000033, verified current editor and app documentation. Before versions: OLTP 1.000025 / OLAP 1.000031. This configuration is development-only; production recipients must not be replaced by the development test recipient when preparing a later release.

## Shared model

- Loans.Ref Closing Payment: Ref to Payments.Row ID, read-only, non-key/non-label, IsPartOf false, blank initial/app formula, no Required_If. Display expression `="รายการรับชำระที่ปิดยอด / Closing Payment"`.
- Payments.Related Loans: generated read-only List of Ref; `REF_ROWS("Loans", "Ref Closing Payment")`; generated Ref navigation.
- OLAP Reporting Loans slice includes the new field. Existing filter, READ_ONLY permission, action list and manually ordered loan details/forms are preserved.
- Existing column settings/formulas compared before/after; removed OLTP metadata belongs to disabled generated automation state schemas, not business columns. Both apps use development database-3 and development companion links.

## Retired financial routes

Bots **Create First-Day Charge** and **Payments - Process Receipt** disabled. **Generate Daily Charges** remains disabled. Actions **Payment - Process Receipt** and **Payment - Close Paid Loans** are hidden with condition `FALSE`. Subordinate legacy hidden actions remain for recovery; they are no longer invoked by the retired bots. Current receive/full/partial/lump-sum/close actions continue to insert Payments commands that SQL posts. The daily Close Loan final-charge preparation group remains AppSheet-owned.

## Reviewed notification routes

Every task To expression is `LIST("welct0407@mw-credit.com")`. No email/webhook/export task or financial write step remains in these enabled processes. Original new-loan, receipt and standalone loan-closed notification templates/deep links were preserved except the routing changes and added tasks described here. Existing reusable notification processes have no external callers.

### Notification - Charge Received

Payments Adds + Updates, event name Payment Posted. Event condition:

```appsheet
AND([Allocation Method] <> "First-day Auto",
    OR(ISBLANK([_THISROW_BEFORE].[Row ID]),[_THISROW_BEFORE].[Status]="Error"),
    IN([Status],LIST("Processing","Posted")))
```

Original receipt task followed by **Notify payment-closed loans** branch:

```appsheet
COUNT(SELECT(Loans[Row ID],[Ref Closing Payment]=[_THISROW].[Row ID]))>0
```

Yes task **Send closure summary**, deep link `LINKTOROW([Row ID],"Payments_Detail")`:

```text
Title: ปิดเงินกู้แล้ว / Loans Closed (<<COUNT(SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID]))>>)
Body:
ผู้กู้ Borrower: <<[Ref Borrower].[Borrower Name TE]>>
<<Start: SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID])>>สินเชื่อ Loan: <<[Row ID]>> เงินต้น Principal: <<[Principal Amount]>> ดอกเบี้ย Interest: <<[Total Interest Received]>>
<<End>>
```

### Notification - New Loan Created

Loans Adds; original new-loan task retained. **First-day receipt exists** branch:

```appsheet
COUNT(SELECT(Payments[Row ID],
  AND([Allocation Method]="First-day Auto",
      [Ref Target Charge].[Ref Loans]=[_THISROW].[Row ID],
      [Status]="Posted")))>0
```

Yes task **Notify first-day receipt**, title `ได้รับชำระเงิน / First-day Payment Received`. Loans-context body:

```text
ผู้กู้ Borrower: <<[Borrower Name TE]>>
<<Start: SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto", [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID], [Status] = "Posted"))>>
จำนวนเงิน Amount: <<[Amount Received]>> ดอกเบี้ย Interest: <<SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID]))>> เงินต้น Principal: <<SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID]))>><<End>>
```

Deep link selects that loan's posted first-day payment with ANY/SELECT, then LINKTOROW to Payments_Detail. This originates from the AppSheet loan Add; SQL-created Charges and Payments do not independently trigger normal AppSheet data-change bots.

### Notification - Loan Closed

Loans Adds + Updates. Original owner-only standalone loan-closed task/body/deep link retained. Event condition:

```appsheet
OR(
  AND(ISBLANK([_THISROW_BEFORE].[Row ID]),
      ISNOTBLANK(LOOKUP([Row ID],"Loans","Row ID","Ref Closing Payment"))),
  AND(ISNOTBLANK([_THISROW_BEFORE].[Row ID]),
      [_THISROW_BEFORE].[Loan Status]<>"ปิดยอดแล้ว",
      [_THISROW_AFTER].[Loan Status]="ปิดยอดแล้ว",
      ISBLANK([Ref Closing Payment])))
```

Covers immediate first-day closure and non-payment app updates; ordinary payment closure uses the receipt summary.

### Notification - First-Day Charge

Repurposed **Auto Receive First-Day Charge**, Charges Adds / New Charge Created. Old financial action step removed. Condition:

```appsheet
COUNT(SELECT(Payments[Row ID],
  AND([Ref Target Charge]=[_THISROW].[Row ID],
      [Allocation Method]="First-day Auto",[Status]="Posted")))>0
```

Task **Notify first-day charge receipt** reads the matching posted first-day receipt and its repayment components, includes matching closed-loan information when present, and links to that Payments_Detail row. This covers manually added first-day charges. It was configuration-reviewed; separate GUI/device delivery for this path remains in the acceptance checklist. The SQL-generated first-day charge has no independent AppSheet event; the new-loan route covers it.

## Verification scope

User confirmed actual tested receipt pushes, the two-loan Receive All closure summary and first-day loan alerts/amounts. No exactly-once notification guarantee. AppSheet behavior reference: [data-change events](https://support.google.com/appsheet/answer/11445188?hl=en). See REPORT.md for all six GUI cases, preservation checks and rollback precautions.
