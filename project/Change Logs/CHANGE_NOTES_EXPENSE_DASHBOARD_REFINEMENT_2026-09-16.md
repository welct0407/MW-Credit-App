# Expense and dashboard refinement — 16 September 2026

Status: implemented and verified in Chrome's current DEV apps; owner/mobile acceptance pending. No production deployment. Repository checks and publication are recorded at task completion.

Rollback before editing: OLTP 1.000083 (includes owner's deck changes); OLAP 1.000084. Current Chrome app documentation reports both Runnable/Deployable and database-3. SQL remains V16. Expense entry/referrer maintenance is OLTP-owned; partner reporting/settlement is OLAP-owned. No production or Looker change.

Owner deck recorded: primary auto, secondary Amount, summary Expense Date, category ascending grouping/SUM Amount, Expense Date descending, action bar enabled, square image. Preserve these settings.

Related borrower/loan are optional traceability for manual costs, not allocation inputs; referral links are SQL-created. Explain these fields and retain optional links with clearer labels.

## Saved result

Final app documentation: **OLTP 1.000088**, **OLAP 1.000090**, both Runnable/Deployable Yes, database-3. No SQL migration, data backfill, financial write, bot change or Looker edit in this follow-up. SQL remains V16. Prior synthetic fixtures remain unchanged.

1. **Deck:** retained the owner's exact OLTP deck configuration above. No switch back to table. OLAP remains its existing read-only table.
2. **Category choices:** OLTP Valid_If now offers Collection Cost / ค่าใช้จ่ายติดตามหนี้; Transportation / ค่าเดินทาง; Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน; Software / Subscription / ค่าซอฟต์แวร์และสมาชิก; Other / อื่น ๆ. Automated Referral Rebate remains SQL-owned English and unavailable as a manual option. Existing rows were not rewritten. A legacy English-only manual row needs a current bilingual selection when edited.
3. **Optional context:** related borrower and loan support attribution of manual collection/travel/loan-specific costs. Neither controls allocation, which still uses historical contributions on Expense Date. General overhead can leave both blank. Labels now explicitly say optional in Thai/English. Referral links are generated and protected by SQL. The seven-field form and existing permissions remain.
4. **Amount formatting:** both apps have enabled Business Expenses - Expense Red (`[Amount] > 0`, `#C62828`) and Business Expenses - Offset Green (`[Amount] < 0`, `#2E7D32`), targeting Amount only, no icon/background. Verified positive 500 red and negative -500 green in both current runtimes using rendered computed colors. Saved rule target is Amount in both definitions.
5. **Dashboards:** KPIs replace headline Total Profit with Net Profit displayed as กำไรสุทธิรวม / Total Net Profit. Immediately after Outstanding Loans is งบกำไรขาดทุนเดือนนี้ / Income Statement MTD, followed by Operating Income, Expenses, Net Income. New presentation VCs are read-only and visible: Operating Income MTD = `[Realized Profit MTD]`; Income Statement Expenses MTD = `0 - [Expenses MTD]`; Header - Income Statement MTD is the bilingual Text divider. OLTP additionally gains Net Profit, Expenses MTD and Net Profit MTD, matching OLAP's existing semantics. Price fields use baht / zero decimals. Explicit subtraction was necessary: unary minus initially displayed positive 660 in AppSheet; `0 - [Expenses MTD]` is saved and verified as -660.
6. **Cash Pool:** reduced to four fields: Total Cash Pool, Total Outstanding Principal, Net Unsettled Profit, Net Expected Loan Account Balance. Removed the six-field appended block. The new income statement owns MTD income/expenses/net presentation. Original gross calculations remain in the model; net cash measures subtract total signed expenses once.
7. **Partners:** existing net formulas and card layout were already correct; no partner formula edit was needed. Fresh read-only SQL and current Chrome cards agree as below. Whole-baht per-repayment rounding is preserved. Both Total Profit and Available to Settle already include allocated expenses; expenses must not be subtracted a second time.

## Reconciliation

| Partner role | Gross allocated profit | Allocated expenses | Displayed Total Profit | Created settlements | Available to Settle |
| --- | ---: | ---: | ---: | ---: | ---: |
| A (screenshot) | 124,713 | 396 | 124,317 | 30,960 | 93,357 |
| B | 167,365 | 264 | 167,101 | 84,510 | 82,591 |

Both dashboards show Total Net Profit **291,418 = 292,078 - 660**. MTD statement is **207,848 - 660 = 207,188**. OLAP Cash Pool shows **120,000; 116,394; 175,948; 179,554** respectively. Read-only SQL expense count is 3, total 660, allocation A396/B264. The retained +500/-500 manual fixtures cancel. Existing Daily Analytics reconciliation still has 43 dates / zero mismatches. Evidence: `outputs/expense-dashboard-refinement-20260916/before-reconciliation.jsonl`; saved app definitions and current runtime were read in Chrome.

## Dependencies and verification

No shared physical table changed. OLTP expense entry and both apps' Statistics/KPIs are affected; OLAP owns partner/settlement and was reconciled. Underlying gross loan/payment/repayment formulas, settlement validation, source bindings and cross-app links are unchanged. Reporting Statistics retains its 17 columns and READ_ONLY permission; presentation VCs are not added to the export slice. Existing Analytics Data retains gross/net analysis and inherits the revised Net Profit / Net Profit MTD display labels. No new heavy historical calculations were added to OLTP; its small dashboard summary was explicitly requested.

Chrome checks: saved versions and Runnable/Deployable; unchanged deck settings; all five bilingual options and optional reference labels visible in the Add form (cancelled without saving); signed Amount colors in both apps; dashboard section order and negative expense; four OLAP Cash Pool fields; both net partner cards. No legacy test interface used. Desktop GUI was verified; mobile/offline behavior and owner acceptance remain pending. Existing notification isolation from the prior task is preserved; this follow-up made no bot or financial test changes. Looker/export presentation remains unverified and secondary, with no direct export-slice change.

Updated `Documents/AppSheet_Data_Model_Overview.md`, `Documents/AppSheet_Data_Dictionary.xlsx`, `Documents/Development_Changes.md`, and `Documents/Environment_Inventory.md`. The dictionary refinement mode updates only Dev Differences, App Settings and Guide; all sheets are round-trip compared against intended values and production rows are preserved. Preview renders and error scan are in the evidence folder. The maintained dictionary script has a separate `--edit --refine` mode, so the original implementation mode is not replayed for this follow-up.

Local checks passed: dictionary export/re-import equality on every worksheet, zero formula-error matches, visual review of the changed dictionary and both KPI orders, JavaScript syntax check and `git diff --check`. The first dictionary edit changed 48 rows; the second verification/layout pass changed zero values, confirming idempotence. Only the two KPI-order rows and category-validation row were auto-fitted for longer text. No unrelated workbook sheets were restyled. Commit/push target is the existing master branch and configured origin/master; the final response records the verified publication result.

## Owner acceptance and rollback

Sync both DEV apps, then confirm the expense deck, bilingual choices and optional links, positive/negative Amount colors, dashboard Total Net Profit and MTD section order, simplified Cash Pool, and partner totals above. For an old manual expense, reselect its bilingual category when editing. Do not create a real payment for this review. Mobile/offline review is still required before acceptance.

To reverse this follow-up, restore **DEV OLTP 1.000083** and **DEV OLAP 1.000084**, leaving SQL V16 and financial records intact. Reapply the development preparation checklist after any app restore, especially disabled notification bots and DEV source/cross-app links. Reconcile both app definitions and the model documents. The OLTP rollback version includes the owner's deck. This rollback is separate from reverting the original V15/V16 business-expense implementation, whose coordinated database/app recovery remains in its original report.
