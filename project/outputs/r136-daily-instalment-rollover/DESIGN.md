# Daily instalment loans and loan rollover (R136) — high-level design and user experience summary

Status: **proposal for owner review**, 8 November 2026 (Asia/Bangkok). Written from the owner's instruction of the same day. Nothing here is implemented, approved for a schema change or deployed; the implementing session takes this document as the baseline once the owner has answered the [decisions](#9-decisions-for-the-owner) and accepted or amended the rest. Records: [change note](../../../Change%20Logs/CHANGE_NOTES_R136_DAILY_INSTALMENT_ROLLOVER_DESIGN_2026-11-08.md).

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
| B1 | A loan action opens a new-loan window prefilled from the original (type, principal, documentation fee, duration, daily payment) and a bilingual arrangement note naming the original loan | New "Rollover" action on the loan record; the loan form in rollover mode |
| B2 | Early closure penalty for the original loan, default 4 × daily payment, adjustable | New field on the rollover form; part of the original loan's closing charge |
| B3 | Cash issued = principal − documentation fee − first-day payment − penalty − payment for the remaining days of the original loan | Computed by the rollover quote (server) and shown live on the form |
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
- Payment methods are `Bank Transfer`, `Cash`, `Net-off at Disbursement`; allocation methods include `First-day Auto` and `Loan Close` (every charge of the target loan, exactly the payoff).
- Profit = `"Interest Paid"` (+ late charge) of non-write-off repayments on the payment date; there is no fee or penalty column anywhere, and the owner's R118 rule keeps `"Late Charge Due"` manual only.

## 3. Part A — daily instalment loan defaults

### 3.1 Documentation fee (A1)

