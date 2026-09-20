# R010 — OLTP payment validation and Cash Account Statement

## DEV account initialization — 20 September 2026

Completed the owner's request to initialize all five DEV accounts at zero, after explicit approval of the necessary Dad 19,828 and Lisa 26,234 Manual Correction outflows. Existing financial history is preserved; all five opening and current balances were zero at completion. Earlier daily balances now calculate from retained history. PROD is untouched; this DEV data operation must not be promoted.

Starting Git `498331854ceb4c01823dcf9f769ebefc57062a62`. A fresh private backup was restored, schema-compared and the atomic operation rehearsed before live execution. Transaction assertions, post-commit SQL reconciliation and current-GUI numeric statement balances passed. Exact backup hash, recovery procedure and checks: [initialization evidence](../outputs/r010-20260919/cash-statement/ZERO_INITIALIZATION.md).

Changed files: maintained DEV initialization SQL/PowerShell runner, parameterized R010 backup rehearsal runner, this log, initialization evidence, environment inventory, development differences, report and promotion checklist. No schema or app configuration change; no new migration or dictionary update is needed. Existing V27 hashes and app versions remain applicable. This supersedes the earlier uninitialized-DEV limitation below; broader owner acceptance and promotion remain pending.

## Cash Statement extension — 20 September 2026

**DEV implemented; Ready for owner review.** OLTP **1.000052**, SQL **V27**. Both DEV editors report **No issues found** and remain Deployed. OLAP **1.000017** was observed without edits by this task; its version is newer than the prior 1.000015 record. Preserve it and reconcile owner scope before RC capture. Acceptance, RC creation and production authorization remain pending.

The owner requested the supplied Cash Statement design in **R010**, overriding its suggested R011. The owner confirmed manual OLTP saves through **1.000038** and requested work on current DEV; this is the extension's restorable app baseline. Starting Git **d04e47b8af7f636633e4dc67df7e859af7b52c33**, clean tree. Original design: G:/My Drive/Loan Manager/Design Documents/R010_Cash_Account_Statement_Detailed_Design.md. Existing payment guards below remain included; historical readiness statements describe their earlier scope.

Implemented additive V27: per-Partner selection context with immutable owner and insert seeding; internal account-side Cash Ledger provider; recent statements; 15-date account daily summaries. Running balances use opening minus captured baseline in plus baseline out plus all ledger effects, before the recent filter. Uninitialized balances remain NULL. Financial posting and opening initialization are unchanged.

DEV OLTP adds those three public sources from database-3, two read-only selected slices, localized presentation VCs and four views (controls, summary, five-column transactions and menu dashboard). Only account/date preferences are editable. Source Refs provide native drill-down. Full historical review remains in existing OLAP navigation. Optional date shortcuts and dedicated history action were not necessary to the core feature. Exact types, keys/Refs, filters, formulas, display settings and SQL contracts are captured in [configuration](../outputs/r010-20260919/cash-statement/appsheet-config.json) and dictionary Dev Differences **A2812:E2856**.

Verification: clean 27-migration rebuild, repeat/validate/checksum protection, synthetic finance/date/context suite, restored DEV backup rehearsal, V27 DEV migrate/validate, zero aggregate reconciliation errors, GUI account/date refresh, blank unknown balances, five-column signed amounts, payment drill-down and final both-app diagnostics. GUI testing caught and corrected duplicate baht formatting. See [SQL tests](../outputs/r010-20260919/cash-statement/SQL_TESTS.md) and [GUI tests](../outputs/r010-20260919/cash-statement/GUI_TESTS.md). All existing workbook values/formulas survived export/reimport; rendered review passed. Actual Thai second-user, concurrent-device and physical-phone testing remain limitations; initialized numeric balances were tested in disposable SQL because DEV has no account openings. No financial GUI writes or forced notifications.

Rollback: restore OLTP **1.000038** while retaining owner work. V27 is additive and compatible with the old app; removal would require a reviewed higher migration. Private DEV backup was restored/schema-compared and V27 rehearsed successfully; path/hash and limitations are in SQL evidence. PROD remains R009 (OLTP 3.000231 / OLAP 1.100181 / V26). Promotion must apply V27 before a PROD-bound candidate's source validation, using the exact tested manifest and approved RC workflow. No production action was performed.

Changed files: V27 and maintained SQL test/state/backup runners; R010 statement evidence/configuration; data dictionary, model overview, solution-design DEV note, environment inventory, development differences, tracker, report/tests/manifest and existing promotion checklist. New documentation only describes this feature; unrelated historical sections below are preserved.

## Scope and status

Reserved 19 September 2026; implementation completed 20 September 2026. Status: **Ready for review**. The owner requested implementation in DEV OLTP of the first error-prevention proposal: reject predictable invalid user operations in the AppSheet GUI so users receive a form or action message instead of a later synchronization error.

