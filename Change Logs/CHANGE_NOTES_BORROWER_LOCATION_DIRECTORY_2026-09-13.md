# Borrower location directory — 13 September 2026

## Scope and purpose

Prepare a separate editable Google spreadsheet for the owner's friend to complete borrower cities and working locations for planned offline cash collection. Include every non-hidden borrower and exactly four columns: Thai name, English name, city, working location.

## Source and matching

- Read the deployed Loan Manager app's `Borrowers` view, which identifies its rows as `Visible Borrowers`. The documented filter is `NOT([Hidden Flag])`.
- Read the list through its last row: 27 visible borrowers. All 19 names in the owner-supplied list matched; the other eight remain included with blank locations.
- Preserve the app's Thai and English spellings, honorifics, and numbered name distinctions. No financial values, borrower IDs, bank details, or contact identifiers are included in the deliverable.
- Do not infer cities from an unqualified Soi 6 or freelance description. Preserve the condominium statement as a residence note, and flag the ambiguous street spelling for confirmation. Blank cells mean information not supplied.

## Changed files and objects

- Added `scripts/build-borrower-location-directory.mjs`, a generic builder receiving private JSON separately.
- Private input, XLSX, inspection output and visual preview are under `outputs/.tmp/borrower-locations-20260913/`, already ignored by Git. These contain personal information and must not be committed.
- Created a private `ChatGPT` folder in the owner's confirmed business Google Drive account. The owner corrected the original email spelling to the account signed in through Chrome.
- The Drive connector is authenticated to a different personal account. No borrower data was uploaded through that connector.

## Rollback point

This is a new standalone file; no pre-existing document is overwritten. AppSheet and Looker configuration and operational records are unchanged, so app-version/report-copy rollback requirements do not apply. Existing application data remains the source of record.

## Checks performed

- Verified visible borrower population and matched names against the live deployed app.
- Builder validates four text fields per row and unique Thai names.
- Exported and rendered the 27-row workbook; checked all rows, headers, Thai text, widths and blanks visually.
- Confirmed private build files are in an already-ignored `.tmp` directory.

## Status

Completed through direct Chrome GUI creation and table population, explicitly requested by the owner after file upload was blocked. Native spreadsheet title: `Borrower Locations - ข้อมูลผู้กู้`. Spreadsheet ID: `1EraUswJ7xnSUUE0Gw0Hsv3wgXr_jT7tlbzD1H5_wgBk`. Location: the newly created private `ChatGPT` folder.

Created native table `BorrowerLocations` in `Sheet1!A1:D28`, with fitted columns, table filters and frozen header. Added source/blank-field guidance and the residence clarification as cell notes. Read back the entire range through the spreadsheet clipboard and visually checked the top and bottom of the table. Google displayed `Saved to Drive`.

Reopened sharing and verified the confirmed business account as Owner, the exact friend requested in the conversation as Editor, and General access as Restricted. The Notify people checkbox was cleared before saving. No separate message was sent. Friend-side editing and location accuracy remain for manual acceptance.

## Manual acceptance and downstream effects

After sharing, the friend should verify she can edit, fill missing city/workplace details, confirm the ambiguous street spelling and supply an actual workplace where only residence information was given. Edits to this standalone file do not update AppSheet. No collection automation or payment workflow is changed.

## Rollback instructions

Remove the friend's access and move only the new standalone directory to Drive Trash if it is no longer wanted. Keep the original AppSheet records intact. The newly created private folder can be removed if empty and no longer needed. Revert the generic builder and these notes with a normal Git revert if desired.

## Active-borrower highlighting — 13 September 2026

- Owner requested highlighting for borrowers having active loans.
- Synced the deployed operations app and read all borrower groups under Loans → `ยังไม่ปิดยอด / Active`. Matched 20 distinct active borrowers to the existing 27-row directory. Status is based on the app's Active group, not payment-row existence or historical loan amounts.
- Inspected the current shared sheet before editing; preserved the friend's intervening workplace update and all other cell values.
- Added one pale-yellow conditional-format rule on `Sheet1!A2:D28`, using exact English-name matches with an anchored column and relative row. Name-based matching keeps the highlight with the borrower when sorted. Seven borrowers remain unhighlighted.
- Added a bilingual note to `B1` explaining the meaning, verification date, and lack of automatic AppSheet status sync. No extra data column was added.
- Verified the saved rule range, exact name set and color in the rule panel; visually checked both the top and bottom of the table, including unhighlighted rows and numbered name distinctions. Google reported the sheet saved to Drive.
- Rollback point: the immediately preceding saved Google Sheets revision; the smallest rollback is to remove this conditional-format rule and the new B1 note. No AppSheet configuration, financial data or sharing permission was changed.
- Status: implemented and verified; user/friend acceptance remains pending. Refresh the verified name set after loan openings/closures if current status is needed later.
