# Daily-installment loan change notes — test clone 2026-08-31; production 2026-09-01

## Status

**Implemented and configuration-verified in production OLTP and OLAP. The current editor baselines are OLTP v`2.200099` and OLAP v`1.000164`. Charge generation and allocation were accepted for one designated production daily-installment loan. OLAP formula, schema, slice, and representative live-value checks are complete; a controlled Loan Assessment boundary-date test and broader regression acceptance remain pending.**

- Production OLTP configuration and the production AppSheet Database `Loans` schema were updated on 1 September 2026.
- Production OLAP was updated on 1 September 2026 from rollback v`1.000160` to v`1.000164`. Looker Studio and the Daily Loan Analysis export template were not edited.
- No production Loan, Charge, Repayment, or notification row was created or modified during the configuration rollout. The later user-approved historical allocation repair is documented below.
- The isolated test clone remains deployed as runtime-test evidence.
- External notification events are suppressed in the clone with event condition `FALSE`.
- The authoritative Excel data dictionary was reconciled on 1 September 2026 after the user explicitly approved `openpyxl` as a fallback for the unavailable mandated spreadsheet runtime.
- The earlier OLAP replication-readiness review used v`1.000160` as its read-only baseline. The approved replication was subsequently completed at v`1.000164`; no Loan, Charge, Repayment, Loan Assessment, Calendar-source, or assessment-control row was changed.

## Production rollout — 2026-09-01

| Item | Production result |
| --- | --- |
| App | `Loan Manager ผู้จัดการสินเชื่อ` (`93844270-6aa5-420b-a960-bcdf08abd357`) |
| Source | AppSheet Database `Money database`, table `Loans` |
| Database ID | `9Y5vh3TFzZ4sIe2JgNh4l0` |
| Pre-change rollback version | `2.200082` |
| Initial rollout version | `2.200091` — incomplete because the source-database Loan Type enum still had only two options |
| Enum/form correction version | `2.200092` |
| Statistics-action correction rollback | `2.200093` |
| Current corrected version | `2.200094` |
| Final schema | `Loans` synchronized at 40 columns |
| Editor health | No schema-sync error; one pre-existing/non-blocking PII classification warning for `Closed By` and `Created By` |
| Production financial data | Not touched during the configuration rollout; the later approved seven-pair allocation repair is documented below |
| Notifications | Production notification bot configuration not touched |

Production objects changed:

- Added physical `Loans[Daily Payment Amount]` as a whole-baht Price field and regenerated the production Loans schema.
- Added loan-type enum value `ผ่อนชำระรายวัน` and updated Due Date, Principal Amount, and Payment Interval validation/visibility.
- Updated `Loans[Loan Type TE]`, `Loans[Effective Daily Interest Rate]`, and `Loans[Expected Interest This Month]` with explicit three-type logic.
- Added the hidden lightweight VC `Loans[Expected Daily Interest Amount]`; updated `Statistics[Expected Daily Interest]` and `Borrowers[Active Daily Interest]` to aggregate it.
- Extended the existing first-day and `Generate Today's Charge` actions for whole-baht principal allocation, multi-day intervals, forced due-date tails, duplicate prevention, and transfer-fee preservation.
- Updated first-day creation, auto-receipt, and scheduled daily-charge automation filters. The existing 00:05 schedule was retained; no additional action or bot was added.
- Hid manual closure for daily-installment loans and extended automatic final closure to their principal-bearing Charges. Existing default logic was retained.
- Added `Daily Payment Amount` after Due Date in `Loans_Form` and `Loans_Detail`.
- Replaced affected two-way loan-type assumptions with explicit `IFS` or `SWITCH` handling.

The final regeneration was performed after AppSheet reported that the Loans schema was out of sync with the AppSheet Database. After regeneration, the warning cleared and Loans reported 40 columns. The remaining warning concerns only PII classification of the existing audit-user fields.

### Corrective follow-up after user verification

The user reported that `ผ่อนชำระรายวัน` was absent from both `Loans_Form` and the AppSheet Database `Loans[Loan Type]` enum. Direct inspection confirmed the report. The initial rollout had added the option only at app-column level; a later schema regeneration restored the two values from the unchanged source enum, so version `2.200091` did not expose the third option. The earlier completion statement was therefore incorrect.

Correction performed:

1. Opened the production AppSheet Database `Money database` / `Loans` table.
2. Edited the physical `Loan Type` Enum and saved the third option `ผ่อนชำระรายวัน` alongside the two existing options.
3. Reopened the database column editor and re-read all three saved options.
4. Regenerated the production OLTP Loans schema.
5. Reopened the OLTP `Loans[Loan Type]` column definition and re-read the same three values.
6. Opened the actual production `Loans_Form` directly and confirmed three visible buttons: `กำหนดวันชำระ`, `ดอกเบี้ยรายวัน`, and `ผ่อนชำระรายวัน`.
7. Selected `ผ่อนชำระรายวัน` and confirmed Due Date, Daily Payment Amount, and Payment Interval appeared. Cancelled the form without saving a production record.
8. Recorded corrected app version `2.200092`. The only remaining editor warning is the existing PII classification warning for `Closed By` and `Created By`.

### Statistics manual action correction

The user reported that the Statistics-table action `Generate All Today's Charges` did not appear when an eligible daily-installment loan had no Charge for today. Inspection confirmed that both `Referenced Rows` and `Only if this condition is true` still contained only the daily-interest and fixed-date branches.

At rollback version `2.200093`, both expressions were updated to include the same daily-installment eligibility used by the loan-level `Generate Today's Charge` action:

- open loan;
- `TODAY() > [Loan Date]` and `TODAY() <= [Due Date]`;
- positive Payment Interval;
- an existing first-day/latest Charge;
- regular interval boundary or forced Due Date tail; and
- no existing Charge for the loan on `TODAY()`.

The correction was saved as production version `2.200094`. Both expressions were re-read after save and confirmed to contain the daily-installment and Due Date tail branches. The actual production dashboard was opened and `Generate All Today's Charges` was visible. The action was deliberately not clicked, so this verification created no Charges.

## Scope and purpose

- Production app: `Loan Manager ผู้จัดการสินเชื่อ`
- Production App ID: `93844270-6aa5-420b-a960-bcdf08abd357`
- Test clone: `LoanMgr DailyPay TEST 0831`
- Test clone App ID: `30b07f89-64a8-4648-9a68-0e3369803a2e`
- Purpose: add the Thai loan type `ผ่อนชำระรายวัน`, allocate whole-baht principal and interest across inclusive contract days, reuse the existing recurring-charge action, support multiple-day payment intervals, auto-receive the first payment, prevent manual early closure, include its average contract interest in `Expected Daily Interest`, and preserve existing fixed-due-date, daily-interest, transfer-fee, and default behavior.

## Rollback points and isolation

| Item | Rollback / baseline |
| --- | --- |
| Production OLTP baseline | Version `2.200082`; recorded before editing and retained as the rollback point |
| Production OLTP initial rollout | Version `2.200091`; source enum omission discovered after user verification |
| Production OLTP corrected | Version `2.200092` |
| Before Statistics-action correction | Version `2.200093` |
| After Statistics-action correction | Version `2.200094` |
| Test clone before feature changes | Version `1.000002` |
| Test clone before Expected Daily Interest enhancement | Version `1.000014` |
| Test clone after implementation and testing | Version `1.000015` |
| Test app state | Deployed for automation testing; AppSheet reports `No issues found` |
| Test data folder | Private copied Drive folder `LoanMgrDailyPayTEST0831-975338008` |
| Test data source | Six isolated copied Google Sheets: Borrowers, Loans, Charges, Repayments, Partners, Statistics |
| File/image copy | Not selected when cloning |

The test clone does not point at the production operational tables. Synthetic test rows changed only the copied Sheets.

## Approved business rules implemented

