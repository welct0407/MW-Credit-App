# MW Credit business rules for the Partner conversation assistant

Draft, 21 October 2026. Written for the model that answers Partner questions in the persistent conversation, and for the owner to confirm. Every rule below is read from the SQL in `database/migrations` (cited as `V<n>:<line>`) or from a maintained document; nothing is invented. Section 15 lists the points the code leaves to the owner.

## 1. How to use this reference

- Live data wins over this document; this document wins over your own assumptions. Read the current rows each turn, then apply these rules. Never guess a term, date, amount or rule that neither the data nor this document gives you; say what is missing.
- Give the data date with every figure. Trigger-maintained totals and `olap_*` / `reporting_*` views are live; `"Daily Analytics"` snapshots can be up to an hour old (section 13).
- Show the components, then the total: principal, interest, fees, expenses and losses are different measures and Partners check them separately. Keep them distinct.
- Money is Thai baht. Inputs and stored amounts are whole baht almost everywhere; present whole baht.
- Dates and "today" are Asia/Bangkok. A day count is a whole number of calendar days; there is no partial-day interest anywhere in the system.
- When a rule has an open owner decision (section 15), apply the stated default and say that you did.

## 2. Vocabulary

| Thing | Values (Thai = stored value) | Meaning |
| --- | --- | --- |
| Loan type `Loans."Loan Type"` | `ดอกเบี้ยรายวัน` | Daily Interest: interest only, charged every N days; principal repaid at close |
| | `กำหนดวันชำระ` | Fixed Due Date: one charge on the due date with all principal and the fixed interest |
| | `ผ่อนชำระรายวัน` | Daily Installment: every N days a charge carrying a principal share plus interest |
| Loan status `"Loan Status"` | `ยังไม่ปิดยอด` / `ปิดยอดแล้ว` | open / closed |
| Charge status `"Payment Status"` | `รอชำระ` / `ชำระบางส่วน` / `ชำระแล้ว` | unpaid / partly paid / paid. Every charge of a closed loan shows `ชำระแล้ว` even if a balance remains (V12:32-33) |
| Payment status `Payments."Status"` | `Processing` → `Posted` (or `Error`) | Only `Posted` payments count (V6:56-59) |
| Charge id prefixes | `fd6:` first-day, `cg8:` generated, `lc7:` loan-close final, `df10:` default loss | anything else is a manual charge |
| Partners | role A = Tommy, role B = Lisa (V31:52) | capital contributors and operators |
| "Settlement" (`"Settlements"` table) | Pending / Completed / Cancelled | a profit payout to a Partner, not a loan payoff. For a loan payoff say "close" or "payoff" |

## 3. Loans and interest

- Term columns (V1:329-349): `"Principal Amount"`, `"Loan Date"` (start; also the first-day charge date), `"Due Date"` (Fixed: the one due date; Installment: last day; Daily: unused for charging), `"Current Daily Interest"` (Daily loans: baht per day, an amount not a rate), `"Fixed Interest"` (Fixed loans: total interest in baht), `"Daily Payment Amount"` (Installment: baht per day, principal plus interest), `"Interest Payment Interval"` (N days between charges), `"Interest Schedule Anchor Date"` (optional schedule origin, ≥ Loan Date, V5:3-12), `"Transfer Fee"` (added to the first-day charge interest), `"Auto Charge Enabled"`, `"Original Daily Interest Rate"`.
- Term length T = `"Due Date"` − `"Loan Date"` + 1 days (both ends counted).
- `"Original Daily Interest Rate"` is a whole percent per day, frozen at creation and read-only afterwards (V53:3-7; V68:12-17): round(100 × original average daily interest / original principal). 1 means 1% per day. It is NULL for old loans without evidence.
- Daily loans: after any principal repayment the daily amount is recomputed from the frozen rate, `"Current Daily Interest"` = round(max(0, Outstanding Principal) × rate / 100), whole baht (V68:22-34; V45:99-112). So paying principal lowers later interest. If principal is unchanged the daily amount keeps its value; a direct edit of it is reverted (V68:35-37). A principal payment mid-cycle does not split the period: the next charge applies the new daily amount to all days since the last charge (V8:43).
- Trigger-maintained loan totals (V12:49-57): `"Total Principal Received"`, `"Total Interest Received"`, `"Total Amount Received"`, `"Outstanding Principal"` = `"Principal Amount"` − `"Total Principal Received"`.
- `"Effective Daily Interest Rate"` in `olap_loans_analytics` (V26) is a reporting fraction per day on outstanding principal, 4 decimals; it is not the contractual rate.

