# OLAP assessment in PostgreSQL — test result

**Workflow update, 15 September 2026:** version 1.000023 removes Refresh Assessment at the owner's request. Input updates and normal sync remain the calculation flow. Pending input results now show a waiting message; source/date-stale results have a separate Out of date message. The results below document the earlier measured 1.000022 prototype; action-specific tests are historical. See `Change Logs/CHANGE_NOTES_ASSESSMENT_SAVE_WORKFLOW_2026-09-15.md` for current behavior and checks.

15 September 2026. **Implemented and verified in LoanInsights PG Trial 20260914, version 1.000022. Production apps are unchanged.** The lab uses separate assessment objects in loan_manager_prod; it reads existing business tables but does not modify their financial records.

The combined change reduced median full-sync time by **16.6% (1.121 seconds)** in five interleaved control/test pairs. All five combined test runs were faster than their adjacent control. Moving the assessment calculation alone did **not** improve whole-app sync. Removing the separate Google Sheets Calendar read was material to the measured combined result.

## Quantified performance

| Configuration | Control median | Test median | Median time saved | Improvement |
|---|---:|---:|---:|---:|
| Trigger results plus freshness checks, Calendar still in Sheets | 5.850 s | 6.531 s | -0.681 s | -11.6% |
| Above plus generated PostgreSQL Calendar view | 6.734 s | 5.613 s | 1.121 s | 16.6% |

Combined mean: 6.848 → 5.562 seconds (18.8% faster). Control range 6.239–7.518 seconds; test range 4.531–6.120 seconds.

The complete PostgreSQL refresh, through the updatable view and both lab triggers, took **15.072 ms median**, 12.713–18.265 ms across ten measured runs after one warm-up. This is database execution time, not the user's save-to-result time.

Input update + sync measurements were 6.732–12.844 seconds; the explicit stale-result recovery action + sync took 12.496 seconds. There is no equivalent repeated pre-change write benchmark, so no save-to-result percentage gain is claimed. Full-sync measurements include AppSheet processing, network/provider time and browser completion observation. They do not isolate those components. The unchanged production OLAP app was used only as a read-only timing control; the optimized copy is a different app ID with its pre-existing disabled schedules. Five pairs establish a promising observed improvement, not a guaranteed service-level improvement. Earlier non-interleaved runs were highly variable, including a 21.452-second outlier; all raw timings are retained.

## What changed

1. A pure SQL forecast function replaces repeated AppSheet SELECT/LOOKUP scans and nested Calendar accumulation. It uses numeric arithmetic, generated dates and cumulative window sums. It does not read the Calendar spreadsheet/table.
2. A separate Loan Assessment SQL Lab table holds the copied input row plus results. BEFORE INSERT/UPDATE recalculates on the same row, so AppSheet retrieves inputs and outputs together. Nine existing result VCs now perform lightweight row-level reads. Existing labels, price formatting, eligibility messages and calculation layout remain.
3. An updatable Loan Assessment SQL Lab View checks the stored source fingerprint against current borrower-specific calculation inputs. After sync, changed source data or a previous-day result is marked stale. Local unsynced input changes also hide old outputs. The recommendation shows the calculation timestamp.
4. Refresh Assessment changes only a refresh token and invokes the database calculation. No lending transaction, borrower notification or new loan is created.
5. Sixteen assessment-specific Calendar VCs and the obsolete reverse Calendar borrower reference were removed from the test copy. Dependent slice membership, the Calendar inline view and its obsolete Ref action were reconciled automatically and reviewed in the definition diff.
6. Calendar is now backed by OLAP Calendar SQL Lab, a generated SQL view. Its 153 date keys and ten descriptive date VCs are preserved for Daily Analytics. There is no physical Calendar table in this design, but the logical AppSheet date table remains because existing Daily Analytics actions/bots use it.

## Correctness evidence

