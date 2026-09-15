# Saved production AppSheet configuration

15 September 2026, OLTP **3.000094**, OLAP **1.100062**. Captured from the current Chrome editor and saved appdoc. Rollback versions **3.000080 / 1.100056**. Existing source bindings, financial permissions and manual view orders are preserved. Exact model properties are in `model-evidence.json` and the production dictionary.

## Operational commands

**Generate Today's Charge**: SET_COLUMN_VALUE on Loans, assigning only:

```appsheet
[Charge Generation Request] = CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|", UNIQUEID())
```

Existing visibility, eligibility and Generate All Today's Charges routing are retained.

**Wrapped Action - Close Loan**: COMPOSITE with only Receive All Remaining Charges, retaining confirmation/eligibility. The child adds Payments with Status `Processing`, Ref Borrower `[Ref Borrowers]`, Ref Target Loan `[Row ID]`, Payment Date `TODAY()`, Payment Method `Bank Transfer`, Allocation Method `Loan Close`, Created By `USEREMAIL()`, Created At `NOW()`. Submitted Amount Received:

```appsheet
[Outstanding Principal] + SUM(SELECT(Charges[Interest Remaining], [Ref Loans] = [_THISROW].[Row ID])) + [Accrued Interest]
```

The child condition is:

```appsheet
AND([Auto Charge Enabled], [Loan Type] = "ดอกเบี้ยรายวัน",
 [Loan Status] = "ยังไม่ปิดยอด", [Outstanding Principal] > 0,
 COUNT(SELECT(Payments[Row ID], AND([Ref Borrower] = [_THISROW].[Ref Borrowers],
 IN([Status], LIST("Processing", "Error"))))) = 0)
```

SQL derives the actual receipt amount from locked balances. Ref Target Charge Required_If and Amount Received Valid_If were updated exactly as recorded in `model-evidence.json`; other validations were preserved.

**Wrapped Action - Default Loan**: SET_COLUMN_VALUE on Loans, assigning Defaulted `TRUE`, Close Date `TODAY()`, Closed By `USEREMAIL()`, Loan Status `"ปิดยอดแล้ว"`. Existing eligibility, confirmation, prominence and bulk setting remain unchanged.

The following obsolete sub-actions have Only_If `FALSE` and hidden prominence:

| Table | Actions |
| --- | --- |
| Loans | Create Final Charge; Add Principal to Today's Charge; Default - Create Final Charge; Default - Create Repayment; Default - Delete Pending Charges; Default - Record Default; Default - Write Off Partial Charges |
| Charges | Add Outstanding Principal to Charge; Default - Delete Pending Charge; Default - Write Off Remaining Charge |
| Payments | Payment - Close Paid Loans; Payment - Process Receipt |

Existing Single Full/Partial, Receive All and Lump Sum entry commands are retained and now post through the unified SQL trigger.

## Bot enablement

Disabled: **Create First-Day Charge**, **Generate Daily Charges**, **Payments - Process Receipt**.

Enabled, notification-only: **Notification - New Loan Created**, **Notification - Loan Closed**, **Notification - Charge Received**, **Notification - First-Day Charge** (repurposed and renamed Auto Receive First-Day Charge). No enabled bot retains a financial data-action step.

Production OLAP retains **Refresh Daily Analytics Daily 2** enabled, its predecessor disabled and Daily Loan Analysis Export disabled. This release does not migrate analytics.

## Payment receipt and closure summary

Notification - Charge Received uses Payments Adds/Updates, event Payment Posted:

```appsheet
AND([Allocation Method] <> "First-day Auto",
 OR(ISBLANK([_THISROW_BEFORE].[Row ID]), [_THISROW_BEFORE].[Status] = "Error"),
 IN([Status], LIST("Processing", "Posted")))
```

The original receipt task's recipient, title/body and deep link remain unchanged. A new branch, **Notify payment-closed loans**, tests:

```appsheet
COUNT(SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID])) > 0
```

Its Yes task **Send closure summary** selects the existing partner audience:

```appsheet
SELECT(Partners[Email], AND(ISNOTBLANK([Email]), [Email] <> [_THISROW].[Created By]))
```

Title:

```text
ปิดเงินกู้แล้ว / Loans Closed (<<COUNT(SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID]))>>)
```

Body:

```text
ผู้กู้ Borrower: <<[Ref Borrower].[Borrower Name TE]>>
<<Start: SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID])>>สินเชื่อ Loan: <<[Row ID]>> เงินต้น Principal: <<[Principal Amount]>> ดอกเบี้ย Interest: <<[Total Interest Received]>>
<<End>>
```

