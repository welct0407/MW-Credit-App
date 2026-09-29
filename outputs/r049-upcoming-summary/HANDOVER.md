# R049 — Summary-first upcoming charges

Status: DEV SQL V56 applied/validated; AppSheet implementation and GUI tests blocked by disconnected browser control. No PROD change authorized or made.

## Intended implementation

1. **Done:** additive V56 applied/validated in DEV after verified backup/restore and rehearsal. It adds `public.oltp_upcoming_charge_summary_v2` while preserving V1 for current PROD and rollback. Both use stable borrower/date keys; V2 covers the existing event provider's seven-day OR first-five-date union, never beyond three calendar months/max93days.
2. Rebind the existing read-only OLTP `Upcoming Charge Summary` table from V1 to V2. Columns/types/keys remain identical; retain bilingual display names and zero-decimal currency.
3. Cap `Borrower Upcoming Summary` to dates present for the same borrower/as-of date in `Borrower Upcoming 5 Dates`. Preserve the synced context as-of guard. This supplies Collection and Borrowers summaries.
4. Add a read-only seven-day summary slice bounded by synced context From Date/Through Date and As Of Date. Main `Upcoming Charges` uses it, groups only by Due Date, sums Total Charge, and displays Ref Borrower then Total Charge. Retain partner-language menu display name.
5. Add a reference table view `Upcoming Charge Details` over `Upcoming Charge Forecast`, preserving existing detail columns, bilingual titles/Basis and integer-baht formatting. A hidden row navigation action on `Upcoming Charge Summary` opens it with `LINKTOFILTEREDVIEW`, matching Ref Borrower, Due Date and As Of Date to the tapped summary. Assign this action as Row Selected in both main and summary-inline views.
6. Remove `Upcoming Charges` from Collection detail's visible ColumnOrder, keeping `Upcoming Charges Summary` after today's charges and before receipts. Preserve issue-only note logic.
7. Add `Upcoming Charges Summary` to the actual Borrowers detail used by the Borrowers entry point, after its first summary section and immediately before the loan list. Check whether its source slice already includes the column; add only if absent. Keep all unrelated owner cosmetics.

## Verification required

- Disposable full migration CI plus synthetic checks: seven daily dates (especially days6/7), five borrower dates, same-date multiple loans/components, exact summary/detail equality, paid-date removal, empty summary and inclusive three-month boundary. V1 compatibility remains tested.
- Verify DEV tuple/SSL, current Flyway version and verified backup before migration. Existing DEV financial values must remain unchanged.
- Current GUI: main menu summary → correct borrower/date details; Collection summary → same; Borrowers summary placement → same. Back navigation, readonly behavior, bilingual labels, integer baht and unchanged limits.
- Both DEV editors must report zero warnings/errors at completion. Capture final saved versions and targeted AppDoc definitions; maintain labeled DEV dictionary overlays and release evidence.
- Commit/push intended sanitized files only. R049 stays Open; no new production release or tag until later scoped promotion.

## Recovery / continuation

Starting Git `dccb28adfd2c62d9aca067521a0cbdd3fe3b1b06`. Existing unrelated Metabase/Risks work is not part of this task. Only additive DEV V56 is applied at this checkpoint; both apps still use V1. Record current restorable DEV OLTP version before UI editing. The old V1 provider remains available for app rollback; never edit applied migrations.

Completed evidence: [backup/restore](summary-development-backup.json), [migration](development-migrate.json), [validation](development-validate.json), [read-only saved definitions](postgresql-affected-definitions.json). Full `Test-CI.ps1` passed (exit0), including added V2 synthetic assertions and existing V1 compatibility, on 29 September 2026. Disposable diagnostics are private at `C:/Users/MWCredit/AppData/Local/AppSheetLoanTools/migration-test-a641de40493c45a0a5a6f22510939b33`. SQL dictionary overlay records DEV only. No AppSheet definition is claimed implemented.

Work Chrome profile is `mw-credit.com`, extension identity `151f9bf5-de78-4106-af6b-95dc06d36707`; transient browser IDs changed after tool reset. Owner account must be `welct0407@mw-credit.com`. The editor briefly opened successfully, then browser control disconnected. Owner reconnection is pending; no alternate profile/sign-in workaround.
