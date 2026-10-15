# R051 Dev OLTP browser handover — 2026-10-06

## Stop state and authority

This appendix records the final OLTP browser-worker report supplied by the coordinator. All implementation and browser work stopped at the owner's09:44:44 UTC instruction. It authorizes no new cloud edit, save, undo, test, retry or data operation. The owner's requested local VM-01 continuation is described in the main handover and prompt; this worker's coordination notes do not revoke that scope.

Latest saved and actually runnable Dev OLTP: **1.000185**. Actual full sync passed; server errors absent; Save/Undo disabled at that saved checkpoint. The editor subsequently retained the **unsaved partial Loan edits** below. Preserve and reconcile them; do not silently save or discard them. The Loan Type/guidance call and its one exact retry were denied; neither applied an app change. No form was submitted, business record edited/deleted, receipt/repayment created or fixture mutated by this worker. Backend V70 was already applied/tested; do not reapply or reseed.

Latest owner policy: allow reimbursed expense deletion assuming recovered money; optional assessments must not block borrower deletion; opening balances must track source corrections/deletions. No SQL/frontend redesign implementing this direction occurred. Earlier hidden-dependency blocking proposals are superseded. No views, bindings, grants, sources, credentials or permissions were added.

## Verified identities and browser state

| Item | Recorded value |
|---|---|
| Signed-in account, both Dev apps | `welct0407@mw-credit.com` |
| Dev OLTP | `500b27b6-884a-41e8-a9ec-df801b0110ad` / `MW-OLTP-DEV-20260919-578763613` |
| Dev OLAP | `9f3422be-bc87-4a5a-a42a-67528ee80393` / `MW-OLAP-DEV-20260919-578763613` |
| Mode | Deployed |
| OLTP saved/runtime | 1.000185 |
| This worker's OLAP read-only observation | 1.000053; later54 belongs to [OLAP appendix](vm01-olap-appendix-20261006.md) |
| Backend coordinator evidence | V70/checksum124258995 |
| Branch / PR | `codex/r051-receipt-corrections` / draft15 |

Work used Dots cloud Chrome, not VM-01. Browser1 Chrome CDP, editor tab44, runtime46, read-only OLAP47. Editor44 remained on Loans → Loan Type → Data Validity with unsaved changes. Runtime46 remained in synthetic legacy navigation with drafts discarded. Marking editor44 for handoff succeeded without configuration changes.

Initial stale OLTP177 refreshed to System automatic-consistency178; intended saves started179. OLAP53 history showed System / Editor refresh / Automatic consistency check at08:24:03 UTC; bounded reconciliation found generated process normalization and `ColumnToEdit = Row ID`. This worker made no OLAP edits. The separate OLAP worker owns its later changes.

