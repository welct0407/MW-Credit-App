# OLAP Shared VC Alignment — 2026-08-30

## Status

Corrected by the dependency repair recorded in `CHANGE_NOTES_OLAP_ACCRUED_INTEREST_DEPENDENCY_REPAIR_2026-08-30.md`. User runtime testing remains pending.

> **Correction:** The original comparison covered only VCs that already existed in both apps. It did not recursively validate formula dependencies or confirm target-app runnability. Consequently, the copied `Expected Interest This Month` formula referenced a missing OLAP `Accrued Interest` VC. OLAP version 1.000151 adds the complete dependency chain and supersedes the validation result recorded below.

## Scope and purpose

Compared every virtual column used by both apps and treated the OLTP app as the governing logic and configuration baseline. Updated the OLAP app wherever a shared VC differed.

## AppSheet versions and rollback point

| App | Version | Role |
| --- | --- | --- |
| Loan Manager ผู้จัดการสินเชื่อ | 2.200075 | OLTP source baseline; unchanged |
| Loan Business Insights | 1.000148 | OLAP rollback point before editing |
| Loan Business Insights | 1.000149 | OLAP version after save |

OLAP App ID: `e74dd368-654f-44d7-bccf-83cf361d1cdb`.

## Comparison result

- Compared 78 VCs present in both apps.
- Compared type, key, label, formula, Show/Show_If, editable, required, initial value, display name, description, searchable, scannable, NFC, and PII settings exposed in the live column grids.
- Identified 13 differing VCs.
- After saving OLAP version 1.000149, repeated the comparison and found zero remaining differences across those settings.

## OLAP changes

### Formula alignment

- `Borrowers[Return on Active Principal]`: replaced the repeated Loans SELECT calculation with the OLTP aggregate-column calculation and zero guard.
- `Borrowers[Daily Collection Status]`: adopted the OLTP list-membership logic for fully paid and partially paid classification.
- `Loans[Expected Interest This Month]`: added accrued but uncharged interest to the remaining-month forecast.
- `Loans[Loan Duration]`: aligned to the OLTP Close Date formula using floored 24-hour periods plus one inclusive day.
- `Statistics[Profit Coverage of Outstanding Principal]`: added the OLTP zero guard.

### Display and behavior alignment

- `Charges[Payment Date]`: changed the display name to `วันที่ชำระครบ / Paid in Full Date`.
- Set `Show? = FALSE` for:
  - `Statistics[Net Principal Days MTD]`
  - `Statistics[Forecast Remaining Principal Days]`
  - `Statistics[Forecast Average Daily Outstanding Principal]`
- Applied the OLTP positive-count Show_If expression and enabled Searchable for:
  - `Statistics[Borrowers Fully Paid Today]`
  - `Statistics[Borrowers Partially Paid Today]`
  - `Statistics[Borrowers with Overdue Payment]`
  - `Statistics[Borrowers Not Paid Today]`

## Documentation updated

- `Documents/AppSheet_Data_Model_Overview.md`
- `Documents/AppSheet_Data_Dictionary.xlsx`
- `Change Logs/CHANGE_NOTES_OLAP_SHARED_VC_ALIGNMENT_2026-08-30.md`

## Checks performed

- Confirmed the OLAP rollback version before editing.
- Verified the OLAP draft had zero remaining shared-VC differences before save.
- Saved successfully as OLAP version 1.000149.
- Confirmed AppSheet reported no configuration issues after save.
- Re-read all 78 shared VCs from the saved OLAP app and confirmed zero remaining differences against OLTP across the compared settings.
- Re-imported, scanned, rendered, and visually reviewed the updated Excel dictionary.

## Manual testing required

1. Sync OLAP and confirm no column or expression errors appear.
2. Check Return on Active Principal for borrowers with zero and non-zero outstanding principal.
3. Check Daily Collection Status for no-charge, overdue, fully paid, partially paid, and not-paid scenarios.
4. Check Expected Interest This Month for open daily-interest loans with and without Accrued Interest, plus fixed-term loans due this month.
5. Check Loan Duration for a closed loan and confirm inclusive-day behavior.
6. Confirm the three Statistics helper VCs are no longer directly shown.
7. Confirm each collection-status count appears only when positive and remains searchable.
8. Reconcile Projected Monthly Profit and Forecast Remaining Interest against representative OLTP records.

## Rollback instructions

If testing reveals a regression, restore `Loan Business Insights` version 1.000148 from AppSheet Manage → Versions, then update this change log and both data-model documents to record the rollback.
