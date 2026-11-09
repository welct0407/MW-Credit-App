# Change notes — R136 daily instalment defaults and loan rollover, design for owner review, 8 November 2026

## Purpose
The owner asked on 8 November 2026 (Asia/Bangkok) for a high-level design and user experience summary of two product changes, to review before implementing them in another session: daily instalment loan defaults (Transfer fee renamed Documentation fee with a 10% default, a 25-day default term counting the loan date as day 1, a 5% daily payment default split into daily principal and interest) and a new Rollover action that closes an open daily instalment loan through a deduction from a new loan's disbursement (early closure penalty, default four days of daily payment, plus the payment for the remaining days), with an income-statement style forecast of the cash issued. The owner's request is the approval for the design document; nothing is implemented, no schema change is authorized and nothing is deployed.

## Changes
- New design document [project/outputs/r136-daily-instalment-rollover/DESIGN.md](../project/outputs/r136-daily-instalment-rollover/DESIGN.md): requirements restated, the current baseline (first-day charge, instalment formula, Loan Close, profit recognition), Part A form defaults, Part B rollover rule, SQL and operation (`loan.rollover`, V138 proposal), user experience summary with the Rollover statement, out of scope, compact test plan, delivery notes and ten decisions for the owner (D1 to D10).
- Archie (A — Architect) and Echo (E — User Experience Officer) reviewed the draft on paper (no build exists); their accepted points are folded into the document. Archie: the settlement cannot use the `Loan Close` method (a payment naming a target loan runs the daily-interest payoff trigger), so it is an explicit `Selected Charges` plan as in R113; the two receipts of one journal row follow the R111 precedent and V138 must redefine `pwa_effective_payment_plan_v2`, its index and the correction head lookup; the closing charge is inserted on the rollover day whether or not a generated charge carries that date; "remaining days" became "days not yet charged"; decisions D11 to D13 and test-plan additions. Echo: R136-UX-01 to R136-UX-09 (never overwrite a typed value, one helper line per field with the totals above Save, Rollover in the Close Loan slot with its own icon, the statement as a label-and-amount list with Thai labels, the penalty field above the card, the negative-cash message, the recounted penalty helper, Cash issued first on Confirm, one name and one result wording). Byte, Chase, Dewey and Forge were not started: no implementation, tests, records beyond this note or infrastructure were in scope.
- Owner review of 8 November 2026: "agree with all recommendations, except the following: 2. include daily interest too, if that's possible. 7. could be yesterday too. 12. … interest should be charged everyday. that's the main income." The design now covers daily-interest loans (the rollover reuses the close quote's components plus the penalty), and a rollover day of today or yesterday (the apply generates the new loan's charge for today when the day is yesterday). On the D12 follow-up the owner then answered "no, charge only up to the due date. i didn't understand the question before.", so an overdue instalment loan owes nothing for the days past its due date and D14 (a generator change) is closed. D5 is authorized: V138 adds the nullable column `"Loans"."Ref Rollover Source Loan"`.
- [Development Changes](../project/Documents/Development_Changes.md): one outstanding-work row for the R136 design.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | Pass, 0 failures and the 4 pre-existing warnings (old unlinked change notes), on the final tree of each commit on `claude/loving-ride-wslera` |

## Not run
Product CI, unit tests, database groups and browser checks: documentation only, no executable input changed. A skipped check is not a pass.

## Recovery
Git baseline `5ea4036` (R135 closure). Revert the commit that adds the design, this note and the Development Changes row; no artifact, configuration or data changed.

## Open questions
None: D1 to D14 are decided (section 9 of the design).

## Remaining work
The implementing session takes the design as the R136 scope (DEV first, PROD on the owner's instruction with a verified backup before V138, which adds one column).
