# Daily loan analysis automation — 2026-08-31

## Scope and purpose

- OLAP AppSheet app: `Loan Business Insights`
- App ID: `e74dd368-654f-44d7-bccf-83cf361d1cdb`
- Purpose: generate a governed daily multi-worksheet loan-analysis extract, save it to Google Drive, and use it as the source for a personal scheduled summary.
- Delivery scope for this implementation: Codex Scheduled inbox pilot only. Outlook delivery remains disabled pending manual acceptance.

## Rollback points recorded before implementation

- AppSheet version before editing: `1.000151`
- Version confirmed in the live AppSheet editor on `2026-08-31` (Asia/Singapore).
- Looker Studio backup: Not applicable; the Looker Studio report is not being changed.
- Google Drive: no production extract file or folder changed before implementation.
- Codex scheduled task: not yet created at the time this rollback point was recorded.

## Rollback points recorded before the production export test

- AppSheet version before the test-state changes: `1.000154`.
- Google Drive template file ID: `1g4xHHsTVvRR5ek4u3DslZAb_UerH05E5`.
- Google Drive template revision before the compatibility repair: `0ByMpjGph731Id2xpcTFEWno4ODVpeEsybXA0bEQrMVNWSFRvPQ` (`2026-08-30T16:52:49Z`, 10,780 bytes, retained as a Drive revision).
- The original local template remains at `outputs/daily-loan-analysis-2026-08-31/Loan_Daily_Analysis_Template.xlsx`.

## Rollback points recorded before the activity-linked export update

- AppSheet version: `1.000157`; no AppSheet configuration save is required for this template-only update.
- Google Drive template revision: `0ByMpjGph731IdC8rQXd6dUJ1cjBZR0JXU1BrYUttS1Q1VXZjPQ` (`2026-08-31T01:40:16.855Z`, 10,659 bytes).
- Local pre-change template: `outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.1.xlsx`.
- Looker Studio backup: Not applicable; the report is not being changed.

## Implementation

- Created `outputs/daily-loan-analysis-2026-08-31/Loan_Daily_Analysis_Template.xlsx` with seven worksheets: `Manifest`, `Statistics`, `Daily Analytics 30D`, `Borrowers`, `Loans`, `Charges`, and `Repayments 30D`.
- The borrower display field is `Borrowers[Description]`, exported as `Borrower Name EN`. Transaction tabs retain immutable IDs for joins and do not copy a borrower-name field.
- The export populations are intentionally bounded to current/relevant records: active, overdue, defaulted, due-today, recently closed, recent charge activity, or recent repayment activity as applicable.
- Uploaded the template to the app owner's private Google Drive as `Loan_Daily_Analysis_Template.xlsx` and attached it to the OLAP AppSheet task.
- Created disabled AppSheet bot `Daily Loan Analysis Export` with:
  - scheduled event `Daily Loan Analysis Export Schedule`;
  - daily recurrence and `Singapore Standard Time`;
  - placeholder time `12:00 pm` pending the user's timing decision;
  - task `Create Daily Loan Analysis Workbook`;
  - output type `XLSX`;
  - default private file store;
  - folder-path expression `"Loan Daily Analysis/Exports"`;
  - filename-prefix expression `"Loan_Daily_Analysis"`; and
  - timestamp suffix enabled for uniqueness and auditability.
