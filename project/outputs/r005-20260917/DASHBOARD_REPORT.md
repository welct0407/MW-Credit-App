# R005 dashboard and Collection refinement

18 September 2026. DEV SQL **V21**, OLTP **1.000125**, OLAP **1.000123**. Requested behavior implemented and focused current-GUI checks passed. **Not ready to promote**: both editors show No issues found, but their deployed-state Deployment Check pages expose no fresh Run control. Full R005 retains its earlier notification-delivery limitation. Owner acceptance and production authorization remain pending.

## Changes and evidence

- Reused the existing V20 **Cash Holder Balances SQL view**, one row per holder. Added READ_ONLY to OLTP on database-3, with Ref Cash Holder as the Ref key to Cash Holders.Row ID, Holder Name as label, and amounts as THB Price with zero decimals. OLAP's Cash Holder Summary already uses this view; ledger entry remains OLAP-owned.
- Added READ_ONLY **Business Cash Held** slice, `[Business Cash Held] <> 0`, and compact reference deck: holder name above amount, no image/action bar. Dashboard order is KPIs Small followed by Business Cash Held Small. Income Statement MTD remains the last KPI section. Desktop layout was visually inspected; physical phone review remains an owner check.
- Added Statistics.Total Cash Pool, `ANY(Loan Form Context[Contributed Capital])`, before Outstanding Principal. This uses the existing one-row SQL capital limit, not custody cash or remaining loan capacity. Price/THB/zero decimals; orange `#FF8C00` applies only to this field.
- Changed OLTP Borrowers.Todays Amount Due to `[Todays Amount Collected] + [Todays Amount Remaining]`. Component date/population rules, Collection detail/slice membership and payment actions are preserved.
- Added owner-authorized DEV Opening Balance entries dated 18 September: Dad 18,000 and Lisa 30,000. Stable fixture IDs prevent duplicates. No SQL DDL/migration, historical source backfill or production financial change. Opening custody entries do not change contributed capital.

[Exact additive delta](dashboard-delta.json), [checklist](dashboard-checklist.md), [saved definitions](dashboard-saved-definitions.json). This batch adds 20 items to the retained original and Delete reversal R005 checklists, including generated reverse-reference and detail/inline views. Cash Holders_Detail options and all KPI/Dashboard options except intended ordered lists match starting evidence. The revised AGENTS.md supersedes historical whole-app and intermediate-capture gates.

The imported Cash In key/label was corrected before final save. An interim empty formatting target produced: “The format rule 'Statistics - Total Cash Pool - Orange' is not applied to any column. Select at least one column in the settings for the format rule to display.” Native selection was corrected after an interim action target; saved target and rendered orange were verified. The initial free-text slice condition did not persist and was corrected through Expression Assistant. Superseded states are retained in delta dispositions.

## Executed verification

| Check | Expected / actual | Result |
| --- | --- | --- |
| SQL identity | Cash Holder Balances pg_class relkind `v` | Passed |
| Opening dry run / apply / retry | Exactly two entries, total 48,000; retry adds none | Passed; [apply](dashboard-opening-cash-readback.jsonl), [retry rollback](dashboard-opening-cash-retry.jsonl) |
| Reconciliation | Dad -110 + 18,000 = **17,890**; Lisa -891 + 30,000 = **29,109**; Tommy **0** | Passed SQL and both current apps |
| Reloaded OLTP Dashboard | Dad/Lisa visible, Tommy absent; cash deck follows KPIs | Passed; [preview](dashboard-preview.png) |
| Limit | 120,000 before principal 116,394; computed text color rgb(255,140,0) | Passed current app and saved definitions |
| Cash detail | Holder and amounts visible, no Add/Edit/Delete | Passed current app |
| Reported Collection case (redacted) | Previously 6,900 due; now **5,570 = 0 collected + 5,570 remaining** | Passed; prior partial payments visible, no borrower financial writes |
| Fully paid synthetic borrower | **1,065 due = 1,065 collected + 0 remaining** | Passed current Collection detail |
| OLAP Cash Position | Opening entries 18,000/30,000; summary 17,890/29,109/0 | Passed after sync |
| Saved configuration | Formula/filter/key/label/types/deck/order/color/generated dependencies | Passed; repeatable assertions in scripts/r005-dashboard-record.mjs |
| Final diagnostics | OLTP 1.000125, OLAP 1.000123: No issues found; no Deployment Check Run control | Editor passed; rerun unavailable; [evidence](dashboard-final-diagnostics.json) |
| Model documentation | Twelve affected workbook rows; overview, tracker and environment records updated. Export/reimport preserves all sheet values; formula-error scan zero; changed rows rendered | Passed; [verification](dictionary-dashboard-verification.json) |

Prior V21 reversal/custody regressions are retained evidence, not newly executed. No automation route, recipient, loan-capacity rule or Looker grain changed; no unrelated report audit/notification test ran. A fresh current-day partial-payment write was not performed; the reported existing partial-payment case and fully paid boundary were checked without changing borrower records.

## Recovery and remaining checks

Starting Git **5858bcc5c49fc1d1042d2d25dc734225a0b0123a**. Restore OLTP **1.000120** to undo this app refinement; OLAP **1.000123** and SQL V21 are unchanged. Pre-opening database snapshot: [dashboard-seed-backup.json](dashboard-seed-backup.json), private dump outside Git. Do not restore over later writes. To correct DEV opening amounts, use a documented compensating Manual Correction with controlled SQL opt-in and notes, retaining opening history. Seed-R005OpeningCash.ps1 asserts DEV host and is not a production migration.

Owner checks: sync DEV, review the compact deck on your phone, orange limit and Collection totals, and confirm the additive opening entries. Current cash held includes prior movements, so it differs from the two opening amounts. Promotion still needs the diagnostic gate, full-release acceptance and explicit authorization. No new SQL package was frozen; tested V21 hashes remain in reversal-sql-candidate-manifest.json.