1. Loan type is `ผ่อนชำระรายวัน`.
2. Loan Date through Due Date is counted inclusively.
3. Principal Amount and Daily Payment Amount are whole baht for this type.
4. Total scheduled payment must exceed principal.
5. No allocation helper virtual columns were added. One reusable forecast VC was later added for `Expected Daily Interest`; it does not participate in charge allocation.
6. Principal is allocated by whole baht: floor division across all term days, then one extra baht to each earliest day until the remainder is exhausted.
7. First-day Charge is created when the Loan is added and is automatically received because net principal is issued after deducting the first payment.
8. Transfer Fee retains the existing behavior and is added only to first-day Charge interest.
9. Later Charges use the existing `Generate Today's Charge` action. Payment Interval may be greater than one; a Charge combines all elapsed scheduled days since the latest Charge.
10. Due Date forces the final tail Charge even if the interval has not fully elapsed.
11. Manual early closure is unavailable. Final full repayment closes the loan automatically.
12. Default continues through the existing workflow.
13. Old two-way type assumptions in affected expressions were replaced with explicit `IFS` or `SWITCH` branches.

## Test clone and copied data

### Clone

- App name: `LoanMgr DailyPay TEST 0831`
- App ID: `30b07f89-64a8-4648-9a68-0e3369803a2e`
- Internal app name: `LoanMgrDailyPayTEST0831-975338008`
- Pre-change version: `1.000002`
- Final reviewed version: `1.000015`
- Deployment check: definition, errors, data structure, sign-in, updates, and core deployment checks passed; app description remained a non-blocking warning before deployment.

### Copied Sheets

| Sheet | Copied spreadsheet ID |
| --- | --- |
| Loans | `1JJ5QnDAZ7DzZNfdvo_ilSSPB2r7wlnz0IGVGCAtnTzE` |
| Borrowers | `1ILdeyoFDwmocm5SDBig7YPUxmNPl3arBt24_hvtC5LM` |
| Charges | `14s2zgavpa0o3NEoKML7ptNtPbUpNd8btEAM0VPXwofk` |
| Repayments | `1AYaYKyLOxwQiV__5hvzbKGEWNaQsIgr32K6ZcXOsfJQ` |
| Partners | `1-pCMEy1tH2OVfClLpTec8joQIi_aafnRe0vclxqMx3w` |
| Statistics | `1g9WqlPmO84qmDKk5OAOSapPKkw8IKF188cHbPrLDlk4` |

The copied Sheets are private and not shared broadly.

## Data-model changes in the clone

### New physical field

Added `Loans[Daily Payment Amount]` to copied `Loans` column `S`, then regenerated the AppSheet schema.

| Setting | Value |
| --- | --- |
| Type | Price |
| Decimal digits | `0` |
| Currency | `฿` |
| Show_If | `[Loan Type] = "ผ่อนชำระรายวัน"` |
| Required_If | `[Loan Type] = "ผ่อนชำระรายวัน"` |
| Display name | `ยอดชำระรายวัน / Daily Payment Amount` |
| Description | `ยอดรวมต่อหนึ่งวันตามสัญญา ระบบจะรวมหลายวันเมื่อรอบการชำระมากกว่า 1 วัน / Contract amount per day; interval charges combine elapsed days.` |
| Valid_If | `AND([_THIS] > 0, MOD([_THIS], 1) = 0, [_THIS] * (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1) > [Principal Amount])` |
| Invalid message | `ต้องเป็นจำนวนเต็มบวก และยอดชำระรวมต้องมากกว่าเงินต้น / Enter a positive whole-baht amount whose scheduled total exceeds principal.` |

### Existing physical-field configuration

- `Loans[Loan Type]`: added enum value `ผ่อนชำระรายวัน`; arbitrary values remain disallowed.
- `Loans[Due Date]`:
  - Show_If and Required_If: `IN([Loan Type], LIST("กำหนดวันชำระ", "ผ่อนชำระรายวัน"))`
  - Valid_If:

    ```appsheet
    IFS(
      [Loan Type] = "กำหนดวันชำระ",
        AND(ISNOTBLANK([Due Date]), [Due Date] > [Loan Date]),
      [Loan Type] = "ผ่อนชำระรายวัน",
        AND(ISNOTBLANK([Due Date]), [Due Date] >= [Loan Date]),
      TRUE,
        TRUE
    )
    ```

- `Loans[Principal Amount]` Valid_If:

  ```appsheet
  AND(
    [_THIS] > 0,
    OR([Loan Type] <> "ผ่อนชำระรายวัน", MOD([_THIS], 1) = 0)
  )
  ```

- `Loans[Interest Payment Interval]`:
  - Show_If and Required_If: `IN([Loan Type], LIST("ดอกเบี้ยรายวัน", "ผ่อนชำระรายวัน"))`
  - Existing positive-whole-number validation preserved.
  - Display name: `รอบการชำระ (วัน) / Payment Interval (Days)`
  - Description: `จำนวนวันที่สะสมก่อนสร้างยอดเรียกเก็บครั้งถัดไป / Number of elapsed daily amounts combined into the next charge.`

### Existing virtual columns

- `Loans[Loan Type TE]` now uses explicit `SWITCH` branches for fixed due date, daily interest, daily installment, and unknown values.
- `Loans[Expected Interest This Month]` adds a daily-installment branch that forecasts uncharged contract interest from the latest Charge through the earlier of Due Date and month end. The formula uses inline date/index calculations and no new helper VC.
- `Loans[Effective Daily Interest Rate]` now uses explicit branches. Daily-installment average daily profit is:

  ```text
  ((Daily Payment Amount × inclusive term days) - Principal Amount)
  ÷ inclusive term days
  ÷ Principal Amount
  ```

### Expected Daily Interest enhancement (version `1.000015`)

One hidden, lightweight VC was added because AppSheet aggregate expressions can sum a column but cannot directly sum an arbitrary per-loan expression without repeating the calculation elsewhere.

`Loans[Expected Daily Interest Amount]`:

| Setting | Value |
| --- | --- |
| Type | Price |
| Decimal digits | `2` |
| Currency | `฿` |
| Show? | `FALSE` |

```appsheet
IFS(
  [Loan Status] <> "ยังไม่ปิดยอด", 0,
  [Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest],
  AND(
    [Loan Type] = "ผ่อนชำระรายวัน",
    ISNOTBLANK([Loan Date]),
    ISNOTBLANK([Due Date]),
    [Due Date] >= [Loan Date],
    [Daily Payment Amount] > 0
  ),
    (
      ([Daily Payment Amount] * (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1))
      - [Principal Amount]
    )
    / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1),
  TRUE, 0
)
```

The VC returns the contractual daily amount for open daily-interest loans, estimated average contract interest per inclusive day for open daily-installment loans, and zero for closed/defaulted or fixed-date loans. Transfer Fee is excluded from the estimate.

`Statistics[Expected Daily Interest]` was changed to:

```appsheet
SUM(Loans[Expected Daily Interest Amount])
```

`Borrowers[Active Daily Interest]` was changed to:

```appsheet
SUM(
  SELECT(
    Loans[Expected Daily Interest Amount],
    [Ref Borrowers] = [_THISROW].[Row ID]
  )
)
```

The physical `Loans[Current Daily Interest]` field remains unchanged and continues to store the manually entered contract amount only for `ดอกเบี้ยรายวัน`. This prevents a derived estimate from becoming stale when principal, dates, or Daily Payment Amount changes.

## Allocation specification

For production replay, use these definitions and inline them in AppSheet action expressions:

```text
termDays     = TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1
baseDailyP   = FLOOR([Principal Amount] / termDays)
remainder    = MOD([Principal Amount], termDays)
daysCovered  = TOTALHOURS(TODAY() - MAX([Related Charges][Charge Date])) / 24
startIndex   = TOTALHOURS(MAX([Related Charges][Charge Date]) - [Loan Date]) / 24 + 2
endIndex     = TOTALHOURS(TODAY() - [Loan Date]) / 24 + 1
minEndRem    = IF(endIndex < remainder, endIndex, remainder)
extraBaht    = IF(minEndRem - startIndex + 1 > 0, minEndRem - startIndex + 1, 0)
batchP       = baseDailyP × daysCovered + extraBaht
batchI       = Daily Payment Amount × daysCovered - batchP
```

