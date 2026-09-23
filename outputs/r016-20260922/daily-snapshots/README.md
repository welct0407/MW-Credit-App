# R016 part 1 — daily snapshot engine

Owner scope, 23 September 2026: implement database logic and reconstruct history now; hold all 2R report changes for another task/model. The owner approved the proposed columns/account snapshot table and one common routine for hourly and historical rebuilds. This remains R016, not a new release reservation. Starting Git: `ea9563f06d620498e4294cec5cc908f476e29f99`; clean tree.

## State

V37 is deployed and verified in DEV and PROD from exact commit `98ae765b319bdcb956d6a1f34caeb5106f745c87`. Database part 1 is complete. AppSheet definitions, schedules and live providers remain unchanged. The owner subsequently resumed part 2; 2R integration is now implemented and verified for review. [Current report contract](../cash-snapshot-report.md). Full R016 acceptance/tag remains pending.

## Data contract for part 2

| Purpose | Source | Rule |
| --- | --- | --- |
| Past portfolio position and historical daily flows | `public.reporting_daily_snapshot` | One row per Bangkok date; 32 stored columns plus Provisional and Freshness Basis. Sum flows, select closing positions at the requested date. |
| Past account/holder position | `public.reporting_cash_account_snapshot` | One row per date/account; joins current account labels and immutable holder identity. Net movement and positive/negative balance parts are cheap derived values. |
| Current operational position | Existing `Cash Account Balances`, `Cash Dashboard`, `Loan Form Context`, governed OLAP providers | Continue querying live providers. Snapshot freshness is hourly, not real time. |
| Transaction detail | Existing ledger/cashflow transaction providers | Keep transaction grain. Do not replace with daily totals. |

All monetary measures are THB. New Daily Analytics fields: Capital Contributed, Capital Withdrawn, Partner Settlements; Partner A/B Net Profit and Partner A/B Settlements; Cash Money In, Cash Money Out, Cash Opening Balance, Cash Balance EOD, Cash Available From, Cash Balance Status. Net movement is Money In minus Money Out. Existing Available Cash EOD means remaining contributed lending capital, not actual custody. Existing legacy Unsettled Profit fields remain compatible; no new retained-profit, advance or selected-period FIFO fields are stored.

Partner inputs follow the existing rounded per-repayment/expense allocation definitions, preserving FIFO semantics for future selected-period reporting. Partner Settlements records completed transfers on their actual Transfer Date, excluding Pending/Cancelled; it is not an allocation to a profit month. Account transfers cancel from consolidated inflow/outflow but retain both account sides. Signed closing cash includes negative accounts.

`Pending Charges EOD` is corrected in Model 3 to sum `max(charge principal + interest due - posted principal/interest paid through date, 0)` for each charge dated through the snapshot day. Partially paid charges retain their residual. Other legacy snapshot definitions remain unchanged, including gross role A/B unsettled-profit semantics.

`Generated At` is Bangkok time, shared atomically across both tables for a refresh. `Model Version` is 3. `Provisional` is true for Bangkok today; Freshness Basis is `Hourly snapshot`. There is no immutable-close assertion: these are restated snapshots of currently available dated source facts, not an as-recorded audit archive. 2R now uses these providers for past positions and completed-day trends; today uses live OLAP.

## Common refresh / reconstruction

The existing enabled AppSheet `Refresh Daily Analytics Daily` bot retains its hourly schedule, canonical-app guard and Statistics request expression:

```appsheet
CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|Recent|", UNIQUEID())
```

Its existing SQL request trigger calls `refresh_daily_analytics(today-1,today)`. Full calls the same function with `analytics_history_start()` through today. That earliest-date function considers loans, repayments, charges, expenses, contributions, completed settlements, cash ledger/openings and existing snapshots, including zero-activity dates.

The engine acquires the existing nonblocking advisory transaction lock, then updates portfolio and account snapshots in one SQL statement and transaction. Upserts preserve row keys. Account opening seeds come from immutable opening-minus-baseline offsets plus all dated source effects before the requested start; correctness does not depend on an older cached snapshot being fresh. Full and bounded rebuilds use exactly the same formulas.