## 4. Charges

- Generation runs once a day at 00:05 Bangkok (`pwa_job_run_v1('daily-charges')` → `generate_due_charges(today)`, V94:83) for open loans with `"Auto Charge Enabled"`, only for that business date, never backfilled, and never twice for the same loan and date (V8:29-34, 81-86). Manual generation is for today only.
- Daily Interest loan (V8:35-44): anchor = `"Interest Schedule Anchor Date"` or `"Loan Date"`. Charges fall on anchor + N, anchor + 2N, …, never on the anchor day. Interest = `"Current Daily Interest"` × (charge date − last charge date on or before it, or Loan Date if none). Principal = 0. The day count runs from the last actual charge, so a missed day is caught up at the next charge.
- Fixed Due Date loan (V8:45-49): one charge on `"Due Date"`: principal = outstanding principal, interest = `"Fixed Interest"` in full. No first-day charge.
- Daily Installment loan (V8:50-63): base = floor(P/T), r = P mod T. On each due day (every N days after Loan Date, and on Due Date): principal = base × elapsed days + the remainder spread one baht per day over the first r days; interest = `"Daily Payment Amount"` × elapsed − principal.
- First-day charge (V6:247-281; V83:181-203): auto-enabled Daily and Installment loans get a charge dated Loan Date (`fd6:`): Daily: interest = `"Current Daily Interest"` + `"Transfer Fee"`; Installment: principal = base (+1 if r > 0), interest = daily payment − principal + fee. It is paid at once by a `First-day Auto` / `Net-off at Disbursement` payment, deducted from the disbursement.
- Charge row (V1:215-222; V12:3-12): `"Charge Date"` is also the due date; `"Principal Due"`, `"Interest Due"` (the transfer fee sits inside interest; there is no fee column); derived `"Principal Paid"`, `"Interest Paid"`, `"Total Paid"`, `"Principal Remaining"`, `"Interest Remaining"`, `"Amount Remaining"`, `"Payment Status"`.
- Generated charges are not rounded; they inherit input precision. Whole baht is enforced on the daily amount after a principal change, on forecasts, on the loan-close total and on first-day components.
- Forecasts: `forecast_schedule_v1` (V53:87-192) simulates the same formulas from tomorrow. `oltp_upcoming_charge_events_v1` (V54) lists each loan's coming due dates with amounts and a `Basis` of Recorded or Projected, after today only, within 93 days. Forecast rows are not obligations until generated.

## 5. Payments and allocation

- A `Payments` row is one receipt from one borrower: `"Amount Received"` (positive whole baht, V6:64-67), `"Payment Date"` (not after today), `"Created At"` (receipt transfer time, V30), `"Payment Method"` (`Bank Transfer`, `Cash`, `Net-off at Disbursement`), `"Allocation Method"` (`Single Full`, `Single Partial`, `Receive All`, `Lump Sum`, `First-day Auto`, `Loan Close`, `Selected Charges`, V51:91-93), `"Ref Target Charge"` / `"Ref Target Loan"` / `"Selected Charge IDs"`, receiving account and holder, `"Created By"`, `"Status"`.
- Posting creates one `"Payment Allocations"` row and one `"Repayments"` row per charge paid (interest, principal, amount) and one `"Cash Ledger"` `Payment Receipt` row for the full amount (V6:119-131; V23:350-353).
- Automatic allocation order (Lump Sum, Receive All, Single, Loan Close): charges newest first (`"Charge Date"` descending), interest before principal within a charge (V2:82-94; V6:110-125; V51:147-162). The app's Auto-assign uses the same order and only charges due by today. Older charges can therefore stay unpaid while newer ones are paid.
- App "Record payment" (command v6/v7) posts an explicit per-charge plan exactly as submitted (`post_payment_explicit_v6`, V82:260-334): each line ≤ that charge's remaining principal and interest, lines sum to the amount, date today or yesterday (V96:117). If balances changed since the Partner looked, it is rejected (`selection_unavailable`).
- Which charges each method can pay (V51:68-76, 137-146): Receive All and Lump Sum: all the borrower's charges dated ≤ payment date (Receive All must equal their total; Lump Sum ≤ it); Selected Charges: the listed charges, exactly their total; Loan Close: every charge of the target loan, exactly the payoff; First-day Auto: the loan-date charge.
- Overpayment is impossible: every path rejects an amount above the eligible balance (V51:144-146; V2:98-99). There is no credit balance, advance or carry-forward. Partial payment is allowed (`Single Partial`, `Lump Sum`, partial plan lines); the charge becomes `ชำระบางส่วน`.
- On Daily Interest loans the generated charges carry no principal, so Lump Sum, Receive All and Auto-assign cannot repay principal; principal is repaid through Loan Close or a manual charge that carries principal.
- While a borrower has a payment in `Processing` or `Error`, new payments for that borrower are refused (V6:77-80).
- A loan closes automatically after any payment once principal paid ≥ principal and every charge is fully paid (V6:32-49).

