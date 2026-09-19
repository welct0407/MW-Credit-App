# DEV app refresh — 19 September 2026

## Scope and status

Owner requested refreshing DEV OLAP and OLTP from PROD while preserving the current DEV theme colors. Apps-only scope: retain the existing DEV database, financial data and fixtures. No PROD changes or database refresh are authorized by this task. Status: replacement apps applied and Deployed; configuration/runtime checks and old-app cleanup are complete.

Starting Git commit: `b170c5870d3a1fed6265609281d4d7fdcc4bf8f0`. Pre-existing unrelated untracked `Change Logs/CHANGE_NOTES_ORGAN_PAYMENT_2026-09-19.md` belongs to another task and is excluded.

## Live baseline and recovery

| App | UUID | Observed version | Mode | Theme | Primary color |
| --- | --- | --- | --- | --- | --- |
| DEV OLTP | 65faacd8-2b0d-43bf-9e0a-58eb915dcf9b | 1.000181 | Prototype | White/light | #e8710a |
| DEV OLAP | 494cd013-0d9b-482f-9559-c9d83059de91 | 1.000171 | Prototype | White/light | #1e88e5 |
| PROD OLTP | 93844270-6aa5-420b-a960-bcdf08abd357 | 3.000228 | Deployed | Not changed | Not changed |
| PROD OLAP | e74dd368-654f-44d7-bccf-83cf361d1cdb | 1.100178 | Deployed | Not changed | Not changed |

Both prior DEV apps used Color header/footer style, white launch image, no background image and text size 20. OLTP used Rubik and the accounting.png app icon; OLAP used productivity.png. Exact values were read from current editor controls and preserved in the replacements.

DEV OLAP 1.000171 is newer than the inventory's 1.000170. Its history records a System automatic consistency check at 2026-09-19T02:30:43Z, with generated metadata/internal output-table changes. It is not evidence of a new owner feature. Release tracker and development differences record R001–R008 promoted; preserve all existing DEV data and environment differences.

Read-only Flyway info succeeded on the configured distinct DEV and PROD endpoints; both report V24. No SQL writes occurred. DEV is 34.158.38.171 / appsheet-pg-dev-20260915; PROD is 34.21.174.215 / appsheet-pg-prod-20260914. Both databases are named loan_manager_prod.

## OLTP replacement checkpoint

Created definition-only copy from verified PROD OLTP 3.000228, with both data/file-copy options off. Replacement internal name `MW-OLTP-DEV-20260919-578763613`, UUID `500b27b6-884a-41e8-a9ec-df801b0110ad`. Initial copy was observed in Prototype mode. An attempted temporary Pause confirmation encountered a browser-control timeout; a fresh editor still showed Pause app, so pause was not established. No financial writes were submitted during preparation. Deployment occurred only after DEV source, route and guard configuration.

All 13 business source bindings were individually changed to existing database-3 sources with matching public table/view identifiers: Borrowers, Business Expenses, Cash Accounts, Cash Holder Balances, Cash Holders, Charges, Loan Form Context, Loans, Partners, Payment Allocations, Payments, Repayments, Statistics. Independent saved appdoc readback at **1.000009** confirmed all 13 bindings and the new DEV OLAP link. No data-copy operation or manual schema regeneration. Preserved White/light and Color header/footer style, primary `#e8710a`, Rubik/20, white launch and empty background. Original accounting.png DEV logo restored in a subsequent save. New default folder is `/appsheet/data/MW-OLTP-DEV-20260919-578763613`.

## OLAP replacement and isolation

Definition-only copy of PROD OLAP **1.100178**, both data/file-copy options off. New internal name `MW-OLAP-DEV-20260919-578763613`, UUID `9f3422be-bc87-4a5a-a42a-67528ee80393`. All **19** business sources were rebound and independently read back at **1.000011**: five OLAP analytics views including Portfolio Summary, Loan Assessment SQL Lab View, and the original operational/account/custody/statistics tables/views. All use database-3; native process-state tables belong to the replacement UUID. New folder `/appsheet/data/MW-OLAP-DEV-20260919-578763613` isolates relative file output. Disabled Daily Loan Analysis Export remains disabled, preserving its XLSX template and relative `Loan Daily Analysis/Exports` path. No export was executed.

Saved theme readback: White/light, primary **#1e88e5**, Color header/footer, white launch and empty background; original productivity.png DEV logo restored in a subsequent save. Both companion actions now use the replacement internal names. Rendered appdoc scans found no obsolete DEV or PROD companion navigation targets. Actual navigation OLTP → OLAP → OLTP passed, verified by runtime internal app names.