Deep link: `LINKTOROW([Row ID], "Payments_Detail")`. This is one summary per originating payment.

## Loan closure/default notification

Notification - Loan Closed uses Loans Adds/Updates:

```appsheet
OR(
 AND(ISBLANK([_THISROW_BEFORE].[Row ID]),
 ISNOTBLANK(LOOKUP([Row ID], "Loans", "Row ID", "Ref Closing Payment"))),
 AND(ISNOTBLANK([_THISROW_BEFORE].[Row ID]),
 [_THISROW_BEFORE].[Loan Status] <> "ปิดยอดแล้ว",
 [_THISROW_AFTER].[Loan Status] = "ปิดยอดแล้ว",
 ISBLANK([Ref Closing Payment])))
```

Original recipient: `SELECT(Partners[Email], AND(ISNOTBLANK([Email]), [Email] <> [_THISROW].[Closed By]))`. Original deep link: `LINKTOROW([_THISROW].[Row ID], "Loans_Detail")`.

Title:

```text
<<IF(LOOKUP([Row ID], "Loans", "Row ID", "Defaulted"), "บันทึกหนี้สูญ / Loan Defaulted", "ปิดเงินกู้แล้ว / Loan Closed")>>
```

Body:

```text
ผู้กู้ Borrower: <<[Borrower Name TE]>>
<<IF(LOOKUP([Row ID], "Loans", "Row ID", "Defaulted"), CONCATENATE("เงินต้นขาดทุน / Principal loss: ", LOOKUP([Row ID], "Loans", "Row ID", "Default Loss Amount"), " | ไม่มีเงินสดรับ / No cash received"), CONCATENATE("เงินต้นคืน Principal: ", [Principal Amount], " | ดอกเบี้ยที่ได้รับ Interest: ", [Total Interest Received]))>>
```

## First-day receipt from new loan

Notification - New Loan Created retains its Loans Adds event and original new-loan notification. Added branch **First-day receipt exists**:

```appsheet
COUNT(SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto",
 [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID], [Status] = "Posted"))) > 0
```

Yes task **Notify first-day receipt** uses the existing Partners excluding Loans.Created By expression, title `ได้รับชำระเงิน / First-day Payment Received`, body:

```text
ผู้กู้ Borrower: <<[Borrower Name TE]>>
<<Start: SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto", [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID], [Status] = "Posted"))>>
จำนวนเงิน Amount: <<[Amount Received]>> ดอกเบี้ย Interest: <<SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID]))>> เงินต้น Principal: <<SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID]))>><<End>>
```

Deep link:

```appsheet
LINKTOROW(ANY(SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto",
 [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID], [Status] = "Posted"))), "Payments_Detail")
```

## First-day receipt from originating charge event

Notification - First-Day Charge uses Charges Adds, New Charge Created:

```appsheet
COUNT(SELECT(Payments[Row ID], AND([Ref Target Charge] = [_THISROW].[Row ID],
 [Allocation Method] = "First-day Auto", [Status] = "Posted"))) > 0
```

Its sole step **Notify first-day charge receipt** runs a notification task, replacing the old financial action. Recipient:

```appsheet
SELECT(Partners[Email], AND(ISNOTBLANK([Email]), [Email] <> [_THISROW].[Ref Loans].[Created By]))
```

Title: `ได้รับชำระเงิน / First-day Payment Received`. Tested development body, with production recipient adaptation only:

```text
ผู้กู้ Borrower: <<[Ref Loans].[Borrower Name TE]>> <<Start: SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto", [Ref Target Charge] = [_THISROW].[Row ID], [Status] = "Posted"))>>จำนวนเงิน Amount: <<[Amount Received]>> ดอกเบี้ย Interest: <<SUM(SELECT(Repayments[Interest Paid], [Ref Payment] = [_THISROW].[Row ID]))>> เงินต้น Principal: <<SUM(SELECT(Repayments[Principal Paid], [Ref Payment] = [_THISROW].[Row ID]))>> <<If: COUNT(SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID])) > 0>>ปิดเงินกู้แล้ว / Loan Closed: <<SELECT(Loans[Row ID], [Ref Closing Payment] = [_THISROW].[Row ID])>><<EndIf>><<End>>
```

Deep link:

```appsheet
LINKTOROW(ANY(SELECT(Payments[Row ID], AND([Allocation Method] = "First-day Auto",
 [Ref Target Charge] = [_THISROW].[Row ID], [Status] = "Posted"))), "Payments_Detail")
```

All edited templates were read back after saving; line breaks are actual newline characters. No test notification was sent in production. Development owner-only addresses were not copied into production.