- Saved the AppSheet implementation as version `1.000152`. The bot remains disabled, so no production workbook has been generated.
- Installed and connected the Google Drive plugin for the private account and confirmed that the template is discoverable as a private, unshared XLSX file.
- Created paused standalone Codex automation `Daily Loan Analysis Summary` in the `AppSheet Loan Project`. It is configured to read the newest workbook, enforce freshness, join by immutable IDs, use `Borrower Name EN` only, flag missing English names, reconcile totals where population scope permits, and return the summary only in the scheduled task result.
- The Codex schedule uses a placeholder time after the export task. It remains paused until timing and the first production-data test are accepted.
- Outlook and Gmail delivery are not configured. No external email or notification was sent.
- During the approved production-data test, AppSheet's editor **Test** action returned an internal server error (`00-c238b1df58d6fa594afc7ef8c50260d2-4cc75c60849b896c-00`). The bot was therefore temporarily enabled, saved, run once from its **Run** action, immediately disabled, and saved again.
- The first generated workbook, `Loan_Daily_Analysis20260831_012538_023.xlsx` (Drive ID `1ne9oDex1RBLk1HqIyR7cUPkCflgB3-ck`), contained the expected data but rendered blank in Google Sheets. Inspection found two `sheetData` elements per worksheet: AppSheet wrote populated unprefixed elements while the template retained empty namespace-prefixed elements.
- Created `outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.1.xlsx` by normalizing the worksheet XML to the default SpreadsheetML namespace. This is a packaging compatibility repair only; no field, expression, table, or worksheet schema changed.
- Replaced the bytes of the same private Drive template file in place, preserving its Drive file ID and the AppSheet task reference.
- Repeated the one-time enable/run/disable sequence. The corrected private workbook is `Loan_Daily_Analysis20260831_014143_190.xlsx` (Drive ID `1bu6iWj4P6aN5voqS87Ndz3SsU8ZOylQi`).
- AppSheet is now at version `1.000157`; `Daily Loan Analysis Export` is confirmed disabled. The standalone Codex automation remains paused.
- Updated the template population contract without changing any AppSheet table, slice, column, bot, or task configuration:
  - `Borrowers` now exports the complete `Reporting Borrowers` master.
  - `Loans` now exports the complete `Reporting Loans` master.
  - `Charges` includes rows dated or paid within the 30-day period and all earlier charges for a loan with any in-period origination, closure, charge, charge-payment, or repayment activity.
  - `Repayments 30D` includes rows paid within the 30-day period and all earlier repayments for those same activity-linked loans. The existing worksheet name is retained for analyzer compatibility.
  - Direct in-period transaction rows are included independently of the loan-history join so orphaned transaction references remain visible as data-quality exceptions.
- Incremented the workbook contract version to template schema `1.1` and created the verified local artifact `outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis_Template_v1.2.xlsx`.
- Replaced the bytes of the existing private Drive template in place. The file ID remains `1g4xHHsTVvRR5ek4u3DslZAb_UerH05E5`; the new Drive revision is `0ByMpjGph731IZXlQc2ZWT0hOdUQ3L3pKdjE5cWZLcmFwT01jPQ` (`2026-08-31T02:45:22.635Z`, 10,731 bytes).
- Updated the paused `Daily Loan Analysis Summary` Codex automation prompt so current-day and 30-day transaction metrics are always date-filtered and older included transactions are used only for history, behavior, delinquency, and audit analysis. Its schedule, model, project, delivery policy, and paused status were preserved.

## Data-model impact

- No new AppSheet database table or physical column was added.
- No slice or virtual-column change was made because the existing reporting surfaces contain the required fields.
- No data-model change was made. `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` therefore required no update for this change.

## Checks performed

