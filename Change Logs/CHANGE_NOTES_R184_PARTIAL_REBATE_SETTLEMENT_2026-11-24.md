# Change notes — R184 Partial and offset referrer rebate settlement, 24 November 2026

## Purpose
Owner request of 24 November 2026 (verbatim): "Currently the unpaid rebate for referrers had to be paid in total. I want to have an option to pay a portion of the unpaid rebate amount, and also allowing me to pay to outstanding charges of the referrer if there's any outstanding charges, or pay directly to referrer (same way as current full payment)". The owner asked that Echo review the proposed UI/UX. Status: In development; nothing is implemented, built, deployed or promoted yet.

Authority: the new table and the new column below (V155) were authorized by the owner on 24 November 2026: asked "Partial rebate payments need a schema change (migration V155): a new table pwa_rebate_settlement_allocations … and a new column pwa_rebate_settlements.offset_payment_id …, plus a backfill of one allocation row per existing settlement. … Do you authorize this?", the owner answered "Authorize". In the same answer the owner chose the offset reach "Same as Loan Close" (due charges first, then future charges up to 93 days) and "Keep the push" for an offset settlement. Promotion authority: none yet.

Team: Archie (Fable 5.2, high, escalated for the financial design), Echo (Opus 5.5, high, escalated for a new flow), Dewey (default). Byte and Chase start after the authorization. Forge: not applicable (no infrastructure; SQL migration only; the V155 owner window is a promotion matter).

## Changes
Agreed design, not yet implemented. Baseline `9e64b48` on branch `claude/pensive-allen-9x8ht7`.

Archie's decisions:
- D1 Partial amounts live in a new allocation table, one row per settlement and rebate.
- D2 Pending stays derived: Amount minus the close-time offset minus the sum of allocations. `pwa_rebate_pending_v1` and `pwa_rebates_owed_v1` are replaced in place; no notify v6.
- D3 Existing settlements are not rewritten. The migration backfills one allocation row per already-linked expense and self-checks that every settlement's allocations sum to its amount and every referrer's owed total is unchanged.
- D4 `"Business Expenses"."Ref Rebate Settlement"` is kept and means the most recently recorded settlement applied to the rebate (null exactly when no allocation exists), so the offline delta, the "Remove the settlement first" guard and list reads keep working.
- D5 The client sends per-rebate lines `{expenseId, amount, expectedPending}`; a stale `expectedPending` is rejected; the page applies oldest close first, tie-break expense id.
- D6 "Pay to outstanding charges" is an offset settlement that reuses the Loan Close offset machinery (`pwa_pay_forward_plan_v1`, a `system.rebate-offset` journal row, `pwa_apply_pay_forward_v1`, a payment with method `Referral Rebate Offset` on the referrer). New read-only `pwa_rebate_offset_plan_v1` gives eligibility, covered amount, lines and a plan hash used by both preview and command.
- D7 Cash: direct is one Rebate Settlement movement out of the chosen Lisa account, as today. Offset is that movement out of Lisa's default account plus the offset payment's receipt into it, net zero.
- D8 Expense recognition and the Partner split are unchanged.
- D9 An offset is dated today (Bangkok); a direct payment keeps today's date rule.
- D10 Any settlement can be deleted in any order. Deleting an offset settlement removes its payment through the existing engine (charges become unpaid, booked future charges stay, a loan it closed reopens) and is refused as `dependency_conflict` when the engine refuses.
- D11 Tiles: paidToDate is direct settlements plus legacy paid-at-close; offsetToDate is close-time offsets plus offset settlements; total is unpaid plus paid plus offset.
- D12 Cash Position "Rebates payable" uses the D2 rule through `pwa_rebate_pending_v1`; the Node mirror in `rebate-state.mjs` goes.
- D13 The apply result returns `rebateSettlement {destination, amount, owedAfter, offsetPaymentId, lines}`; one counted widening of the journal CHECK.
- D14 A direct settlement sends no push (as today). An offset settlement posts a payment, so the existing "Rebate offset" push fires.