This produces whole-baht Charges, allocates the remainder to earliest days, and reconciles total principal exactly.

## Action changes

### `New Loan Payment - Create First-Day Charge`

- Condition:

  ```appsheet
  AND(
    IN([Loan Type], LIST("ดอกเบี้ยรายวัน", "ผ่อนชำระรายวัน")),
    COUNT(
      SELECT(
        Charges[Row ID],
        AND(
          [Ref Loans] = [_THISROW].[Row ID],
          [Charge Date] = [_THISROW].[Loan Date]
        )
      )
    ) = 0
  )
  ```

- Daily-installment first-day principal:

  ```appsheet
  FLOOR([Principal Amount] / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1))
  + IF(
      MOD([Principal Amount], (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)) > 0,
      1,
      0
    )
  ```

- Daily-installment first-day interest: `[Daily Payment Amount] - first-day principal + [Transfer Fee]`.
- Existing daily-interest first-day values remain Principal Due `0` and Interest Due `[Current Daily Interest] + [Transfer Fee]`.

### `Generate Today's Charge`

- Principal Due uses explicit type branches:
  - fixed due date: `[Outstanding Principal]`
  - daily interest: `0`
  - daily installment: `batchP` from the allocation specification
  - fallback: `0`
- Interest Due uses explicit type branches:
  - daily interest: `[Accrued Interest]`
  - fixed due date: `[Fixed Interest]`
  - daily installment: `batchI` from the allocation specification
  - fallback: `0`
- Eligibility condition:

  ```appsheet
  AND(
    [Loan Status] = "ยังไม่ปิดยอด",
    COUNT(
      SELECT(
        Charges[Row ID],
        AND(
          [Ref Loans] = [_THISROW].[Row ID],
          [Charge Date] = TODAY()
        )
      )
    ) = 0,
    IFS(
      [Loan Type] = "ดอกเบี้ยรายวัน",
        AND(
          TODAY() > [Loan Date],
          [Interest Payment Interval] >= 1,
          MOD(
            FLOOR(TOTALHOURS(TODAY() - [Loan Date]) / 24),
            [Interest Payment Interval]
          ) = 0
        ),
      [Loan Type] = "กำหนดวันชำระ",
        [Due Date] = TODAY(),
      [Loan Type] = "ผ่อนชำระรายวัน",
        AND(
          TODAY() > [Loan Date],
          TODAY() <= [Due Date],
          [Interest Payment Interval] >= 1,
          ISNOTBLANK(MAX([Related Charges][Charge Date])),
          OR(
            MOD(
              FLOOR(TOTALHOURS(TODAY() - [Loan Date]) / 24),
              [Interest Payment Interval]
            ) = 0,
            TODAY() = [Due Date]
          )
        ),
      TRUE,
        FALSE
    )
  )
  ```

The action was temporarily made Prominent for controlled manual execution during testing and was restored to **Hide** in the final clone version.

### Closure actions

- `Wrapped Action - Close Loan` condition now explicitly limits manual closure to daily-interest loans:

  ```appsheet
  AND(
    [Loan Type] = "ดอกเบี้ยรายวัน",
    [Loan Status] = "ยังไม่ปิดยอด",
    [Outstanding Principal] > 0
  )
  ```

- `Close Related Loan - Fixed Due Date` was extended to fixed-date and daily-installment principal-bearing Charges:

  ```appsheet
  AND(
    IN([Ref Loans].[Loan Type], LIST("กำหนดวันชำระ", "ผ่อนชำระรายวัน")),
    [Principal Due] > 0
  )
  ```

- Existing `Set Loan Closed` guard based on zero Outstanding Principal was preserved.

## Automation changes

### `Create First-Day Charge`

Event condition:

```appsheet
OR(
  AND([Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest] > 0),
  AND([Loan Type] = "ผ่อนชำระรายวัน", [Daily Payment Amount] > 0)
)
```

### `Auto Receive First-Day Charge`

Event condition:

```appsheet
AND(
  IN([Ref Loans].[Loan Type], LIST("ดอกเบี้ยรายวัน", "ผ่อนชำระรายวัน")),
  [Charge Date] = [Ref Loans].[Loan Date],
  [Payment Count] = 0,
  [Amount Remaining] > 0
)
```

### `Generate Daily Charges`

- Existing schedule retained: daily at `00:05` in the configured Southeast Asia time zone.
- Per-row filter updated to the same three-type eligibility logic used by `Generate Today's Charge`.
- No second daily-charge action or bot was added.

### Notification safety in the clone

The event conditions for these three copied notification bots are `FALSE`:

- `Notification - New Loan Created`
- `Notification - Loan Closed`
- `Notification - Charge Received`

This suppression is test-environment-only and must **not** be copied to production unless separately approved.

## View changes

- `Loans_Form`: added `Daily Payment Amount` immediately after `Due Date`.
- `Loans_Detail`: added `Daily Payment Amount` immediately after `Due Date`.
- Conditional Show_If rules display the new amount and Payment Interval only for applicable types.

## Runtime test results

All amounts below are synthetic. No real borrower or production data was used.

| Test | Expected | Result |
| --- | --- | --- |
| Whole-baht validation | Decimal principal rejected for new type | Passed; bilingual principal error shown and form remained open |
| Scheduled-total validation | Daily amount × inclusive days must exceed principal | Passed; invalid total rejected |
| Decimal daily payment | Daily Payment Amount must be whole baht | Passed; bilingual daily-payment error shown |
| Date validation | Due Date may equal Loan Date, but not precede it | Passed; prior date rejected as invalid |
| First day, uneven principal, interval 3 | P3,002; D500; 7 inclusive days; fee20 → first Charge P429/I91 and auto-repayment P429/I91 | Passed |
| Final interval | Same loan, remaining six days → final Charge P2,573/I427 | Passed; principal total P3,002 and contract interest plus fee total I518 |
| Duplicate guard | Same-date action unavailable after Charge creation | Passed; Generate action disappeared after creation |
| Automatic closure | Full final repayment closes loan | Passed; Close Date 2026-08-31, status closed, outstanding principal zero |
| Manual early closure | Close action hidden for new type | Passed on active daily-installment details |
| Partial final tail | P3,000; D600; 6 inclusive days; interval 4; due-day elapsed 5 not divisible by 4 | Passed; first Charge P500/I100, forced final Charge P2,500/I500, then closed |
| Default | P1,500; D600; 3 days; first Charge P500/I100; default with P1,000 outstanding | Passed; closed/defaulted and Default Loss Amount P1,000 |
| Daily-interest regression | P1,000; current daily interest100; fee10; interval2 | Passed; first Charge P0/I110 and auto-repayment P0/I110 |
| Fixed-date regression | P1,000; fixed interest200; due today | Passed; Charge P1,000/I200, full repayment, automatic closure |
| Transfer-fee compatibility | Fee appears only in first-day interest | Passed in uneven-principal case; later Charge excluded fee |
| Expected Daily Interest — open installment | ฿3,000/฿500/7 days contributes ฿71.43; ฿3,001/฿500/7 days contributes ฿71.29 | Passed; combined contribution ฿142.71 |
| Expected Daily Interest — aggregate | Prior daily-interest-only KPI ฿6,800 plus ฿142.71 | Passed; synchronized standalone app displays ฿6,943 after whole-baht display rounding |
| Expected Daily Interest — closed/fixed branches | Closed/defaulted installments and fixed-date loans contribute zero | Passed; KPI increase matched exactly the two open installment loans and no other loan types |
| Expected Daily Interest — daily-interest regression | Existing open daily-interest contribution remains based on Current Daily Interest | Passed; P6,800 baseline retained before adding the two installment averages |
| Borrower aggregate dependency | Active Daily Interest uses the same row-level VC filtered by Ref Borrowers | Passed; saved formula re-read from the clone after version save |
| App validation | AppSheet definition health | Passed; final editor status `No issues found` |

