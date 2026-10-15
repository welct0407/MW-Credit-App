# R014 DEV verification

21 September 2026. **DEV complete; ready subject to owner acceptance and production authorization.** No RC, production migration or App Upgrade was performed. PROD remains R013 / V30 / OLTP 3.000240 / OLAP 1.100189.

Latest owner refinements supersede the initial app versions below: **OLTP 1.000072 / OLAP 1.000028**, both Deployed and No issues found. The settlement Paid From Account picker has no New option. Both Borrowers lists group Active before Inactive using the existing activity flag and show outstanding principal as secondary header. All 48 detail views have Slideshow mode FALSE after checking all 127 views; exposed row swipe events are None. [Exact configuration, coverage and checks](refinements.json). No financial writes in this refinement. V31 is unchanged, so the initial SQL evidence is reused. Device/browser edge-back gestures are not AppSheet view settings; physical touch hardware was not tested.

## Tested definition

| Component | Before / rollback | Final tested state |
| --- | --- | --- |
| DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` | 1.000064 | 1.000070; Deployed; No issues found |
| DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393` | 1.000021 | 1.000024; Deployed; No issues found |
| `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_dev` | V30; [private dump evidence](backup.json) | V31; migrated and validated |

Final editor versions and zero issues were read after reloading both saved editors. OLTP imports 18 SQL tables/views; OLAP remains 19. New OLTP imports are read-only `Cash Account Balances` and `Cash Dashboard` through verified `database-3`.

## Behavior and decisions

- Manual OLAP Cash Ledger account selection has no inline New option; standalone Cash Accounts administration retains Add. The table update-mode expression is recorded in the release log and dictionary.
- OLTP Business Cash Held lists Current Balance per account, grouped by Holder Name with SUM :: Current Balance. Account Label is the primary header. Four initialized accounts across two owners reconcile to SQL owner totals.
- Income MTD is a reference detail view with eight fields, source-order layout, whole-baht display and compact bilingual labels. It replaces the former three-field MTD block in KPIs. Other KPIs remain. Green `#188038`: Operating Income MTD and Net Profit MTD. Red `#d93025`: signed Expenses MTD and Tommy/Lisa Withdrawn MTD. Blue `#1a73e8`: Unsettled Profit MTD, Cash Pool Remaining and Business Cash Held.
- Withdrawals mean completed settlements allocated to the current month's profit under the owner's FIFO rule. Each partner's cumulative prior-month net entitlement is consumed first, starting from business inception. Pending reservations and Cancelled settlements are excluded. Existing historical rounding and expense allocations remain authoritative. Prior losses offset net entitlement. No Profit Month field is required.
- Current-month unsettled profit equals current net profit minus those allocated completed withdrawals. Losses retain their actual sign. Cash pool uses existing available contributed capital; business cash sums positive account custody and remains unavailable when any account opening is unknown.
- OLAP Partners has **ระบุยอด / Set Amount**, which opens the existing settlement form with partner, today and Pending prefilled. Amount is entered by the user, validated positive and within availability. Existing settle-all, SQL reservation/concurrency guards and audited cancellation are retained.

## Executed checks

| Check | Result |
| --- | --- |
| Isolated PostgreSQL 18.6 / Flyway 13.6.0 rebuild | 31 migrations applied; repeat applied 0; validation passed; checksum tampering rejected |
| `Test-R014.sql` | 12 synthetic FIFO assertions plus read-only view assertion passed: first month, prior-month boundary, crossing, partial/full/capped withdrawal, prior/current losses, incremental settlement, cancellation arithmetic, independent partners |
| DEV migration/validation | V31 applied; 32 history entries validated including baseline |
| Dashboard SQL | Income + signed expenses = net; net + signed withdrawals = unsettled; withdrawal signs nonpositive; initialized account/owner sums reconcile |
| Query timing | Observed 3.578 ms execution for dashboard SELECT in DEV; one checkpoint measurement, not a load benchmark |
| Current OLAP GUI | Cash Position > Record Cash Transfer > existing holder > From Account contains existing accounts and no New; unsaved form discarded; standalone Cash Accounts retains Add |
| Partial-settlement GUI | Set Amount opens prefilled Pending form; zero and one above available rejected; synthetic ฿100 saved exactly and reduced availability by ฿100 |
| Audited cleanup | Existing Delete action changed synthetic row `MnhvLkXcurjmpTtaRxLPrd` to Cancelled, retained amount and audit note; availability restored; no Cash Ledger row for test settlement |
| Current OLTP GUI | Synced desktop dashboard shows all eight signed figures; owner groups and individual account balances agree with SQL; obsolete MTD header absent |
| Phone preview | Current editor 360 × 640 preview visually checked: all eight bilingual labels and amounts fit; two green, three red, three blue; scrolling works |
| Final saved editors | OLTP 1.000070 and OLAP 1.000024: No issues found, Save disabled, Deployed |
| Dictionary | 19 DEV-difference rows appended; all prior sheet values/formulas preserved after export/reimport; [verification](dictionary-verification.json) |

The migration runner's `baselineRebuildMatch=False` means no baseline-comparison input was requested, not a failed test. Arithmetic cancellation coverage is complemented by the actual GUI reservation/cancellation test. No completed money transfer or forced notification was performed. Physical-device/offline, separate-login and load/concurrent-edit testing were not repeated; unchanged posting/concurrency guards retain their earlier release evidence.

## Dependencies, recovery and remaining release steps

V31 only adds a view and arithmetic function. Existing apps/views, keys, financial tables, triggers, exports and Looker sources remain compatible and unchanged. OLTP reads SQL results; it does not reproduce historical calculations locally. No Looker publication or integration-routing change is needed.

DEV app rollback points are above. The additive SQL can remain while restoring old app definitions; any later SQL correction must use V32 or higher. The private pre-change dump has a valid custom archive listing and recorded SHA-256; this task did not claim a full restore rehearsal. Synthetic settlement remains audited in DEV history. Do not copy it or DEV recipient data to PROD.

Owner acceptance, scoped production authorization, the single master promotion-checklist copy, exact-commit Flyway preparation, frozen PROD-mapped RCs and normal App Upgrade remain future release steps. See [manifest](release-manifest.json), [release log](../../Change%20Logs/CHANGE_NOTES_R014_2026-09-21.md) and the repository release workflow.

## AI Reviewer extension

The owner added Partners.AI Reviewer to this same release. DEV is now V32 / OLTP 1.000075 / OLAP 1.000031. Tommy is selected, Lisa unselected. Both editors remain clear; the agent role filter is implemented and tested but awaits coordinated production deployment after V32. See [reviewer report](reviewer-report.md) for schema/app checks, separate runtime dependency and rollback. This supersedes the earlier V31-only release package.
