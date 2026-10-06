# R051 — Common receiving and OLTP sync investigation

6 October2026. Owner requested frequent-payment optimization with measurements and review of reducing synced tables. Completed bounded DEV investigation; V73 trigger improvements remain intact. All seven receiving methods still use one posting engine.

V73 DEV command medians were37–68ms, while AppSheet saves/syncs took seconds. A Payments.Eligible Charges trial failed to establish a speed gain and was reverted exactly in OLTP1.000198. No SQL migration or net business/table-membership change is retained. OLAP1.000056 is unchanged; both saved editors show No issues found. Twenty-three sync entries comprise22 business tables plus user settings. Removing four forecast tables would require moving existing features to OLAP and measuring critical-path savings; no removal was applied.

Changed: bounded backup/fixture/profiling/readback helpers, sanitized evidence, one dictionary overlay/index, current release/environment/development references. Starting commitdd985cbd65ff127c24768a19ba18320b14e44620; unrelated main-checkout work preserved.

Validation: full Windows Test-CI passed73 migrations, financial/history/concurrency/upgrade suites. Current synthetic GUI covered Single Full, Single Partial/correction, Lump Sum, Selected Charges, Receive All and Loan Close. All seven submitted receipts Posted; closure principal0/total1060 matched SQL. First-day Auto coverage is reused, not newly benchmarked. Final198 sync passed. Exact cleanup preserved all23 existing source/audit/history tables; zero non-owner delivery addresses and one owner actor mapping. Three derived tables are excluded from exact parity. No independent notification-delivery claim.

Recovery: initial app194 and fresh private V73 dump with26-table restore parity; final198 already restores the sole trialled formula. No V74 exists. Private source data/plans/backups remain outside Git. No real-record deletion, PROD, merge, access, credential or instance changes. R051 Open, PR15 draft; publication/CI are verified on the resulting commit.

[Exact measurements, trial disposition, tests, table review and recovery](../outputs/r051-payment-performance/README.md).