## 6. Settlement of a loan (payoff) today

- Only an open, auto-enabled Daily Interest loan has a payoff function (V83:408). The authoritative figure is `SELECT public.loan_close_calculation_v83(loan_id, bangkok_today)` (read-only; returns `amount`, `allocations`, `mutation`, `planHash`; raises P0001 for an ineligible loan). Prefer calling it over recomputing.
- What it computes (V83:400-435): missing principal = outstanding principal − unpaid `"Principal Due"` already on charges. If no charge is dated today: gap interest = `"Current Daily Interest"` × (today − latest charge date, or Loan Date if none), and a final charge `lc7:` is added for today with that principal and interest. If a charge is dated today: no gap interest; the missing principal joins that charge. Payoff = sum of unpaid principal and interest on every charge of the loan, including the new one. Whole baht, positive, date must be today.
- So "pay every 3 days, asked on day 2": payoff = outstanding principal + unpaid balances of earlier charges + daily interest × 2 days (from the last charge or the Loan Date to today). Interest runs through today, full days; there is no discount, penalty, late fee or pro-rata beyond that.
- Worked example: principal 10,000, daily interest 300 (3%), N = 3, no earlier unpaid charge, last charge on day 0. Day 2 payoff = 10,000 + 300 × 2 = 10,600. The first-day charge (300 + fee) was netted off at disbursement and is not owed again.
- Closing posts the receipt as `Loan Close`, sets `"Loan Status"` = `ปิดยอดแล้ว`, `"Close Date"`, `"Closed By"`, `"Ref Closing Payment"` (V59:606-623), and books a referral rebate expense of min(round(10% × interest received), 1,000) for the referrer when the borrower has `"Ref Referrer"` and the loan was not defaulted (V15:151-174).
- Fixed Due Date and Daily Installment loans have no payoff function. "Settle everything today" for them has no encoded rule: owner decision 15.2. Default until decided: state the unpaid charge balances plus the unscheduled outstanding principal, say that the system has no early-close path for this loan type, and that a Partner must handle the close manually.
- "Settle everything" for a borrower = the sum of the payoff of each open loan computed by type as above, plus any unpaid charges of closed loans (open balances on closed loans still accept payments).

## 7. Measures: what to sum, and what not to

| Question | Use | Do not use |
| --- | --- | --- |
| Charges due today / amount due | Σ `"Amount Remaining"` of the borrower's charges dated ≤ today with remaining > 0 (what `Receive All` must equal, V80:85-89) | forecast rows |
| Unpaid interest | Σ `"Interest Remaining"` on the loan's charges | |
| Outstanding principal | loan `"Outstanding Principal"`; borrower `"Total Outstanding Principal"` (V13) | adding `"Amount Remaining"` on top: the principal part of a charge is already inside outstanding principal (double count) |
| Total outstanding (what is owed now) | outstanding principal + unpaid interest (+ gap interest only when quoting a payoff, section 6) | |
| Total paid by a borrower | Σ `"Amount Received"` of `Posted` payments with that `"Ref Borrower"` (= Σ `"Repayments"` with `"Ref Payment"` not null). Say whether `Net-off at Disbursement` first-day receipts are included (owner decision 15.4; default: include and label them) | loan or borrower `"Total Principal Received"` / `"Total Interest Received"` on defaulted loans: they contain the loss entry (section 8) |
| Interest received from a borrower | borrower `"Total Interest Earned"` (= Σ `"Repayments"."Interest Paid"`, V13:29-41); `"Active Loan Interest Earned"` for open loans | charged or accrued interest (not income) |
| Principal lent | borrower `"Total Amount Loaned"` = Σ `"Principal Amount"` | |

