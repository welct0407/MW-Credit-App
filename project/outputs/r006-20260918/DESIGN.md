# OLTP Targeted Virtual-Column Performance Optimization
## Change Design for Codex Implementation

**Status:** Design approved for DEV implementation and benchmarking
**Date:** 18 September 2026
**Target application:** AppSheet OLTP
**Current production baseline:** OLTP 3.000172 / OLAP 1.100122 / SQL V21 / R005
**Primary source documents:**
- `AppSheet_Data_Dictionary.xlsx`
- `AppSheet_Data_Model_Overview.md`

---

## 1. Purpose

This change is a deliberately narrow OLTP performance optimization.

The existing SQL materialization work already moved the major financial rollups out of AppSheet virtual columns (VCs). This change does **not** start another materialization project. It addresses three remaining expressions that still perform avoidable full-table scans or unnecessary computation:

1. `Payments[Eligible Charges]` and `Payments[Eligible Outstanding]`
2. `Payments[Visible Allocations]`
3. `Borrowers[Daily Collection Status]` overdue detection

The objective is to reduce AppSheet VC evaluation work, particularly as historical `Payments`, `Payment Allocations`, and `Charges` continue to grow, while preserving the current business behavior.

The change must be implemented first in DEV, functionally verified, benchmarked, and only then considered for production promotion.

---

## 2. Scope

### 2.1 In scope

Only the following OLTP AppSheet expressions are changed:

- `Payments[Eligible Charges]` — App formula
- `Payments[Eligible Outstanding]` — App formula
- `Payments[Visible Allocations]` — App formula
- `Borrowers[Daily Collection Status]` — App formula, overdue branch only

### 2.2 Explicitly out of scope

Do **not** change any of the following as part of this work:

- PostgreSQL schema
- Flyway version
- SQL functions
- SQL triggers
- SQL views
- SQL indexes
- OLAP application
- payment posting logic
- lump-sum SQL processing
- allocation order or allocation calculations
- repayment logic
- loan closure logic
- default logic
- charge generation logic
- payment actions
- bots or schedules
- slices
- views
- format rules
- security filters
- table update permissions
- physical columns
- Ref relationships
- generated reverse-reference VCs
- `Borrowers[Todays Collection Charges]`
- collection-status meanings or priorities
- existing Thai status values
- notification behavior

Do not introduce new permanent columns or VCs for this optimization.

Temporary DEV-only test instrumentation is permitted only if required for verification and must be removed before the implementation is considered complete.

---

## 3. Current Architecture Context

The production model is currently R005 with:

- OLTP 3.000172
- OLAP 1.100122
- SQL V21

The earlier VC materialization release moved 24 OLTP derived fields into SQL-owned physical fields and removed four obsolete Payment Allocation calculation VCs.

The measured seven-sample median sync after that release was approximately:

- Before: 5.293 seconds
- After: 4.819 seconds
- Observed improvement: 8.96%

That work captured the major cross-table financial rollups.

The remaining work in this document intentionally targets only obvious avoidable scans. Do not expand the project into another general VC conversion exercise.

---

# 4. Change 1 — Stop Recalculating Payment Eligibility for Posted History

## 4.1 Current problem

`Payments[Eligible Charges]` is currently a VC that scans `Charges`:

```appsheet
=SELECT(
  Charges[Row ID],
  AND(
    [Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower],
    [Amount Remaining] > 0,
    IFS(
      IN(
        [_THISROW].[Allocation Method],
        LIST("Single Full", "Single Partial", "First-day Auto")
      ),
        [Row ID] = [_THISROW].[Ref Target Charge],

      [_THISROW].[Allocation Method] = "Loan Close",
        [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans],

      IN(
        [_THISROW].[Allocation Method],
        LIST("Receive All", "Lump Sum")
      ),
        [Charge Date] <= [_THISROW].[Payment Date],

      TRUE,
        FALSE
    )
  )
)
```

`Payments[Eligible Outstanding]` is currently:

```appsheet
=SUM([Eligible Charges][Amount Remaining])
```

The payment status enum is:

- `Processing`
- `Posted`
- `Error`

and a new payment starts with:

```appsheet
="Processing"
```

