# Change Notes — Daily Collection Message Review — 2026-09-03

## Status

Implemented for review; manual testing and the user's friend's wording approval are pending. No borrower message was sent, no messaging automation was created, and no production financial record or Looker Studio object was changed.

## Message structure standardization — 2026-09-03

- Standardized each draft so the first line politely addresses the borrower and states today's payment; the `16.00 น.` deadline and late-charge warning remain in the payment request.
- Added a second line only when an overdue balance exists. For the borrower whose current-day charge was already paid, the first line says so and the second line requests the overdue balance.
- Appended the screenshot-inspired payment reminder block after the amount lines. The bank, account number, and account-holder fields use approved-detail placeholders because project data-protection rules prohibit copying bank details into the shared review workbook.
- Reused the existing reconciled workbook and Google Sheet. No AppSheet data was re-extracted, and no amount, status, charge count, or today/overdue allocation changed.
- Updated `Draft Messages!A2` and `Draft Messages!E5:E9` in the local workbook and native Google Sheet. All five review statuses remain `Friend review pending`, and no borrower message was sent.

## Wording refinement — 2026-09-03

- Refined the five draft messages after reviewing the user's screenshot of the friend's normal borrower-reminder style.
- Reused the previously generated and reconciled workbook; no AppSheet data was re-extracted and no amount, status, charge count, or today/overdue allocation changed.
- Shortened the copy to an amount-first, emoji-led reminder using the conversational term `ส่งยอด`.
- Removed the explanation of charge origin when the overdue amount is zero. Borrowers with overdue amounts retain a compact today/overdue split.
- Preserved the `16.00 น.` deadline and late-charge warning in friendlier language.
- Did not copy the bank/account details visible in the reference screenshot into the workbook or Google Sheet.
- Updated `Draft Messages!A2` and `Draft Messages!E5:E9` in both the local review workbook and the existing native Google Sheet. Review status remains `Friend review pending` for all five borrowers.

## Scope and purpose

- Added a read-only `Todays Collection Board` slice to the OLAP app, `Loan Business Insights`, to provide a governed borrower-level collection export surface.
- Preserved the OLTP row rule: `ISNOTBLANK([Daily Collection Status])`.
- Used eleven fields already available in OLAP: `_RowNumber`, `Row ID`, `Borrower Name`, `Description`, `Hidden Flag`, `Daily Collection Status`, `Todays Collection Charges`, `Todays Amount Due`, `Todays Amount Collected`, `Todays Amount Remaining`, and `Overdue Amount`.
- Exported the five borrowers with a positive outstanding amount into a review workbook, separated current-day and overdue amounts at borrower/bucket grain, and drafted copy-ready Thai reminder messages.
- The OLAP slice intentionally does not add the OLTP-only presentation VCs `Daily Collection Status - Order` or `Borrower Name - Collection`.

## Rollback points

- OLTP source app: `Loan Manager ผู้จัดการสินเชื่อ` v2.200115 (`93844270-6aa5-420b-a960-bcdf08abd357`); inspected only.
- OLAP affected app before change: `Loan Business Insights` v1.000191 (`e74dd368-654f-44d7-bccf-83cf361d1cdb`).
- OLAP version after change: v1.000192.
- Local data-dictionary backup: `outputs/01a066b1-e885-7d52-98f5-34812d9c7c18/daily-collection-messages-2026-09-03/AppSheet_Data_Dictionary.before-daily-collection-slice.xlsx`.

## Current snapshot and reconciliation

Snapshot date: 2026-09-03, Asia/Singapore.

| Borrower | Status | Outstanding now | Today | Overdue |
| --- | --- | ---: | ---: | ---: |
| พี่วา - Wa | Not Paid | ฿100 | ฿100 | ฿0 |
| พี่เนย - Noey | Not Paid | ฿300 | ฿300 | ฿0 |
| พี่ปุยฝ้าย - Puifai | Overdue | ฿5,900 | ฿2,900 | ฿3,000 |
| พี่เบล - Bell | Overdue | ฿4,220 | ฿0 | ฿4,220 |
| พี่หนึ่ง - Nueng | Overdue | ฿800 | ฿400 | ฿400 |
| **Total** | **5 actionable borrowers** | **฿11,320** | **฿3,700** | **฿7,620** |

The live OLTP board contained 20 borrower rows: 2 Not Paid, 3 Overdue, and 15 Fully Paid. The export excludes fully paid rows. Every borrower and bucket row has a zero reconciliation difference.

## Objects and files changed

- AppSheet OLAP slice: `Todays Collection Board`.
- `Documents/AppSheet_Data_Model_Overview.md`.
- `Documents/AppSheet_Data_Dictionary.xlsx` (`README`, `Slices`, `Slice Columns`, and reserved `Change Log` worksheets).
- Native Google Sheets review file, [Daily Collection Message Review - 2026-09-03](https://docs.google.com/spreadsheets/d/1Sg4gX0PNRuHy6nuOi1k954Au0sHb7KmjX5pLQA0O4n0/edit), stored in the My Drive `ChatGPT` folder and containing `Collection Summary`, `Charge Breakdown`, `Draft Messages`, and `Metadata` tabs.
- This Markdown change log.

## Checks performed

- Confirmed the live OLTP slice source, row filter, read-only mode, and collection workflow data.
- Confirmed the OLAP app ID and pre-change version, saved the new slice, and verified OLAP v1.000192 after save.
- Verified the new OLAP slice is read-only and uses the documented filter and column order.
- Reconciled the five current actionable borrowers to the live board total of ฿11,320.
- Verified `฿11,320 = ฿3,700 current-day + ฿7,620 overdue` and zero variance for every borrower/bucket row.
- Scanned the review workbook and data dictionary for formula errors; none were found.
- Rendered and visually checked all review-workbook tabs and the affected data-dictionary sheets.
- Imported the verified workbook as native Google Sheets and read the values back before presenting the drafts.

## Manual testing required

1. Sync both apps and confirm the five borrowers and amounts still match the current cutoff; amounts may change after payment or charge activity.
2. In OLAP, confirm the new slice remains read-only, includes only borrowers with a nonblank collection status, and contains the eleven fields in the documented order.
3. For each borrower, open the related charge detail and confirm current-day and overdue bucket amounts, including partial payments and same-day fully paid charges.
4. Ask the user's friend to review tone, borrower naming, the `16.00 น.` deadline, and the phrase `ค่าปรับล่าช้า` before any use.
5. Confirm fully paid borrowers are excluded and that permissions do not expose borrower data beyond the intended reviewers.
6. Reconcile the native Google Sheet total to the OLTP Collection board immediately before copying any message.

## Downstream effects and limitations

- The new slice may add a small OLAP sync/query cost because it exposes existing borrower VCs, but it introduces no new expression or aggregation.
- The Google Sheet is a point-in-time review artifact, not a live synchronized feed.
- Borrower status and amounts can become stale after payments, reversals, adjustments, or new charges.
- The drafts are prototype operational wording; they are not legal notices or compliance-approved communications.

## Rollback instructions

1. Restore OLAP version v1.000191 in AppSheet to remove the new slice.
2. Restore `Documents/AppSheet_Data_Dictionary.xlsx` from the recorded local backup and revert the corresponding daily-collection sections in `Documents/AppSheet_Data_Model_Overview.md`.
3. Mark this change log as rolled back with the date and reason.
4. Leave the Google Sheet unsent; archive or delete it only with the user's explicit instruction.
