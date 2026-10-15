# Development monitored jobs and phase 7

Implementation window: 15–16 September 2026, Asia/Bangkok. Development only. Owner accepted both development apps on 16 September 2026; no production deployment authorized by this report.

## Result

- Development OLTP **1.000048**, OLAP **1.000050**, Flyway **V11**. Both use database-3 / development host 34.158.38.171, database loan_manager_prod.
- Generate Daily Charges: enabled AppSheet Daily **00:05 Bangkok**, existing Loans eligibility and Generate Today's Charge request action. Development pg_cron job 1 is **paused**.
- Refresh Daily Analytics Daily: enabled AppSheet **hourly :00 Bangkok**, foreach Statistics filter `[Row ID] = INDEX(SORT(Statistics[Row ID]), 1)`, one inline Set row values action. Request: `CONCATENATE(TEXT(TODAY(), "YYYY-MM-DD"), "|Recent|", UNIQUEID())`.
- Both development apps moved to deployed state after required checks passed, solely to enable scheduled execution. No sharing change. Description/icon/cache warnings remain; OLAP also has the existing menu-design warning.
- Manual Recent and confirmed Full actions now write the same command with Recent/Full mode. Existing icons, prominence, Dashboard availability and full-history confirmation retained, except Recent's Calendar count replaced with nonempty Loans count.
- Daily Analytics is READ_ONLY in OLAP. Calendar binding, 12-column schema, Calendar Detail View, Sheet1_Detail and the old create/delete/rebuild actions are removed. Daily Analytics_Form and generated add/edit/delete actions disappear under READ_ONLY. The duplicate disabled Calendar bot is removed. **Zero Calendar references remain in saved development OLAP app documentation.** Historical PostgreSQL Calendar table/date view remain unused for recovery.

## Model and dependency reconciliation

Approved `Statistics.Analytics Refresh Request`: nullable Text; hidden, non-key/non-label/non-Ref, no default/formula/backfill/reset, not searchable. OLTP statically read-only; OLAP `Editable_If = FALSE` with static Read-Only No for action writes. OLTP Statistics has 27 columns, OLAP 40. Existing Row ID key/read-only/hidden/UNIQUEID(PackedUUID) settings survive regeneration; internal Fixed definition and Editable Initial Value metadata changes are documented.

Saved OLAP pre/post app documentation comparison: the command is the only business column addition after ignoring those internal metadata flags. Existing formulas, defaults, types, reference settings and manually ordered views are preserved. All **12 slices** match their prior definitions exactly after removing the automatically appended command from Reporting Statistics. Daily Analytics retains its existing 23 columns. OLTP does not consume Daily Analytics or Calendar. New native process state/output tables are AppSheet-generated internal metadata, not new SQL business tables.

SQL retains one snapshot per date and existing row keys. New dates get `da11:YYYY-MM-DD`. Each refresh uses a consistent source statement, advisory transaction lock, unique date index and upsert. Stale/malformed requests fail; unchanged requests are no-ops. Request and snapshot writes share a transaction. Dates derive from first loan through Bangkok today, without a fixed year cutoff.

Model Version 2 preserves the old expressions: loans by Loan Date, repayments by Payment Date, lifecycle by Close Date, contributions by Contribution Date, completed settlements by Transfer Date, and A/B profit shares at each repayment date. **Pending Charges EOD preserves the old first-payment rule, so a partial payment excludes that entire charge.** Default postings retain the prototype positive-principal/equal-negative-interest, zero-cash convention. These are parity decisions, not accounting claims. Use Full after edits affecting dates before yesterday. Looker was not edited or audited; curated reporting fields are unchanged.

## Tests and evidence