The expensive eligibility calculation is operationally required while a payment is being prepared, processed, reconciled, or retried.

It is not operationally useful after the payment has reached `Posted`.

As transaction history grows, recalculating the entire eligible-charge universe for every historical Posted payment is unnecessary work.

---

## 4.2 Design principle

Preserve the existing eligibility formula exactly for:

- `Processing`
- `Error`

Short-circuit it for:

- `Posted`

No allocation or repayment history is modified.

No persisted payment amount is modified.

---

## 4.3 New `Payments[Eligible Charges]` formula

Replace the App formula with:

```appsheet
=IF(
  IN([Status], LIST("Processing", "Error")),

  SELECT(
    Charges[Row ID],
    AND(
      [Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower],
      [Amount Remaining] > 0,
      IFS(
        IN(
          [_THISROW].[Allocation Method],
          LIST("Single Full", "Single Partial", "First-day Auto")
        ),
          [Row ID] = [_THISROW].[Ref Target Charge],

        [_THISROW].[Allocation Method] = "Loan Close",
          [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans],

        IN(
          [_THISROW].[Allocation Method],
          LIST("Receive All", "Lump Sum")
        ),
          [Charge Date] <= [_THISROW].[Payment Date],

        TRUE,
          FALSE
      )
    )
  ),

  LIST()
)
```

### Important

Do not "clean up", simplify, reinterpret, or otherwise modify the inner existing eligibility expression in this change.

In particular, preserve the current Loan Close branch exactly as it exists in the production formula. Any separate cleanup of the Loan Close eligibility model would be a different change with different regression risk.

---

## 4.4 New `Payments[Eligible Outstanding]` formula

Replace:

```appsheet
=SUM([Eligible Charges][Amount Remaining])
```

with:

```appsheet
=IF(
  IN([Status], LIST("Processing", "Error")),
  SUM([Eligible Charges][Amount Remaining]),
  0
)
```

This makes the intended optimization explicit and prevents any unnecessary list dereference for Posted history.

---

## 4.5 Expected behavior

| Payment state | Eligible Charges | Eligible Outstanding |
|---|---|---:|
| New/unsaved payment | Existing behavior because initial Status is Processing | Existing behavior |
| Processing | Existing behavior | Existing behavior |
| Error | Existing behavior | Existing behavior |
| Posted | Empty list | 0 |

### Intentional side effect

If `Eligible Outstanding` is surfaced indirectly while viewing an already Posted payment, its value will now be `0`.

This does **not** change:

- `Amount Received`
- `Planned Allocation Amount`
- `Posted Amount`
- allocations
- repayments
- Processed At
- payment Status
- loan balances
- charge balances
- financial history

The current `Amount Received` validation already bypasses new-entry validation for an existing payment row. Do not change that validation as part of this work.

---

## 4.6 Dependencies that must remain unchanged

The following current logic uses payment eligibility and must continue working:

- `Amount Received` description
- `Amount Received` Valid_If
- Payment - Create Snapshots
- Payment - Reconcile
- other payment workflow expressions referencing `[Eligible Charges]` or `[Eligible Outstanding]`

Do not alter those expressions unless a DEV test demonstrates that the proposed status gate cannot work with the existing workflow.

If any such conflict is found, stop and report it rather than broadening the implementation.

---

# 5. Change 2 — Filter Visible Allocations from the Existing Reverse Ref

## 5.1 Current problem

`Payments[Visible Allocations]` currently scans the complete `Payment Allocations` table:

```appsheet
=SELECT(
  Payment Allocations[Row ID],
  AND(
    [Ref Payment] = [_THISROW].[Row ID],
    [Allocated Amount] > 0
  )
)
```

However, `Payments` already contains the system-generated reverse-reference VC:

```appsheet
Related Payment Allocations
```

with the formula:

```appsheet
REF_ROWS("Payment Allocations", "Ref Payment")
```

The existing reverse Ref already identifies only Payment Allocation rows belonging to the current Payment.

The additional full-table condition:

```appsheet
[Ref Payment] = [_THISROW].[Row ID]
```

is therefore redundant for `Visible Allocations`.

---

## 5.2 New formula

Replace the current `Payments[Visible Allocations]` App formula with:

```appsheet
=SELECT(
  [Related Payment Allocations][Row ID],
  [Allocated Amount] > 0
)
```

This preserves the current output:

- same result type: List of Ref to `Payment Allocations`
- same Payment ownership
- same `[Allocated Amount] > 0` condition
- same row keys
- same user-facing allocation records

but evaluates only the already-related allocation list instead of starting from the entire Payment Allocations table.

---

## 5.3 Do not change the generated reverse reference

Leave this unchanged:

```appsheet
REF_ROWS("Payment Allocations", "Ref Payment")
```

Do not rename, replace, materialize, or remove `Related Payment Allocations`.

It is part of the existing Ref model and may also support AppSheet navigation.

---

## 5.4 Expected behavior

For any Payment:

```text
OLD Visible Allocations
=
all Payment Allocations
filtered by:
    Ref Payment = current payment
    AND Allocated Amount > 0
```

becomes:

```text
NEW Visible Allocations
=
current payment's Related Payment Allocations
filtered by:
    Allocated Amount > 0
```

The result set must be identical.

No ordering change is authorized. If AppSheet presents a different order after the expression change, investigate before promotion.

---

# 6. Change 3 — Remove the Redundant Full Charges Scan from Daily Collection Status

## 6.1 Current problem

`Borrowers[Daily Collection Status]` already starts from the precomputed VC:

```appsheet
[Todays Collection Charges]
```

But the Overdue branch then scans `Charges` again:

```appsheet
COUNT(
  SELECT(
    Charges[Row ID],
    AND(
      IN([Row ID], [_THISROW].[Todays Collection Charges]),
      [Charge Date] < TODAY(),
      [Payment Status] <> "ชำระแล้ว"
    )
  )
) > 0
```

This is redundant.

The candidate rows are already known in:

```appsheet
[Todays Collection Charges]
```

The overdue test only needs to filter that related Ref list.

---

## 6.2 Current full formula

Current formula:

```appsheet
=IFS(
  COUNT([Todays Collection Charges]) = 0,
    "",

  COUNT(
    SELECT(
      Charges[Row ID],
      AND(
        IN([Row ID], [_THISROW].[Todays Collection Charges]),
        [Charge Date] < TODAY(),
        [Payment Status] <> "ชำระแล้ว"
      )
    )
  ) > 0,
    "Overdue",

  AND(
    NOT(IN("รอชำระ", [Todays Collection Charges][Payment Status])),
    NOT(IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]))
  ),
    "Fully Paid",

  OR(
    IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]),
    AND(
      IN("ชำระแล้ว", [Todays Collection Charges][Payment Status]),
      IN("รอชำระ", [Todays Collection Charges][Payment Status])
    )
  ),
    "Partially Paid",

  TRUE,
    "Not Paid"
)
```

---

## 6.3 New full formula

Replace only the overdue selection source.

New formula:

```appsheet
=IFS(
  COUNT([Todays Collection Charges]) = 0,
    "",

  COUNT(
    SELECT(
      [Todays Collection Charges][Row ID],
      AND(
        [Charge Date] < TODAY(),
        [Payment Status] <> "ชำระแล้ว"
      )
    )
  ) > 0,
    "Overdue",

  AND(
    NOT(IN("รอชำระ", [Todays Collection Charges][Payment Status])),
    NOT(IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]))
  ),
    "Fully Paid",

  OR(
    IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]),
    AND(
      IN("ชำระแล้ว", [Todays Collection Charges][Payment Status]),
      IN("รอชำระ", [Todays Collection Charges][Payment Status])
    )
  ),
    "Partially Paid",

  TRUE,
    "Not Paid"
)
```

---

## 6.4 Logic equivalence

The old expression searches all Charges and then keeps only rows whose Row ID is already in:

```appsheet
[Todays Collection Charges]
```

The new expression starts directly from:

```appsheet
[Todays Collection Charges][Row ID]
```

and applies the same two remaining predicates:

```appsheet
[Charge Date] < TODAY()
```

and:

```appsheet
[Payment Status] <> "ชำระแล้ว"
```

Therefore the intended overdue population is unchanged.

---

## 6.5 Do not change `Todays Collection Charges`