- Confirmed pre-change live AppSheet rollback version `1.000151` before editing.
- Confirmed saved implementation version `1.000152` after editing.
- AppSheet editor reported **No issues found** after the disabled bot was saved.
- Re-imported and inspected the XLSX template successfully.
- Confirmed all seven worksheets exist in the intended order.
- Confirmed `Borrowers!B2` is `<<[Description]>>` and that the Loans and Charges tabs contain no copied borrower-name field.
- Scanned the workbook for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, and `#N/A`; no matches were found.
- Rendered and visually reviewed every worksheet; headers, expressions, wrapping, and column sizing were readable.
- Confirmed the Google Drive plugin can access the private template and that the file is not shared.
- With the user's explicit approval, ran the export bot twice: the first run reproduced and diagnosed the workbook-rendering defect; the second run validated the repaired template.
- Confirmed the corrected workbook is private to the owner and opens visibly in Google Sheets Office editing with all seven worksheets.
- Downloaded the corrected XLSX to `outputs/daily-loan-analysis-test-2026-08-31/Loan_Daily_Analysis20260831_014143_190.xlsx` and parsed its worksheet XML independently.
- Confirmed exactly one `sheetData` element per corrected worksheet.
- Confirmed actual row counts match the manifest: 14 Borrowers, 31 Loans, 294 Charges, and 252 Repayments 30D; Daily Analytics contains 27 snapshots.
- Confirmed all 14 exported borrowers have a nonblank, unique `Borrower Name EN` sourced from `Borrowers[Description]`.
- Re-imported the generated XLSX with the spreadsheet verifier, scanned for formula-error values, and found no matches.
- Rendered and visually checked every worksheet in the corrected generated workbook; headers, values, number formats, wrapping, and row/column layout are readable.
- Reconciled outstanding principal to THB 69,000 in Statistics, Borrowers, and Loans; active-loan count reconciles to 22 in Statistics, borrower totals, and loans with positive outstanding principal.
- Reconciled 30-day repayments to THB 104,820 = THB 28,000 principal + THB 76,820 interest.
- Reconciled today's exact-date charges to THB 6,870 due, THB 0 collected, and THB 6,870 remaining.
- Reconciled borrower open-charge amount THB 17,470 to THB 10,600 overdue plus THB 6,870 due on the export date. This confirms that the borrower field labelled `Today's Amount Due` is a due-through-today/open-charge measure, while the Statistics field is exact-date due.
- Re-imported the activity-linked template and confirmed all seven worksheets remain present in the original order with one `sheetData` element each.
- Confirmed the full-master expressions are used for Borrowers and Loans and that Manifest counts use those same populations.
- Confirmed the Charges and Repayments manifest counts exactly match their worksheet population expressions.
- Confirmed every date predicate is bounded from `TODAY() - 29` through `TODAY()` inclusive, and the activity-loan set covers loan date, close date, charge date, charge payment date, and repayment payment date.
- Re-ran the workbook error scan; no `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`, `#NUM!`, or `#NULL!` values were found.
- Rendered and visually reviewed the changed Manifest, Charges, and Repayments worksheets; the existing styles and layout were preserved.
- Confirmed Drive accepted the replacement at the existing file ID and exposed the immediately prior revision for rollback.
- Confirmed the scheduled summary task remains `PAUSED` after its data-contract instructions were updated.

## Manual testing required

1. Review the ad hoc summary and confirm that its borrower-level detail and alert thresholds are appropriate.
2. Confirm the desired AppSheet export time and Codex analysis time; the pilot placeholders must be changed before activation.
3. Optionally open the corrected workbook in desktop Microsoft Excel as an additional client-specific acceptance check.
4. Decide whether to rename/document the borrower-level `Today's Amount Due` field as due-through-today to prevent confusion with the exact-date Statistics metric.
5. Confirm no Outlook/Gmail message is sent during the pilot.
6. Run one export with production data and confirm the AppSheet template engine accepts the new population expressions.
7. Select at least one loan with both in-period activity and pre-period transactions; confirm all of that loan's older Charges and Repayments are present.
8. Confirm a loan with no activity in the period contributes no Charges or Repayments, while its master Loan and Borrower rows remain present.
9. Recheck that every exported Loan joins to one Borrower and that any orphan transaction remains explicitly reportable.

## Status

- `LIVE EXPORT PASSED — DISABLED / PAUSED` — the activity-linked template executed successfully in AppSheet and the borrower-master defect is fixed. The AppSheet bot is saved disabled and the standalone Codex automation remains paused. The historical-transaction branch remains logically verified but could not be demonstrated with live pre-period rows because the source transactions begin inside the current 30-day period.

## Corrected export retest — 2026-08-31

- Rollback version before the run: AppSheet `1.000157`.
- Ran `Daily Loan Analysis Export` once and generated private workbook `Loan_Daily_Analysis20260831_025455_066.xlsx` (Drive ID `1NXz4FPF3y8-2io12u74pA5iJp1m0jL_X`).
- Manifest export timestamp: `2026-08-31 10:55:00.938` Asia/Singapore; template schema `1.1`.
- Manifest and actual populations agree: 17 Borrowers, 31 Loans, 294 Charges, and 252 Repayments.
- The three borrowers omitted by the prior filtered export are now present. Their four closed loans represent THB 13,000 principal, THB 17,100 received, THB 4,100 interest, zero outstanding principal, and zero defaults.
- All 31 Loans join to an exported Borrower. All 294 Charges join to an exported Loan. All 252 Repayments join to both an exported Loan and Charge. All 17 English borrower names are populated.
- Outstanding principal reconciles to THB 69,000 across Statistics, Borrowers, and Loans.
- Gross borrower profit THB 82,820 less THB 6,000 default losses reconciles to THB 76,820 net realized profit in Statistics and Daily Analytics.
- The oldest exported Charge and Repayment is `2026-08-05`; the selected-period start is `2026-08-02`. Therefore, no older live transaction exists to exercise the pre-period-history inclusion branch in this dataset.
- Saved the export bot back to disabled state. Post-test AppSheet version: `1.000158`.
- Created `outputs/daily-loan-analysis-test-2026-08-31/Adhoc_Loan_Summary_Corrected_2026-08-31.md` with the corrected business analysis and recommendations.