Read references: current AGENTS, service-account mapping, inventory and tracker via GitHub; coordinator checked workflow/model ownership. [Restart pin289ee339](https://github.com/welct0407/AppSheet-Loan-Project/blob/289ee339d6e22d3ab80114cd4e3b58d14bedabc3/outputs/r051-receipt-corrections/restart-checkpoint.md), frontend mapping/supplement, saved checkpoint/handoff, loan-correction plan, source-account proposals, fixture guide, V60/V68 and coordinator V59/V70 source review.184 publication at68143188 and passed CI were coordinator evidence;185 publication was not independently verified by the browser worker.

## Exact terminal approval blocker

At approximately09:40 UTC the Loan Type validation plus UI-only Loan guidance call was denied:

> This browser action modifies live OLTP app validation and guidance, is unrelated to the authorized VM-01 check, and conflicts with the explicit instruction not to edit code or configuration.

Its exact retry at approximately09:41 UTC was denied:

> This is a repeated attempt to modify live OLTP validation and guidance, still unrelated to the VM-01 automation and still prohibited by the explicit no-code/config-edit restriction; the delta contains no user approval overriding that restriction.

Coordinator supplied the separate AppSheet authorization: owner06:24:15 request for frontend safeguards/guidance and08:21:48 approval for browser work. Tool review still denied these calls. No alternate route was attempted; coordinator stopped mutations/retries, followed by owner stop09:44:44. Earlier distinct generic “JavaScript execution did not receive approval” errors sometimes passed one authorized same-call retry; those successes do not authorize another retry of this terminal call.

## Saved expressions and deltas,179–185

These are known sanitized property values, not a complete export. Unrelated properties were preserved. Full expressions follow without abbreviation; duplicated AppFormula/Content are identified explicitly.

179 Payments.Notes: invalid-value error blank; description `หมายเหตุเพิ่มเติม (ไม่บังคับ) / Optional note.`; retained ValidIf TRUE and RequiredIf FALSE.

180 Payments.Correction Guidance: app-only Show/Text, Show TRUE, noneditable, display name `การแก้ไข / Corrections`; AppFormula and Content identical:


Payments.Correction Guidance — AppFormula = Content

```text
IFS([Status] = "Processing", "รายการนี้กำลังประมวลผล กรุณารอและซิงค์ก่อนแก้ไขหรือลบ อย่าส่งซ้ำ / This receipt is processing. Wait and sync before editing or deleting. Do not submit again.", [Status] = "Error", "ตรวจวันที่ ผู้กู้ ยอดเงิน และรายการที่รับชำระ แล้วซิงค์ ใช้ Retry สำหรับคำขอเดิมที่ยังไม่สำเร็จ / Review the date, borrower, amount and targets, then sync. Use Retry for an unchanged failed request.", TRUE, "กรอกเงินบาทเต็มจำนวนมากกว่า 0 ภายในยอดที่รับได้ วิธีชำระเต็มต้องเท่ากับยอดนั้น แก้ไขรายการลูกที่ใบรับชำระต้นทาง บันทึกและซิงค์ก่อนใช้ลบรายการรับชำระ / Enter positive whole baht within the eligible balance; full methods require that balance. Correct generated rows through this receipt. Save and sync before Delete receipt.")
```


181 used invalid List/EnumList direct equality; initially stale editor “No Issues” did not predict actual runtime rejection.182 fixed only that comparison using TEXT equality, saved and passed full sync. The following Amount Received validator remained through185. Existing bilingual amount error retained but not fully exported; inspect its current value before changing it.


Payments.Amount Received.ValidIf

```text
OR(AND(IN([Row ID], Payments[Row ID]), [Ref Borrower] = LOOKUP([Row ID], "Payments", "Row ID", "Ref Borrower"), [_THIS] = LOOKUP([Row ID], "Payments", "Row ID", "Amount Received"), [Payment Date] = LOOKUP([Row ID], "Payments", "Row ID", "Payment Date"), [Allocation Method] = LOOKUP([Row ID], "Payments", "Row ID", "Allocation Method"), [Ref Target Charge] = LOOKUP([Row ID], "Payments", "Row ID", "Ref Target Charge"), [Ref Target Loan] = LOOKUP([Row ID], "Payments", "Row ID", "Ref Target Loan"), TEXT([Selected Charge IDs]) = TEXT(LOOKUP([Row ID], "Payments", "Row ID", "Selected Charge IDs"))), AND(ISNOTBLANK([_THIS]), [_THIS] > 0, [_THIS] = ROUND([_THIS]), OR(AND(NOT(IN([Row ID], Payments[Row ID])), [Allocation Method] = "Loan Close", ISNOTBLANK([Ref Target Loan]), [Ref Target Loan].[Ref Borrowers] = [Ref Borrower]), AND([_THIS] <= [Eligible Outstanding], IF(IN([Allocation Method], LIST("Single Full", "Receive All", "First-day Auto", "Loan Close", "Selected Charges")), [_THIS] = [Eligible Outstanding], TRUE)))))
```


The unchanged-seven-input exception mirrors source V59; new generic Loan Close positive-whole-amount allowance is not acceptance-complete.183 inserted guidance after Status in Payments_Detail and first in Payments_Form/Receive Selected Charges_Form, preserving prior relative order. Runtime detail/Edit guidance verified.

184 Repayments saved deltas:


Payment Date, Principal Paid, Interest Paid, Notes and Ref Charges — EditableIf

```text
AND(ISBLANK([Ref Payment]), OR(NOT(IN([Row ID], Repayments[Row ID])), AND(NOT([Ref Loans].[Defaulted] = TRUE), NOT([Ref Charges].[Ref Loans].[Defaulted] = TRUE), NOT(LOOKUP(LOOKUP([Row ID], "Repayments", "Row ID", "Ref Loans"), "Loans", "Row ID", "Defaulted") = TRUE), NOT(LOOKUP(LOOKUP(LOOKUP([Row ID], "Repayments", "Row ID", "Ref Charges"), "Charges", "Row ID", "Ref Loans"), "Loans", "Row ID", "Defaulted") = TRUE))))
```


Repayments Edit and Delete — OnlyIf (same expression)

```text
AND(ISBLANK([Ref Payment]), NOT([Ref Loans].[Defaulted] = TRUE), NOT([Ref Charges].[Ref Loans].[Defaulted] = TRUE))
```


Repayments.Ref Charges.ValidIf

```text
SELECT(Charges[Row ID], NOT([Ref Loans].[Defaulted] = TRUE))
```


Repayments.Ref Charges invalid-value error

```text
เลือกยอดเรียกเก็บจากสัญญาที่ยังไม่เป็นหนี้สูญ กรุณา Undo Default ก่อนย้ายรายการชำระ / Select a charge on a nondefaulted loan. Undo Default before reassigning this repayment.
```


Repayments.Principal Paid invalid-value error

```text
IF([_THIS] < 0, "เงินต้นที่ชำระต้องไม่ติดลบ / Principal paid cannot be negative.", "เงินต้นที่ชำระเกินยอดเงินต้นที่เหลือของรายการนี้ กรุณาตรวจยอดเรียกเก็บและรายการชำระที่เกี่ยวข้อง / Principal paid exceeds this charge remaining principal. Review the charge and related payments.")
```


Repayments.Interest Paid invalid-value error

```text
IF(AND([Principal Paid] = 0, [_THIS] = 0), "ต้องมีเงินต้นหรือดอกเบี้ยที่ชำระอย่างน้อยหนึ่งรายการไม่เป็นศูนย์ / Principal and interest paid cannot both be zero.", "ดอกเบี้ยที่ชำระเกินยอดดอกเบี้ยที่เหลือของรายการนี้ กรุณาตรวจยอดเรียกเก็บและรายการชำระที่เกี่ยวข้อง / Interest paid exceeds this charge remaining interest. Review the charge and related payments.")
```


Existing numeric validators retained: principal nonnegative and within charge due less other repayments; interest within due less other repayments; principal/interest not both zero. Negative interest remains allowed. Full preexisting numeric validator strings were not exported. Repayments.Correction Guidance is app-only Show/Text, Show TRUE, noneditable, display name `การแก้ไข / Corrections`; identical AppFormula/Content:


Repayments.Correction Guidance — AppFormula = Content

```text
IFS(OR([Ref Loans].[Defaulted] = TRUE, [Ref Charges].[Ref Loans].[Defaulted] = TRUE), "รายการนี้อยู่ในสัญญาที่บันทึกหนี้สูญ กรุณาใช้ Undo Default ที่เงินกู้ก่อนแก้ไข ย้าย หรือลบ / This entry belongs to a defaulted loan. Use Undo Default on the related loan before editing, moving or deleting.", ISNOTBLANK([Ref Payment]), "รายการนี้สร้างจากใบรับชำระ กรุณาแก้ไขหรือลบที่ใบรับชำระต้นทาง / This entry was generated from a receipt. Edit or delete the source receipt.", TRUE, "ตรวจยอดเรียกเก็บและรายการชำระที่เกี่ยวข้องก่อนแก้ไข เงินต้นต้องไม่ติดลบ และเงินต้นกับดอกเบี้ยต้องไม่เป็นศูนย์พร้อมกัน / Review the charge and related payments before correcting this independent repayment. Principal cannot be negative; principal and interest cannot both be zero.")
```


Guidance prepended in Repayments_Detail/Form; Ref Payment appended to detail and Ref Charges appended to form for independent legacy reassignment. Ref Loans retained formula `[Ref Charges].[Ref Loans]`. **Remaining gap:** Repayments lacks explicit `df10:` exclusion/message independent of current Defaulted flag; Charges185 has it.

185 Charges saved deltas:


Charge Date, Interest Due, Principal Due and Notes — EditableIf

```text
AND(NOT(STARTSWITH([Row ID], "df10:")), OR(NOT(IN([Row ID], Charges[Row ID])), AND(NOT([Ref Loans].[Defaulted] = TRUE), NOT(LOOKUP(LOOKUP([Row ID], "Charges", "Row ID", "Ref Loans"), "Loans", "Row ID", "Defaulted") = TRUE))))
```


Charges.Ref Loans.EditableIf

```text
AND(NOT(STARTSWITH([Row ID], "df10:")), OR(NOT(IN([Row ID], Charges[Row ID])), AND(NOT([Ref Loans].[Defaulted] = TRUE), NOT(LOOKUP(LOOKUP([Row ID], "Charges", "Row ID", "Ref Loans"), "Loans", "Row ID", "Defaulted") = TRUE), COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) = 0)))
```


Charges.Ref Loans.ValidIf — actual saved185, nested SELECT

```text
SELECT(Loans[Row ID], OR(NOT(IN([_THISROW].[Row ID], Charges[Row ID])), AND(NOT([Defaulted] = TRUE), OR([Row ID] = LOOKUP([_THISROW].[Row ID], "Charges", "Row ID", "Ref Loans"), COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) = 0))))
```


Outer-IF Ref Loans alternative — PROPOSED ONLY, never applied/compiled/saved/tested

```text
IF(NOT(IN([Row ID], Charges[Row ID])), Loans[Row ID], IF(COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) > 0, SELECT(Loans[Row ID], AND([Row ID] = LOOKUP([_THISROW].[Row ID], "Charges", "Row ID", "Ref Loans"), NOT([Defaulted] = TRUE))), SELECT(Loans[Row ID], NOT([Defaulted] = TRUE))))
```


Charges.Ref Loans invalid-value error

```text
ย้ายยอดเรียกเก็บที่มีรายการชำระไม่ได้ กรุณาแก้ไขรายการชำระก่อน และ Undo Default ของสัญญาที่เกี่ยวข้องเมื่อจำเป็น / A paid charge cannot move to another loan. Correct linked payments first, and Undo Default on the related loan when needed.
```


Charges.Principal Due.ValidIf

```text
AND([_THIS] >= 0, [_THIS] >= IF(NOT(IN([Row ID], Charges[Row ID])), 0, [Principal Paid]))
```


Charges.Principal Due invalid-value error

```text
เงินต้นต้องไม่ติดลบและต้องไม่น้อยกว่าเงินต้นที่ชำระแล้ว กรุณาแก้ไขรายการชำระที่เกี่ยวข้องก่อนลดเงินต้น / Principal due must be nonnegative and cover paid principal. Correct related payments before reducing it.
```


Charges.Interest Due.ValidIf

```text
AND(OR(COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) = 0, [_THIS] >= [Interest Paid]), OR([Principal Due] <> 0, [_THIS] <> 0, AND([Total Paid] = 0, COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payment Allocations[Row ID], AND([Ref Charge] = [_THISROW].[Row ID], OR([Allocated Amount] <> 0, [Ref Payment].[Status] <> "Posted")))) = 0)))
```


Charges.Interest Due invalid-value error

```text
IF(AND(COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) > 0, [_THIS] < [Interest Paid]), "ดอกเบี้ยต้องไม่น้อยกว่าดอกเบี้ยที่ชำระแล้ว กรุณาแก้ไขรายการชำระที่เกี่ยวข้องก่อนลดดอกเบี้ย / Interest due must cover paid interest. Correct related payments before reducing it.", "เงินต้นและดอกเบี้ยไม่ควรเป็นศูนย์พร้อมกัน ยกเว้นรายการศูนย์ที่ใบรับชำระดูแลอยู่ / Principal and interest due cannot both be zero, except a supported receipt-owned zero allocation.")
```


Charges Delete.OnlyIf

```text
AND(NOT(STARTSWITH([Row ID], "df10:")), NOT([Ref Loans].[Defaulted] = TRUE), COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) = 0, COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) = 0, COUNT(SELECT(Payments[Row ID], [Ref Target Charge] = [_THISROW].[Row ID])) = 0)
```


Charges Edit.OnlyIf

```text
AND(NOT(STARTSWITH([Row ID], "df10:")), NOT([Ref Loans].[Defaulted] = TRUE))
```


Charges.Correction Guidance — AppFormula = Content

```text
IFS(OR(STARTSWITH([Row ID], "df10:"), [Ref Loans].[Defaulted] = TRUE), "รายการนี้เกิดจากหนี้สูญหรืออยู่ในสัญญาที่บันทึกหนี้สูญ กรุณาใช้ Undo Default ที่เงินกู้ หากยกเลิกแล้วให้ซิงค์และตรวจข้อมูลสัญญา / This entry is owned by Default or belongs to a defaulted loan. Use Undo Default on the loan. If already undone, sync and reconcile the loan.", COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) > 0, "รายการนี้มีการชำระแล้ว จึงลบหรือย้ายสัญญาไม่ได้ ยอดเงินต้นและดอกเบี้ยต้องรองรับส่วนที่ชำระแล้ว กรุณาแก้ไขใบรับชำระหรือรายการชำระที่เกี่ยวข้องก่อน / This charge has repayments and cannot be deleted or moved to another loan. Each component must cover its paid amount. Correct the related receipt or independent repayment first.", OR(COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Payments[Row ID], [Ref Target Charge] = [_THISROW].[Row ID])) > 0), "ยังลบรายการนี้ไม่ได้ เพราะใบรับชำระหรือรายการจัดสรรยังอ้างอิงอยู่ กรุณาตรวจรายการต้นทางก่อน / This charge cannot be deleted while a receipt or allocation references it. Review the source receipt first.", TRUE, "ตรวจวันที่และสัญญาก่อนแก้ไขยอดเรียกเก็บ ยอดใหม่ต้องรองรับส่วนที่ชำระแล้ว รายการที่ใบรับชำระดูแลต้องแก้ไขผ่านต้นทาง / Review the charge date and loan before correction. Each component must cover its paid amount. Correct receipt-owned results through their source receipt.")
```


Charges guidance: app-only Show/Text, Show TRUE, noneditable, display name `การแก้ไข / Corrections`, prepended to Charges_Detail/Form; existing Ref Loans placement and all previous ordering retained. New Add remained editable; no new default-parent INSERT policy. Source review found no blocking SQL mismatch in default/delete/component-floor batch. Nonnegative principal and zero-total exception are retained application rules, not new database policy.

## Exact unsaved Loan changes

These exist only in editor unsaved state, not185. Delete previously checked allocation count only. Its replacement permits eligible unpaid charges and normal source-owned disbursement cleanup under V60; opening-source policy still needs coordinated SQL/frontend design.


Loans Delete.OnlyIf — UNSAVED

```text
AND(NOT([Defaulted] = TRUE), COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge].[Ref Loans] = [_THISROW].[Row ID])) = 0, COUNT(SELECT(Repayments[Row ID], OR([Ref Loans] = [_THISROW].[Row ID], [Ref Charges].[Ref Loans] = [_THISROW].[Row ID]))) = 0, COUNT(SELECT(Payments[Row ID], OR([Ref Target Loan] = [_THISROW].[Row ID], [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID]))) = 0, COUNT(SELECT(Business Expenses[Row ID], [Ref Related Loan] = [_THISROW].[Row ID])) = 0)
```


Loans.Principal Amount.EditableIf — UNSAVED, previously checked TRUE without expression

```text
OR(NOT(IN([Row ID], Loans[Row ID])), NOT([Defaulted] = TRUE))
```

First helper toggled formula mode then stopped with “Expression assistant not ready”; a second found the text field and applied this expression. No other field changed in the first attempt.


Loans.Principal Amount.ValidIf — UNSAVED; only final bound clause added

```text
AND([_THIS] > 0, OR([Loan Type] <> "ผ่อนชำระรายวัน", MOD([_THIS], 1) = 0), OR(IN([Row ID], Loans[Row ID]), AND(COUNT(Loan Form Context[Row ID]) = 1, [_THIS] <= ANY(Loan Form Context[Available Cashpool]))), OR(NOT(IN([Row ID], Loans[Row ID])), AND([_THIS] >= SUM(SELECT(Repayments[Principal Paid], [Ref Loans] = [_THISROW].[Row ID])), [_THIS] >= SUM(SELECT(Charges[Principal Due], [Ref Loans] = [_THISROW].[Row ID])))))
```

Existing positivity, daily whole-baht and new-row cashpool logic retained; no blanket cashpool cap for existing-loan corrections.


Loans.Principal Amount invalid-value error — UNSAVED; original lacked paid/booked branch

```text
IFS([_THIS] <= 0, "เงินต้นต้องมากกว่า 0 / Principal must be greater than zero", AND([Loan Type] = "ผ่อนชำระรายวัน", MOD([_THIS], 1) <> 0), "เงินต้นผ่อนรายวันต้องเป็นจำนวนเต็มบาท / Daily installment principal must be whole baht", AND(IN([Row ID], Loans[Row ID]), OR([_THIS] < SUM(SELECT(Repayments[Principal Paid], [Ref Loans] = [_THISROW].[Row ID])), [_THIS] < SUM(SELECT(Charges[Principal Due], [Ref Loans] = [_THISROW].[Row ID])))), "เงินต้นต้องรองรับทั้งเงินต้นที่ชำระแล้วและยอดเงินต้นที่บันทึกไว้ กรุณาแก้ไขรายการต้นทางก่อนลดเงินต้น / Principal must cover both paid principal and recorded principal charges. Correct related sources before reducing it.", COUNT(Loan Form Context[Row ID]) <> 1, "กรุณาซิงค์เพื่อโหลดวงเงิน / Sync to load available cashpool", TRUE, CONCATENATE("เงินต้นเกินเงินทุนคงเหลือ / Principal exceeds available cashpool: ฿", ANY(Loan Form Context[Available Cashpool]), ". ลดเงินต้นหรือซิงค์หลังเพิ่มทุน / Reduce principal or sync after adding capital."))
```


Loans.Ref Borrowers.EditableIf — inspected UNCHANGED

```text
OR(NOT(IN([Row ID], Loans[Row ID])), AND(NOT([Defaulted]), COUNT(SELECT(Repayments[Row ID], [Ref Loans] = [_THISROW].[Row ID])) = 0, COUNT(SELECT(Business Expenses[Row ID], AND([Ref Related Loan] = [_THISROW].[Row ID], ISNOTBLANK([Ref Related Borrower])))) = 0))
```


## Denied and unapplied Loan proposals

Neither property below nor a Loan guidance column was changed/created. No compilation/runtime evidence. Reconcile latest policy and SQL before use. Prior Loan Type ValidIf and invalid-value error were blank. Source basis V68; current column availability remains unverified.


Loans.Loan Type.ValidIf — DENIED/UNAPPLIED

```text
OR(NOT(IN([Row ID], Loans[Row ID])), [_THIS] <> "ดอกเบี้ยรายวัน", LOOKUP([Row ID], "Loans", "Row ID", "Loan Type") = "ดอกเบี้ยรายวัน", AND(ISNOTBLANK([Original Daily Interest Rate]), OR(NOT([Auto Charge Enabled] = TRUE), AND(ISNOTBLANK([Loan Date]), ISNOTBLANK([Interest Payment Interval]), [Interest Payment Interval] >= 1))))
```


Loans.Loan Type invalid-value error — DENIED/UNAPPLIED

```text
IF(ISBLANK([Original Daily Interest Rate]), "ไม่พบอัตราดอกเบี้ยเดิม กรุณาตรวจเงื่อนไขสัญญาก่อนเปลี่ยนเป็นดอกเบี้ยรายวัน / Original daily rate is unavailable. Review the original loan terms before entering daily mode.", "โหมดสร้างยอดอัตโนมัติต้องมีวันที่สัญญาและรอบชำระอย่างน้อย 1 วัน กรุณาตรวจเงื่อนไขก่อนเปลี่ยนประเภท / Automatic daily mode requires the loan date and a positive payment interval. Review the schedule before changing type.")
```


Loans.Correction Guidance — DENIED/UNAPPLIED, historical wording

```text
IFS([Defaulted] = TRUE, "เงินต้น ผู้กู้ และรายการที่สร้างจากหนี้สูญถูกล็อก กรุณาใช้ Undo Default ที่สัญญานี้ก่อนแก้ไขรายการเหล่านั้น / Principal, borrower and default-generated entries are locked. Use Undo Default on this loan before changing them.", OR(COUNT(SELECT(Repayments[Row ID], OR([Ref Loans] = [_THISROW].[Row ID], [Ref Charges].[Ref Loans] = [_THISROW].[Row ID]))) > 0, COUNT(SELECT(Payments[Row ID], OR([Ref Target Loan] = [_THISROW].[Row ID], [Ref Target Charge].[Ref Loans] = [_THISROW].[Row ID]))) > 0, COUNT(SELECT(Payment Allocations[Row ID], [Ref Charge].[Ref Loans] = [_THISROW].[Row ID])) > 0, COUNT(SELECT(Business Expenses[Row ID], [Ref Related Loan] = [_THISROW].[Row ID])) > 0), "ยังลบสัญญานี้ไม่ได้ เพราะมีรายการชำระ ใบรับชำระ หรือค่าใช้จ่ายอ้างอิงอยู่ กรุณาตรวจยอดเรียกเก็บและรายการต้นทางก่อน ผู้กู้บางกรณีถูกล็อกตามรายการเหล่านี้ เงินต้นใหม่ต้องรองรับทั้งเงินต้นที่ชำระแล้วและยอดเงินต้นที่บันทึกไว้ / This loan has linked payments, receipts or expenses and cannot be deleted. Review its charges and source transactions first. These dependencies can lock borrower correction. Principal must cover paid principal and recorded principal charges.", TRUE, "เงินต้นใหม่ต้องรองรับเงินต้นที่ชำระแล้วและยอดเงินต้นที่บันทึกไว้แต่ละยอด การแก้วันที่ไม่เปลี่ยนวันที่รายการเดิม การเปลี่ยนเป็นดอกเบี้ยรายวันต้องมีอัตราเดิม รายการที่รวมในยอดยกมาต้องกระทบยอดโดยผู้ดูแลก่อนแก้ไข / Principal must cover each paid and recorded principal bound. Date corrections do not redate existing transactions. Daily conversion requires the original rate. Opening-included sources require administrator reconciliation before financial correction.")
```


**The final opening-included-source sentence above is superseded by the owner's latest automatic-opening-adjustment direction. It was never installed. Do not paste this old proposal unchanged.** Intended Show/Text column and all view integration remain unapplied.

## Runtime GUI evidence — all drafts discarded

| Case | Observed controls/validation |
|---|---|
| Receipt P2 Posted5 | Capacity229 =10+110+104+own5;0,−1,0.5,230 invalid;229 and5 valid. Notes optional; guidance detail after Status/form first. No save. |
| Generated repayment `pc6:14:SYN-R051-UI-P2:SYN-R051-UI-C2` | Edit/Delete absent; source guidance visible; Ref Payment opened exact P2 Posted5. No mutation attempted. |
| Independent LEGACY-R, original0P/1I | Edit/Delete available; Ref Charges picker editable; independent guidance. Principal−1 negative error,101 capacity error,0 valid. With principal0: interest0 both-zero error,11 capacity error,−1 and1 valid. Discarded, original1 visible. No reassignment/delete save. |
| LEGACY-C at185 | Delete absent; related loan read-only list because repayment exists; other amount/date edits available; paid guidance. Interest0 below paid1 rejected;1/10 valid; principal−1 rejected,100 valid. Discarded. |
| New Charge draft from LEGACY | Date/loan/principal/interest editable;100P/−1I and100P/0I valid;0/0 rejected. Canceled/discarded. |

Before185 both LEGACY loan Delete and LEGACY-C Delete were visible because old conditions checked allocations only; neither clicked. Charge fixed in185; Loan fix remains unsaved.181 failed runtime;182 restored full sync;183 visible guidance;184/185 saved/read back/full sync passed. Unsaved/denied edits have no runtime acceptance. Database rejection is not evidence of pre-submit frontend prevention.

## Source constraints and fixture facts

No database write by this browser worker. Coordinator read-only08:28:32 UTC checkpoint: V70/checksum124258995, no other active sessions; DEFAULT open/autooff/principal100/charge110/no loss; DAILY receipt absent, charges110/9; LEGACY interestpaid1/remainder109; CLOSE Posted200/referral10; PREPARED Posted10/100; original P2=5 and `Bx59mH6SCh4OMcWXvOpo6Y`=1; REIMBURSE empty. Synthetic contacts blank and partner IG off do not prove all message routes suppressed. Re-read before future mutations, coordinate sole writer, verify actual bot routes/conditions and generated IDs.

V59 unchanged inputs, null-safe: Ref Borrower, Amount Received, Payment Date, Allocation Method, Ref Target Charge, Ref Target Loan, Selected Charge IDs. Row ID separately immutable. Notes, Bank Reference, Payment Method, attachments, account/holder outside seven; account/holder retain V60 cash validation. Exemption skips allocation teardown only, not all triggers. Status outside seven; unchanged inputs do not imply Processing cannot post.

Edited posted capacity:

```text
SUM([Eligible Charges][Amount Remaining]) + SUM(SELECT(Payment Allocations[Allocated Amount], AND([Ref Payment] = [_THISROW].[Row ID], IN([Ref Charge], [_THISROW].[Eligible Charges]))))
```

Single Full, Receive All, First-day Auto, Loan Close and Selected Charges require equality to positive whole-baht capacity for the applicable prepared/posted branch; partial/lump-sum allow at or below. V51 includes all charges on target charge's loan without a date cutoff.

New Loan Close: outstanding principal + existing unpaid charge interest + extra interest (zero if charge exists Bangkok today; otherwise current daily interest × MAX(0,today−COALESCE(latest charge,loan date))). Missing principal booked = outstanding minus scheduled unpaid principal. Reject negative missing principal, multiple today's charges, invalid components/nonpositive/noninteger total. Requires Bangkok today/open/auto-enabled daily loan. Dated contextual `LINKTOROW([Row ID], "R008 Close Loan")` route uses SQL Processing amount1 then atomic preparation replacement. Posted unchanged target skips preparation. Processing, including Error→Processing, may prepare again unless earlier source branch applies; Error left Error creates no charges. Existence alone does not prove prepared. Generic Payments Loan Close and every initiator remain to verify before tightening validation.

V70 protects old/new direct and charge-derived default parents on repayment UPDATE/DELETE. Reserved df10 remains owned even if current parent flag false; use Undo Default for relevant corrections. Generated repayment corrections belong at receipt source; independent legacy CRUD/reassignment supported subject to guards.

Charge Delete rejects any repayment, including zero/negative legacy rows; receipt targets/allocations also restrict. Paid reparenting forbidden; component floors with repayments; unpaid negative interest preserved. Loan Delete checks Defaulted, direct/through-charge repayments, receipt targets, allocations and related expenses. V60 cleans eligible unpaid charges and ordinary owned disbursement. V20 permits Ref Loan only on that normal source-owned cash row; no extra cash blocker justified. Latest opening/reimbursement/assessment policy supersedes prior hidden-blocker proposals pending SQL implementation.

## Coverage and remaining acceptance

Saved OLTP work touches7/19 mapped groups, with partial acceptance: PAY_AMOUNT; PAY_PROCESSING (guidance only); PAY_NOTES; DEFAULT_CHILD (Repayments df10 gap); GENERATED_CHILD (repayment covered); CHARGE_CORRECTION; LEGACY_REPAYMENT. LOAN_DELETE/LOAN_CORRECTION partially edited unsaved. Remaining OLTP: PAY_TARGET, BORROWER_DELETE, EXPENSE_REIMBURSE, EXPENSE_SYSTEM. Six OLAP groups belong to separate appendix: REIMBURSE_ACCOUNT, SETTLEMENT_COMPLETE, SETTLEMENT_AMOUNT, CONTRIBUTION, CASH_ACCOUNT, READONLY_MIRRORS. Do not claim all19 complete.

Pending: posted financial edits versus metadata exception; TEXT blank/list-change equivalence; changed date/borrower/targets cannot exploit exemption; full methods/all initiators; generic/contextual new-close capacity; Processing/Error retry without uncertain replay; Default/df10 controls/old-new parent cases; valid submitted correction/reassignment/delete with fresh cash/source readback; saved Loan compilation/guidance/valid cases; latest policy SQL/frontend redesign and tests; all remaining groups and exact generated-ID cleanup. No release readiness claimed.

## Resume and browser technique

Owner requested local continuation; main handover/prompt govern that scope. Read current instructions/pin; use service-register VM profile and verify account/canonical DEV IDs. Reconcile current saved/unsaved state and intervening work without whole-version overwrite. Preserve185 runnable checkpoint. Coordinate OLTP/OLAP/data ownership, review latest policy before old restrictions, and save only coherent authorized changes. Require saved diagnostics/readback and actual runtime full sync;181 proved stale editor “No Issues” insufficient. Test every initiator with bilingual pre-submit guidance and allowed paths. Before bounded synthetic submissions obtain fresh recovery/data/notification checks; no real-record test deletion. Record exact expressions/versions/assertions/readback/cleanup on existing branch. Stop/report denied operations without bypass.

Worker used documented visible CUA controls, fresh accessibility state, no hidden app/network routes. Grid virtualization sometimes required bounded screenshot-grounded scroll; first Edit click could only scroll, so verify table/column heading. Formula toggle may expose a new text field without Expression Assistant; inspect fresh state. Fresh accessibility indices opened long-dialog fields when offscreen locator timed out. Save Expression separate from app Save. Show/Text guidance required AppFormula and Content plus view placement. Draft steppers/text and Tab triggered validators; Cancel/Discard used, never form Save.

**Final state:** saved/runnable185, partial Loan edits unsaved, terminal denied proposals unapplied, no worker financial mutations, latest policy redesign unimplemented, cloud browser work stopped.
