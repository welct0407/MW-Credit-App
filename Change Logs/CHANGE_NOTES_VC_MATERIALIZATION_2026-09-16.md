# VC materialization phases 1–4 — DEV

**Subsequent status, 16 September:** The owner explicitly authorized production promotion. Phases 1–4 are now production V14 / OLTP 3.000108 / OLAP 1.100090; see [production VC release](../outputs/vc-production-20260916/REPORT.md). Further optimization opportunities are on hold. The original development checkpoint and pending device-test limitations below remain historical evidence.

16 September 2026. Status: implemented and agent-verified; owner acceptance pending. User authorized four phases in DEV, benchmarks and Chrome operation, then a read-only production performance review. No production changes.

Development: V14 / OLTP 1.000061 / OLAP 1.000064. V12 adds 13 Charge/Loan rollups, phase 2 deletes four obsolete allocation VCs and disables their freeze action, V13 adds nine Borrower/Loan helper fields, V14 adds two Payment totals. All 24 OLTP replacements and corresponding OLAP fields are physical/read-only with blank App formulas. Amount Due remains virtual. Shared consumers, sources and permissions were reviewed; Reporting Charges retains its original 22-column read-only contract. Other formulas/types/defaults/refs are preserved except documented internal Row ID regeneration metadata. Looker/export definitions are unchanged; rendering not retested.

Rollback: OLTP 1.000048 / OLAP 1.000052 plus private V11 backup. Fresh OLAP version supersedes stale inventory 1.000050. Local restore verified all 14 original table fingerprints and normalized schema. Use a coordinated higher-migration forward fix; app restore alone over same-name physical columns is unsafe. Backup path/hashes and recovery limits are in the report.

Full SQL functional and four concurrency suites passed at each migration. Final all-row parity has zero mismatches. New-GUI partial/full/default transactions, immediate Amount Due feedback and OLAP read-only readback passed. Fixture borrower is hidden, auto-charge off, financial history retained. Original non-snapshot records matched before GUI fixtures; existing hourly analytics changed Daily Analytics/Statistics. Development bots and owner-only routing were reviewed and unchanged. Device notification delivery was not independently verified.

Seven sync samples per checkpoint: baseline 5.293 s; phase 1 4.925 s; phase 2 5.422 s; phase 3 5.107 s; phase 4 4.819 s. Final median 8.96% faster; phase 2 showed no gain. Sequential measurements, browser overhead and overlapping ranges limit causal interpretation.

Updated immutable migrations, maintained database regression/backup/parity/fixture scripts, artifact-tool dictionary updater, overview and dictionary, development differences, environment inventory, database README and sanitized evidence. Production detailed dictionary rows remain V11. Dictionary all-sheet roundtrip checks passed.

Production analyzer suggests Payments.Eligible Charges, then Bangkok-date-aware collection summaries; Last Interest Charge Date remains a VC and is an additional date-aware candidate. No extra optimization was implemented. Historical graph timings and inclusive parallel durations are not promised savings.

Owner checks: DEV partial/full receipt, closure/default, immediate form feedback, OLAP balances/permissions, mobile/offline and competing-device retry, owner notifications. Owner acceptance and production approval remain pending.

[Full scope, tests, timings, manual checklist and rollback](../outputs/vc-materialization-20260916/REPORT.md). [Production performance review](../outputs/vc-materialization-20260916/PRODUCTION_PERFORMANCE_REVIEW.md).