The current `Borrowers[Todays Collection Charges]` expression remains unchanged:

```appsheet
=SELECT(
  Charges[Row ID],
  AND(
    [Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID],
    OR(
      AND(
        [Payment Status] <> "ชำระแล้ว",
        [Charge Date] <= TODAY()
      ),
      AND(
        [Payment Status] = "ชำระแล้ว",
        [Payment Date] = TODAY()
      ),
      IN(
        TODAY(),
        [Related Repayments][Payment Date]
      )
    )
  )
)
```

The purpose of Change 3 is only to prevent a **second** full Charges scan inside `Daily Collection Status`.

Do not redesign today's-collection population in this change.

---

# 7. Functional Contract That Must Not Change

After implementation, the following behavior must remain identical.

## 7.1 Payment methods

All existing methods must continue to work:

- Single Full
- Single Partial
- Receive All
- Lump Sum
- First-day Auto
- Loan Close

The changes must not alter:

- target charge selection
- target loan behavior
- eligible payment amount while active
- allocation generation
- SQL posting
- reconciliation
- repayment generation
- loan closure
- notification events

---

## 7.2 Collection statuses

The exact existing output values must remain:

```text
Overdue
Fully Paid
Partially Paid
Not Paid
blank
```

The priority/order of the IFS expression must remain unchanged:

1. No collection charges -> blank
2. Any overdue unpaid/partial charge -> Overdue
3. Otherwise fully paid -> Fully Paid
4. Otherwise mixed/partial -> Partially Paid
5. Otherwise -> Not Paid

The exact Thai charge payment-status values must remain unchanged:

```text
รอชำระ
ชำระบางส่วน
ชำระแล้ว
```

---

## 7.3 Downstream collection behavior

Do not change:

- `Daily Collection Status - Order`
- Today's Collection Board slice filter
- Today's Collection Board columns
- borrower detail navigation
- collection format rules
- status colors
- Statistics collection-count formulas

The following Statistics results must remain identical before and after the change for the same underlying data:

- Borrowers Fully Paid Today
- Borrowers Partially Paid Today
- Borrowers with Overdue Payment
- Borrowers Not Paid Today

---

# 8. Implementation Sequence

## Step 1 — Capture DEV baseline

Before editing:

1. Confirm the current DEV OLTP version.
2. Save/export the current DEV AppSheet definition.
3. Record the current formulas for all four targeted VCs.
4. Capture the current DEV app-model/configuration artifact used by the repository.
5. Confirm DEV database and production database bindings are not being changed.
6. Confirm no SQL migration is planned.

Do not make any production change during this phase.

---

## Step 2 — Baseline performance benchmark

Before changing the expressions, collect a baseline using the same methodology that will be used after implementation.

Recommended minimum:

- 1 warm-up sync that is excluded
- 7 measured syncs
- record every sample
- calculate median
- use the same client/device/browser where practical
- use the same DEV application
- avoid financial writes during the benchmark
- keep network/location conditions as consistent as practical

Also capture AppSheet Performance Analyzer evidence if available, especially:

- VC evaluation time
- Payments VC evaluation
- Borrowers VC evaluation
- table read time
- total sync time

Do not claim improvement from a single sync.

---

## Step 3 — Implement Change 1

Change only:

- `Payments[Eligible Charges]`
- `Payments[Eligible Outstanding]`

Save the DEV app.

Confirm:

- AppSheet editor shows no expression error.
- Both VCs retain their existing types.
- No additional VC is generated.
- No table/schema regeneration occurred.
- No column order/visibility/editability changed.

Run the Change 1 test cases in Section 9 before continuing.

---

## Step 4 — Implement Change 2

Change only:

- `Payments[Visible Allocations]`

Save the DEV app.

Confirm:

- AppSheet accepts `SELECT([Related Payment Allocations][Row ID], ...)`.
- VC remains List of Ref to `Payment Allocations`.
- existing inline/detail navigation still works if this VC is displayed.
- returned allocation rows exactly match the old formula for tested payments.

Run the Change 2 test cases before continuing.

If AppSheet rejects the related-list `SELECT()` syntax in the current editor/runtime, **stop this item and report the result**. Do not substitute a different broad formula without design review.

