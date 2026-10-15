# Loans borrower name virtual column — completed 15 September 2026

Owner requested replacing stored Loans[Borrower Name] with a same-name VC and removing the SQL-trigger implementation. Owner confirmed permanent removal and that both apps were idle. Borrowers[Borrower Name] is unchanged.

| Consumer | Rollback version | Final version |
| --- | --- | --- |
| Production OLTP | 3.000067 | 3.000069 |
| Production OLAP | 1.100044 | 1.100046 |
| SQL OLTP copy | 1.000006 | 1.000008 |
| SQL OLAP copy | 1.000011 | 1.000013 |

## Implementation and dependencies

Removed only public.Loans.Borrower Name and the appsheet_loan_borrower_name / appsheet_borrower_name_propagate triggers and functions in an atomic SQL transaction. RESTRICT was used, with no CASCADE. No SQL view depended on the column. The 13 validated foreign keys and eight blank-reference normalizers remain. Loans has 62 rows and 19 SQL columns.

Regenerated Loans in all four consumers using the new editor and added Name VC **Borrower Name** with expression **[Ref Borrowers].[Borrower Name]**. Display name **ชื่อผู้กู้ / Borrower**, visibility, searchable status and read-only behavior were restored to the original settings. Same-name dependencies in formulas, labels, views, slices and actions are retained. Loans has 20 physical AppSheet columns including ordinal plus 21 OLTP / 31 OLAP virtual columns. Overall counts remain unchanged.

OLTP owns loan entry; OLAP consumes names in reporting. Both SQL copies were reconciled because they share the database. Direct SQL readers must join Borrowers for the name; AppSheet readers retain the same field. No Looker configuration was changed. Export/Looker execution was not retested.

Before/after definition comparison checks every object, including actions disambiguated by owning table. No objects were lost or added. Only intended VC properties, app version, connector locale metadata and Row ID's inherited fixed-definition/initial-value-editability metadata differed. Row ID remains hidden, read-only, Text, key, with UNIQUEID("PackedUUID"). It was not rekeyed or made editable to app users. The new VC does not have NFC scanning metadata, unlike the previous stored column's disabled setting.

## Verification

All 62 stored loan names matched their referenced borrower before removal, with no missing borrower. The existing authorized copied OLAP API was used for read-only Find after conversion: all 62 virtual names match Borrowers. No financial transaction or borrower rename was made to test this change. Current-name resolution follows the direct Ref expression; a separate live rename propagation test was not performed.

Both production desktop clients loaded. Loan name labels rendered, the OLTP detail showed the bilingual borrower-name field, and an existing loan edit form opened and was cancelled without saving. All four final app definitions report Runnable Yes. Full lifecycle retesting was not repeated for this display/reference-only change. Owner device acceptance and downstream refresh remain follow-ups.

## Mailbox error investigation

The owner reported an email during the change. The requested work mailbox contained two AppSheet sync alerts: OLTP at 00:37 Bangkok referencing **3.000068**, and OLAP at 00:38 referencing **1.100045**. Both say the app version is not runnable. These were intermediate versions saved automatically by regeneration while Borrower Name was absent and before its VC replacement was saved. The editor showed the matching missing-column Loan Key error. This temporary failure was caused by the migration sequence. Corrected versions 3.000069 and 1.100046 are runnable and load successfully. No evidence of a failed payment or lost data was found; no payment was attempted during this change. Future conversions should prepare the replacement before regeneration to minimize the invalid-version interval.

## Documentation and recovery

Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx (Columns, Tables, SQL Production). The workbook was rendered and re-imported; saved values match expected edits and unrelated sheet values are preserved. SQL migration/rollback, dependency inventory and sanitized verification are in outputs/borrower-name-vc-20260915. Maintained verification/dictionary scripts are in scripts/.

Full definitions, SQL metadata and all 62 exact key/name/reference values are privately backed up under C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-name-vc-20260915. Credentials and personal row data are excluded from Git. Independent private backup coverage is unverified.

Rollback requires restoring the SQL column and two name triggers/functions with restore-stored-name.sql, then reconciling or restoring all four app definitions. Do not restore an old app definition against the column-removed schema. The rollback SQL reconstructs current names from Borrowers; exact prior names are also privately backed up. Preserve intervening production writes.

Owner checklist: reopen/sync both apps, inspect an existing loan name, and confirm a future normal borrower rename appears in related loan labels after sync. Report any error mentioning a final version. Current configuration is implemented and verified; owner acceptance is pending.

References: https://support.google.com/appsheet/answer/10106758 (virtual columns); https://support.google.com/appsheet/answer/10106675 (column changes and regeneration).