## Post-payment refresh and bilingual partner summary — 2026-08-31

- Rollback version before the approved refresh run: AppSheet `1.000158`.
- Temporarily enabled the disabled export bot, saved, ran it once, disabled it again, and saved the disabled state.
- Post-run AppSheet version: `1.000160`; the bot is confirmed disabled and the Codex scheduled analysis remains paused.
- Generated private workbook `Loan_Daily_Analysis20260831_061225_925.xlsx` (Drive ID `1m-Qk7ezUrnMZxWkfOK7ohkZnA7UrVWQh`).
- Manifest export timestamp: `2026-08-31 14:12:30.029` Asia/Singapore; template schema `1.1`.
- Populations: 17 Borrowers, 31 Loans, 294 Charges, and 264 Repayments. All master and transaction joins reconcile; all English borrower names are populated.
- Twelve new Repayment rows total THB 3,700: Puifai THB 2,900 and Oum THB 800. All were interest payments; outstanding principal remains THB 69,000.
- Puifai's overdue balance fell from THB 5,800 to THB 2,900 and overdue-charge count fell from 16 to 8. Her total unpaid amount through the export date is THB 5,800.
- Total portfolio overdue fell from THB 10,600 to THB 7,700. Bell remains at THB 4,800 and is now the largest overdue case.
- Net realized profit increased from THB 76,820 to THB 80,520. Gross borrower profit THB 86,520 less THB 6,000 default losses reconciles to this result.
- Identified a reporting-definition distinction: THB 3,700 cash was received on the export date, while Statistics `Amount Collected Today` is THB 800 because the THB 2,900 Puifai payment was allocated to older charges rather than charges due on the export date.
- Created `outputs/daily-loan-analysis-test-2026-08-31/Partner_Loan_Summary_Bilingual_2026-08-31.md` as a plain-language English–Thai summary for both business partners.

## Deeper bilingual partner review — 2026-08-31

- Reused the verified `2026-08-31 14:12:30.029` export; no additional AppSheet run or data refresh was performed.
- Extended the business analysis to cover profit quality, forecast interpretation, exposure concentration, overdue prioritization, principal recycling, borrower segmentation, and operating limits.
- Confirmed key diagnostic ratios: 6.9% default loss versus gross profit; 28.9% principal recovery; 74.2% of receipts from interest; 63.8% top-three exposure concentration; 76.8% top-five exposure concentration; and 55.5% of gross borrower profit generated by Puifai.
- Identified nine active loans with interest received equal to or greater than original principal while THB 32,000 principal remains outstanding; six of these loans and THB 27,000 outstanding principal belong to Puifai.
- Created `outputs/daily-loan-analysis-test-2026-08-31/Partner_Loan_Business_Review_Bilingual_2026-08-31.md` with simple English and Thai wording, deeper consultant interpretation, borrower segments, proposed portfolio limits, and a 30-day action plan.

## Rollback instructions

- AppSheet: restore version `1.000154` to undo only the test-state saves, or restore `1.000151` to undo the full implementation, from **Manage > Versions > Version History**.
- Google Drive template: restore revision `0ByMpjGph731Id2xpcTFEWno4ODVpeEsybXA0bEQrMVNWSFRvPQ` to undo the namespace compatibility repair while preserving the file ID.
- Google Drive template: restore revision `0ByMpjGph731IdC8rQXd6dUJ1cjBZR0JXU1BrYUttS1Q1VXZjPQ` to roll back only the activity-linked population update while preserving the file ID.
- Google Drive outputs: remove only the two exact test files identified above after verifying their names and ownership. The first file is intentionally retained as private defect evidence until the user decides whether to delete it.
- Codex: keep `Daily Loan Analysis Summary` paused or delete that automation.
- Local artifacts: delete only `outputs/daily-loan-analysis-2026-08-31/` and `outputs/daily-loan-analysis-test-2026-08-31/` if the template and test evidence are no longer required.