Schema for owner authorization (V155, not yet written):
- New table `public.pwa_rebate_settlement_allocations`: `settlement_id` text NOT NULL FK to `pwa_rebate_settlements(id)`; `expense_id` text NOT NULL FK to `"Business Expenses"("Row ID")`; `amount` numeric NOT NULL, whole baht, greater than 0; primary key `(settlement_id, expense_id)`; index on `expense_id`.
- New column `pwa_rebate_settlements.offset_payment_id`: text, nullable, unique, FK to `"Payments"("Row ID")`.
- Constraint changes: the settlement method CHECK admits `Referral Rebate Offset` exactly when `offset_payment_id` is set; the journal CHECK admits `rebateSettlement`.
- The D3 backfill.
- No routine version bumps. Replaced in place: `pwa_rebate_pending_v1`, `pwa_rebates_owed_v1`, `pwa_apply_rebate_settlement_v1`, `calculate_business_expense`, `pwa_submit_operation_v2`. New: `pwa_rebate_offset_plan_v1`.

Echo's proposal review (accepted for implementation):
- PAY-PART-01 destination before amount. PAY-PART-02 the tick list shows applied/unpaid per row and the footer counts only rebates that get more than ฿0. PAY-PART-03 a typed amount is never changed silently; "Pay in full" restores the default. PAY-PART-04 help line wording. PAY-PART-05 numeric keypad attributes. PAY-PART-06 error and disabled states, including a visible offline line. PAY-PART-07 live region updates on ticks, destination and amount blur. PAY-PART-08 footer "Pay ฿X · N rebates" / "Offset ฿X · N rebates".
- PAY-DEST-01 same plan and preview as Loan Close. PAY-DEST-02 "Settle by" fieldset, "Payment to referrer" / "Offset to referrer's loan". PAY-DEST-03 default Payment to referrer. PAY-DEST-04 never switch destination silently. PAY-DEST-05 date locked to today on offset. PAY-DEST-06 one destination per settlement, with "Pay the rest". PAY-DEST-07 Review rows. PAY-DEST-08 result page from the server's `owedAfter`.
- REF-01 to REF-06: referrer detail, history rows, tiles, settlement detail, delete confirm text, and the expense record showing "part paid" with a link per settlement.

## Checks
Planned (Archie's test plan); results to be filled in after Byte and Chase run them.

| Command | Result |
| --- | --- |
| Real SQL on a disposable cluster, extending `scripts/database/Test-RebateSettlement.sql`: partials, second partial and delete order, each rejection, offset including loan close and delete, legacy 7-key create, replay, end invariants, access matrix | Not yet run |
| Upgrade proof from head 154 | Not yet run |
| `tests/integration/rebate-settlement-independent.test.mjs` (two connections) | Not yet run |
| Unit: canonical twin, oldest-first helper, state mapping, tile identity | Not yet run |
| `tests/e2e/referrers-independent.spec.ts`, one UI path on iPhone WebKit | Not yet run |
| `Development checks` on the pull request (the one broad run) | Not yet run |
| `npm run check:docs` (Dewey) | Not yet run |

## Not run
Nothing is skipped yet; every check above is still to run. Byte must confirm three items Archie did not verify: the row-change trigger logs an UPDATE whose values did not change (D4 relies on it for deleting a non-newest settlement); the payment engine's behaviour when an offset is deleted after a later payment closed the loan; whether the plan's due step includes kept charges of a defaulted loan.

## Recovery
Git baseline `9e64b48` (R183 closed, branch `claude/pensive-allen-9x8ht7`). Nothing is applied to DEV or PROD yet. Once V155 exists, recovery needs a verified restorable PROD backup before the migration, per the hard rules.

## Open questions
- Answered 24 November 2026: the owner authorized the new table, the new column and the constraint changes (see Authority).
- Answered 24 November 2026: offset reach is the Loan Close plan (due charges first, then future charges to the 93-day horizon), with the amount defaulting to what is due now; the existing "Rebate offset" push stays for an offset settlement. Orchestrator default, open to the owner: the default destination is Payment to referrer (Loan Close preselects the offset).

## Remaining work
Byte implemented the batch locally (commits `c2601a4`, `a42dc1b`, `b4145bd`, `9fa3a27`, `d424951`; pushed unverified on 24 November 2026 only to keep the work safe in an ephemeral cloud container, with CI skipped on that push). Chase (verification) and Echo (review of the built UI) are in progress; then corrections; the full documentation pass; the pull request and its Development checks; DEV deployment and the V155 owner window, then PROD on the owner's instruction.
