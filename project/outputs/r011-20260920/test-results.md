# R011 DEV verification — 20 September 2026

Targets: DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`, final 1.000059; DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`, final 1.000018. Database tuple: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_dev`.

| Check | Result / evidence |
| --- | --- |
| Affected live schema | Before: 23 physical borrower columns, no note; V27; three existing borrower triggers. After: 24 physical columns including nullable text Borrower Note; V28. `scripts/database/Inspect-R011.ps1` reads metadata/aggregate counts only. |
| Rollback | Private DEV dump completed; pg_restore catalogue read passed; SHA256 in release log. App rollback OLTP 1.000054. No full DB restore rehearsal claimed. |
| Migration chain | `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-R011.sql`: 28 migrations built, validate passed, repeat migrate 0, checksum tampering rejected; PostgreSQL 18.6 / Flyway 13.6.0. `baselineRebuildMatch=False` is the runner's non-V1-only result, not a failed chain test. |
| Synthetic SQL | Old-style borrower insert without note succeeds; multiline note persists on only target borrower; no payment created; principal remains zero; existing OLAP borrower view reads fixture; note clear succeeds; all fixtures rolled back. |
| DEV migrate/validate | V27→V28, one migration, success true, no warnings; validationSuccessful true, no invalid migrations. |
| GUI note persistence | Current DEV desktop app: Collection → borrower detail → enter two-line synthetic R011 TEST note → blur/sync → reload. Both lines remain. Clear note and sync restores empty value. SQL aggregate confirms 0 nonblank notes after cleanup. No borrower identities or data exported into evidence. |
| GUI required English Name | Existing borrower Edit form shows required English Name. Clear only that input and press Save: Thai required-field message `จำเป็นต้องกรอกข้อมูลนี้`; form remains open. Cancel and return to detail. Database aggregate confirms 0 missing English Names among 31 borrowers. |
| Final layout | 1.000057 reloaded runtime: optional multiline note directly below Todays Amount Remaining and before Todays Collection Charges, inside borrower summary. Persistence test reused from 1.000056 because that save only reordered the same field; 1.000058 changed display names only. |
| GUI new-borrower labels | Final 1.000058 blank create form shows Thai-first bilingual labels for Borrower Name, English Name, Preferred Receiving Cash Account, Instagram Username, AI Collection Enabled and Address. Existing bilingual labels remain in the same format. The form was cancelled; no borrower row was created. |
| Partner-language localization | In both apps, all 116 Localization system-text rows are expression mode and exactly match the Partner lookup template: `USEREMAIL()` → `Partners[Login Email]` → `Language Preference`. `English` selects the AppSheet platform English label; all other/blank values use Thai. Exact editor readback found 0 mismatches in each app. OLAP received the verified OLTP set through AppSheet localization copy/paste. The current signed-in runtime displayed the launch text in English. See `localization/verification.json`. |
| Diagnostics | Final OLTP 1.000059 and OLAP 1.000018 saved editors show green check, no outstanding configuration warning/error indicators, Deployed. Both Save controls are disabled after save. Schema regeneration slice-list warnings remained cleared. |
| OLAP | Current editor/preview saved at 1.000018 for localization only; Borrowers source remains olap_borrowers_analytics / database-3, read-only, 87 AppSheet columns. Existing SQL provider contract is unchanged; no regeneration was necessary. |
| Dictionary | Rows 2857–2870 in Dev Differences, all prior values/formulas preserved after export/import; affected renders inspected and formula-error scan clear. See `dictionary/verification.json`, `dictionary-labels/verification.json` and `dictionary-localization/verification.json`. |

Limitations: physical-device/mobile/offline and concurrent-user note edits were not tested. Separate Tommy and Lisa sign-in sessions were not impersonated; the saved per-user expression set and current-user English evaluation were verified instead. No dated note history was requested or implemented. Tests do not establish owner acceptance or production authorization. No new notification route or financial workflow was exercised.
# Latest extension — 21 September 2026

R011 now includes optional Cash Accounts.Alternative Account Number. Current DEV: SQL V29 / OLTP 1.000062 / OLAP 1.000021. See [account-alias verification](account-alias/test-results.md) for new SQL/GUI tests, rollback and preserved R012 integration; the earlier tests below remain dated evidence for unchanged behavior.

## Production closure — 21 September 2026

The owner merged the reserved R012 Cash Ledger Recent refinement into R011 and authorized promotion. PROD finished at SQL V29 / OLTP 3.000240 / OLAP 1.100189 with both apps Deployed and editor-clear. See the [production report](production/REPORT.md) and [Cash Ledger evidence](cash-ledger-recent/test-results.md). R012 was not promoted independently.