---

## Step 5 — Implement Change 3

Change only:

- `Borrowers[Daily Collection Status]`

Save the DEV app.

Confirm:

- the expression is valid.
- no output values changed for existing current borrowers.
- slice membership and formatting remain unchanged.

Run the Change 3 tests before continuing.

---

## Step 6 — Combined regression test

After all three changes are present, execute the complete payment and collection smoke test in Section 9.

No production promotion is allowed until the combined regression test passes.

---

## Step 7 — Post-change benchmark

Repeat the exact baseline benchmark methodology:

- 1 excluded warm-up
- 7 measured syncs
- median calculation
- same client/environment where practical
- no unrelated data/model change between benchmark sets

Compare:

```text
Baseline median
Post-change median
Absolute difference
Percentage difference
```

Also compare Performance Analyzer hotspots.

---

# 9. Required Test Matrix

## 9.1 Change 1 — Payment eligibility

### Test A — New Single Full

Create/open an unsaved Single Full payment.

Verify:

- Status evaluates as Processing.
- Eligible Charges contains only the selected target charge.
- Eligible Outstanding equals the target charge remaining amount.
- Amount Received validation behaves exactly as before.

Discard the test if a permanent transaction is not needed.

---

### Test B — New Single Partial

Verify:

- same eligible target charge as before
- Eligible Outstanding unchanged from old logic
- partial amount within eligible amount is valid
- amount above eligible amount remains invalid

---

### Test C — Receive All

Verify:

- all currently eligible borrower charges up to Payment Date are returned
- Eligible Outstanding is unchanged from baseline
- Receive All amount remains exactly equal to eligible outstanding

---

### Test D — Lump Sum

Verify:

- eligible list remains unchanged while Status is Processing
- SQL lump-sum preparation/finalization is not affected
- after successful posting, Status becomes Posted
- Posted payment then has:
  - Eligible Charges = empty
  - Eligible Outstanding = 0
- persisted allocations, repayments and amount remain unchanged

---

### Test E — Error payment

Use or create a controlled DEV Error case if safely possible.

Verify:

- Error still calculates Eligible Charges
- Error still calculates Eligible Outstanding
- retry/reconcile behavior remains available and correct

---

### Test F — First-day Auto

Verify through the existing tested workflow or a controlled DEV loan:

- first-day payment still sees its target charge while Processing
- automatic amount remains correct
- SQL posting succeeds
- final Posted history is unchanged except for the intentional empty/zero eligibility VCs

---

### Test G — Loan Close

Verify the existing close workflow.

Do not modify the Loan Close branch of the eligibility formula.

Confirm:

- eligible behavior before posting matches baseline
- final charge/receipt preparation succeeds
- SQL closes the loan as before
- no new Error status is introduced

---

### Test H — Existing Posted history

Select multiple existing Posted payments covering:

- single allocation
- multiple allocations
- lump-sum payment
- closed-loan payment if available

Verify:

- persisted business fields remain unchanged
- child Payment Allocations remain unchanged
- child Repayments remain unchanged
- no action unexpectedly becomes available
- Eligible Charges is empty
- Eligible Outstanding is 0

---

## 9.2 Change 2 — Visible Allocations

Test at least:

1. Payment with one positive allocation
2. Payment with multiple positive allocations
3. Payment with no allocations
4. Historical payment containing any zero/nonpositive allocation if such a row exists
5. Lump Sum payment with multiple allocations

For every test:

```text
new Visible Allocations result
=
old Visible Allocations result
```

Compare Row IDs, not only displayed labels.

No allocation row may be added, removed, or reordered unexpectedly.

---

## 9.3 Change 3 — Daily Collection Status

Use existing borrowers where possible; use controlled DEV fixtures only if required.

Verify all five states:

### No collection charge

Expected:

```text
blank
```

### Not Paid

Current charge(s) awaiting payment with no partial/full receipt.

Expected:

```text
Not Paid
```

### Partially Paid

At least one partial status, or a mixture of paid and waiting charges without an overdue condition.

Expected:

```text
Partially Paid
```

### Fully Paid

All today's relevant charges paid with no overdue unpaid charge.

Expected:

```text
Fully Paid
```

### Overdue

At least one selected collection charge where:

```text
Charge Date < TODAY()
AND
Payment Status <> "ชำระแล้ว"
```

Expected:

```text
Overdue
```

---

## 9.4 Mixed-condition priority test

Test a borrower with a combination such as:

- an old unpaid/partial charge
- a current paid charge

Expected:

```text
Overdue
```

The Overdue branch must still take priority over Fully Paid / Partially Paid logic.

---

## 9.5 Collection UI regression

Verify in the current DEV GUI:

- Collection view
- Today's Collection Board
- Today's Collection Board detail
- borrower navigation from collection detail
- remaining amount
- collection status grouping/order
- status colors

Where representative borrowers exist, verify:

- green Fully Paid
- red Not Paid
- purple Overdue
- orange Partially Paid

Do not modify format rules to make the tests pass.

---

## 9.6 Statistics regression

Record before/after values for:

- Borrowers Fully Paid Today
- Borrowers Partially Paid Today
- Borrowers with Overdue Payment
- Borrowers Not Paid Today

The before/after values must match for identical underlying data.

---

# 10. Performance Acceptance and Stop Rule

The purpose of this change is performance.

Functional correctness is mandatory, but do not continue extending OLTP optimization simply because the changes work.

After the combined benchmark:

## Strong result

If median sync improves by approximately:

```text
>= 3%
```

or roughly:

```text
>= 0.15 seconds
```

at the current ~5-second sync scale, with no regression:

- retain the implementation
- prepare it for owner acceptance / production promotion

## Small result

If improvement is approximately:

```text
1% to <3%
```

report it accurately.

Do **not** add more OLTP optimization scope.

The owner can decide whether the scaling benefit justifies promotion.

## Negligible result

If improvement is:

```text
< 1%
```

or within obvious benchmark noise:

- report that these changes do not produce a meaningful current performance gain
- do not invent further optimizations
- recommend stopping OLTP performance work and moving to OLAP optimization

## Regression

If median sync is slower or functional behavior changes:

- revert the affected formula(s)
- isolate which change caused the regression
- do not compensate by changing unrelated objects

---

# 11. Promotion Design

If the owner approves production promotion after DEV acceptance:

1. Capture the exact tested DEV app version.
2. Confirm no SQL/Flyway change exists.
3. Confirm only the four approved App formulas differ.
4. Promote the exact tested AppSheet changes.
5. Open and sync production.
6. Do **not** create unnecessary production financial transactions.
7. Verify:
   - app loads
   - sync completes
   - current Collection view loads
   - current Statistics collection counts are plausible
   - existing Posted payment details load
8. If an owner-authorized production payment test is performed, use the minimum necessary case and reconcile it completely.

---

# 12. Rollback

This change is AppSheet-only.

No database rollback is required.

Rollback options:

1. Restore the prior OLTP app version; or
2. Restore the four original formulas.

Original `Payments[Eligible Charges]`:

```appsheet
=SELECT(
  Charges[Row ID],
  AND(
    [Ref Loans].[Ref Borrowers] = [_THISROW].[Ref Borrower],
    [Amount Remaining] > 0,
    IFS(
      IN(
        [_THISROW].[Allocation Method],
        LIST("Single Full", "Single Partial", "First-day Auto")
      ),
        [Row ID] = [_THISROW].[Ref Target Charge],

      [_THISROW].[Allocation Method] = "Loan Close",
        [Ref Loans] = [_THISROW].[Ref Target Charge].[Ref Loans],

      IN(
        [_THISROW].[Allocation Method],
        LIST("Receive All", "Lump Sum")
      ),
        [Charge Date] <= [_THISROW].[Payment Date],

      TRUE,
        FALSE
    )
  )
)
```

Original `Payments[Eligible Outstanding]`:

```appsheet
=SUM([Eligible Charges][Amount Remaining])
```

Original `Payments[Visible Allocations]`:

```appsheet
=SELECT(
  Payment Allocations[Row ID],
  AND(
    [Ref Payment] = [_THISROW].[Row ID],
    [Allocated Amount] > 0
  )
)
```

Original `Borrowers[Daily Collection Status]`:

