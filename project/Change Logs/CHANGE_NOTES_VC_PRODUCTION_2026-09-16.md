# VC phases 1–4 — production promotion

16 September 2026. Status: implemented and verified within the production checks below; owner explicitly authorized promotion and put further opportunities on hold.

Promoted immutable V12–V14 from tested commit f48dd28d91e66b40485bcf7e2d118afae6682205. Production is OLTP 3.000108 / OLAP 1.100090 / V14. Both apps read 24 SQL-owned fields each without App formulas; four obsolete OLTP allocation VCs are deleted and their freeze action is disabled. Amount Due remains virtual. Production sources, slices, permissions, bot routes and schedules were preserved.

Rollback points: OLTP 3.000098 / OLAP 1.100081 plus verified private V11 logical backup. Full restore matched all 14 business tables and schema; pre-release schema matched the reviewed DEV baseline. Prefer a coordinated V15 forward fix. An app-only restore is unsafe; snapshot recovery discards later writes and needs a separate recovery decision.

Production all-row parity has zero mismatches; all 14 original business-table fingerprints were preserved. Both current Chrome apps synced without errors, and the payment form opened and was cancelled without saving. No production financial test or forced notification was submitted. DEV functional/concurrency and GUI tests remain regression evidence; no new production speed percentage is claimed. Mobile/offline/competing-device feedback and notification delivery remain unverified; Looker rendering was not retested.

Updated Documents/AppSheet_Data_Model_Overview.md and AppSheet_Data_Dictionary.xlsx together, Environment_Inventory.md, Development_Changes.md, database/README.md, prior DEV status, maintained parity/dictionary scripts and sanitized outputs/vc-production-20260916 evidence. Dictionary all-sheet roundtrip, error scan and visual preview passed. Migration sources are unchanged. Repository publication follows final staged-diff checks.

Owner checks: next ordinary partial/full receipt, relevant closure/default, Amount Due form feedback, OLAP read-only balances, mobile/offline retries and expected notifications. Further optimization opportunities are on hold.

[Complete release evidence, hashes, scope and recovery](../outputs/vc-production-20260916/REPORT.md).