- Local PostgreSQL 18.6 / Flyway 13.6 rebuild and previous payment/close/generation/default functional and concurrency suites passed. V11 analytics suite passed stable IDs, repeated refresh/no-op, malformed request and rollback of earlier-date updates when a later date fails. Migration validation passed; V11 applied at **23:20:12 Bangkok**, 173 ms. Exact JSON results are alongside this report.
- Current editor Run, charge failure: synthetic `MJ11GUI-Error-L` had invalid -1 interest. Both selected updates rolled back: no charges and no request tokens. Monitor errors **14bf0a6f-081f-4e49-a5b4-df72510c9c3f**, **be3b0ee9-8c35-4225-b135-f993c7df5a62**, shown 16:21:28 UTC. SQL exception: `P0001: Generated charge requires valid nonnegative principal and interest`.
- Corrected synthetic interest to 30 and reran: both Complete, **34c8f682-7f50-4596-815a-f37877e8d1c5**, **5488e18f-68e9-4948-84d1-ebf4ab53879d**, 16:25:07 UTC. Charges 125 and 130 reconcile in SQL. Original event filter restored; test borrowers hidden and auto-charge disabled. Financial fixture rows retained. Do not infer independent per-loan commits: this failure rolled back both selected updates.
- Analytics bot Run: Complete **4d5b1577-e607-48c6-9399-a54306e01b3b**, 16:48:44 UTC. SQL request `2026-09-15|Recent|76b47917`, both recent dates refreshed at 23:48:40.760431 Bangkok.
- Current new app GUI Full action showed its confirmation and synced successfully: request `2026-09-15|Full|2032a7b2`, 23:50:56.626089. All **42 dates** from Aug 5–Sep 15 rebuilt. Recent action then synced request `2026-09-15|Recent|2bda3dbb`, 23:51:28.887555.
- Independent read-only old-expression reconciliation: **42 matched / 0 mismatches**, across all 12 stored metrics. Snapshot key fingerprint stayed **3e326032156ab849ca8196caacb13373** through bot, Full and Recent. No duplicate or null snapshot dates.
- OLAP new interface displayed matching outstanding principal and unsettled profit after refresh; saved app definitions are runnable and deployment definition/schema checks passed. Owner subsequently confirmed both development apps look correct.
- Four prior owner-only OLTP notification routes remain reviewed and unchanged. Create First-Day Charge and Payments - Process Receipt stay disabled. OLAP Daily Loan Analysis Export remains disabled; its only task creates XLSX in default store `Loan Daily Analysis/Exports`, with no execution this task. No new email/push task was enabled.
- Audit History Alerts are already enabled in both development apps. Owner reported **no test error email received**. Automation Monitor capture is verified; automatic email delivery is **not**. Natural scheduled execution was subsequently verified as recorded below.

## Backup and rollback

- Before edits: OLTP **1.000042**, OLAP **1.000040**, database **V10**.
- Private folder `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-20260915/`: development-before.dump, schema-before.normalized.sql, database-before.jsonl, dictionary-before.xlsx. Logical dump listing verified; no full restore test was performed for this development snapshot.
- Dump SHA256 **46ce5a79702c435bf13f7b5c1759618fe12d20c382a67f8d3ce76a78ed343217**. Pre-schema SHA256 **242404152af2760a046b1e628e7a4df1e56a1a7230e90839f8192d8e05217bba**.
- Charge rollback: disable AppSheet Generate Daily Charges, save/verify, then re-enable development pg_cron. Never overlap schedules.
- Analytics rollback: disable hourly bot and stop command writes; restore OLAP 1.000040 and OLTP 1.000042 if needed. Keep the additive SQL column/index/functions dormant. Any SQL removal/correction uses a new V12+ migration; never alter V11 or Flyway history. Database restore requires agreed reconciliation of later development writes.
- A push protects code/docs only. Private backups/credentials have separate, unverified backup coverage; C:/GitHub is excluded from Drive.

## Owner acceptance / remaining limits

The owner synced both development apps, confirmed Dashboard refresh/charts, Calendar removal and normal Operations loading, and answered **“Looks correct — accept development changes”** on 16 September 2026. No further acceptance check is pending for this scope. Automatic error-email delivery remains unverified. Production, Looker, offline/multiple-device behavior and historical backdated-edit handling beyond the Full refresh contract were not tested here.

### Natural execution and preservation

- Hourly analytics completed automatically at **00:00:05 Bangkok, 16 September**, run `dfaed1bb-2f27-4b30-98d8-cd09dca74e1e`. Request `2026-09-16|Recent|a9c1a6a4`; SQL generated at 00:00:05.018097. Snapshot count became 43.
- Daily charge scheduling fired automatically at **00:05:03 Bangkok**; all **24** natural runs show Complete in the current Automation Monitor. The two earlier synthetic errors remain visible as expected. See natural-daily.jsonl and natural-monitor.json.
- The midnight analytics snapshot precedes 00:05 charges; those changes appear at the next hourly or manual Recent refresh. This is the documented refresh cutoff.
- Before the natural daily job, all original records across **13 nonanalytics tables** matched the baseline after excluding the named synthetic fixtures and new Statistics command. Later scheduled charge/request writes are expected and are not covered by that preservation claim.
- Dictionary import/export matched expected values across all 12 sheets; native OOXML features were preserved, error scan found zero spreadsheet errors, and changed ranges were visually reviewed. Acceptance was recorded in the Guide.


Documentation: model overview, data dictionary, development differences, database README, this report and Markdown change log. Publication status is recorded in the change log after checks.