- Charge-level balances are never forced to zero; a closed loan can carry `"Amount Remaining"` > 0 while its charges display `ชำระแล้ว` (owner decision 15.3; default: report the stored remaining and the status, both).
- Totals on `olap_portfolio_summary` have no date limit; `reporting_*` views stop at today. Say which you used when a future-dated row could matter.

## 8. Default and loss

- `post_loan_default` (V10:3-64; V60:518-578): requires an open, auto-enabled, non-defaulted loan with outstanding principal > 0 and no payment in progress. It writes every charge down to what was paid (originals saved in `"Notes"`), inserts a loss charge and repayment `df10:` with principal paid = +outstanding and interest paid = −outstanding, no payment and no cash row, sets `"Default Loss Amount"` and closes the loan.
- Effects: outstanding principal → 0; `"Total Principal Received"` rises by the loss; `"Total Interest Received"`, `"Total Interest Earned"`, Total Profit, Operating Income and Partner profit fall by the loss on the default date (signed loss); `"Total Amount Received"` unchanged; no referral rebate.
- When reporting a defaulted loan, show interest actually received and the principal lost (`"Default Loss Amount"`) separately (owner decision 15.6), and say the net.
- Undo Default restores the originals only while the loss rows still match; a defaulted loan's charges and repayments cannot be changed (V69; V70).

## 9. Corrections

- The `Payments` row is the editable source. Correcting any financial field deletes and re-posts its allocations and repayments atomically, undoes a closure it caused, refreshes analytics from the earlier date; the command journal keeps every prior version (V59; V83:577-842). Generated allocation and repayment rows are immutable (V59:398-399). Deleting a payment removes its cash receipt and refunds nothing (V59:333-334).
- Refused: payments on a defaulted loan (Undo Default first), on a manually closed loan (reopen first), in the historical cash opening balance, or dated in the future.
- "Move interest" moves a pure-interest Lump Sum allocation to another charge on the same open, non-defaulted loan (V59:339-380). Cash and the payment are unchanged.
- What to tell a Partner who wants to fix a past payment: use Correct payment or Delete payment on that payment; the system re-posts it in one step and keeps the prior version; no money moves. You may only do this yourself when you are a current AI Reviewer and the Partner explicitly asks in the current message.

## 10. Income and profit

- Income is interest actually received (cash basis): Σ `"Repayments"."Interest Paid"` by `"Payment Date"`. Unpaid, charged or accrued interest is never income (V22:357-359; V34:26, 91; V37:85-87). The loan transfer fee is inside the first-day interest, so it counts as interest income once paid (V83:197-198).
- Default losses are inside income as negative interest on the default date (section 8). `"Profit Last 30 Days"` / `"Profit Last 10 Days"` exclude negative rows (V22:195-196); other 30-day figures include them.
- Net profit = interest received − `"Business Expenses"` for the same period (V22:388; V34:91-93). Net margin = net profit / operating income.
- "Profit of a borrower" (owner decision 15.1; default): gross interest received from that borrower (`"Total Interest Earned"`, signed for defaults), stated as "interest received before expenses". No general expense is allocated to a borrower; the only borrower-linked expense is the referral rebate paid to the referrer, which you may mention.
- "Profit % of principal" for a borrower: lifetime interest received ÷ `"Total Amount Loaned"` (Metabase model 310 "Lifetime interest return"); for a loan `"Principal Recovered by Interest %"` = `"Total Interest Received"` ÷ `"Principal Amount"` (V22:104). Other defined ratios: Return on Active Principal = Active Loan Interest Earned ÷ Total Outstanding Principal (V22:231); Return on Closed Loans = Closed Loan Interest Earned ÷ Closed Loan Principle (V22:264); 30D Return on Average Principal (V22:238, 265); Effective Daily Interest Rate (V26). Name the ratio you used.
- Forecasts, not income: `"Accrued Interest"` = daily interest × days since last charge (V22:117); `"Projected Monthly Profit"` (V22:377); `"Pending Payment Amount"` (unpaid charges, V22:361).

## 11. Partner economics

