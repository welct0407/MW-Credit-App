# R008 DEV review candidate — revision 2

Implementation/evidence commit: **3f1ab7d5ee1369805752f787f4f904f8557d4e7e**.

Configuration candidate SHA256: **5afdba00fb474c0fc89076cdb79c42c7bfbbadab58d755a17b3d406baffde56e**. [Complete 174-item delta](release-delta.json), [DEV comparison](dev-comparison.json), [repair and tests](REPORT.md). Seven new property observations are independent saved 1.000178 readbacks. The 167 unchanged revision-1 observations/tests retain their original versions/timestamps and are explicitly reused.

DEV SQL **V24 / OLTP 1.000178 / OLAP 1.000169**, both Prototype. Dependencies: released R007 including R005/R006. PROD remains **V22 / OLTP 3.000173 / OLAP 1.100131**. No SQL file changed: reuse the [frozen migration manifest](../flyway-manifest-r1.json) and V23→V24 order. The revision-2 implementation commit contains those identical migration files. Synthetic data and DEV recipients are not to be copied into PROD.

This candidate supersedes revision 1 for review/promotion and includes the manual charge generation Bangkok-date sync fix. It is **ready for review subject to the existing R008 owner checks**, not accepted or authorized for production. The [report](REPORT.md) records current-editor diagnostics, remaining mobile/opening/recipient decisions and rollback OLTP 1.000176 plus a verified private pre-test snapshot. Production requires its own scoped authorization, current recovery points, drift checks, exact saved readbacks, smoke tests and documentation closure. Further candidate edits require another revision and affected retesting.