| Check | Result |
|---|---|
| Existing AppSheet forecast versus SQL, current assessment | 153 dates × 6 numeric fields = 918 comparisons; zero differences above 0.005 |
| SQL input extraction versus AppSheet calculated source data | 45 active loans and 676 charge rows, 2,523 comparisons; zero mismatches |
| Independent procedural oracle versus SQL | 95 cases, 14,535 date rows, 87,210 numeric comparisons; zero differences above 0.000001; maximum floating-point difference 0.000000000005 |
| Cases | 29 borrower datasets plus 66 synthetic variants: installment remainder, invalid dates, zero daily payment, missing charge history, negative adjustments/overpayment, daily interest, zero daily interest, fixed interest due today/in future, manual charges, empty loans, zero/large proposed amounts and zero/positive rates |
| Final app result at restored inputs | 12 result fields match the original AppSheet baseline |
| Generated date source | 153 date keys and 1,683 Date/date-derived field values match |
| New GUI write/read round trip | Changed proposed amount; trigger-updated date, coverage and margin returned in the same sync |
| No eligibility / invalid input | Large proposed amount shows no eligible date; zero amount shows the existing input guidance |
| Unsynced input | Old eligibility date hidden and refresh guidance shown |
| Stale source simulation | Invalidated only the lab's stored fingerprint; SQL view detected it, app hid old results, Refresh Assessment restored fresh results |
| Previous-day result | Rollback-only lab test detected it as stale |
| Independent rows / repeated refresh | Two temporary assessment rows produce different results; refreshing one leaves the other unchanged and preserves its own financial result; transaction rolled back |
| Keys and permissions | Existing text Row ID and Calendar Date keys preserved; all result/metadata fields read-only except hidden refresh token |
| Database preservation | Existing 13 foreign keys retained; lab triggers enabled; lab input values restored to source values |

These checks establish fidelity to the existing prototype math. They are not a validation of the assumptions against actual future borrower payments. The synthetic oracle tests cover the SQL forecast math; only the current baseline and the described UI cases were compared to the running AppSheet app. No real source financial row was altered to simulate repayment events.

## Important design limits before production

- **Forecast window:** 1 August–31 December 2026 is explicitly retained to make the comparison like-for-like. The calculation accepts date bounds without requiring stored Calendar rows. Before cutover, choose and test a rolling horizon and a sufficient historical start. Extending the horizon can intentionally change a former “no eligible date” result. The lab trigger rejects a window that no longer includes today.
- **Freshness:** source changes are detected when the client syncs. Refresh then recomputes the assessment. Offline clients cannot know another user's unreceived changes. This is a point-in-time assessment, and the timestamp is shown. It is not an automatic approval or loan-disbursement action.
- **Two users:** the SQL computation is row-specific and no longer depends on LOOKUP("MAIN"). The existing app still presents its shared MAIN assessment row. Separate user-owned input rows would be the next workflow change if both people assess borrowers concurrently; that UI change is not included in this performance prototype.
- **Original semantics preserved:** active-status filtering, installment rounding/remainder, maximum-charge-date forecast cutoff, manual-charge treatment and contractual principal exposure are retained. This does not silently repair gaps in historical installments or change repayment assumptions.
- **Daily Analytics:** date fields, date population and action/bot definitions are preserved. Read-only dashboard/Calendar checks are included. The disabled copied schedule was not run to overwrite production Daily Analytics snapshots; scheduled write behavior is not claimed as newly tested.
- **Downstream:** production OLTP, production OLAP and Looker retain their current sources and configuration. No Looker audit or edits were needed for this isolated prototype.

## Review and production plan

Review the test app's assessment screen: select inputs, sync, verify the recommendation and timestamp, then use Refresh Assessment and sync again. Check a normal case, a large amount with no eligible date, and concurrent use expectations. Production implementation remains subject to the owner's review as requested for performance proposals.

For cutover, capture fresh versions of both OLAP consumers and a database backup; agree the forecast horizon and shared/per-user workflow; add result fields to the intended production assessment source or deliberately migrate its input rows to a dedicated table; preserve its borrower FK and blank-Ref behavior; bind/regenerate each consuming app; validate input/result permissions, all affected formulas, scheduled Daily Analytics and same-sync output retrieval. Deploy during an agreed idle window. Do not replay lab DDL against the production assessment table without this adaptation.

## Rollback and evidence

Test app rollback version: **1.000013**. Restoring it returns Loan Assessment to public.Loan Assessment and Calendar to Calendar Help Table / Sheet1, and restores the original formulas. The separate lab SQL objects can remain unused; deleting them is not necessary for rollback. Production OLAP 1.100046 and OLTP 3.000069 were not edited.

Exact SQL: 01-calculation.sql, 02-lab-table.sql, 03-freshness.sql, 04-calendar-view.sql. App changes: app-definition-diff.json. Machine-readable correctness and performance evidence is in this folder. Raw borrower data, full app exports and UI captures are outside Git under Documents/ChatGPT/AppSheet-Loan-Project/assessment-sql-20260915. Their presence does not establish backup coverage. No credentials or unrestricted borrower data are published in this report.

Official references: [PostgreSQL trigger behavior](https://www.postgresql.org/docs/18/trigger-definition.html), [AppSheet sync performance](https://support.google.com/appsheet/answer/10104985?hl=en), [AppSheet offline and sync guidance](https://support.google.com/appsheet/answer/10107724?hl=en). The measured results above come from the live test, not from vendor claims.