### Test limitations and retained evidence

- The 00:05 clock trigger was not time-travel tested. Its final per-row filter matches the manually executed action guard, and the underlying action was tested against regular and forced-tail conditions.
- External notification delivery was intentionally not tested.
- Two synthetic loans created before deployment or before the first-day event filter was corrected remain as negative-control rows without first-day Charges. They are isolated test data and document the observed precondition; do not treat them as feature-pass cases.
- The copied database is a snapshot. Production data volume, offline clients, user-role variation, and concurrent execution were not simulated.

## Checks performed

- Confirmed production OLTP version `2.200082` before clone work.
- Confirmed clone rollback version `1.000002` before feature edits.
- Confirmed copied Sheets are separate, private files.
- Regenerated the clone schema after adding the physical field.
- Tested expressions through AppSheet validation and corrected mixed-type `LIST()` operations before acceptance.
- Ran the deployment check before deploying the test clone.
- Re-read copied Loans, Charges, and Repayments rows after each representative scenario.
- Confirmed daily-installment workflow baseline version `1.000014`, `No issues found`, and recurring action restored to Hide.
- Recorded version `1.000014` as the rollback point immediately before the Expected Daily Interest enhancement.
- Confirmed final clone version `1.000015`, `No issues found`, synchronized standalone KPI ฿6,943, and saved Statistics/Borrowers dependencies.
- Confirmed production pre-change version `2.200082`, incomplete intermediate version `2.200091`, and corrected version `2.200092`.
- Confirmed production Loans source is AppSheet Database `Money database`, not the clone's copied Google Sheets.
- Confirmed production Loans reports 40 columns and no longer reports an out-of-sync schema warning.
- Confirmed the only remaining editor warning is the existing PII classification warning for `Closed By` and `Created By`.
- Rechecked the affected fields, actions, automation filters, and view column placement against the tested clone configuration during the rollout.
- Confirmed production notification bots were not changed and no production financial test row was created.
- Re-read the production AppSheet Database Loan Type enum after correction and confirmed all three saved options.
- Opened the actual production `Loans_Form`, selected `ผ่อนชำระรายวัน`, verified its conditional fields, and cancelled without saving.
- Confirmed the Statistics manual action omitted daily-installment loans from both its row-selection and visibility expressions.
- Added the matching daily-installment interval/due-tail eligibility branch to both expressions and re-read them after save.
- Opened the actual production dashboard and confirmed `Generate All Today's Charges` was visible; did not execute it.

## Production implementation sequence completed

1. Recorded production OLTP version `2.200082` before editing.
2. Added physical `Daily Payment Amount` to the production Loans source and regenerated the OLTP schema.
3. Applied the field configuration and existing-field validation changes in this document.
4. Added `ผ่อนชำระรายวัน` to the Loan Type enum.
5. Updated the three affected loan VCs with explicit three-type logic.
6. Added `Loans[Expected Daily Interest Amount]`, then updated `Statistics[Expected Daily Interest]` and `Borrowers[Active Daily Interest]` to use it.
7. Applied the first-day and recurring action changes using the whole-baht allocation specification.
8. Updated the first-day, auto-receive, and scheduled-bot event filters.
9. Updated manual and automatic closure conditions.
10. Added the physical field to Loans_Form and Loans_Detail.
11. Saved and regenerated the schema until the out-of-sync warning cleared; no production transaction test record was created.
12. Production manual acceptance remains to be performed with an approved test borrower: uneven remainder, interval >1, due-date tail, auto-receipt, full closure, default, Expected Daily Interest, daily-interest regression, and fixed-date regression.
13. Did not copy the clone's `FALSE` notification conditions to production.
14. Left OLAP Reporting Loans, exports, and Looker Studio unchanged; downstream completeness remains pending a separate review.
15. Updated the Markdown overview and this change log. The Excel dictionary was subsequently reconciled after explicit approval of the fallback authoring method.

## Production manual acceptance checklist

- With an approved test borrower, create `ผ่อนชำระรายวัน` principal ฿3,002, daily payment ฿500, seven inclusive days, interval three, and fee ฿20. Confirm first-day Charge P429/I91 is auto-received and the due-date tail is P2,573/I427.
- Create a six-day principal ฿3,000 / daily ฿600 case with interval four. Confirm first-day P500/I100 and forced due-date tail P2,500/I500.
- Confirm decimal principal, decimal Daily Payment Amount, a scheduled total not exceeding principal, and Due Date before Loan Date are rejected.
- Confirm manual Close is absent for an active daily-installment loan, full final repayment closes automatically, and the existing default action records remaining principal as loss.
- Confirm Transfer Fee appears only in first-day interest and does not increase `Expected Daily Interest`.
- Confirm `Expected Daily Interest` and borrower `Active Daily Interest` include average daily contract interest for open daily-installment loans and return to zero after closure/default.
- Re-run one daily-interest loan and one fixed-date loan to verify their first Charge, recurring/due Charge, and closure behavior remain unchanged.
- Observe at least one scheduled 00:05 run to verify automatic interval/due-tail creation and confirm existing production notifications still deliver as configured.
- Reconcile any new production test Charges and Repayments before acceptance; use an auditable reversal/adjustment path if correction is required.

## Rollback instructions

### Test clone

1. To roll back only the Expected Daily Interest enhancement, restore version `1.000014`.
2. To roll back the entire daily-installment feature, restore version `1.000002`.
3. The copied Loans Sheet column `S` is isolated test data; leave it in place for audit or remove it only if the entire clone is intentionally retired.
4. If retiring the environment, archive/delete the clone and copied Drive folder only after explicit approval.

### Production rollback

1. Restore production AppSheet version `2.200082`.
2. Do not delete posted Charges or Repayments created during an accepted financial test; use an auditable reversal/default/adjustment path if correction is required.
3. The nullable physical `Loans[Daily Payment Amount]` column will remain in the AppSheet Database after an app-version restore. Retain it for a reversible rollback, or remove it only after a separate dependency review and explicit approval.
4. Reconcile the restored app definition, retained physical column, documentation, and any manual-test records, then record the rollback in this file.

## Documentation updated

- `Documents/AppSheet_Data_Model_Overview.md`: updated with the production OLTP and OLAP versions, physical/VC counts, business rules, environment boundary, Loan Assessment helper design, and downstream implications.
- `Change Logs/CHANGE_NOTES_DAILY_INSTALLMENT_LOAN_TEST_2026-08-31.md`: updated as the detailed clone-test, production implementation, validation, and rollback record.
- `Documents/AppSheet_Data_Dictionary.xlsx`: reconciled with production OLTP v2.200099 and OLAP v1.000164. It records 82 shared VCs with the five prior formula variances resolved, OLAP-only projection helpers, current table/slice counts, and the separate OLTP-only `Borrowers[Hidden Flag]` variance.

## OLAP replication — implemented 2026-09-01 at v1.000164

This section preserves the reviewed implementation specification and records its completed production OLAP result. It covers the verified starting state, exact shared definitions, OLAP-only Loan Assessment dependencies, deliberately excluded operational objects, checks, and rollback instructions.

### Implementation result and rollback point

| Item | Production OLAP result |
| --- | --- |
| App | `Loan Business Insights` (`e74dd368-654f-44d7-bccf-83cf361d1cdb`; internal name `LoanBusinessInsights-975338008`) |
| Pre-change rollback version | `1.000160` |
| Intermediate validation version | `1.000163` — exposed two Number/Price clamp type mismatches in Calendar; not the accepted endpoint |
| Current corrected version | `1.000164` |
| Loans schema | 50 columns: 20 physical and 30 VCs |
| Calendar schema | 28 columns: 2 physical and 26 VCs |
| Reporting Loans | Read-only, filter `TRUE`, 32 columns |
| Reporting Statistics | Read-only, 17 columns; membership unchanged |
| Reporting Borrowers | Read-only, 40 columns; membership unchanged |
| Production data | No Loan, Charge, Repayment, Loan Assessment, Calendar-source, or assessment-control row changed |
| Editor health | No new formula or schema error; only the pre-existing Borrowers schema warning caused by intentionally OLTP-only `Borrowers[Hidden Flag]` remains |

