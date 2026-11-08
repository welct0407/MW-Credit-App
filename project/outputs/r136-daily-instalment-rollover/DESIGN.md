# Daily instalment loans and loan rollover (R136) — high-level design and user experience summary

Status: **reviewed by the owner on 8 November 2026 (Asia/Bangkok)**: the owner agreed with every recommendation in [section 9](#9-decisions-for-the-owner) except D2 (daily-interest loans are included), D7 (the rollover date may be yesterday) and D12 (an overdue instalment loan is charged interest for every day). The document is updated for those three answers; one follow-up question (D14) remains open and does not block the work. Written from the owner's instruction of the same day. Nothing here is implemented or deployed; the implementing session takes this document as the R136 scope. The owner's agreement with D5 authorizes the one nullable column in [4.2](#42-data-and-sql-one-migration-v138). Archie (A — Architect) and Echo (E — User Experience Officer) reviewed the draft on paper on 8 November 2026; their accepted points are marked inline. Records: [change note](../../../Change%20Logs/CHANGE_NOTES_R136_DAILY_INSTALMENT_ROLLOVER_DESIGN_2026-11-08.md).

The design reuses the existing loan, charge, payment and cash engine as far as it goes and adds one governed operation. Formulas use the owner's example: principal ฿10,000, documentation fee ฿1,000, daily payment ฿500 over 25 days.

## 1. Owner input, restated as requirements

Daily instalment loans (`"Loan Type"` = `ผ่อนชำระรายวัน`):

| # | Requirement | Where it lands |
| --- | --- | --- |
| A1 | "Transfer fee" becomes "Documentation fee"; same behaviour; default 10% of principal, filled automatically when the type is Daily instalment | PWA loan form and record labels; a default rule in `loan-form-values.ts` |
| A2 | Default duration 25 days counting the loan date as day 1; due date can be overwritten | PWA form default (due date = loan date + 24 days) |
| A3 | Daily payment = daily principal + daily interest; daily principal = principal ÷ 25; interest = daily payment − daily principal; default daily payment 5% of principal | PWA form default and helper lines; the SQL charge formula already does this |
| A4 | Cash issued = principal − documentation fee − first-day payment (same as today) | No change; shown as a forecast line on the form |
| A5 | Daily charges generated as today | No change |

Rollover of an existing loan into a new one:

| # | Requirement | Where it lands |
| --- | --- | --- |
| B1 | A loan action opens a new-loan window prefilled from the original (type, principal, documentation fee, duration where applicable, daily payment or daily interest) and a bilingual arrangement note naming the original loan | New "Rollover" action on the loan record of an open daily instalment or daily interest loan (owner, D2); the loan form in rollover mode |
| B2 | Early closure penalty for the original loan, default 4 × the daily payment (instalment) or 4 × the current daily interest (daily interest), adjustable | New field on the rollover form; part of the original loan's closing charge |
| B3 | Cash issued = principal − documentation fee − first-day payment − penalty − payment for the remaining days of the original loan (instalment) or its payoff through the rollover day (daily interest) | Computed by the rollover quote (server) and shown live on the form |
| B4 | The rollover page shows the forecast cash amount and how it is derived, in an income-statement style | The "Rollover statement" card on the form, repeated on the confirm page and the result |
| B5 | Recording the rollover closes the original loan through the deduction, so profit and principal of each loan are right | One atomic SQL operation `loan.rollover`: closing charge + net-off settlement payment on the original loan, new loan with its first-day net-off |
| B6 | Documentation fee and early closure penalty are profit | Both sit in `"Interest Due"` of a charge that is paid on the same day (fee: the new loan's first-day charge, as today; penalty: the original loan's closing charge), so they reach `"Interest Paid"`, gross profit, the Partner split and the referral rebate basis on the rollover date |

## 2. What exists today (baseline the design builds on)

- The form has fields Loan Date, Principal Amount, Transfer Fee, Disbursing Cash Account, Loan Type, Due Date, Daily Payment Amount, Fixed Interest, Current Daily Interest, Interest Payment Interval, Interest Schedule Anchor Date, Loan Arrangement, Auto Charge Enabled ([`LoanForm.tsx`](../../../apps/pwa/src/LoanForm.tsx)). The only automatic default today is the daily-interest loan's Current Daily Interest = 10% of principal (`tenth()` in [`loan-form-values.ts`](../../../apps/pwa/src/loan-form-values.ts)).
- Term length T = Due Date − Loan Date + 1 (both ends counted), so a 25-day loan has Due Date = Loan Date + 24 days.
- Daily instalment charge formula (V8, unchanged since): base = floor(P ÷ T), remainder r = P mod T spread one baht per day over the first r days; interest on a charge = Daily Payment Amount × elapsed days − principal. With P = 10,000, T = 25, daily payment 500: principal 400 and interest 100 a day, exactly the owner's A3.
- First-day charge (`fd6:`, `first_day_components_v83`): principal = base (+1 if r > 0), interest = daily payment − principal + Transfer Fee. It is paid at once by a `Net-off at Disbursement` / `First-day Auto` payment received on the disbursing account. The cash ledger shows the disbursement out (P) and that receipt in (daily payment + fee), so cash issued = P − fee − first-day payment: the owner's A4. The fee is therefore already profit on the loan date (B6, fee half).
- Only an open, auto-enabled daily-interest loan has a payoff path (`loan_close_calculation_v83`, Loan Close page, "Closes <loan>" in Receive payment). Fixed due date and daily instalment loans have none (owner decision 15.2 in the chat business rules): a Partner would close them by hand. The rollover is the first encoded early-close path for an instalment loan.
- A loan closes automatically after any payment once principal received ≥ principal and every charge is fully paid (`close_payment_loans`); the closing payment is recorded on the loan. A close of a referred loan books the referral rebate (R120 terms; default offset to the referrer's open loan when the close date is today, V124; otherwise pending payment, R129).
- Payment methods are `Bank Transfer`, `Cash`, `Net-off at Disbursement`; allocation methods include `First-day Auto`, `Loan Close` and `Selected Charges` (an explicit per-charge plan). A payment that names a target loan is a Loan Close and runs the daily-interest payoff calculation in a Payments trigger (`prepare_loan_close`), so it cannot carry an instalment settlement; R113 already closes loans through an explicit `Selected Charges` plan instead, and the ordinary payment-closes-the-loan path marks the loan closed.
- Every receipt created by a governed operation resolves its plan from the journal row (`pwa_effective_payment_plan_v2`, keyed by `result_json->>'paymentId'` for a fixed list of operations); R111 showed how one operation records a second receipt (`rebate.offsetPaymentId` with its own plan).
- Profit = `"Interest Paid"` (+ late charge) of non-write-off repayments on the payment date; there is no fee or penalty column anywhere, and the owner's R118 rule keeps `"Late Charge Due"` manual only.

## 3. Part A — daily instalment loan defaults

### 3.1 Documentation fee (A1)

- **Labels only.** English "Documentation Fee", Thai "ค่าธรรมเนียมเอกสาร", on the loan form, the loan record, the offline viewed record, the chat business rules and the Data Dictionary descriptions. The database column `"Transfer Fee"`, the API key `transferFee`, the command catalogue and the reporting views keep their names: renaming the column would touch about twenty dependent functions and views (V22, V42, V44, V45, V53, V83, the reporting and Metabase models, the agent manifest) for no behaviour change, and migrations are immutable. The dictionary entry for the column gets the business name "Documentation Fee (column `Transfer Fee`)". → Decision [D1](#9-decisions-for-the-owner).
- The label changes for every loan type (one field, one name). Behaviour is unchanged: the fee is added to the first-day charge interest of daily-interest and daily-instalment loans and netted off at disbursement. (Existing fact, not changed here: a fixed-due-date loan has no first-day charge, so a fee entered on it is never charged.)
- **Default:** when the type becomes Daily instalment on a new loan, and whenever the principal changes on a new Daily instalment loan, the fee is set to round-half-up(principal × 10%) in whole baht (same rounding helper as `tenth()`). A fee the Partner has typed is kept: a derived field counts as edited by hand from its first keystroke, whatever the type was at the time, and the defaults fill only empty or untouched fields (Echo R136-UX-01); clearing a field restores the default on the next principal change. The per-field "edited" flags are part of the form's draft value, so a restored draft does not re-derive over the Partner's edits (Archie). The default never applies when editing an existing loan.

### 3.2 Duration (A2)

- On a new loan, when the type becomes Daily instalment and the due date is empty, or when the loan date changes and the due date has not been edited by hand: Due Date = Loan Date + 24 days (T = 25, loan date is day 1). The field stays editable with the existing minimum (loan date). The helper line under it reads "25 days, loan date is day 1" / "25 วัน นับวันที่กู้เป็นวันที่ 1" and recounts when either date changes.
- Interest Payment Interval keeps its default 1.

### 3.3 Daily payment, daily principal and interest (A3)

- Default Daily Payment Amount = round-half-up(principal × 5%) in whole baht, set with the type and re-derived on principal change under the same "not edited by hand" rule.
- One read-only helper line under the Daily Payment field, computed in the form from the SQL formula so it matches the charges the engine will generate: "Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day)"; when P mod T > 0 it adds "· first N days +฿1 principal" so the Partner sees the remainder rule. The totals move to the summary block above Save ([3.4](#34-cash-issued-forecast-a4)), so a phone shows at most one helper line per field (Echo R136-UX-02).
- Validation is unchanged: whole baht, daily payment × T > principal, T ≥ 1. The existing `installment` error message stays.

### 3.4 Cash issued forecast (A4)

- A small summary block in the `close-summary` style sits just above Save on a new daily-interest or daily-instalment loan, two rows: "Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000" (instalment only) and "Cash issued to borrower ฿8,500 = ฿10,000 principal − ฿1,000 documentation fee − ฿500 first-day payment", where first-day payment = daily payment (instalment) or daily interest (daily interest) plus the fee. It is computed with the same components as `first_day_components_v83`, so it equals the cash movement the save will create. "Cash issued to borrower" is the one name for this figure on every screen (Echo R136-UX-09). The confirm step is the existing Save (no new confirm page for an ordinary loan).

### 3.5 Charges (A5)

No change to `generate_due_charges`, the first-day charge, forecasts or Upcoming Charges.

## 4. Part B — rollover

### 4.1 Business rule (owner's B2, B3, B5, B6, made exact)

The rollover day D is the Bangkok business date or the day before it (owner, D7: "could be yesterday too"), chosen on the form like a payment date. Given an original loan O on day D, the deduction depends on O's type.

**Daily instalment O:**

| Symbol | Meaning | Source |
| --- | --- | --- |
| P₀, DP₀, T₀, Due₀ | Original principal, daily payment, term (Due₀ − Loan Date₀ + 1) and due date | `"Loans"` |
| L | Latest charge date of O (always exists: the first-day charge); it may be before D (days never charged), D itself (today's generated charge, the common case with interval 1) or after D (a pay-forward charge) | `"Charges"` |
| Unpaid | Sum of `"Amount Remaining"` (principal + interest + late charge) over O's existing charges | `"Charges"` |
| R | Days not yet charged = max(0, Due₀ − L) | derived |
| Missing principal | Outstanding principal − unpaid principal already on charges; because the schedule's principal sums to P₀, it is the principal of the uncharged days whatever L is | same rule as `loan_close_calculation_v83` |
| Remaining interest | DP₀ × R − missing principal; negative only when O's charges were edited by hand or the loan is past due with principal still missing → [D11](#9-decisions-for-the-owner) | same shape as the V8 formula |
| Overdue interest | Owner, D12: interest is charged for every day, so a loan past its due date owes the contract's daily interest component, DI₀ = DP₀ − floor(P₀ ÷ T₀), for each day after Due₀ through D: DI₀ × max(0, D − Due₀). Nothing when D ≤ Due₀ | derived; see [D14](#9-decisions-for-the-owner) for the generator |
| Penalty | Default 4 × DP₀, whole baht, editable, 0 allowed | form input |
| **Settlement S** | Unpaid + missing principal + remaining interest + overdue interest + penalty; must be a positive whole baht amount → [D13](#9-decisions-for-the-owner) | the deduction for O |

The closing of O on day D is one new charge dated D (id prefix `rl138:`, inserted whether or not a generated charge already carries that date; O is closed afterwards, so generation never recurs) with `"Principal Due"` = missing principal and `"Interest Due"` = remaining interest + overdue interest + penalty, Notes "Rollover to loan <new key>: R days not yet charged × ฿DP₀ = …, N overdue days × ฿DI₀ = …, early closure penalty ฿…".

**Daily interest O** (owner, D2): the deduction is O's payoff through D plus the penalty, with the components the existing close quote already computes (`loan_close_calculation_v83` with `p_day` = D): Unpaid as above, missing principal = outstanding principal not yet on a charge, gap interest = Current Daily Interest₀ × days from the latest charge dated on or before D through D (none when a charge is dated D), and a charge dated after D (today's generated charge when D is yesterday, or a pay-forward charge) treated as the close treats it today (R101: its interest lowered to the days through D, noted on the charge). Penalty default 4 × Current Daily Interest₀. S = Unpaid + missing principal + gap interest + penalty. The closing charge is the same `rl138:` charge dated D with `"Principal Due"` = missing principal and `"Interest Due"` = gap interest + penalty (it takes the place of the `lc7:` charge a Loan Close would add). The owner's example at 3% a day: principal 10,000, daily interest 300, last charge two days before D, no unpaid charge: payoff 10,600, penalty 1,200, S = 11,800; a new loan of 10,000 at the same terms with fee 1,000 gives cash issued 10,000 − 1,000 − 300 − 11,800 < 0, so the Partner raises the principal or lowers the penalty ([D6](#9-decisions-for-the-owner)); a daily-interest rollover usually needs a larger new principal because the whole outstanding principal is settled on D. It is paid by one payment of S on O: an explicit `Selected Charges` plan over every charge of O that still has a balance, the `rl138:` charge included, `targetLoanId` null, payment method `Net-off at Disbursement`, received on the new loan's disbursing account, dated D. This is the R113 "Closes <loan>" path, not the `Loan Close` method (a payment naming a target loan runs the daily-interest payoff trigger and would be refused for an instalment loan). The ordinary engine then marks O closed with that payment as its closing payment, books the referral rebate if O is referred, and refreshes the borrower totals. The penalty is profit on D because it is interest paid (B6); the remaining interest is also recognized on D rather than over the uncharged days, which is the point of the early closure. "Payment for the remaining days" (B3) is therefore DP₀ × R, split into principal and interest exactly as the schedule would have split it, and the unpaid balance of earlier charges is settled in the same deduction so that O can close. → Decisions [D3](#9-decisions-for-the-owner), [D4](#9-decisions-for-the-owner), [D12](#9-decisions-for-the-owner) for a loan past its due date.

New loan N on day D: an ordinary loan of O's type created by the same request with Loan Date = D and the prefilled terms (edited or not), its own first-day charge and first-day net-off as today. When D is yesterday, the daily charge job has already run for today and never backfills, so the apply also generates N's charge for today when the schedule calls for one (the existing generator, as `loan.generate-charge` does), so N's schedule is complete without a manual step. O's `"Close Date"` is set by the shared `close_payment_loans` to the day the rollover is recorded (today) even when D is yesterday, exactly as a payment dated yesterday that closes a loan behaves today; the settlement payment itself is dated D. Cash on the ledger for D on the disbursing account: − P (disbursement of N) + (DP + fee) (N's first-day net-off) + S (O's settlement). Net cash issued = P − fee − DP − S, the owner's B3 with the unpaid balance made explicit.

Worked example (owner's numbers, rollover on day 18 of 25, all charges paid): R = 7, missing principal 2,800, remaining interest 700, penalty 2,000, Unpaid 0 → S = 5,500. New loan 10,000 at the same terms: cash issued = 10,000 − 1,000 − 500 − 5,500 = **3,000**. Profit recognized on D: 1,000 (fee) + 100 (first-day interest of N) + 700 (remaining interest of O) + 2,000 (penalty) = 3,800; principal received on O: 2,800 (O fully recovered); principal lent on N: 10,000.

Guards: O open, type Daily instalment or Daily interest, Auto Charge Enabled, not Defaulted, no principal-loss posting, no `Processing` or `Error` payment for the borrower, D ≥ Loan Date₀, charge components reconcile (no over-paid charge), S whole baht and > 0, remaining interest ≥ 0 (or the D11 rule), cash issued ≥ 0 (→ [D6](#9-decisions-for-the-owner)), N passes the ordinary loan validation. D is today or yesterday ([D7](#9-decisions-for-the-owner), the payment-date rule of V96); the form offers no other date. Two net-off receipts on one account and day are fine for the cash ledger (each receipt is its own `PAYMENT:<id>` source key); only the Cash Position wording for a net-off receipt that is not the first-day one is checked in the test plan.

### 4.2 Data and SQL (one migration, V138)

- `loan_rollover_calculation_v1(p_loan, p_day, p_penalty)` → jsonb quote for both types: the fields above (`type`, `unpaid`, `unchargedDays`, `missingPrincipal`, `remainingInterest`, `overdueDays`, `overdueInterest` for instalment; `gapDays`, `gapInterest` for daily interest; `penalty`, `settlement`), the closing charge mutation (and the R101 lowering of a charge dated after D for daily interest), the `Selected Charges` allocation lines, `sourceVersion` (`pwa_loan_version_v2` of O) and a `planHash` over O's version, the day, the penalty and the lines, in the shape of `loan_close_calculation_v83` so the PWA and the command treat it the same way (a changed hash is `source_conflict`). N's terms are not hashed: they are validated as ordinary `loan.create` inputs.
- `pwa_apply_loan_rollover_v1(canonical)`: the governed apply for operation `loan.rollover`, journal-owner only, one transaction: lock the borrower and both loans; re-run the quote and compare `expectedPlanHash`, `expectedSettlement` and the source version; insert O's closing charge; create N through the shared loan-create body (same inputs as `loan.create` plus the link), which records N's first-day receipt; post O's settlement payment through the explicit plan path (`post_payment_explicit_v6`, allocation method `Selected Charges`), received on N's disbursing account; assert O is now `ปิดยอดแล้ว` with that payment as its closing payment and N's first-day effect matches its plan (same assertion as `pwa_apply_loan_create_v2`); return `{ newLoanId, closedLoanId, settlementPaymentId, firstDayPaymentId, statement }`.
- Two receipts from one journal row: following the R111 precedent (`rebate.offsetPaymentId` and its plan), the result keeps `paymentId` and `plan` for N's first-day receipt and adds `settlement.paymentId` and `settlement.plan`; V138 redefines `pwa_effective_payment_plan_v2`, the unique index `pwa_operation_receipt_v2` and the correction head lookup so that `loan.rollover` is in their operation lists and each receipt resolves exactly one provenance. A later `payment.correct` of the settlement re-posts through the explicit plan, never through the Loan Close calculation.
- Link between the loans: a nullable column `"Loans"."Ref Rollover Source Loan"` (text, FK to `"Loans"`, set only by the rollover apply) so the loan record, lists and reports can say "Rollover of …" and "Rolled over to …" without parsing the journal. Authorized by the owner's agreement with [D5](#9-decisions-for-the-owner) on 8 November 2026; V138 therefore adds this column, the functions and the read-role grant, and PROD needs the verified backup a column change requires.
- Read routes (reader service): `GET /api/loan-records/:id/rollover-preview?day=&penalty=` returns the quote plus N's prefill (type, principal, fee, T₀ and DP₀ or Current Daily Interest₀, interval, arrangement note in both languages); `GET /api/loan-records/:id` adds `rolloverSourceLoanId` / `rolledOverToLoanId` with their display keys. Command contract: `loan.rollover` with `targetId` = N's new uuid, `expectedVersion` null (create), inputs = the `loan.create` inputs + `sourceLoanId`, `sourceExpectedVersion`, `penalty`, `expectedSettlement`, `expectedPlanHash`.
- Business consequences that need no new code: `close_payment_loans`, borrower totals, `create_referral_rebate` (offset by default when D is today), the cash ledger projection, the "Payment received" push (content v5 shows the settlement; wording check in the test plan), Collection and Upcoming (O disappears as closed, N appears with its schedule).
- Corrections stay the ordinary ones (no new reversal framework): deleting the settlement payment reopens O and leaves the `rl138:` charge editable or deletable, as Loan Close does today; N is then deleted like any unpaid new loan. The implementing session documents this in the source-correction table.
- Chat and agent: the `loan.rollover` operation is not added to the chat command catalogue in this release (the owner can ask for it later); the chat business rules gain the instalment early-close path ("rollover in the app") in place of "no early-close path", and the daily-interest section mentions the rollover beside Loan Close. The Instagram agent is untouched. Metabase and the income statement need no change: fee and penalty flow through `"Interest Paid"`; an optional "Rollover penalties received" memo line is a later request.

### 4.3 Operation flow (PWA)

```
Loan record (open daily instalment or daily interest) ── Rollover ──▶ Rollover loan form (online only)
   prefilled from O; penalty field; live Rollover statement; reads /rollover-preview
   ──▶ Review rollover ──▶ Confirm page (statement + both loans) ──▶ loan.rollover
   ──▶ Result: new loan record opens with the status line in 5.3
```

## 5. User experience summary

### 5.1 New loan form (Part A)

- Field order unchanged; the fee field reads "Documentation Fee" / "ค่าธรรมเนียมเอกสาร" with the existing ±100 stepper.
- Choosing Daily instalment on a new loan fills the empty or untouched Documentation Fee (10%), Due Date (+24 days) and Daily Payment Amount (5%) at once; a value the Partner typed before or after is never overwritten (Echo R136-UX-01). Changing the principal re-derives only the untouched ones.
- Helper lines (read-only, under the fields, same style as the daily-interest "Daily Interest Rate" line), one per field: under Due Date "25 days, loan date is day 1"; under Daily Payment "Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day)". The totals sit in the summary block above Save: "Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000" and "Cash issued to borrower ฿8,500 = ฿10,000 − ฿1,000 documentation fee − ฿500 first-day payment" (Echo R136-UX-02).
- Save behaves as today (offline queueing included); no new confirm page.
- Thai wording: ยอดชำระรายวัน (daily payment), เงินต้นต่อวัน (daily principal), ดอกเบี้ยต่อวัน (daily interest), เงินสดที่จ่ายให้ผู้กู้ (cash issued to borrower), ค่าธรรมเนียมเอกสาร (documentation fee).

### 5.2 Loan record

- New action "Rollover" / "ต่อสัญญาใหม่" in the action row, right after Close Loan, with its own icon and that title and aria-label, shown for an open, auto-enabled, non-defaulted daily instalment or daily interest loan with outstanding principal; disabled offline (online-only like Close Loan). A daily-interest loan then shows seven icon buttons (Edit, New charge, Close Loan, Rollover, Default Loan, Generate Charges, Delete), about 343 px at the current button size, which still fits a 390 px phone; Echo checks the row on the DEV build and the row wraps to a second line rather than shrinking if it does not fit (Echo R136-UX-03, revised for D2).
- A loan created by rollover shows "Rollover of <O key> · closed <date>" under its heading with a link to O; O shows "Rolled over to <N key> · <date>" with a link to N (needs [D5](#9-decisions-for-the-owner) or the journal fallback).

### 5.3 Rollover loan form

- Heading "Rollover loan · <borrower>" / "ต่อสัญญาใหม่ · <ผู้กู้>". The same loan form in rollover mode: Loan Date (the rollover day D) is a two-choice control, today or yesterday, default today (D7; the same choice Receive payment gives for the payment date); type preselected and locked to the original type; principal, documentation fee and interval prefilled from O and editable; for an instalment O the due date (D + T₀ − 1) and daily payment, for a daily-interest O the Current Daily Interest, prefilled from O and editable; disbursing account defaulted as today. Changing D re-quotes the statement.
- Loan Arrangement prefilled with the bilingual note on two lines, followed by a blank line and O's own arrangement text:
  `Rollover of loan <O key> (loan date 15/10/2026, principal ฿10,000, daily payment ฿500, due 08/11/2026), closed on 01/11/2026 with early closure penalty ฿2,000.`
  `ต่อสัญญาจากสินเชื่อ <O key> (วันที่กู้ 15/10/2026 เงินต้น ฿10,000 ยอดชำระรายวัน ฿500 ครบกำหนด 08/11/2026) ปิดเมื่อ 01/11/2026 ค่าปรับปิดก่อนกำหนด ฿2,000`
  The Partner can edit it.
- New field "Early closure penalty (original loan)" / "ค่าปรับปิดสินเชื่อเดิมก่อนกำหนด", whole baht, stepper ± one day (DP₀ for an instalment O, Current Daily Interest₀ for a daily-interest O), default 4 days. Its helper recounts from the current value: "฿2,000 = 4 days of ฿500", "฿2,250 = 4.5 days of ฿500" (Echo R136-UX-07). The field sits directly above the statement card, so the figure it changes is on screen while it is edited (Echo R136-UX-05).
- **Rollover statement card** (B4), under the penalty field, recomputed on every edit (the O side from the server quote, the N side from the form). It is a list of label and amount rows (`dl` in the `close-summary` style), amounts right-aligned in tabular digits and never wrapping, a smaller line under a row for its breakdown, "Settlement of loan <O key>" as a subheading, and Cash issued as the largest figure (Echo R136-UX-04). Content, in English and Thai:

  | Row | ฿ | Thai |
  | --- | ---: | --- |
  | Rollover statement, 01/11/2026 | | ใบสรุปการต่อสัญญา 01/11/2026 |
  | New loan principal | 10,000 | เงินต้นสินเชื่อใหม่ |
  | − Documentation fee | 1,000 | − ค่าธรรมเนียมเอกสาร |
  | − First-day payment (day 1 of 25) | 500 | − ยอดชำระวันแรก (วันที่ 1 จาก 25) |
  | **Available for disbursement** | **8,500** | **ยอดพร้อมจ่าย** |
  | Settlement of loan <O key> (subheading) | | ปิดยอดสินเชื่อ <O key> |
  | − Unpaid charges to date | 0 | − ยอดเรียกเก็บค้างชำระ |
  | − 7 days not yet charged × ฿500 · small line: principal ฿2,800 · interest ฿700 | 3,500 | − 7 วันที่ยังไม่เรียกเก็บ × ฿500 · เงินต้น ฿2,800 · ดอกเบี้ย ฿700 |
  | − Interest for N overdue days × ฿100 (only when D is after the due date, D12) | 0 | − ดอกเบี้ย N วันที่เกินกำหนด × ฿100 |
  | − Early closure penalty (4 days of ฿500) | 2,000 | − ค่าปรับปิดก่อนกำหนด (4 วัน × ฿500) |
  | **Deducted for the original loan** | **5,500** | **หักชำระสินเชื่อเดิม** |
  | **Cash issued to borrower** (largest) | **3,000** | **เงินสดที่จ่ายให้ผู้กู้** |
  | Profit recognized today (fee, first-day interest, remaining interest, penalty), memo in help style | 3,800 | กำไรรับรู้วันนี้ |

  For a daily-interest O the settlement rows are instead "− Unpaid charges to date", "− Outstanding principal" (the principal not yet on a charge), "− Interest for N days since the last charge × ฿300" (gap interest; the row is absent when a charge is dated D) and "− Early closure penalty (4 days of ฿300)"; the new-loan rows and the totals are the same, with "First-day payment" = daily interest + fee. Thai: − เงินต้นคงเหลือ, − ดอกเบี้ย N วันนับจากรายการล่าสุด × ฿300.

  When the cash figure is negative the card stays and the Cash issued row turns the error colour; a message above the disabled Review button says "Cash issued would be negative (−฿X). Raise the principal or lower the penalty." and adds "or record the borrower's payment of the unpaid charges first" only when Unpaid > 0 (Echo R136-UX-06, [D6](#9-decisions-for-the-owner)).
- The Review button row repeats "Cash issued ฿3,000" beside the button "Review rollover" / "ตรวจสอบการต่อสัญญา" (Echo R136-UX-05). Review opens the standard confirm page (`OperationConfirm`) that leads with Cash issued to borrower, then the statement card, the new loan's terms list and the two cash lines (disbursing account, "Net-off at Disbursement"), then Confirm (Echo R136-UX-08). A quote that changed between the form and Confirm (payment posted meanwhile, charge edited) shows the Loan Close wording "Original loan balances changed. Review the current amount before continuing." with the button "Use current statement" / "ใช้ยอดปัจจุบัน".
- Result: the new loan record opens with the status line "Rollover saved: loan <O key> closed, new loan <N key> · ฿3,000 cash to <borrower>" / "ต่อสัญญาแล้ว: ปิดสินเชื่อ <O key> · จ่ายเงินสด ฿3,000 ให้ <ผู้กู้>" (plus the rebate line when O was referred, in the existing Loan Close wording) (Echo R136-UX-09). The settlement payment appears in O's payments and in Payments with notes "Rollover to <N key>".
- Draft: the rollover form keeps a device draft like the other forms, but the statement is re-quoted on restore (never saved), and the operation is online only (like Loan Close): offline the page says "Connect to review the rollover".
- Errors: `source_conflict` (quote changed), `rollover_ineligible` (loan closed, defaulted, wrong type or a Processing payment: message names the reason), `invalid_request` (new-loan validation, same messages as the loan form), `command_busy` (retry same request, as elsewhere).

### 5.4 Where else it shows

- Payments list and Payment record: the settlement is an ordinary payment with method Net-off at Disbursement and allocation Loan Close; its notes name the new loan. Payment history of the borrower shows two net-off receipts on D (O's settlement and N's first-day).
- Cash: on D the disbursing account shows the disbursement of P out and the two receipts in; the Cash Position and the daily statement already present net-off receipts.
- Collection and Upcoming: O leaves the board as closed; N appears with its first charge due the day after D (interval 1), and when D is yesterday that charge is today's and is already generated by the apply. Push: the existing "Payment received" push fires for the settlement (and for N's first-day net-off, as it does for any new loan today).
- Chat: answers about an instalment loan's early close point to the Rollover action; it cannot post one in this release.

## 6. Out of scope (this release)

Rollover of fixed-due-date loans; a rollover dated earlier than yesterday; a partial rollover (new principal smaller than the settlement, cash issued negative); chat or Instagram agent posting a rollover; renaming the `"Transfer Fee"` column; a fee or penalty column; daily interest-only charges on an overdue instalment loan outside the rollover ([D14](#9-decisions-for-the-owner), open); changes to Loan Close, Receive payment or reports.

## 7. Proportional validation (Archie's compact test plan, to confirm at implementation)

Behaviour class: financial logic plus a new SQL operation and a UI flow. Checks, each once per tree:

1. Unit (Node): defaults and helper lines for Part A (10%, +24 days, 5%, remainder rule, edited-by-hand rule including a restored draft, the summary block), the rollover statement arithmetic including R = 0 (past due), Unpaid > 0, penalty 0 and a typed penalty, negative cash with and without unpaid charges, and the bilingual arrangement note.
2. Database (disposable PostgreSQL, the `database.yml` groups; register `Test-Rollover.sql` in the workflow): the quote and apply on the owner's example (day 18 of 25) with today's generated charge present (the common case), with L before D (uncharged days) and with L after D (a pay-forward charge); a loan past its due date with unpaid charges and the overdue-interest line (D12); a daily-interest O with and without a charge dated D, with a charge dated after D (R101 lowering), and the referral rebate; D = yesterday for both types, including the generation of N's charge for today and O's Close Date; a referred original loan (rebate booked and offset); an overpaid charge (refused); a stale hash (refused); a Processing payment (refused); the cash ledger lines for D including the Cash Position wording of the second net-off receipt; O closed with the settlement as closing payment; borrower totals; both receipts resolving exactly one provenance; a `payment.correct` re-post of the settlement running through the explicit plan and not the Loan Close calculation; the reversal path (delete settlement → O reopens; `loan.delete` of N with its first-day receipt rule); the notification event capture for both receipts; `check:schema-digest`.
3. Integration (command service): `loan.rollover` idempotency by request id, `source_conflict`, `rollover_ineligible`, version hashes of both loans after the apply, the journal row.
4. Browser: one Playwright spec per flow (the loan form defaults; the rollover flow record → form → statement → confirm → result), run in the existing CI shards on Chromium and iPhone WebKit, nothing beyond those shards; Echo's one pass on the DEV build on the iPhone profile.
5. Data Dictionary: the new function, operation, column (if [D5](#9-decisions-for-the-owner)) and the renamed labels; `npm run check:docs`.

## 8. Delivery notes for the implementing session

- One release (R136, currently open with no scope), DEV first then PROD on the owner's instruction, with a verified PROD backup before V138 (a production database change with one new column). The Release Tracker's R136 row takes this document as its owner scope when the implementing session starts. Images: read, command and chat (schema digest) plus Hosting; notify and jobs only if the push wording changes; no infrastructure or VM change.
- One-writer boundaries: `database/migrations/V138__*.sql` (including the `pwa_effective_payment_plan_v2` redefinition) and `scripts/database/Test-Rollover.sql` (Byte, SQL); `services/business/loans.mjs`, `services/contracts/operation-command.mjs`, the reader route and the command handler (Byte, services); `apps/pwa/src/LoanForm.tsx`, `loan-form-values.ts`, `LoanRecord.tsx`, a new `rollover-statement.ts` (Byte, PWA); tests (Chase); records and dictionary (Dewey). Forge: not applicable unless a new Cloud Run variable is needed (none foreseen).
- Keep the chat `schema-digest.json` and `conversation-business-rules.md` in the same batch (new function and the early-close rule), since the digest changes start a new chat history epoch.

## 9. Decisions for the owner

Owner answer of 8 November 2026: "agree with all recommendations, except the following: 2. include daily interest too, if that's possible. 7. could be yesterday too. 12. … interest should be charged everyday. that's the main income." The Decided column records the result; D14 is the one open follow-up.

| # | Question | Recommendation | Decided |
| --- | --- | --- | --- |
| D1 | Rename only the labels (column `"Transfer Fee"` and API key `transferFee` stay) or rename the column too? | Labels only; no behaviour change, no migration churn | Labels only |
| D2 | Rollover scope: daily instalment only in this release, or daily-interest loans too (they already have a payoff quote; a rollover would reuse it with the penalty added)? | Instalment only now; daily interest as a follow-up on the same operation | **Both types in this release** (owner); the daily-interest branch reuses the close quote's components, [4.1](#41-business-rule-owners-b2-b3-b5-b6-made-exact) |
| D3 | Include the original loan's unpaid charges to date in the deduction (the loan then closes fully), or require them to be paid separately before a rollover is offered? | Include them; the statement shows the line | Include |
| D4 | Record the penalty and the remaining interest as `"Interest Due"` of one closing charge on the original loan (profit on the rollover date, in the referral rebate basis), with the breakdown in the charge notes? | Yes; it matches how the fee is recorded today and needs no new column | Yes |
| D5 | Authorize one nullable column `"Loans"."Ref Rollover Source Loan"` to link the two loans? | Yes; otherwise the link is derived from the journal and unavailable to views | Yes: the column is authorized |
| D6 | Refuse a rollover whose cash issued would be negative (the borrower must first pay the difference or the terms change)? Zero allowed? | Refuse negative; allow zero | Refuse negative, allow zero |
| D7 | Rollover date = today only (like Loan Close), no back-dating? | Yes | **Today or yesterday** (owner), the payment-date rule; N's charge for today is generated by the apply when D is yesterday |
| D8 | The rollover close of a referred loan books the referral rebate like any other close (default offset when the referrer has an open loan)? | Yes, no exception | Yes |
| D9 | New loan duration on rollover = the original term T₀ (owner's "same duration"), with 25 as the fallback when T₀ is unknown? | Yes | Yes (instalment only; a daily-interest loan has no term) |
| D10 | Penalty stepper step = one day of payment (DP₀), default 4 days? | Yes | Yes; one day = Current Daily Interest₀ for a daily-interest O |
| D11 | When the remaining interest would be negative (charges edited by hand, or a past-due loan with principal still missing): refuse the rollover, or charge the missing principal with interest 0? | Charge the missing principal with interest 0, and show the line; refusing would block exactly the loans that most need a clean close | Charge with interest 0 |
| D12 | A loan past its due date (no uncharged days): penalty still 4 × DP₀ by default, and no interest for the overdue days (a late charge stays manual, R118)? | Yes to both; the Partner can set a late charge on the unpaid charges before the rollover if wanted | **Interest for every overdue day** (owner): the closing charge adds DI₀ × (D − Due₀), where DI₀ = DP₀ − floor(P₀ ÷ T₀) is the contract's daily interest; penalty default unchanged. The implementing session confirms this reading of "interest should be charged everyday" with the owner before the SQL is written if the owner meant a rate on the outstanding principal instead |
| D13 | A fully paid original loan (nothing unpaid, no missing principal) with penalty 0 has nothing to settle: refuse the rollover ("nothing to close; create a new loan instead")? | Refuse; the settlement must stay a positive amount | Refuse |
| D14 | Follow-up raised by D12: today the charge generator stops at an instalment loan's due date, so an overdue instalment loan accrues nothing until it is rolled over or closed by hand. Should the generator also book an interest-only charge of DI₀ every day after the due date while the loan stays open (a change to `generate_due_charges`, Upcoming and the forecast views, outside this release)? | Decide separately; this release charges the overdue days only inside the rollover | **Open** |