Account Sources UI independently confirmed **database-3 → Postgres / 34.158.38.171 / loan_manager_prod / Require SSL**. No source credentials or connector settings changed.

## Automation and verification

- All **12** existing OLTP push-task ToList overrides were saved and independently read back as `LIST("welct0407@mw-credit.com")`. Channel, original event conditions, contents and local-row deep links are retained. [Production recipient restoration map](../outputs/dev-app-refresh-20260919/recipient-mapping.json). No Partner master data edits.
- Canonical first-process branch guards added to OLTP Generate Daily Charges and OLAP Refresh Daily Analytics Daily, plus the disabled OLAP export. Business work is inside the true branch; false and continuation paths have no side effects. Per-row event filters combine the guard with the unchanged original filter. OLTP retains daily 00:05 SE Asia; OLAP retains hourly schedule. Superseded processing bots remain disabled. Existing PROD definitions were not edited.
- Initial deployment checks passed definition, data structure, sign-in, allowed updates and account checks. Advisory suggestions: missing industry/function, OLAP menu size, and server caching. Menu/caching behavior was preserved; these are deployment suggestions, not editor configuration issues. Both replacement editors independently showed **No issues found** after deployment.
- Current desktop GUI: both apps load; OLTP sync completes; both-direction companion navigation passes. Synthetic closed-loan detail and native borrower reference work in both apps, with matching principal/receipt/profit values. OLTP borrower edit form opened and cancelled without saving. OLAP operational loan/borrower details remain read-only. Assessment entry point loads and correctly reports its retained stale assessment; no assessment decision or financial write was made.
- Temporary non-row daily diagnostic at **16:50 SE Asia** added to OLAP: canonical guard → synthetic owner-only push, no business-data write. Controlled copy `MW-GUARD-VERIFY-20260919-578763613`, UUID `89069cd6-e064-4e05-a649-cd3b4fb53130`, copied with no data/files, all 19 DEV source bindings read back, unchanged canonical literals exclude its own name. Initial check passed and copy was Deployed for first-use scheduled server verification. Natural runs at **09:50 UTC / 16:50 Bangkok** completed: canonical DEV returned **Y** and recorded the owner-only push task; excluded copy returned **N**, with no notification step. The diagnostic bot was removed from DEV and the disposable verification app was deleted; inventory confirms its removal. No backing data was deleted. [Sanitized runtime evidence](../outputs/dev-app-refresh-20260919/verification.json).
- Natural OLAP **17:00 Bangkok** hourly run `fc217ece-4789-43d2-a75f-32a28d80f1da` completed at **10:00:06 UTC**. Monitor steps show Input, Canonical app execution guard, Request Recent Analytics Refresh, returnStep. No forced nightly charge run was performed.
- Final saved-state verification: **OLTP 1.000010 / OLAP 1.000013**, both **No issues found**, Save disabled. Restored the original editor preference for showing automation components. Original DEV icons are included in these versions; the later OLAP save removes the diagnostic bot.

## Recovery, documentation applicability and remaining work

The owner subsequently gave explicit approval to delete both prior Prototype apps despite the unavailable original-DEV definition exports. After action-time confirmation, AppSheet deleted `Loan Business Insights — DEV` (`494cd013-0d9b-482f-9559-c9d83059de91`) and `Loan Manager — DEV` (`65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`). A refreshed inventory showed four apps only: the two replacement DEV apps and the two PROD apps, all Deployed. AppSheet warns deleted definitions are no longer accessible. No backing PostgreSQL data or files were deleted.

The private source captures remain under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r008-20260918`: `prod-oltp-r008-appdoc.json` SHA-256 `abbcce7da39b2d1dae9c90133e8f68cfb3a5772c8cb5d8db7f59f5242097c0a9`; OLAP counterpart `c12659ea745579d6ba1d9964fd3761b2bceb78afef971a304f69ee0357552cf0`. No new private-backup coverage is claimed.

No SQL/business model, Ref, slice, permission or business-column expression was redesigned. Environment identity, appearance, routing and automation guards are the refresh differences. Update inventory/differences and overview status; the production dictionary's business inventory remains applicable and requires no model-row rewrite for this environment-only batch. Release tracker R001–R008 remains Released; no new product release number or PROD tag is allocated for the refresh.

Refresh closure is complete. Configuration, source isolation, GUI checks, guard execution and final four-app inventory are verified. Browser content export was unsupported and printing produced no verified original-DEV file; the owner explicitly accepted deletion with that limitation. Device receipt remains distinct from recorded server dispatch and was not independently observed. No PROD deployment/tag applies.
