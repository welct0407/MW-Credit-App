# Enhanced loan assessment promotion — 15 September 2026

Owner explicitly authorized promotion from development to production OLAP. Deployed and functionally verified at production version **1.100051**. Owner's normal-use acceptance remains separate from the completed deployment checks.

Rollback: production OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`, saved version **1.100047**, verified in Manage > Versions before changes. Full current production and development documentation snapshots are preserved outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/assessment-promotion-20260915`. Current development reference is **1.000027**. Preserve unrelated recent changes and production bots, links and source credentials.

Fresh normalized live schema exports from both databases match Flyway V1 SHA256 `0edda94ee69bbcfe1e2b8bf5bad16f7dbbd46af7289a9700bff280b49ea20d38`; no DB migration is required. Intended app-only scope: Loan Assessment SQL view and guarded result VCs, generated Calendar source with obsolete assessment calculations removed, and required presentation/sync configuration. SQL functions, financial data and OLTP business behavior remain outside the configuration edit.

The existing assessment design has a shared input row and a fixed forecast horizon through 31 December 2026. Saving changed inputs fires SQL calculation; ordinary read sync does not recalculate unchanged inputs. Preserve the approved no-refresh-action design and pending/stale messages. Record final configuration comparison, tests, data restoration, versions, documentation and deployment status here before completion.

## Implemented scope

- Production logical Loan Assessment now uses `Loan Assessment SQL Lab View` via production `database-2`. Regenerated 25 provider columns and retained 16 VCs. Nineteen new provider fields and eleven changed output/status formulas reproduce development. Row ID regeneration/settings also match development.
- Production Calendar now uses `OLAP Calendar SQL Lab` via database-2. Removed sixteen old assessment VCs, retaining Date, provider ordinal and ten date-description VCs. Removed the obsolete Borrowers[Related Calendars] reverse reference, two slice memberships, generated Calendar_Inline view and View Ref (Assessment Borrower) action. Generated internal process schemas followed the Calendar schema automatically.
- All 53 assessment/Calendar column definitions and both table settings match development 1.000027, except the intentional database-2/database-3 connection difference. No remaining existing action or view property changed. Production bots and companion links were not edited. No Refresh Assessment action was introduced.
- No DDL, function, trigger or Flyway migration was applied. Both schema exports matched V1 at the start of this promotion. A separate concurrent development task may subsequently advance development; its migrations are excluded from this commit.

## Input preservation and functional verification

The SQL lab row still held the earlier development selection. Before correcting it, both original and SQL assessment rows were backed up privately in `assessment-promotion-20260915/input-before.json`. Copied only the original production row's borrower, proposed amount and minimum rate to the existing SQL assessment row, keyed by Assessment ID. This fired the existing calculation trigger. No borrower/loan/payment financial records were changed and no development transaction data was copied.

Verified through the new desktop production interface:

1. App loaded the assessment page and SQL outputs without fetch/connection errors.
2. Normal read sync returned the preserved original production input selection and refreshed SQL timestamp.
3. Temporarily changed proposed amount from 2000 to 2001. The bilingual waiting message and awaiting-results status appeared immediately.
4. Automatic save/sync returned the trigger result without a manual refresh action. Required coverage increased by 1, safety margin decreased by 1, and the calculation timestamp advanced. The original eligible date remained unchanged, as expected for this small boundary-free test.
5. Restored 2000 through the same UI and verified automatic result readback. Fresh SQL checks confirmed all original inputs match, SQL Source Current=true, as-of date is today in Bangkok, coverage equals principal plus proposed amount plus profit, and margin equals interest minus coverage.

Private UI evidence is in `production-client-synced.txt`, `production-client-input2001.txt` and `production-client-restored.txt`. Public evidence contains configuration identities and aggregate verification only. This is a promotion smoke test, not a repeated full financial lifecycle suite. During the waiting state, existing numeric controls render blank results as zero; the explicit waiting message distinguishes them from calculated results.

The editor briefly reported two warnings that Related Calendars was being removed from borrower slices. The saved app definition confirms those memberships are absent and the app remains runnable/deployable. There were no failed runtime loads. Current sync settings were observed, not changed: server caching off, delta off, Quick Sync off, sync on start on, delayed sync off, automatic updates on. Earlier inventory settings were stale and have been corrected for production OLAP only.

## Documentation, performance and downstream scope

Updated the production overview, detailed dictionary, environment inventory and development difference register. Dictionary: 557 business-column entries (196 OLTP, 361 OLAP), 14 slices and 438 memberships. All worksheets passed export/reopen value checks; DB catalog sheets remained unchanged. Other app inventory remains dated to its earlier capture and is not presented as a fresh retest. Exact current OLAP definitions and change identities are under `outputs/assessment-promotion-20260915`.

Historical development measurement remains median sync 6.734 to 5.613 seconds (16.6% faster), and median SQL refresh 15.072 ms. No fresh production improvement percentage was measured in this promotion. See `outputs/assessment-sql-20260915/REPORT.md` for original methodology. Looker/report delivery and scheduled bot execution were not retested; no report source or production bot configuration changed.

## Owner check and rollback

Open/sync production OLAP, change an assessment input, confirm the waiting message changes to a timestamped result, and confirm ordinary dashboard/partner navigation. The shared input row is still shared between users. Source-data changes or a new day make old outputs stale until an assessment input update fires recalculation. Forecast horizon remains 31 December 2026.

To roll back, restore production OLAP **1.100047** in version history and sync clients. This restores original table/Calendar bindings and expressions. Original production Loan Assessment and Google Calendar sources were retained intact. No database rollback is required. Do not restore a development app version into production or change source to database-3. Private backup coverage is separate from the Git checkpoint.