The affected paths are direct payment entry, correction of cash account/cash holder on a Posted payment, and R008 quick-payment commands for Receive All, Receive Full and Loan Close. The database constraints remain the final integrity layer.

## Implemented DEV controls

- `Payments[Ref Borrower]`, `[Amount Received]` and `[Payment Date]` are required on new rows. Existing borrower concurrency, amount eligibility/whole-baht and no-future-date rules retain their logic and now show bilingual error text. `[Ref Received By Cash Account]` shows a bilingual active-account error.
- `Payments[Notes]` compares the edited Posted receipt with `_THISROW_BEFORE`. A receiving-account or derived-holder correction requires nonblank Notes that differ from the prior Notes and preserve the prior text as a prefix. The first LOOKUP-based draft falsely marked unchanged Posted receipts invalid; current-GUI testing found it and the rule was corrected before readiness.
- `Charges[Payment Request Cash Account]` offers active accounts only when `[Amount Remaining] > 0`; `Borrowers[...]` uses `[Todays Amount Remaining] > 0`; `Loans[...]` requires an open daily-interest loan, Auto Charge enabled, a valid nonfuture Loan Date, a nonnegative Current Daily Interest and positive Outstanding Principal. Each field has a bilingual rejection message and visible balance/prerequisite description.
- Existing Required_If expressions for the three one-field R008 command forms and the existing direct-payment Valid_If expressions remain in place. No bot, action, view, slice, table, SQL object or notification route changed.

## Baseline and rollback

- Starting Git commit: `ca79639667343a598a369d9cef84441d9bfb785f`; working tree clean.
- DEV OLTP: `MW-OLTP-DEV-20260919-578763613` (`500b27b6-884a-41e8-a9ec-df801b0110ad`), saved version **1.000033**, Deployed, editor diagnostics **No issues found**. Version **1.000033** is the recorded restorable rollback point before R010 edits.
- DEV OLAP remains **1.000015**. SQL remains Flyway **V26**. No database schema/data change is planned for this GUI-only batch.
- PROD remains R009 at OLTP **3.000231**, OLAP **1.100181**, SQL **V26**. No RC or PROD action is authorized by this development request.

AppSheet rollback restores DEV OLTP version 1.000033 if needed. Repository rollback uses a scoped revert of R010 commits while preserving later unrelated work. App rollback does not undo accepted data writes; all R010 runtime forms were cancelled or discarded and produced no financial write.

## Verification and evidence

- Saved/reloaded DEV OLTP version **1.000036**; editor diagnostics: **No issues found**; app remains Deployed.
- New blank receipt: Save stayed in `Payments Form` and displayed required-field messages for Ref Borrower and Amount Received. Cancelled; no row written.
- Unchanged Posted receipt: opened without the custom correction error after the `_THISROW_BEFORE` fix.
- Posted receipt account changed Dad → Lisa without changing Notes: Save stayed in the form and displayed the bilingual appended-reason error. The form was discarded; no row or ledger change was written.
- Quick-command zero/ineligible guards were independently read back from the saved editor. A live stale-race write was intentionally not manufactured; the command account list becomes empty and its visible field supplies the message when the current row is ineligible.
- The production model overview, DEV differences, environment inventory and workbook `Dev Differences` rows 2790–2811 are updated. Workbook export/reimport readback and rendered review passed.
- Implementation checkpoint: `eba6f4571fe86cbf3aa584c323e547933a8636fc`.

[Report](../outputs/r010-20260919/REPORT.md), [tests](../outputs/r010-20260919/TESTS.md), [saved readback](../outputs/r010-20260919/dev-saved-readback.json), [manifest](../outputs/r010-20260919/release-manifest.json).

## Readiness and remaining work

**Ready for review.** DEV acceptance, RC creation and production authorization are not recorded. Normal promotion requires an integrated PROD-mapped immutable R010 RC and the current App Upgrade workflow. PROD and SQL remain unchanged.

20 September documentation adoption: continue the [single filled Markdown checklist](../outputs/r010-20260919/promotion-checklist.md) for remaining promotion and document closure. Existing DEV evidence is linked/reused; no live checks, acceptance or production authorization were added by this update.

Cash Statement publication checkpoint: implementation commit df2079cafad1b103178588d8fd60d0c6dba91646; clean New-Release validate/info passed and all 27 migration hashes are pinned in outputs/r010-20260919/cash-statement/flyway-release.json. No subsequent SQL change. Final documentation publication uses the current branch upstream; R010 production tag remains pending.

The pinned runner manifest has a scoped `-text` Git attribute so its recorded SHA-256 survives Windows/Linux checkout unchanged. Published blob bytes were compared with the tested private manifest; no migration was modified.