The accepted v1.000164 correction uses Price-typed zero values in the two Calendar `MAX(LIST(...))` clamps: `[Assessment Installment Future Principal Due] * 0` and `[Assessment Installment Contract Principal Due] * 0`. This preserves type consistency without changing the intended nonnegative calculations.

Implementation scope:

- regenerated only the OLAP `Loans` schema, loading the existing shared physical `Daily Payment Amount` once; no new source column was created;
- confirmed the shared `Loan Type` Enum contains `กำหนดวันชำระ`, `ดอกเบี้ยรายวัน`, and `ผ่อนชำระรายวัน`;
- configured `Daily Payment Amount` as whole-baht Price with the OLTP bilingual label and description, without copying OLTP form-only visibility, required, or validation expressions into read-only OLAP;
- added hidden Price VC `Loans[Expected Daily Interest Amount]` and aligned the five shared formulas in this section to the production OLTP definitions;
- added the minimum OLAP-only projection layer: one hidden loan-level base allocation VC and four hidden Calendar schedule VCs, then updated the four existing Calendar projection/assessment formulas;
- exposed `Daily Payment Amount` and `Expected Daily Interest Amount` as positions 31 and 32 in read-only `Reporting Loans`; and
- did not copy OLTP forms, actions, bots, notifications, charge generation, closure controls, or other transaction-entry behavior.

### Verified pre-change baseline and gaps

The initial review was read-only. The table below records the v1.000160 state used to design and authorize the later v1.000164 implementation.

| Object | Verified state on 2026-09-01 | Daily-installment gap |
| --- | --- | --- |
| Production OLTP | `Loan Manager ผู้จัดการสินเชื่อ` v`2.200095`; App reports `No issues found` | Governing implemented definition |
| OLAP app | `Loan Business Insights` (`e74dd368-654f-44d7-bccf-83cf361d1cdb`) v`1.000160`; App reported `No issues found` | Recorded and retained as the actual OLAP rollback point |
| Data-model documentation snapshot | Excel dictionary and Markdown overview were last formula-reconciled against OLAP v`1.000151`; later unrelated OLAP versions existed | Every affected live formula was re-read at v1.000160 before editing; the older documentation version was not used as the rollback point |
| OLAP `Loans` table | 47 loaded columns: 19 physical and 28 VCs | `Daily Payment Amount` is not loaded and `Expected Daily Interest Amount` does not exist |
| Shared source | AppSheet Database `Money database` / `Loans` | The source already contains physical `Daily Payment Amount` and the three-value `Loan Type` Enum; do not create a second database column or re-edit the source enum during the OLAP rollout |
| `Reporting Loans` | Read-only, filter `TRUE`, 30 columns | Does not expose `Daily Payment Amount` or `Expected Daily Interest Amount` |
| `Reporting Statistics` | Read-only, filter `TRUE`, 17 columns | Already includes `Expected Daily Interest`; membership need not change, but its source formula must be aligned |
| `Reporting Borrowers` | Read-only, filter `TRUE`, 40 columns | Does not include `Active Daily Interest`; no slice change is required unless per-borrower daily-interest output is intentionally added |

The current OLAP formulas still implement the old two-type model for these five shared VCs:

1. `Loans[Loan Type TE]`
2. `Loans[Expected Interest This Month]`
3. `Loans[Effective Daily Interest Rate]`
4. `Statistics[Expected Daily Interest]`
5. `Borrowers[Active Daily Interest]`

The review also found four OLAP-only Calendar formulas that explicitly enumerate only daily-interest and fixed-date loans. These were not part of the OLTP rollout and must be addressed before OLAP parity can be declared:

1. `Calendar[Projected Outstanding Principal]`
2. `Calendar[Projected Interest]`
3. `Calendar[Assessment Principal Base]`
4. `Calendar[Assessment Principal Start Weight]`

### Implemented OLAP sequence and final state

1. Open `Loan Business Insights` and record the then-current version as the OLAP rollback point. The review baseline was v`1.000160`, but a later implementation must use the actual version visible immediately before editing.
2. Regenerate only the OLAP `Loans` schema from the existing shared AppSheet Database table. Confirm that the physical column count changes from 19 to 20 and that `Daily Payment Amount` appears exactly once.
3. Re-read `Loans[Loan Type]` after regeneration and confirm the three source values: `กำหนดวันชำระ`, `ดอกเบี้ยรายวัน`, and `ผ่อนชำระรายวัน`. Do not create a separate OLAP-only spelling or translation.
4. Configure the loaded `Loans[Daily Payment Amount]` as Price, whole baht, currency `฿`, with display name `ยอดชำระรายวัน / Daily Payment Amount` and the contract-description text used in OLTP. OLAP is read-only, so OLTP form-only `Show_If`, `Required_If`, and input validation do not need to be copied unless an OLAP editing workflow is separately approved.
5. Add hidden Price VC `Loans[Expected Daily Interest Amount]` using the exact target formula below.
6. Replace the five shared VC formulas listed above with the exact OLTP target formulas below. Save and re-read each formula after save.
7. Review and redesign the four OLAP-only Calendar formulas before enabling daily-installment results in Loan Assessment. Do not merely treat every non-fixed loan as daily-interest and do not hold installment principal flat through Due Date; either shortcut would misstate projected principal and interest.
8. Add `Daily Payment Amount` and `Expected Daily Interest Amount` to `Reporting Loans`, preserving the existing `TRUE` filter and read-only mode. The expected slice-column count is 32 after both additions. Keep `Reporting Statistics` unchanged at 17 columns. Keep `Reporting Borrowers` unchanged unless per-borrower `Active Daily Interest` is explicitly required downstream.
9. Save and verify the final OLAP `Loans` table has 50 columns: 20 physical plus 30 VCs. The earlier estimate of 49 did not include the later-approved `Daily Installment Base Principal` helper required for an exact Calendar allocation schedule.
10. Run the functional and regression checklist below. Do not update Looker Studio or the XLSX export template in the same unreviewed step.
11. Update `Documents/AppSheet_Data_Model_Overview.md`, `Documents/AppSheet_Data_Dictionary.xlsx`, and this change log in the same OLAP implementation task. The five shared-formula variance flags were removed after live equality was verified; the one Loans helper and four Calendar helpers are recorded as intentional OLAP-only definitions.

### Exact OLAP target definitions copied from production OLTP v2.200095

`Loans[Daily Payment Amount]`:

| Setting | Target |
| --- | --- |
| Kind / type | Physical / Price |
| Decimal digits | `0` |
| Currency | `฿` |
| Display name | `ยอดชำระรายวัน / Daily Payment Amount` |
| Description | `ยอดรวมต่อหนึ่งวันตามสัญญา ระบบจะรวมหลายวันเมื่อรอบการชำระมากกว่า 1 วัน / Contract amount per day; interval charges combine elapsed days.` |
| OLAP availability | Loaded from the existing shared source; no new database column |

`Loans[Expected Daily Interest Amount]`:

| Setting | Target |
| --- | --- |
| Kind / type | VC / Price |
| Decimal digits | `2` |
| Currency | `฿` |
| Show? | `FALSE` |

```appsheet
IFS(
  [Loan Status] <> "ยังไม่ปิดยอด", 0,
  [Loan Type] = "ดอกเบี้ยรายวัน", [Current Daily Interest],
  AND(
    [Loan Type] = "ผ่อนชำระรายวัน",
    ISNOTBLANK([Loan Date]),
    ISNOTBLANK([Due Date]),
    [Due Date] >= [Loan Date],
    [Daily Payment Amount] > 0
  ),
    (
      ([Daily Payment Amount] * (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1))
      - [Principal Amount]
    )
    / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1),
  TRUE, 0
)
```