```powershell
./scripts/database/Invoke-AnalyticsRebuild.ps1 -Environment development -From 2026-09-01
./scripts/database/Invoke-AnalyticsRebuild.ps1 -Environment development -Full
# Production: supply actual scoped approval and verified backup evidence:
./scripts/database/Invoke-AnalyticsRebuild.ps1 -Environment production -From 2026-09-01 `
  -ApprovalReference '<owner authorization>' -BackupReference '<verified backup>'
```

Equivalent database call: `SELECT public.refresh_daily_analytics(DATE '2026-09-01',public.olap_reporting_date());`. Always rebuild through today after a historical correction, using the earlier of the old/new effective dates if a date moved. The low-level function accepts a bounded date range for controlled use, but it does not automatically refresh dates outside that range. The maintained CLI intentionally always ends today. Changes older than yesterday need this rebuild; there is no new automatic change queue. Existing completed-settlement cancellation already invokes the same routine for affected stored dates.

## Coverage and limits

DEV and PROD backfill: 54 portfolio dates from 1 August to 23 September 2026 and 216 account/date rows for four accounts. Consolidated cash is available from 18 September; earlier movements can be recorded without asserting a known cash opening/closing balance. Historical source edits/deletions and missing past facts limit reconstruction. No historical financial transactions, account openings or capital movements are fabricated.

Cash coverage preserves V36's current account population rule: every included account needs a verified opening by the requested date; uninitialized/new accounts can affect consolidated availability. Rebuild history after relevant account/opening/source changes. Labels remain current, not historized. The initial cash opening is an effective reconstructed day opening derived using existing cutover offsets, consistent with V36; it is not claimed to be a separately observed midnight balance.

## Verification / recovery

- Disposable migration chain, no-op remigration/checksum rejection, existing payment/close/charge/default regressions and concurrency suites; dedicated snapshot tests for partial balances, transfers, negatives, zero dates, unknown openings, bounded/full equivalence, key preservation, backdated correction and atomic failure.
- [DEV checks](development-verification.json) and [PROD checks](production-verification.json): each passes 17 cash checks plus 54 independent daily portfolio reconciliations. [Deployment/current-GUI evidence](production-checkpoint.json) and [pinned manifest](flyway-manifest.json).
- DEV current-editor Run exercised the existing hourly bot: only yesterday/today updated, with equal portfolio/account generation times. Both DEV and PROD app editors have zero issues and current clients load/sync. No app definition was edited. The next normal PROD hourly event was not separately awaited; existing scheduling/guard evidence is reused.
- Existing Metabase Daily Performance model 74 executes successfully with 54 rows. Both new views execute through the actual restricted reporting connection with no write privileges. [Consumer](report-consumer.json), [access](reader-access.json).
- Private DEV/PROD backups restored with table fingerprints equal, affected function bodies matched V15, and V37/full rebuild rehearsed on each restored copy. [DEV backup](development-backup.json), [PROD backup](production-backup.json). Backups/credentials remain outside Git; instance settings/roles/cron are separate.
- Existing AppSheet tables intentionally retain their configured columns; new snapshot fields/table are SQL reporting sources only. No regeneration or App Upgrade is needed if current clients sync and final diagnostics remain clear.

Recovery uses a reviewed higher-version forward fix restoring affected function semantics; retain additive tables/columns and preserve financial source rows. Rebuild derived data afterward. The private pre-change backups provide before-images and tested restore recovery. Do not repair Flyway checksums or restore a whole database over subsequent operational writes as a routine rollback.

## Part 2 — implemented for owner review

The agreed live-today versus stored-past routing, source/freshness labels, signed balances and stored trends are implemented in 2R. Its retained-profit/advance bridge is removed; other tabs and transaction details are unchanged. [Part-2 implementation and evidence](../cash-snapshot-report.md). No Metabase edits were performed during the earlier part-1 database batch.
