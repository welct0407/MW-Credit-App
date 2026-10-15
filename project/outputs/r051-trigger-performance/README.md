# R051 synchronous trigger performance — 6 October 2026

DEV V73 is applied and validated (checksum `1165230041`, SHA256 `4385572f8495470f5f462cfdfef220e703a754143c356bf77d1628347071655d`). Canonical OLTP1.000194 / OLAP1.000056 definitions are unchanged. R051 remains Open; PR15 remains draft. No PROD changes or merge.

## Implemented scope

1. Historical corrections collect old/new affected cash accounts and recompute those accounts over the affected existing date range. Missing snapshot coverage falls back to a full account rebuild. Portfolio totals combine refreshed accounts with retained unaffected accounts.
2. Transaction-local dirty sets coalesce deferred charge/loan/payment/borrower refreshes. A receipt amount correction now refreshes its payment and loan once, instead of 22 and 11 times in this fixture. Deferred timing, retries, savepoint rollback and later writes in the same transaction remain supported.
3. Scoped refreshes skip snapshot updates when business values are unchanged, preserving row identity and Generated At. Explicit/scheduled full refresh keeps its existing freshness behavior.
4. Measured expensive queries were rewritten: bounded-date partner income avoids all-history allocation work; longer history ranges use cumulative charge/payment events instead of repeating charge aggregation per day. Short ranges retain the cheaper grouped path. Plan inspection did not justify a new index on the current data.

No new tables/columns, asynchronous financial work, disabled integrity triggers, grants, restrictive views or changes to reversal/account attribution rules. Existing public refresh API and advisory lock are retained. Reporting/export column contracts do not change.

## Measurements

Milliseconds; positive percentage means faster. Local: five measured samples after one warmup, fresh V72 restored clone per run, same source data, per-sample rollback and VACUUM ANALYZE. Live DEV: three samples after one warmup; client elapsed includes two DB round trips, DML, triggers and deferred constraints. EXPLAIN instrumentation is included. These are bounded synthetic samples, not load-test percentiles or AppSheet total latency.

| Operation | Local before → after ms | Reduction | DEV before → after ms | Reduction |
| --- | ---: | ---: | ---: | ---: |
| receipt_add | 40.13 → 34.64 | 13.7% | 52.90 → 46.70 | 11.7% |
| receipt_amount | 42.44 → 32.83 | 22.6% | 59.41 → 48.24 | 18.8% |
| receipt_delete | 30.67 → 24.88 | 18.9% | 44.18 → 37.78 | 14.5% |
| receipt_backdated | 109.77 → 47.09 | 57.1% | 138.21 → 66.43 | 51.9% |
| receipt_metadata | 1.29 → 1.29 | 0.5% | 7.05 → 7.02 | 0.3% |
| expense_amount | 21.68 → 18.85 | 13.1% | 35.90 → 39.94 | -11.2% |

The live expense sample regressed slightly despite local improvement; metadata was effectively unchanged. No universal speedup is claimed. The strongest demonstrated gain is backdated receipt correction. Separate DML-only server timings and nested function call/self-time profiles are in the JSON files; inclusive function times must not be summed. GUI save/sync includes AppSheet/network work beyond these measurements. GUI waits crossed observation boundaries, so no precise GUI latency or before/after GUI improvement is claimed.

[Local baseline](baseline-pinned.json) · [Local V73/parity](candidate-pinned.json) · [DEV before](dev-before.json) · [DEV after](dev-after.json).

## Validation and recovery

- Full Windows Test-CI passed the 73-migration chain, repeat/checksum rejection, financial/history regressions, nine concurrency suites and four historical upgrade paths. The old calculation is retained independently in Test-HistoryReference.sql; complete persisted snapshot rows match it. The new test also checks once-per-parent refresh, savepoint re-arming and unchanged-row write avoidance. [Validation](local-validation.json).
- On the restored populated clone, migration changed no existing rows. All 25 material tables matched across six operation cases, excluding only enumerated run-specific timestamps. The live migration preserved all 25 non-history tables; rollback-only live profiling preserved all 26 tables before and after. [Migration preservation](migration-after-verification.json).
- Private V72 dump restored and matched all26 tables. The recovery point was refreshed after an hourly job changed only three derived tables. [Current recovery](vm01-development-backup.json); [benchmark source](benchmark-backup.json). Dumps, raw business snapshots and nested plans stay outside Git.
- App versions194/56 are restorable. SQL recovery requires a reviewed higher forward-fix migration restoring prior routines/removing the three new dirty triggers, or controlled private dump recovery; do not edit/reapply V73, repair history, or restore an entire database over intervening work without reconciliation. App version restore does not undo SQL.
- Ten affected routines and three relations are captured in [catalog evidence](sql-definitions.json), with guarded updates to the existing DEV dictionary overlay. PROD dictionary definitions are unchanged.

GUI and exact cleanup evidence: [GUI checks](gui-tests.md). Repository publication and CI are verified separately on PR15's final head.