`Statistics[Expected Daily Interest]`:

```appsheet
SUM(Loans[Expected Daily Interest Amount])
```

`Borrowers[Active Daily Interest]`:

```appsheet
SUM(
  SELECT(
    Loans[Expected Daily Interest Amount],
    [Ref Borrowers] = [_THISROW].[Row ID]
  )
)
```

`Loans[Loan Type TE]`:

```appsheet
SWITCH(
  [Loan Type],
  "กำหนดวันชำระ", "กำหนดวันชำระ / Fixed Due Date",
  "ดอกเบี้ยรายวัน", "ดอกเบี้ยรายวัน / Daily Interest",
  "ผ่อนชำระรายวัน", "ผ่อนชำระรายวัน / Daily Installment",
  "ไม่ทราบประเภท / Unknown"
)
```

`Loans[Effective Daily Interest Rate]`:

```appsheet
IFS(
  [Loan Type] = "ดอกเบี้ยรายวัน",
    [Current Daily Interest] / [Principal Amount],
  [Loan Type] = "กำหนดวันชำระ",
    ([Fixed Interest] / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)) / [Principal Amount],
  [Loan Type] = "ผ่อนชำระรายวัน",
    (
      (([Daily Payment Amount] * (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)) - [Principal Amount])
      / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)
    ) / [Principal Amount],
  TRUE, 0
)
```

`Loans[Expected Interest This Month]` exact saved target:

```appsheet
IF([Loan Status] = "ปิดยอดแล้ว", 0, IFS([Loan Type] = "ดอกเบี้ยรายวัน", MAX(LIST([Current Daily Interest] * 0, [Accrued Interest])) + ([Current Daily Interest] * (DAY(EOMONTH(TODAY(), 0)) - DAY(TODAY()))), [Loan Type] = "กำหนดวันชำระ", IF(AND([Due Date] > TODAY(), MONTH([Due Date]) = MONTH(TODAY()), YEAR([Due Date]) = YEAR(TODAY())), [Fixed Interest], 0), [Loan Type] = "ผ่อนชำระรายวัน", IF(AND(ISNOTBLANK(MAX([Related Charges][Charge Date])), IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) > MAX([Related Charges][Charge Date])), ([Daily Payment Amount] * IF(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) > MAX([Related Charges][Charge Date]), TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - MAX([Related Charges][Charge Date])) / 24, 0)) - (FLOOR([Principal Amount] / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)) * IF(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) > MAX([Related Charges][Charge Date]), TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - MAX([Related Charges][Charge Date])) / 24, 0) + IF((IF((TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - [Loan Date]) / 24 + 1) < MOD([Principal Amount], (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)), (TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - [Loan Date]) / 24 + 1), MOD([Principal Amount], (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1))) - (TOTALHOURS(MAX([Related Charges][Charge Date]) - [Loan Date]) / 24 + 2) + 1) > 0, (IF((TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - [Loan Date]) / 24 + 1) < MOD([Principal Amount], (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)), (TOTALHOURS(IF([Due Date] < EOMONTH(TODAY(), 0), [Due Date], EOMONTH(TODAY(), 0)) - [Loan Date]) / 24 + 1), MOD([Principal Amount], (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1))) - (TOTALHOURS(MAX([Related Charges][Charge Date]) - [Loan Date]) / 24 + 2) + 1), 0)), 0), TRUE, 0))
```

### OLAP-only Loan Assessment design — implemented

At v1.000160 the Calendar formulas used explicit two-type population filters and excluded `ผ่อนชำระรายวัน`. At v1.000164 the approved declining-balance interpretation was implemented:

- projected outstanding principal for a daily-installment loan should start from current `Outstanding Principal`, subtract only the contract principal scheduled after the current/latest posted Charge through the earlier of the Calendar date and Due Date, and never fall below zero;
- projected interest should include actual `Total Interest Received` plus only future scheduled installment interest over the same horizon; Transfer Fee must not be projected again;
- whole-baht principal allocation must use the same earliest-day remainder rule as the OLTP Charge actions;
- `Assessment Principal Base` and `Assessment Principal Start Weight` must use the same declining daily-installment balance assumption so `Minimum Required Profit` does not treat the installment principal as flat until Due Date; and
- fixed-date and daily-interest branches remain unchanged.

The smallest exact mapping layer was used because AppSheet cannot evaluate a different per-loan whole-baht allocation expression inside one aggregate without row context. These five hidden OLAP-only fields are therefore intentional reporting helpers, not duplicated operational state:

| Field | Type | Exact role |
| --- | --- | --- |
| `Loans[Daily Installment Base Principal]` | Number VC | `FLOOR(Principal Amount / inclusive term days)` for a valid daily-installment contract, else zero |
| `Calendar[Assessment Installment Contract Principal Due]` | Price VC | Sum each selected borrower's base principal due on the Calendar date and add ฿1 for each loan whose inclusive day index is within `MOD(Principal Amount, inclusive term days)` |
| `Calendar[Assessment Installment Future Principal Due]` | Price VC | Same whole-baht amount, restricted to Calendar dates after that loan's latest posted Charge; if no Charge exists, use `Loan Date - 1` as the cutoff |
| `Calendar[Assessment Installment Future Interest Due]` | Price VC | Sum contract `Daily Payment Amount` after the same cutoff, less the future principal due on that date; Transfer Fee is excluded |
| `Calendar[Assessment Installment Contract Outstanding]` | Price VC | Nonnegative sum of installment principal less cumulative contract principal scheduled through the Calendar date |

`Loans[Daily Installment Base Principal]` was saved as:

```appsheet
IF(
  AND(
    [Loan Type] = "ผ่อนชำระรายวัน",
    ISNOTBLANK([Loan Date]),
    ISNOTBLANK([Due Date]),
    [Due Date] >= [Loan Date]
  ),
  FLOOR(
    [Principal Amount]
    / (TOTALHOURS([Due Date] - [Loan Date]) / 24 + 1)
  ),
  0
)
```

The four existing Calendar VCs were changed as follows:

| Existing field | v1.000164 daily-installment branch |
| --- | --- |
| `Projected Outstanding Principal` | Preserve the previous daily-interest/fixed-date sum; add `MAX(Price-zero, sum of current installment Outstanding Principal for loans begun by the candidate date - cumulative Assessment Installment Future Principal Due through the candidate date)` |
| `Projected Interest` | Preserve actual interest received and previous daily-interest/fixed-date projections; add cumulative `Assessment Installment Future Interest Due` through the candidate date |
| `Assessment Principal Base` | Preserve the previous daily-interest/fixed-date principal base; add `Assessment Installment Contract Outstanding` |
| `Assessment Principal Start Weight` | Preserve the previous daily-interest/fixed-date weight; add `((Candidate Day Index + 1) × Assessment Installment Contract Outstanding) - cumulative Assessment Installment Contract Outstanding through the candidate date` |

The complete saved expressions for these nine changed/added OLAP projection fields are inventoried in the `Columns` worksheet of `Documents/AppSheet_Data_Dictionary.xlsx`. The workbook also marks all five helper definitions as OLAP-only in `App Variances`, so a later rebuild can distinguish shared OLTP parity fields from reporting-only projection support.

The redesign is an OLAP feature dependency, not an OLTP action copy. The live formulas saved without new errors and the embedded Analytics preview remained runnable. Because the current Loan Assessment control row did not select an active installment borrower, the candidate-date boundary behavior still needs the controlled manual test listed below before user acceptance.

### OLTP objects deliberately excluded from OLAP replication

Do not copy these operational objects into `Loan Business Insights`:

- `New Loan Payment - Create First-Day Charge`;
- `Generate Today's Charge`;
- Statistics action `Generate All Today's Charges`;
- `Create First-Day Charge`, `Auto Receive First-Day Charge`, or `Generate Daily Charges` automation changes;
- manual or automatic closure-action changes;
- `Loans_Form` or `Loans_Detail` input placement and form validation behavior;
- production notification settings; or
- the clone-only notification condition `FALSE`.