- Capital: `"Cash Pool Contributions"` (+Contribution, −Withdrawal) per partner (V22:55; V47:6).
- Profit share: for each repayment, a partner's share = that partner's net contributions on or before the payment date ÷ the whole pool on that date; partner profit = round(interest paid × share) per row (V22:54-72; V16:1-3). Negative default rows give negative shares.
- Expenses are split by the same contribution ratio on the expense date (referral rebates on the loan's close date); A gets round(amount × share), B the remainder (V15:64-118).
- `partner_net_profit(partner)` = Σ interest share − Σ expense share (V16:4-17). Available to settle = net profit − non-cancelled settlements (Pending counts as reserved, V60:218-234). `reporting_partner_position_v1` (V47:43-88): `interest_earned` (gross), `expenses`, `net_earned`, `unpaid`, `available`, `capital_share`; entitlement, not cash.
- Partner settlements: Pending / Completed / Cancelled; only Completed moves cash, paid from Lisa (V20:216-218).

## 12. Cash is not profit

- `"Cash Ledger"` (V20) records money movement: payment receipts (full amount, principal plus interest), disbursements, expenses, completed settlements, and manual handover / reimbursement / opening / correction entries. Capital contributions and default losses create no cash entry.
- `"Cash Account Balances"` (V23:238-252): current balance, business cash held, reimbursement / advance due; null until an opening balance exists.
- "Available Cashpool" = contributed capital − outstanding principal (V18); not account cash.
- Never equate cash held with profit; the reconciliation is cash held − advance due − cash pool remaining − (net profit to date − completed settlements) (V35:50-60).

## 13. Data freshness

- Live at read time, using Bangkok today: `olap_*` views, `reporting_*` views and functions, Cash Dashboard, Cash Account Balances, `partner_net_profit`, and the trigger-maintained Loans / Borrowers / Charges totals.
- Hourly snapshots: `"Daily Analytics"` and `"Cash Account Daily Analytics"` (`recent-analytics` job, V94:83); today's row is Provisional (V37:244-247). Quote `"Snapshot Date"` and `"Generated At"` when you use them.
- Today's charges exist only after the 00:05 job ran; before that, the forecast flags "Expected today charge missing" (V53:143-146).

## 14. Answer patterns

- Payoff today, Daily Interest loan: call `loan_close_calculation_v83`; otherwise compute outstanding principal + unpaid charge balances + daily interest × days since the last charge (or Loan Date). State: principal, unpaid charges, gap interest with the day count and daily amount, total, as-of date.
- Total profit of a borrower: list each loan with principal, interest received, status, and default loss if any; give the borrower total of interest received; add the percentage of principal lent; say "before expenses".
- How much has a borrower paid: Σ Posted `"Amount Received"`, split into interest and principal from the repayments, note first-day net-off receipts.
- What is due now: charges dated ≤ today with remaining > 0, newest first as the system would allocate, then the total; add the next forecast due date from `oltp_upcoming_charge_events_v1` as a forecast.
- If the loan type has no encoded rule for the question, say so and give the parts that are defined.

## 15. Open decisions for the owner

Each item has the default the assistant applies until the owner decides.

1. Profit of a borrower: gross interest received before expenses (default), or net of the referral rebate for that borrower, or net of an allocated share of expenses?
2. Payoff for Fixed Due Date and Daily Installment loans paid early: full `"Fixed Interest"` / all scheduled interest, interest to date only, or no rule (default: no payoff quote; report balances and say the close is manual).
3. A closed loan with `"Amount Remaining"` > 0: is the remaining collectable or written off (default: report both the stored remaining and the paid status)?
4. "Total paid" includes `Net-off at Disbursement` first-day receipts (default: include, labelled).
5. Loan Close adds no gap interest when a charge already exists today, and includes future-dated charges in full; it takes the latest charge date including future ones (V83:419). Confirm this is the intended payoff rule.
6. Defaulted loans: report interest received and principal lost separately (default) in addition to the signed net.
7. Mid-cycle principal payment: the new daily amount applies to the whole period since the last charge (as coded). Confirm.
8. Newest-first allocation leaves older charges unpaid; confirm the assistant should explain this ordering when asked why an old charge is still open.
9. Rate frozen as a whole percent (for example 150 on 10,000 = 1.5% → 2%) changes the daily amount after the first principal payment (owner decision R048). Confirm the assistant should explain it from `"Original Daily Interest Rate"`.
