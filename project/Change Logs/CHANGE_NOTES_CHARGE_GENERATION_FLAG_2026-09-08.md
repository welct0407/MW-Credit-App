# Charge generation eligibility — 8 September 2026

Status: Implemented and read back at OLTP **3.000028** / OLAP **1.100020**. Oum consolidation and Puifai flag/rate transition completed. Reactivation task created. User workflow acceptance and future scheduled execution remain pending.

## Authorization and rollback points

The user explicitly approved one Loans eligibility flag, manual-generation button hiding when N, retention of nominal rates, Oum's 35,000 September 6–30 settlement (no principal), deletion of superseded unpaid Oum charges with details in Notes, and September 29 reactivation. Puifai's existing proportional 46,000 plan remains unchanged.

Before edits, Manage > Versions confirmed OLTP **3.000026** and OLAP **1.100018**, Save disabled. Final saved versions **3.000028** / **1.100020** were directly confirmed. Existing OLAP Borrowers schema warning predates this work. Local backups: outputs/charge-generation-flag-20260908/overview.before.md and dictionary.before.xlsx. The earlier native Money Restructure Backup 20260908 predates Puifai's entered plan and is not a current full financial restore. App versions do not restore database rows.

## Configuration implemented

- Physical Loans[Auto Charge Enabled], Yes/No, native key h7VnJR1ERY4o6UUaiANzwe. Initial value TRUE in both apps, no app formula; editable in OLTP, read-only in OLAP. No new VCs, tables, keys, relationships or slices. Direct native-database additions must populate the flag explicitly because app initial values do not govern native inserts.
- Initialized 56 existing flags TRUE, then exactly Puifai's eight and Oum's six FALSE. Full native readback: 56 rows, 42 TRUE, 14 FALSE, exact intended IDs.
- Generate Today's Charge Behavior condition requires the flag, hiding the manual button when N. Generate All Today's Charges referenced rows and COUNT-based visibility exclude disabled loans. Global button can remain visible for other eligible loans.
- Generate Daily Charges filter and underlying action guarded. Schedule remains 00:05 GMT+07 with today's-charge duplicate exclusion and positive interest/accrual guards.
- Create First-Day Charge event and New Loan Payment - Create First-Day Charge action guarded. Auto Receive First-Day Charge event checks the referenced loan flag, avoiding automatic receipt of manual disabled-loan charges.
- Create Final Charge requires flag and positive Accrued Interest. Default - Create Final Charge requires flag. Wrapped Action - Close Loan and Wrapped Action - Default Loan unavailable when disabled because their sequences contain charge-generation steps. Other internal workflow behavior was not executed or rewritten.
- Loans[Accrued Interest] and [Expected Daily Interest Amount] return zero while disabled in both apps. [Expected Interest This Month] uses explicit future Interest Remaining through month-end. Nominal rates retained.
- Eight OLAP Calendar formulas route disabled loans to explicit schedules: Assessment Installment Contract Principal Due, Assessment Installment Future Principal Due, Assessment Installment Future Interest Due, Assessment Installment Contract Outstanding, Projected Outstanding Principal, Projected Interest, Assessment Principal Base and Assessment Principal Start Weight. Enabled contractual branches and zero-rate fallback retained.
- Eleven dictionary model expressions match captured live formulas after whitespace normalization; model-formulas.json and live-model-hashes.json contain evidence.
- Receive All/Lump Sum remain due-only; individual future Full/Partial allowed. Manual Charges entry remains available. No receipt/allocation/payment rows were written by this change.

## Financial transition

Puifai: eight flags FALSE, then original daily rates restored and individually read back: 300, 270, 540, 360, 360, 700, 270, 100 (2,900 total). Her 72-charge plan remains 46,000 = principal 31,000 + carried interest 8,700 + additional fixed profit 6,300. This task did not rewrite her Charges. Original plan manifest: outputs/future-charges-20260908/repayment-plan.json.

Oum: six original loan keys, principal 11,000, daily rates 1,100 retained; flags FALSE. Before-values captured for all 18 unpaid September 6–8 charges, total 3,800 including the existing 500 penalty. All loan references verified. Fresh synced Collection confirmed 18 charges, 3,800 unpaid and zero collected; native Payments search returned no Oum rows. No pre-September 6 unpaid balance was shown in Collection.

Six September 6 keys reused and dated September 30. Twelve superseded September 7–8 unpaid rows deleted under explicit user authorization. No fake receipt, waiver or principal payment posted. Original details/keys preserved in Notes and outputs/charge-generation-flag-20260908/oum-plan-and-before.json.