The shared OLTP app remains the only transaction-entry and charge-generation surface. OLAP must stay read-only for these reporting slices.

### Downstream exports, persisted analytics, and Looker Studio

- `Charges`, `Repayments`, `Reporting Charges`, and `Reporting Repayments` need no new field for this loan type. Their existing principal/interest allocation columns already carry the daily-installment split. Verify that paid/partial/unpaid/default statuses remain driven by posted amounts and existing status logic; do not add a loan-type-specific status shortcut.
- The current Daily Loan Analysis XLSX template has a fixed 22-column Loans tab and does not include either new field. `Reporting Loans` is now aligned, but the export template was intentionally not changed. If the fields are later required in the workbook, update the template schema version, test the export separately, and document its own rollback.
- Existing `Daily Analytics` rows are persisted snapshots. The seven historical Charge/Repayment allocation changes for 25–31 August 2026 do not automatically prove that stored daily snapshots now reconcile. Before any rebuild, compare the affected daily rows with current Charges and Repayments. Use the existing rebuild workflow only with explicit approval because it can replace historical analytical rows; record its backup and result in a separate change-log entry.
- Looker Studio was not changed by this feature. A separate dashboard task must create the mandatory report backup, refresh the governed fields, confirm Loan Type filters recognize `ผ่อนชำระรายวัน`, define the grain/date basis for any new metric, and reconcile dashboard totals to the accepted OLAP slices.

### OLAP checks performed and results

- Confirmed Loans has 50 columns: 20 physical and 30 VCs; `Daily Payment Amount` is present exactly once, and the hidden `Expected Daily Interest Amount` and `Daily Installment Base Principal` VCs are present exactly once.
- Confirmed Calendar has 28 columns: 2 physical and 26 VCs; all four installment schedule helpers are hidden and their saved expressions read back correctly.
- Confirmed `Loan Type` retains all three Thai values and `Loan Type TE` returns `ผ่อนชำระรายวัน / Daily Installment` without changing the two existing translations.
- Confirmed `Daily Payment Amount` is visible Price with zero decimals and `฿`; `Expected Daily Interest Amount` is hidden Price with two decimals and `฿`.
- Confirmed the five shared formulas saved exactly and the earlier OLTP/OLAP variance flags are resolved.
- Confirmed `Reporting Loans` remains read-only with filter `TRUE` and 32 fields, with `Daily Payment Amount` and `Expected Daily Interest Amount` at positions 31 and 32. `Reporting Statistics` remains read-only with 17 fields, and `Reporting Borrowers` remains read-only with 40.
- Representative open daily-installment check: the designated ฿5,000 principal, ฿500/day, 17-inclusive-day contract produces base principal ฿294, average expected daily interest ฿205.88, effective daily rate 4.12%, and ฿1,854 expected remaining current-month interest after the latest posted Charge. Transfer Fee is excluded.
- Uneven-principal check: `FLOOR(5000 / 17) = 294`, remainder 2; the first two contract days allocate principal 295/interest 205 and later days allocate principal 294/interest 206.
- Aggregate reconciliation: OLTP and OLAP `Statistics[Expected Daily Interest]` both displayed ฿6,906 at the same cutoff after the new type was included.
- Existing-type controls: an open daily-interest row retained current/expected daily interest of ฿300 and an effective rate of 10%; a closed fixed-date sample retained expected daily interest of zero and a 5.56% effective rate; the first five reviewed closed fixed/daily rows contributed zero expected daily interest.
- Embedded OLAP Analytics remained runnable at v1.000164. The only editor warning is the pre-existing Borrowers schema drift caused by intentionally not loading OLTP-only `Hidden Flag`; no new daily-installment formula/schema error remains.
- The selected Loan Assessment control row had no active installment loan, so its helper values were zero at the reviewed dates while the existing calculations remained numeric and runnable. No control row was changed merely to force a test.

### Manual testing still required before acceptance

- In the OLAP Loan Assessment workflow, deliberately select a borrower with an active daily-installment loan and check today, the next uncharged/interval date, Due Date, and the day after Due Date.
- Confirm projected principal follows the earliest-remainder whole-baht schedule, never goes negative, and subtracts only installment principal after the latest posted Charge.
- Confirm projected interest adds only scheduled uncharged contract interest, excludes Transfer Fee, and stops after Due Date.
- Confirm `Assessment Principal Base`, `Assessment Principal Start Weight`, `Minimum Required Profit`, and the final recommendation move consistently with the declining installment balance.
- Clean-sync the standalone OLAP app and recheck representative daily-installment, daily-interest, and fixed-date rows rather than relying only on editor previews.
- Reconcile any Daily Loan Analysis export and Looker Studio follow-up separately; neither was changed or accepted in this task.

### OLAP rollback guidance

1. Restore production OLAP app version `1.000160`, the recorded pre-change rollback point.
2. An OLAP version restore will not remove the shared physical `Daily Payment Amount` source column; that column belongs to the already accepted OLTP feature and must remain.
3. If only reporting-slice exposure is rejected, remove the two fields from `Reporting Loans` and restore the prior slice order without rolling back the OLTP source.
4. If Calendar projection logic alone is rejected, restore the prior four Calendar formulas, remove the one Loans helper and four Calendar helper VCs, and label Loan Assessment as not supporting daily-installment loans until a corrected design is approved.
5. Do not roll back or rewrite production Charges, Repayments, statuses, or the accepted historical allocations as part of an OLAP definition rollback.
6. Update this file and both data-model documents with the restored version, formula status, slice membership, tests, and any downstream reconciliation impact.

## Acceptance

- Technical implementation in isolated clone: complete.
- Clone runtime testing: complete with limitations above.
- Production OLTP configuration, form-level verification, and Statistics manual-action visibility correction: complete at v2.200094; current production editor baseline is v2.200099 after the separate borrower-visibility change.
- Production runtime acceptance: the designated daily-installment Charge and its historical allocation correction were reviewed and accepted; the broader regression checklist remains pending.
- Production OLAP alignment: implemented and configuration-verified at v1.000164 from rollback v1.000160. Schema, shared formulas, helper formulas, reporting slices, representative values, and existing-type controls were checked. User acceptance remains pending the controlled Loan Assessment boundary-date test and clean standalone sync.
- Looker Studio and Daily Loan Analysis export alignment: not implemented; each remains a separate downstream task with its own required backup, reconciliation, and acceptance.
- Excel data-dictionary reconciliation: complete using the user-approved `openpyxl` fallback.

## Production historical allocation repair — 2026-09-01

### Scope and authorization

- Reallocated the existing Charges and matching Repayments for the designated production daily-installment loan from its Loan Date, 2026-08-25, through 2026-08-31 (yesterday).
- This was a record-level allocation correction only. No row was created or deleted, and no Charge/Payment status, date, total amount, relationship, note, or loan status was edited.
- The 2026-09-01 Charge was excluded because it was already generated with the correct P294/I206 allocation and was outside the requested historical range.

### Rollback point

- App configuration remained at production OLTP version `2.200094`; no app-definition change was made.
- Before-value snapshot for each of the seven historical Charges and Repayments: principal allocation `0`, interest allocation `500`, total `500`.
- AppSheet Database change history provides the row-level audit trail. A targeted rollback may also restore P0/I500 to the same seven Charge and Repayment rows without changing status or any other field.

### Allocation applied

| Date | Charge Principal Due | Charge Interest Due | Repayment Principal Paid | Repayment Interest Paid | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-08-25 | 295 | 205 | 295 | 205 | 500 |
| 2026-08-26 | 295 | 205 | 295 | 205 | 500 |
| 2026-08-27 | 294 | 206 | 294 | 206 | 500 |
| 2026-08-28 | 294 | 206 | 294 | 206 | 500 |
| 2026-08-29 | 294 | 206 | 294 | 206 | 500 |
| 2026-08-30 | 294 | 206 | 294 | 206 | 500 |
| 2026-08-31 | 294 | 206 | 294 | 206 | 500 |
| **Total** | **2,060** | **1,440** | **2,060** | **1,440** | **3,500** |