- **Labels only.** English "Documentation Fee", Thai "ค่าธรรมเนียมเอกสาร", on the loan form, the loan record, the offline viewed record, the chat business rules and the Data Dictionary descriptions. The database column `"Transfer Fee"`, the API key `transferFee`, the command catalogue and the reporting views keep their names: renaming the column would touch about twenty dependent functions and views (V22, V42, V44, V45, V53, V83, the reporting and Metabase models, the agent manifest) for no behaviour change, and migrations are immutable. The dictionary entry for the column gets the business name "Documentation Fee (column `Transfer Fee`)". → Decision [D1](#9-decisions-for-the-owner).
- The label changes for every loan type (one field, one name). Behaviour is unchanged: the fee is added to the first-day charge interest of daily-interest and daily-instalment loans and netted off at disbursement. (Existing fact, not changed here: a fixed-due-date loan has no first-day charge, so a fee entered on it is never charged.)
- **Default:** when the type becomes Daily instalment on a new loan, and whenever the principal changes on a new Daily instalment loan, the fee is set to round-half-up(principal × 10%) in whole baht (same rounding helper as `tenth()`). A fee the Partner has typed is kept: the form remembers which derived fields were edited by hand (per field) and stops overwriting them; clearing a field restores the default on the next principal change. The default never applies when editing an existing loan.

### 3.2 Duration (A2)

- On a new loan, when the type becomes Daily instalment and the due date is empty, or when the loan date changes and the due date has not been edited by hand: Due Date = Loan Date + 24 days (T = 25, loan date is day 1). The field stays editable with the existing minimum (loan date). The helper line under it reads "25 days, loan date is day 1" / "25 วัน นับวันที่กู้เป็นวันที่ 1" and recounts when either date changes.
- Interest Payment Interval keeps its default 1.

### 3.3 Daily payment, daily principal and interest (A3)

- Default Daily Payment Amount = round-half-up(principal × 5%) in whole baht, set with the type and re-derived on principal change under the same "not edited by hand" rule.
- Two read-only helper lines under the Daily Payment field, computed in the form from the SQL formula so they match the charges the engine will generate:
  - "Daily principal ฿400 · daily interest ฿100 (1.00% of principal per day)"; when P mod T > 0 it adds "· first N days +฿1 principal" so the Partner sees the remainder rule.
  - "Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000".
- Validation is unchanged: whole baht, daily payment × T > principal, T ≥ 1. The existing `installment` error message stays.

### 3.4 Cash issued forecast (A4)

- A "Cash to borrower" line appears on the new-loan form for daily-interest and daily-instalment loans: principal − documentation fee − first-day payment, where first-day payment = daily payment (instalment) or daily interest (daily interest) plus the fee, in the engine's words: "฿8,500 = ฿10,000 principal − ฿1,000 documentation fee − ฿500 first-day payment". It is computed with the same components as `first_day_components_v83`, so it equals the cash movement the save will create. The confirm step is the existing Save (no new confirm page for an ordinary loan).

### 3.5 Charges (A5)

No change to `generate_due_charges`, the first-day charge, forecasts or Upcoming Charges.

## 4. Part B — rollover

### 4.1 Business rule (owner's B2, B3, B5, B6, made exact)

Given an original loan O (open daily instalment) on the rollover day D (the Bangkok business date):

| Symbol | Meaning | Source |
| --- | --- | --- |
| P₀, DP₀, T₀, Due₀ | Original principal, daily payment, term (Due₀ − Loan Date₀ + 1) and due date | `"Loans"` |
| L | Latest charge date of O (always exists: the first-day charge) | `"Charges"` |
| Unpaid | Sum of `"Amount Remaining"` (principal + interest + late charge) over O's existing charges | `"Charges"` |
| R | Remaining days of the original schedule = max(0, Due₀ − L) | derived |
| Missing principal | Outstanding principal − unpaid principal already on charges | same rule as `loan_close_calculation_v83` |
| Remaining interest | DP₀ × R − missing principal (must be ≥ 0) | same shape as the V8 formula |
| Penalty | Default 4 × DP₀, whole baht, editable, 0 allowed | form input |
| **Settlement S** | Unpaid + missing principal + remaining interest + penalty | the deduction for O |

The closing of O on day D is one charge dated D with `"Principal Due"` = missing principal and `"Interest Due"` = remaining interest + penalty (id prefix `rl138:`, Notes "Rollover to loan <new key>: remaining R days × ฿DP₀ = …, early closure penalty ฿…"), followed by one payment of S on O with allocation method `Loan Close`, payment method `Net-off at Disbursement`, received on the new loan's disbursing account, dated D. The ordinary engine then marks O closed with that payment as its closing payment, books the referral rebate if O is referred, and refreshes the borrower totals. The penalty is profit on D because it is interest paid (B6); the remaining interest is also recognized on D rather than over the remaining days, which is the point of the early closure. "Payment for the remaining days" (B3) is therefore DP₀ × R, split into principal and interest exactly as the schedule would have split it, and the unpaid balance of earlier charges is settled in the same deduction so that O can close. → Decisions [D3](#9-decisions-for-the-owner), [D4](#9-decisions-for-the-owner).

New loan N on day D: an ordinary daily instalment loan created by the same request with the prefilled terms (edited or not), its own first-day charge and first-day net-off as today. Cash on the ledger for D on the disbursing account: − P (disbursement of N) + (DP + fee) (N's first-day net-off) + S (O's settlement). Net cash issued = P − fee − DP − S, the owner's B3 with the unpaid balance made explicit.

Worked example (owner's numbers, rollover on day 18 of 25, all charges paid): R = 7, missing principal 2,800, remaining interest 700, penalty 2,000, Unpaid 0 → S = 5,500. New loan 10,000 at the same terms: cash issued = 10,000 − 1,000 − 500 − 5,500 = **3,000**. Profit recognized on D: 1,000 (fee) + 100 (first-day interest of N) + 700 (remaining interest of O) + 2,000 (penalty) = 3,800; principal received on O: 2,800 (O fully recovered); principal lent on N: 10,000.

Guards: O open, type Daily instalment, Auto Charge Enabled, not Defaulted, no principal-loss posting, no `Processing` or `Error` payment for the borrower, D ≥ Loan Date₀, charge components reconcile (no over-paid charge), S whole baht and > 0, remaining interest ≥ 0, cash issued ≥ 0 (→ [D6](#9-decisions-for-the-owner)), N passes the ordinary loan validation. A rollover is posted only with D = today, like Loan Close ([D7](#9-decisions-for-the-owner)).

### 4.2 Data and SQL (one migration, V138)

- `loan_rollover_calculation_v1(p_loan, p_day, p_penalty)` → jsonb quote: the table above as fields (`unpaid`, `remainingDays`, `missingPrincipal`, `remainingInterest`, `penalty`, `settlement`), the closing charge mutation, the allocation lines, `sourceVersion` (`pwa_loan_version_v2`) and a `planHash` over the financial state, in the shape of `loan_close_calculation_v83` so the PWA and the command treat it the same way (a changed hash is `source_conflict`).
- `pwa_apply_loan_rollover_v1(canonical)`: the governed apply for operation `loan.rollover`, journal-owner only, one transaction: lock the borrower and both loans; re-run the quote and compare `expectedPlanHash` and the source version; insert O's closing charge; create N through the shared loan-create body (same inputs as `loan.create` plus the link); post O's settlement payment through the explicit plan path (`post_payment_explicit_v6` with allocation method `Loan Close`), received on N's disbursing account; assert O is now `ปิดยอดแล้ว` with that payment as its closing payment and N's first-day effect matches its plan (same assertion as `pwa_apply_loan_create_v2`); return `{ newLoanId, closedLoanId, settlementPaymentId, firstDayPaymentId, statement }`.
- Link between the loans: a nullable column `"Loans"."Ref Rollover Source Loan"` (text, FK to `"Loans"`, set only by the rollover apply) so the loan record, lists and reports can say "Rollover of …" and "Rolled over to …" without parsing the journal. A new column needs the owner's authorization → [D5](#9-decisions-for-the-owner); the fallback is to derive the pair from the `loan.rollover` journal row (`result_json`), which is enough for the two loan pages but not for views.
- Read routes (reader service): `GET /api/loan-records/:id/rollover-preview?day=&penalty=` returns the quote plus N's prefill (type, principal, fee, T₀, DP₀, interval, arrangement note in both languages); `GET /api/loan-records/:id` adds `rolloverSourceLoanId` / `rolledOverToLoanId` with their display keys. Command contract: `loan.rollover` with `targetId` = N's new uuid, `expectedVersion` null (create), inputs = the `loan.create` inputs + `sourceLoanId`, `sourceExpectedVersion`, `penalty`, `expectedSettlement`, `expectedPlanHash`.
- Business consequences that need no new code: `close_payment_loans`, borrower totals, `create_referral_rebate` (offset by default when D is today), the cash ledger projection, the "Payment received" push (content v5 shows the settlement; wording check in the test plan), Collection and Upcoming (O disappears as closed, N appears with its schedule).
- Corrections stay the ordinary ones (no new reversal framework): deleting the settlement payment reopens O and leaves the `rl138:` charge editable or deletable, as Loan Close does today; N is then deleted like any unpaid new loan. The implementing session documents this in the source-correction table.
- Chat and agent: the `loan.rollover` operation is not added to the chat command catalogue in this release (the owner can ask for it later); the chat business rules gain the instalment early-close path ("rollover in the app") in place of "no early-close path". The Instagram agent is untouched. Metabase and the income statement need no change: fee and penalty flow through `"Interest Paid"`; an optional "Rollover penalties received" memo line is a later request.

### 4.3 Operation flow (PWA)

```
Loan record (open daily instalment) ── Rollover ──▶ Rollover loan form (online only)
   prefilled from O; penalty field; live Rollover statement; reads /rollover-preview
   ──▶ Review rollover ──▶ Confirm page (statement + both loans) ──▶ loan.rollover
   ──▶ Result: new loan record opens, toast "Loan <O key> closed · ฿3,000 issued"
```

## 5. User experience summary

### 5.1 New loan form (Part A)

- Field order unchanged; the fee field reads "Documentation Fee" / "ค่าธรรมเนียมเอกสาร" with the existing ±100 stepper.
- Choosing Daily instalment on a new loan fills Documentation Fee (10%), Due Date (+24 days) and Daily Payment Amount (5%) at once; the Partner sees the three fields change and the helper lines appear. Fields they then edit are not overwritten; changing the principal re-derives only the untouched ones.
- Helper lines (read-only, under the fields, same style as the daily-interest "Daily Interest Rate" line): "25 days, loan date is day 1"; "Daily principal ฿400 · daily interest ฿100 (1.00%/day)"; "Total ฿12,500 over 25 days · interest ฿2,500 + documentation fee ฿1,000"; "Cash to borrower ฿8,500 = ฿10,000 − ฿1,000 documentation fee − ฿500 first-day payment".
- Save behaves as today (offline queueing included); no new confirm page.
- Thai wording: ยอดชำระรายวัน (daily payment), เงินต้นต่อวัน (daily principal), ดอกเบี้ยต่อวัน (daily interest), เงินสดที่จ่ายให้ผู้กู้ (cash to borrower), ค่าธรรมเนียมเอกสาร (documentation fee).

### 5.2 Loan record

- New action "Rollover" / "ต่อสัญญาใหม่" in the action row, between Close Loan and Default Loan, shown only for an open, auto-enabled, non-defaulted daily instalment loan; disabled offline (online-only like Close Loan).
- A loan created by rollover shows "Rollover of <O key> · closed <date>" under its heading with a link to O; O shows "Rolled over to <N key> · <date>" with a link to N (needs [D5](#9-decisions-for-the-owner) or the journal fallback).

### 5.3 Rollover loan form

- Heading "Rollover loan · <borrower>" / "ต่อสัญญาใหม่ · <ผู้กู้>". The same loan form in rollover mode: Loan Date fixed to today (read-only, with the business date), type preselected and locked to the original type, principal, documentation fee, due date (today + T₀ − 1), daily payment and interval prefilled from O and editable, disbursing account defaulted as today.
- Loan Arrangement prefilled with the bilingual note on two lines, followed by a blank line and O's own arrangement text:
  `Rollover of loan <O key> (loan date 15/10/2026, principal ฿10,000, daily payment ฿500, due 08/11/2026), closed on 01/11/2026 with early closure penalty ฿2,000.`
  `ต่อสัญญาจากสินเชื่อ <O key> (วันที่กู้ 15/10/2026 เงินต้น ฿10,000 ยอดชำระรายวัน ฿500 ครบกำหนด 08/11/2026) ปิดเมื่อ 01/11/2026 ค่าปรับปิดก่อนกำหนด ฿2,000`
  The Partner can edit it.
- New field "Early closure penalty (original loan)" / "ค่าปรับปิดสินเชื่อเดิมก่อนกำหนด", whole baht, stepper ±DP₀ (one day of payment per step), default 4 × DP₀, helper "4 days × ฿500".
- **Rollover statement card** (B4), always visible under the fields, recomputed on every edit (the O side from the server quote, the N side from the form):

  | Rollover statement — 01/11/2026 | ฿ |
  | --- | ---: |
  | New loan principal | 10,000 |
  | − Documentation fee | 1,000 |
  | − First-day payment (day 1 of 25) | 500 |
  | **Available for disbursement** | **8,500** |
  | Settlement of loan <O key> | |
  | − Unpaid charges to date | 0 |
  | − Remaining 7 days × ฿500 (principal ฿2,800 · interest ฿700) | 3,500 |
  | − Early closure penalty (4 × ฿500) | 2,000 |
  | **Deducted for the original loan** | **5,500** |
  | **Cash issued to borrower** | **3,000** |
  | Profit recognized today (fee, first-day interest, remaining interest, penalty) | 3,800 |

  The last line is a memo in the smaller help style. A negative cash figure turns the card into a blocking message "Cash issued would be negative (−฿X). Raise the principal, lower the penalty or record the borrower's payment of the difference first." and disables Review ([D6](#9-decisions-for-the-owner)).
- Button "Review rollover" / "ตรวจสอบการต่อสัญญา" → the standard confirm page (`OperationConfirm`) showing the statement card, the new loan's terms list and the two cash lines (disbursing account, "Net-off at Disbursement"), then Confirm. A quote that changed between the form and Confirm (payment posted meanwhile, charge edited) shows "Original loan balances changed. Review the current statement." with a "Use current statement" button, as Loan Close does.
- Result: the new loan record opens; a status line "Loan <O key> closed by rollover · ฿3,000 issued to <borrower>" (and the rebate line when O was referred, in the existing Loan Close wording). The settlement payment appears in O's payments and in Payments with notes "Rollover to <N key>".
- Draft: the rollover form keeps a device draft like the other forms, but the statement is re-quoted on restore (never saved), and the operation is online only (like Loan Close): offline the page says "Connect to review the rollover".
- Errors: `source_conflict` (quote changed), `rollover_ineligible` (loan closed, defaulted, wrong type or a Processing payment: message names the reason), `invalid_request` (new-loan validation, same messages as the loan form), `command_busy` (retry same request, as elsewhere).

### 5.4 Where else it shows

- Payments list and Payment record: the settlement is an ordinary payment with method Net-off at Disbursement and allocation Loan Close; its notes name the new loan. Payment history of the borrower shows two net-off receipts on D (O's settlement and N's first-day).
- Cash: on D the disbursing account shows the disbursement of P out and the two receipts in; the Cash Position and the daily statement already present net-off receipts.
- Collection and Upcoming: O leaves the board as closed; N appears with its first charge due tomorrow (interval 1). Push: the existing "Payment received" push fires for the settlement (and for N's first-day net-off, as it does for any new loan today).
- Chat: answers about an instalment loan's early close point to the Rollover action; it cannot post one in this release.

## 6. Out of scope (this release)

Rollover of daily-interest or fixed-due-date loans ([D2](#9-decisions-for-the-owner)); a partial rollover (new principal smaller than the settlement, cash issued negative); chat or Instagram agent posting a rollover; renaming the `"Transfer Fee"` column; a fee or penalty column; changes to the charge generator, Loan Close, Receive payment or reports.

## 7. Proportional validation (Archie's compact test plan, to confirm at implementation)

Behaviour class: financial logic plus a new SQL operation and a UI flow. Checks, each once per tree:

1. Unit (Node): defaults and helper lines for Part A (10%, +24 days, 5%, remainder rule, not-edited-by-hand rule, cash-to-borrower line), the rollover statement arithmetic including R = 0 (past due), Unpaid > 0, penalty 0, negative cash, and the bilingual arrangement note.
2. Database (disposable PostgreSQL, the `database.yml` groups): `Test-Rollover.sql` covering the quote and apply on the owner's example (day 18 of 25), a loan past its due date with unpaid charges, a referred original loan (rebate booked and offset), an overpaid charge (refused), a stale hash (refused), a Processing payment (refused), the cash ledger lines for D, O closed with the settlement as closing payment, borrower totals, and the reversal path (delete settlement → O reopens; delete N).
3. Integration (command service): `loan.rollover` idempotency by request id, `source_conflict`, `rollover_ineligible`, version hashes of both loans after the apply, the journal row.
4. Browser: one Playwright spec on the loan form defaults and one on the rollover flow (record → form → statement → confirm → result), run in the CI shards on Chromium and iPhone WebKit; Echo's pass on the DEV build on the iPhone profile.
5. Data Dictionary: the new function, operation, column (if [D5](#9-decisions-for-the-owner)) and the renamed labels; `npm run check:docs`.

## 8. Delivery notes for the implementing session

- One release (R136, currently open with no scope), DEV first then PROD on the owner's instruction, with a verified PROD backup before V138 (a production database change). Images: read, command and chat (schema digest) plus Hosting; notify and jobs only if the push wording changes; no infrastructure or VM change.
- One-writer boundaries: `database/migrations/V138__*.sql` and `scripts/database/Test-Rollover.sql` (Byte, SQL); `services/business/loans.mjs`, `services/contracts/operation-command.mjs`, the reader route and the command handler (Byte, services); `apps/pwa/src/LoanForm.tsx`, `loan-form-values.ts`, `LoanRecord.tsx`, a new `rollover-statement.ts` (Byte, PWA); tests (Chase); records and dictionary (Dewey). Forge: not applicable unless a new Cloud Run variable is needed (none foreseen).
- Keep the chat `schema-digest.json` and `conversation-business-rules.md` in the same batch (new function and the early-close rule), since the digest changes start a new chat history epoch.

## 9. Decisions for the owner

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Rename only the labels (column `"Transfer Fee"` and API key `transferFee` stay) or rename the column too? | Labels only; no behaviour change, no migration churn |
| D2 | Rollover scope: daily instalment only in this release, or daily-interest loans too (they already have a payoff quote; a rollover would reuse it with the penalty added)? | Instalment only now; daily interest as a follow-up on the same operation |
| D3 | Include the original loan's unpaid charges to date in the deduction (the loan then closes fully), or require them to be paid separately before a rollover is offered? | Include them; the statement shows the line |
| D4 | Record the penalty and the remaining interest as `"Interest Due"` of one closing charge on the original loan (profit on the rollover date, in the referral rebate basis), with the breakdown in the charge notes? | Yes; it matches how the fee is recorded today and needs no new column |
| D5 | Authorize one nullable column `"Loans"."Ref Rollover Source Loan"` to link the two loans? | Yes; otherwise the link is derived from the journal and unavailable to views |
| D6 | Refuse a rollover whose cash issued would be negative (the borrower must first pay the difference or the terms change)? Zero allowed? | Refuse negative; allow zero |
| D7 | Rollover date = today only (like Loan Close), no back-dating? | Yes |
| D8 | The rollover close of a referred loan books the referral rebate like any other close (default offset when the referrer has an open loan)? | Yes, no exception |
| D9 | New loan duration on rollover = the original term T₀ (owner's "same duration"), with 25 as the fallback when T₀ is unknown? | Yes |
| D10 | Penalty stepper step = one day of payment (DP₀), default 4 days? | Yes |
