# Direct loan correction — bounded supported matrix

DEV67 source behavior; local tests only for this extension. Existing GUI fields are not proof of valid generation after every edit. [Exact tests/results](loan-correction-validation.json). No live loan was changed and no migration is proposed.

| Edit | Proven behavior / boundary | GUI acceptance still required |
|---|---|---|
| Open daily principal decrease |200→150 with30 received gives120 outstanding and12 current daily at frozen10%; same disbursement key becomes150. Existing charge amounts/receipt remain unchanged. Must be at least both total booked principal and total received principal; positive/non-null. Existing prior test covers increase1000→1200. |Existing loan form save/full sync; confirm principal/current rate/cash and no duplicate. No claim for closed/default principal restructuring. |
| Loan Date / disbursement account |Moves the existing disbursement date/account, preserves amount/key. Lisa→Lisa2 tested. Anchor cannot precede corrected Loan Date. Included-opening sources reject financial corrections; metadata remains distinct. |Actual form valid date/account, old/new account balances/history. This does not redate existing charges/receipts. |
| Daily interval / anchor |Controls future generation dates. Test off-cycle returns no charge; eligible day accrues36 since last charge at current12. Anchor does not erase elapsed accrual. Existing charges remain. |Safe synthetic manual generation/date selection; no scheduler/notification exposure. |
| Fixed interest / Due Date |New fixed45 and corrected due date generate500 principal+45 interest on that date; earlier7-interest charge retained. |Form fields and future generation. Review existing booked principal before any new full-principal charge; no automatic cancellation of old obligations. |
| Borrower |Unpaid source move works after independent borrower-bound expense is removed/corrected. Any receipt or mismatched borrower-bound expense rejects. |Contextual Add remains; Edit field availability/access and old/new parent totals. |
| Original daily rate / Current daily amount |Original percentage remains immutable. Current daily amount recalculates on principal changes; unchanged-principal saves preserve prior current amount. |Keep original read-only and current entry-only as currently configured. |
| Existing Loan Type conversion |**Support gap:** fixed→daily can persist with Current Daily Interest=NULL; generator then returnsNULL. Stored type change is not usable-schedule acceptance. Frozen original5 remained in the local case. Other cross-type conversions remain unproven. |Proposed temporary type Editable_If below requires parent review; no silent UI change. A future correction needs explicit basis/schedule semantics, not a guessed original-rate rewrite. |

Narrow proposed existing-type control, composed with current independent access rules:

```appsheet
NOT(IN([Row ID], Loans[Row ID]))
```

This retains new-loan type selection and locks existing conversion until its missing-basis/schedule semantics are resolved. It is a disclosed restriction for a reproduced gap, not a claim that the release supports all type conversions. Preserve existing term validations and booked obligations; do not add a blanket source-history prohibition.

[Borrower delete proposal](borrower-delete-ui-plan.json) restricts native Delete to unreferenced borrowers and retains relationships. Local multi-request reproduction proves a later failure cannot restore an earlier committed unpaid sibling deletion; it does not assert actual AppSheet ordering. OLTP lacks Loan Assessment, so that reference remains a final FK check/OLAP workflow.