### Verification performed

- Re-read all seven Charge details after the edits and confirmed the expected principal/interest pair and unchanged total of 500 for every date.
- Confirmed all seven Charges still display `ชำระแล้ว / Payment Received` and retain one matching Repayment of 500.
- Synchronized the OLTP app, reloaded the production AppSheet Database, reapplied the designated-loan relationship filter, and confirmed the persisted Charge values for all seven dates.
- Re-read the seven filtered Repayment rows and confirmed their persisted principal/interest allocations match the Charges exactly.
- Reconciled Charges and Repayments to principal 2,060 plus interest 1,440 equals total collections 3,500; no status field was edited.

### Status and rollback

- Historical allocation repair: complete.
- Broader production manual acceptance items listed above remain pending and are unaffected by this repair.
- To roll back only this repair, restore Principal Due/Principal Paid to 0 and Interest Due/Interest Paid to 500 on the seven dated Charge/Repayment pairs, leaving all statuses and other fields unchanged. Reconcile both tables to total 3,500 after rollback.

## Documentation reconciliation follow-up — 2026-09-01

- Updated `Documents/AppSheet_Data_Model_Overview.md` to replace the pre-runtime-test status with the verified production charge-generation and historical allocation outcome.
- Clarified that the seven-row-pair allocation repair was transactional and did not change schema, expressions, statuses, dates, row counts, or total collections.
- Re-ran the approved workspace dependency loader and attempted to open `Documents/AppSheet_Data_Dictionary.xlsx` with the mandated `@oai/artifact-tool` authoring workflow.
- The loader-provided `node_modules` directory did not contain `@oai/artifact-tool`; the initial import failed before the workbook could be modified. No alternate authoring library was used until the user explicitly approved `openpyxl` as the fallback.
- Markdown verification: the daily-installment physical field, loan-type enum, row-level Expected Daily Interest VC, dependent aggregates, charge-generation behavior, closure restrictions, rollback versions, and production runtime result are documented consistently with this change log.
- Rollback for this documentation-only follow-up: revert the 2026-09-01 status wording in the Markdown overview. No AppSheet version or production row rollback is associated with this documentation edit.

### Excel dictionary fallback completion

- Authorization: user explicitly approved `openpyxl` after the mandated authoring package was confirmed absent from the loader-provided runtime.
- Live read-only baseline: production OLTP editor v2.200095, Loans 40 columns; OLAP remained v1.000151 and was not edited.
- `Tables`: changed Loans counts from 19 physical / 19 OLTP VCs / 28 OLAP VCs to 20 / 20 / 28.
- `Columns`: added `Loans[Daily Payment Amount]` as physical Price, OLTP-only, and `Loans[Expected Daily Interest Amount]` as hidden Price VC, OLTP-only; the Loans union inventory now contains 49 rows.
- `Columns`: recorded the current OLTP formulas alongside the retained OLAP formulas for `Borrowers[Active Daily Interest]`, `Loans[Expected Interest This Month]`, `Loans[Effective Daily Interest Rate]`, `Loans[Loan Type TE]`, and `Statistics[Expected Daily Interest]` using the `App formula variance` flag.
- `Columns`: documented the production Loan Type enum values and exact validation/visibility rules for Daily Payment Amount.
- `App Variances`: added the two OLTP-only Loans columns with OLTP `Yes` / OLAP `No` and retained the existing OLAP-only Loans definitions.
- `README`: updated reconciliation status/date, current live baselines, and the 81-shared-VC boundary with five intentional formula variances.
- Table ranges were extended to `DataModelColumns!A4:H302` and `DataModelAppVariances!A4:F180`.
- Verification: reopened the saved workbook, confirmed eight worksheets, 49 unique Loans inventory rows, both new definitions and variance rows, recalculation-on-open settings, valid XLSX ZIP members, and no `#REF!`, `#DIV/0!`, `#VALUE!`, or `#NAME?` error text. Performed visual review of all worksheets plus focused Loans and App Variances ranges.
- Rollback: restore the prior `Documents/AppSheet_Data_Dictionary.xlsx` from version control and revert the paired Markdown status changes. No AppSheet configuration or production financial row rollback is required for this documentation-only update.

### Change-log completeness and OLAP replication audit

- Review date: 1 September 2026.
- Scope: documentation review only; no OLTP, OLAP, AppSheet Database, export, Daily Analytics, or Looker Studio object was changed.
- Live read-only baselines verified during the review: production OLTP v`2.200095`; OLAP v`1.000160`; both editors reported `No issues found`.
- Verified OLAP structure: Loans 47 columns, Reporting Loans 30 read-only columns, Reporting Statistics 17 read-only columns including `Expected Daily Interest`, and Reporting Borrowers 40 read-only columns without `Active Daily Interest`.
- Cross-checked the feature log against the Markdown overview and the Excel dictionary definitions for the two new OLTP-only columns and five shared-formula variances.
- Added a self-contained OLAP replication specification with dependency order, exact production target formulas, expected column/slice counts, OLTP-only exclusions, test cases, downstream export/dashboard considerations, and rollback instructions.
- Identified four additional OLAP-only Calendar formulas with two-type assumptions. These affect Loan Assessment and must be redesigned for declining daily-installment principal and scheduled interest before OLAP parity is accepted.
- Documentation status: this change-log review does not itself change the data model, so no new Excel or overview inventory row was required. Both data-model documents must be updated in the later OLAP implementation task.
- Rollback for this documentation-only audit: revert the `OLAP replication specification` section, the audit bullets, and the related status wording. No AppSheet version or production row rollback is associated with this edit.

### Subsequent OLAP implementation and documentation reconciliation

- Implementation date: 1 September 2026, following the read-only audit above.
- App-definition scope: production OLAP only, from v`1.000160` to corrected v`1.000164`; no operational transaction row, assessment-control row, Looker Studio object, or export template was changed.
- Added/loaded definitions: shared physical `Loans[Daily Payment Amount]`, shared hidden `Loans[Expected Daily Interest Amount]`, OLAP-only hidden `Loans[Daily Installment Base Principal]`, and four OLAP-only hidden Calendar installment helpers.
- Aligned formulas: `Loans[Loan Type TE]`, `Loans[Expected Interest This Month]`, `Loans[Effective Daily Interest Rate]`, `Statistics[Expected Daily Interest]`, and `Borrowers[Active Daily Interest]` now match the daily-installment-aware OLTP definitions; four existing Calendar projection/assessment formulas now include declining installment balances.
- Reporting surface: read-only `Reporting Loans` increased from 30 to 32 fields by adding the two governed shared installment fields; `Reporting Statistics` and `Reporting Borrowers` memberships were unchanged.
- Workbook reconciliation: eight worksheets reopened successfully; union inventory now contains 304 columns, including 50 Loans and 28 Calendar definitions; `Reporting Loans` has 32 members; 82 shared VCs are reconciled; all five new helpers and `Borrowers[Hidden Flag]` are represented as intentional app variances. The saved XLSX ZIP has no corrupt member and no `#REF!`, `#DIV/0!`, `#VALUE!`, or `#NAME?` text. All sheets plus focused changed ranges were rendered and visually reviewed.
- Markdown reconciliation: `Documents/AppSheet_Data_Model_Overview.md` now records OLAP v1.000164, rollback v1.000160, final counts, formulas/business rules, slice membership, live reconciliation checks, the intentional Borrowers warning, downstream exclusions, manual test status, and rollback boundary.
- Current documentation status: configuration and documentation complete; controlled Loan Assessment boundary-date testing and clean standalone sync remain pending user acceptance.
- Rollback: restore OLAP v1.000160 and restore the paired data-model documentation/change-log state. Do not remove the accepted shared physical `Daily Payment Amount` column or rewrite any production Charge/Repayment data.
