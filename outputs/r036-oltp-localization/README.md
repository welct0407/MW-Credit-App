# R036 — OLTP DEV localization refinements

Production update, 26 September 2026: R036 applied SQL V45 and OLTP3.000249; OLAP1.100202 unchanged. Both editors clear, read-only GUI checks passed, temporary RC deleted. [Promotion record](../r036-production/promotion-checklist.md). The development checkpoints below are dated history; their prior pending/Open status is superseded.

Date: 25 September 2026. R036 remains Open. The affected app is DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` (`MW-OLTP-DEV-20260919`), saved **1.000090 → 1.000091**. Version 1.000090 was the restorable saved version observed before this batch; it had advanced beyond the earlier R036 interest checkpoint (1.000086), so its intervening edits were preserved. DEV OLAP remains 1.000033. PROD apps and both databases were not edited for this localization batch.

The seven main navigation views Dashboard, Collection, Payments, Borrowers, Loans, Business Expenses and Reporting App Shortcut now choose one label by the current Partner's `Language Preference`, matched to normalized `Login Email` and `USEREMAIL()`. Thai uses the prior Thai wording; English uses Dashboard, Collection, Payments, Borrowers, Loans, Expenses and Reporting App. The existing Cash Statement formula already used this rule and was unchanged. Internal view names, positions, sources, icons and actions were unchanged.

Three previously unlocalized column labels now read `กองเงินสดทั้งหมด / Total Cash Pool` on `Statistics.Total Cash Pool` (Dashboard KPIs), `รายการเรียกเก็บวันนี้ / Today's Collection Charges` on `Borrowers.Todays Collection Charges` (borrower within Collection), and `รายการเรียกเก็บที่เกี่ยวข้อง / Related Charges` on `Loans.Related Charges` (Loans_Detail).

All thirteen displayed `Payments_Detail` columns use the same Partner language test when `CONTEXT("View") = "Payments_Detail"`. Existing labels elsewhere retain their previous effective wording. The changed fields are Payment Date, Status, Ref Borrower, Amount Received, Payment Method, Allocation Method, Bank Reference, Notes, Ref Received By Cash Holder, Ref Received By Cash Account, Related Repayments, Visible Allocations and Related Loans. The original before/after deltas remain at Git pin4a848fa under `Documents/Data Dictionary/development/appsheet/r036/`; promoted values now live in the production dictionary objects.

Saved GUI verification: the logged-in work Partner rendered all five primary entries and three menu entries in English; Cash Statement remained the control pattern. Dashboard showed the new bilingual cash-pool label. An existing R036 synthetic posted payment opened in Payments_Detail with English labels including Borrower, Received By, Received Into, Repayments, Allocations and Related Loans. Its linked synthetic loan showed the bilingual Related Charges label, and a borrower opened from Collection showed the bilingual Today's Collection Charges label. No financial entry was submitted. The Thai branches were checked against the same expression form and Thai strings but were not independently rendered under a Thai-preferring session. Both saved editors showed **No issues found** and remained Deployed. Current OLTP DEV preview loaded and synced.

The saved editor was reloaded at 1.000091 and the Payments column expressions were read back. Dictionary validation passed with 1,226 documents and zero errors. The existing three recorded dictionary limitations were unchanged.

Rollback: restore DEV OLTP saved version 1.000090 if this presentation batch needs to be reverted; this does not undo other R036 SQL/app work or later changes. Before-version repository commit: `74912733825a441283071f44a7b347d979b38566`. No schema, data, notification, route or OLAP change in this batch. Reconcile any unrecorded 1.000087–1.000090 DEV definition edits before final R036 RC capture. Production promotion requires separate owner authorization and the integrated R036 checklist.

## Business Expenses Detail and Form labels

On 25 September, DEV OLTP saved **1.000091 → 1.000092** for a further R036 refinement. Five previously English-only Business Expenses column Display names became fixed Thai / English strings, following `ผู้จ่ายเงิน / Paid By`:

| Column | Saved display name |
| --- | --- |
| Expense Date | `วันที่ค่าใช้จ่าย / Expense Date` |
| Expense Category | `ประเภทค่าใช้จ่าย / Expense Category` |
| Amount | `จำนวนเงิน / Amount` |
| Payee Name | `ชื่อผู้รับเงิน / Payee Name` |
| Notes | `หมายเหตุ / Notes` |

The existing bilingual Related Borrower, Related Loan, Paid By and Paid From Account labels were retained. No Partner-profile formula is used for these five labels. The saved editor was reloaded at 1.000092, and the current app GUI showed the new labels in `Business Expenses_Detail` and the unsaved `Business Expenses_Form`. The form was cancelled. OLTP diagnostics reported **No issues found**; the app remained Deployed. Dictionary validation passed with 1,227 documents, zero errors and the same three recorded limitations. OLAP and PROD were unchanged. The exact DEV deltas remain in that file at Git pin4a848fa; promoted values now live in the production Business Expenses dictionary object. Rollback for this refinement is saved DEV OLTP 1.000091; no DB or financial write occurred.