```appsheet
=IFS(
  COUNT([Todays Collection Charges]) = 0,
    "",

  COUNT(
    SELECT(
      Charges[Row ID],
      AND(
        IN([Row ID], [_THISROW].[Todays Collection Charges]),
        [Charge Date] < TODAY(),
        [Payment Status] <> "ชำระแล้ว"
      )
    )
  ) > 0,
    "Overdue",

  AND(
    NOT(IN("รอชำระ", [Todays Collection Charges][Payment Status])),
    NOT(IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]))
  ),
    "Fully Paid",

  OR(
    IN("ชำระบางส่วน", [Todays Collection Charges][Payment Status]),
    AND(
      IN("ชำระแล้ว", [Todays Collection Charges][Payment Status]),
      IN("รอชำระ", [Todays Collection Charges][Payment Status])
    )
  ),
    "Partially Paid",

  TRUE,
    "Not Paid"
)
```

---

# 13. Documentation Updates After Acceptance

If the change is accepted and promoted, update the repository documentation together.

At minimum update:

- `AppSheet_Data_Dictionary.xlsx`
  - current OLTP column rules for the four App formulas
  - Dev Differences / release evidence as applicable
- `AppSheet_Data_Model_Overview.md`
  - add a concise release/change note
  - do not change the stated SQL ownership model
- applicable Markdown change log
- current app-model/configuration export
- production version reference after promotion

Do not modify DB Columns, DB Constraints or DB Logic to imply a database change; there is none.

---

# 14. Codex Implementation Constraints

Codex must follow these constraints:

1. Work in DEV first.
2. Do not modify production without explicit owner authorization.
3. Do not change SQL.
4. Do not create a Flyway migration.
5. Do not rename any field.
6. Do not add a permanent field.
7. Do not change field type.
8. Do not change Ref configuration.
9. Do not change payment actions.
10. Do not change collection slices/views/format rules.
11. Do not "improve" other formulas discovered during implementation.
12. Preserve exact Thai enum/status strings.
13. Preserve exact existing payment-method behavior.
14. Benchmark before and after.
15. Report raw samples as well as median.
16. If Change 2's related-list `SELECT()` syntax is rejected by AppSheet, stop that item and report; do not silently substitute another design.
17. If functional parity cannot be demonstrated, revert rather than broadening scope.
18. After these three items, stop OLTP performance optimization unless the owner explicitly requests another round.

---

# 15. Definition of Done

This change is complete only when all of the following are true:

- [ ] DEV baseline captured
- [ ] baseline sync benchmark captured
- [ ] `Payments[Eligible Charges]` updated exactly as designed
- [ ] `Payments[Eligible Outstanding]` updated exactly as designed
- [ ] `Payments[Visible Allocations]` updated exactly as designed
- [ ] `Borrowers[Daily Collection Status]` updated exactly as designed
- [ ] AppSheet editor reports no new issue
- [ ] all active payment methods pass regression tests
- [ ] Processing payment eligibility matches baseline
- [ ] Error payment eligibility matches baseline where tested
- [ ] Posted payment eligibility short-circuits as designed
- [ ] Visible Allocations Row ID sets match baseline
- [ ] all five collection-status states are correct
- [ ] mixed overdue priority is preserved
- [ ] collection UI behavior is unchanged
- [ ] Statistics collection counts are unchanged
- [ ] post-change seven-sample benchmark completed
- [ ] raw benchmark samples recorded
- [ ] median and percentage difference calculated
- [ ] no SQL/database change exists
- [ ] implementation report states whether the gain is Strong / Small / Negligible / Regression
- [ ] no additional OLTP optimization was added
- [ ] owner decision obtained before production promotion
- [ ] repository documentation updated only after acceptance/promotion as appropriate

---

## Final design intent

This is a **targeted expression-efficiency change**, not a redesign.

The desired end state is:

```text
Historical Posted Payments
    -> do not recalculate charge eligibility

Payment Visible Allocations
    -> filter the already-related allocation list

Borrower Daily Collection Status
    -> filter the already-selected today's charge list for overdue status
```

If these changes do not provide a measurable benefit, stop. The next optimization effort should move to OLAP rather than expanding the OLTP scope.
