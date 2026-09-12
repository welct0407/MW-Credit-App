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

Local workbook prepared and visually checked. Chrome upload is blocked by the extension's local-file access setting. Owner has been asked to enable it. Google Sheets conversion, content/ownership verification and the requested friend editor access remain pending. No sharing success is claimed.

## Manual acceptance and downstream effects

After sharing, the friend should verify she can edit, fill missing city/workplace details, confirm the ambiguous street spelling and supply an actual workplace where only residence information was given. Edits to this standalone file do not update AppSheet. No collection automation or payment workflow is changed.

## Rollback instructions

Remove the friend's access and move only the new standalone directory to Drive Trash if it is no longer wanted. Keep the original AppSheet records intact. The newly created private folder can be removed if empty and no longer needed. Revert the generic builder and these notes with a normal Git revert if desired.
