# R051 transparent performance experiment — 6 October 2026

**DEV candidate retained for review; no demonstrated full-sync improvement.** V74 changes only the SQL implementation of `public.oltp_upcoming_charge_coverage_v1`. It evaluates the forecast schedule once per statement and reuses those results for issue counts and the first-five-date count. The former implementation evaluated the schedule again through the events view. No cached/materialized results, schema columns, AppSheet definitions, forms, lists, navigation, clicks, filters, notification routes or payment engines change.

Owner constraint: the same information must appear in the same places, with the same freshness and no additional clicks. Deferring/hiding history lists and a separate user-facing command interface were excluded. The seven payment channels retain their existing unified posting engine. This query experiment addresses one measured forecast dependency; it does not claim to eliminate the much larger related-list costs.

Branch `codex/r051-appsheet-latency-experiment`, draft PR16 stacked on PR15; starting commit `2a2d5d899e2655dc936d0d1472832a01a9028ac8`. Canonical DEV is shared. R051 remains Open. PROD was read-only throughout.

## Production evidence and measured result

Production AppDoc observed OLTP3.000264 (newer than the earlier inventory263); SQL read-only identity confirmed `appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_prod`, V58/checksum1886180782. This observation does not reconcile or claim ownership of that intervening app-version change.

The earlier 6 October production Performance Analyzer review found 73 syncs with median3.763s, two Payment saves12.739/16.205s and two collection-board updates9.138/9.795s. The16.205s Payment trace attributed7.682s to related-list VCs, including2.325s Related Repayments. The9.795s collection update attributed8.232s to VCs, including1.532s Upcoming Charge Note and2.445s Submitted Receipts. Parent/child timings overlap; these include dependent reads, not only arithmetic. [Analyzer](https://www.appsheet.com/manage/viewLog?perfOnly=true&appId=93844270-6aa5-420b-a960-bcdf08abd357).

Read-only alternating SELECT-plan tests used one repeatable-read snapshot, one warm-up pair and three measured samples per query. No customer rows were exported. All columns, including statement timestamps, were compared in the same SQL statement using bidirectional EXCEPT ALL.

| Measurement | Original | Candidate | Meaning |
| --- | --- | --- | --- |
| Production coverage query, median server execution |225.342ms|100.950ms|55.2% lower query time; 124ms saved, not a save/sync result |
| DEV coverage query, median server execution |306.375ms|153.911ms|49.8% lower query time |
| DEV manual sync, three samples |2.520,3.084,2.916s|2.523,2.916,4.103s|Median2.916s in both groups; no established sync gain |

[Production query evidence](production-query-experiment.json) includes current data volumes:30 borrowers,85 loans,1276 charges,1097 repayments. All30 coverage rows matched. [DEV query evidence](development-query-experiment.json): all35 coverage rows matched. [Manual sync/UI evidence](gui-verification.json) records exact UTC timestamps; preview/background records were excluded from the comparison. These small sequential samples are not statistical or mobile-device benchmarks. No new save-latency improvement was measured in this batch.

The other expensive Payment dependencies have inexpensive raw SQL reads in production: medians Loans0.128ms, Payment Allocations0.246ms, Repayments0.344ms and Cash Account Statement Recent4.278ms. Even the first reads were at most19.289ms. [Bounded read-only measurements](production-dependency-reads.json). These are direct SELECT execution times, not AppSheet's exact queries, transfer time or recursive VC work. They do not justify promising multi-second savings from simply replacing those tables with views. Their lists remain intact.

## Verification and unchanged experience

- Full maintained `scripts/database/Test-CI.ps1` passed, including immutable migration checks, concurrency and historical upgrades. The upcoming-charge suite compares V74 against the independent original V54 query with synthetic empty/manual borrowers, tied dates, more than five dates, partial/full prepayments and inclusive horizon boundaries. All synthetic writes ran in disposable local databases and rolled back. [Local output](local-ci.txt).
- Fresh private logical backup restored successfully with all26 table fingerprints matching. [Recovery metadata](vm01-development-backup.json). The dump is outside Git.
- Flyway applied exactly V74 to DEV, checksum-530937726, then validated. [Migrate](flyway-migrate.json) · [Validate](flyway-validate.json).
- After migration, all25 existing data tables still exactly matched the backup, including derived/history/audit tables. Flyway history is the sole expected data-table difference. All existing routines and other view definitions were unchanged; the coverage view's columns, types, owner and ACL were unchanged. Live DEV coverage still exactly matched V54. [Before](before-contract.json) · [After](after-contract.json).
- Current Chrome GUI: Upcoming Charges loaded before and after; the visible content/order/totals were identical, excluding only transient Pull-to-sync/Last-updated status. Three post-change syncs completed successfully. No schema regeneration or AppSheet save was necessary. OLTP1.000200 and OLAP1.000056 remained saved with No issues found. No additional click, stale-result cache, delayed sync or table removal was introduced.
- DEV delivery data still had zero non-owner delivery addresses and one owner actor mapping. No new notification or financial transaction was requested. Existing tested payment/receipt/history behavior is reused because its definitions, functions and source data are unchanged.
- Exact SQL definition is recorded in a DEV-only dictionary overlay; production reference remains unchanged. Dictionary validation:1505 documents, zero errors. No architectural/data-model explanation or downstream export changes are required because the provider contract is identical; the existing forecast context continues to consume it.

## Recovery and disposition

Retain V74 as a modest SQL-efficiency candidate in draft PR16; do not describe it as a material app-latency fix. No merge or promotion occurred. The remaining related-list bottleneck needs an independently measured, behavior-preserving AppSheet solution; hiding/deferring lists or adding drilldown clicks is outside the owner constraint.

App rollback is unnecessary for this batch: neither app definition changed (OLTP200 / OLAP56). To drop an already-applied V74, use a new higher Flyway migration restoring the coverage CREATE VIEW query from immutable V54, as CREATE OR REPLACE VIEW, retaining columns/ACL. Never delete/rewrite V74 or repair history. V74 contains no financial writes and needs no data backfill/reversal. The verified private backup provides broader recovery if separately required; do not restore it over intervening data for a query-only rollback.
