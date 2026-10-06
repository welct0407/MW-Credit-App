# V73 DEV GUI acceptance — 6 October 2026

Existing Chrome work profile; canonical DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` and OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393`. Owner delivery containment rechecked before SQL profiling and GUI seed: no nonblank Partner delivery address outside welct0407@mw-credit.com. Existing distinct login mapping and notification expressions were preserved; no independent delivery claim or forced notification test.

One bounded disposable fixture: SYN-R051-PERF borrower/loan, ten ฿10 charges, receipt, manual expense and Dad/Lisa synthetic accounts. No real record was changed or deleted. Existing auto-charge disabled on the fixture; borrower contact fields blank. Seed and cleanup use exact reserved keys and normal enabled triggers.

| Current GUI check | Observed result |
| --- | --- |
| Receipt amount50→60 | Save/sync completed; Posted; six repayment/allocation children instead of five |
| Receipt60→70 and date2026-09-11 | Save/sync completed; seven repayment/allocation children dated9/11; SQL readback Posted Amount70/date9/11 |
| Expense10→12 | Correct synthetic borrower/Lisa account verified in form; save/sync displayed12 |
| OLAP analytics/account consumer | Analytics loaded; Cash Position after sync showed Dad cash-in70 and Lisa cash-out1012 (loan1000 + expense12) |
| Delete receipt action | Confirmation accepted for exact disposable receipt; sync completed; filtered Payments showed No items; SQL source absent; OLAP after sync showed synthetic Dad cash-in/out0 |
| Final editors | Reloaded current editors: OLTP1.000194 / OLAP1.000056; Save disabled and No issues found in both. No definition edit/regeneration/deployment-mode change |
| Exact cleanup | Remaining synthetic expense, charges, loan, borrower, account snapshots/accounts removed; zero reserved source records. All22 pre-existing source/audit tables match refreshed V72 backup. Derived analytics/statistics were recomputed separately |

Save/sync observations crossed browser-tool calls and one wait returned early with a selector deadline. Therefore no precise GUI duration, average, or before/after UI speedup is claimed. The DB comparison is independently instrumented in the measurement JSON. Both apps were synchronized after cleanup.

[Cleanup preservation](migration-cleanup-verification.json) · [Measurement and recovery](README.md).