| Loan date | Daily interest | 25-day interest | Late penalties | September 30 charge |
|---|---:|---:|---:|---:|
| 21 August | 300 | 7,500 | 2,045 | 9,545 |
| 24 August | 100 | 2,500 | 682 | 3,182 |
| 26 August | 200 | 5,000 | 1,364 | 6,364 |
| 30 August | 200 | 5,000 | 1,364 | 6,364 |
| 2 September | 200 | 5,000 | 1,363 | 6,363 |
| 4 September | 100 | 2,500 | 682 | 3,182 |
| Total | 1,100 | 27,500 | 7,500 | **35,000** |

Penalties use daily-interest proportions and largest-remainder whole-baht rounding. All six saved dates, amounts, principal zeros and Notes read back. Notes marker OUM20260908 documents September 6–30 inclusive, original amounts included once, no principal, and the original Thai 500-penalty note.

## Reactivation task

Codex heartbeat **reactivate-oum-auto-charges** is ACTIVE for one run **29 September 2026 at 23:55 Bangkok**. Persisted automation TOML read back. An earlier suggested card was rendered during schedule validation; the subsequently created ACTIVE task is authoritative. Do not create a duplicate from that suggestion.

The task verifies six September 30 charges, original totals, retained rates, interval 1 and current generation guards before enabling only Oum's flags. It does not generate charges, change receipts or notify borrowers. It records results here and reports completion or failure. Puifai stays disabled. Execution delayed past October 1 00:05 must stop for catch-up review.

This is a local Codex task, not an AppSheet server bot: host availability and authenticated AppSheet access are required. September 30 00:05 should skip each loan because a charge exists on that date. October 1 should generate one day's interest (1,100 total) under interval-1 logic. These future executions are not claimed tested. Do not manually generate during September 29 23:55–midnight: re-enabling while the covered charge is still future-dated permits catch-up.

## Checks and reconciliation

- Full 56-loan flag readback, eight restored rates, six consolidated charge readbacks and twelve authorized deletion actions completed. Fresh Collection excludes Oum from due/overdue borrowers.
- Operations editor showed No issues found and Save disabled; Reporting saved version and runnable app confirmed. No live payment/generation execution tests.
- Fresh Operations before consolidation: Pending 14,600, Today's Profit 3,386, Daily Interest 6,896, Remaining Forecast 160,725, Principal 110,588. Profit had increased by 300 before consolidation with a real Lisa collection visible in the app; this task posted no receipt.
- After: Pending **10,850**, Today's Profit **3,386**, Daily Interest **6,896**, Remaining Forecast **195,725**, Projected Monthly Profit **264,363**, Principal **110,588**, Realized Profit MTD **57,788**. Collection **2,250 + 8,600 = 10,850**. Lisa's concurrent balance increased from 800 to 850, explaining **14,600 - 3,800 + 50 = 10,850**.
- Both apps agree on Daily Interest 6,896, Remaining Forecast 195,725, Projected Monthly Profit 264,363, Total Profit 142,018 and Principal 110,588. **57,788 + 10,850 + 195,725 = 264,363** reconciles current monthly projection. Consolidation recorded no profit or principal payment.
- Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx together; eleven formula hashes matched and dictionary preview/error scan checked. Earlier future-charge changelog marked historical. No Looker edits or stored-snapshot rebuild.

## Manual acceptance

1. Sync. Check N-loan generation button hidden, bulk exclusion, manual Charges entry available; use a test copy for a Y-loan generation control.
2. In a test copy, verify future individual Full/Partial, due-only Receive All/Lump Sum, overpayment rejection, duplicate/retry handling and permissions. Do not post fake live receipts.
3. Check Oum six September 30 charges total 35,000 with principal zero and detailed Notes. Puifai next installment remains September 10, 5,000. Disabled loans accrue zero with retained rates.
4. Verify scheduled reactivation, September 30 skip and October 1 generation when those dates arrive. Keep local host and authenticated app available.
5. Refresh Looker/snapshots and reconcile date cutoffs. Existing Borrowers schema warning and principal-days approximation remain outside this scope. User acceptance not yet claimed.

## Rollback

Pause/delete reactivation task first. Restore app versions 3.000026 / 1.100018 for configuration only. Before restoring old formulas, set Puifai rates back to zero because those formulas do not honor the flag. Restore only task-owned documentation from before copies, preserving unrelated later edits.

Review subsequent receipts/allocations before financial rollback. Oum manifest contains 18 original keys/dates/amounts/Notes. Restore six reused rows and recreate twelve deleted rows through a supported exact-key-preserving path; if unavailable, stop and reconcile a controlled adjustment. Native backup copies have different keys and cannot be substituted wholesale. Reconcile new payments before rollback. Return Oum flags TRUE only after restoring original daily-charge state and checking the cutoff. Do not delete the new column while either app references it.
