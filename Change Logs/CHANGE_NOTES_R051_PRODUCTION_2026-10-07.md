# R051 production promotion — 7 October 2026

Owner accepted the readiness review and explicitly authorized consolidation, cleanup and production promotion. Scope frozen 2026-10-06T19:01:37.427547+00:00; R052 is the sole Open development release. Both AppSheet apps require Upgrade.

Retained: source corrections and consistent generated accounting; reimbursement transfers survive expense deletion; optional assessments preserve history and do not block borrower deletion; historical opening corrections use recorded attribution with Lisa fallback; V73 coalesced/scoped refresh, V74 forecast reuse, and server-only posted-payment calculation guards. Existing screens, information and native related lists are retained. No restrictive dependency views were added.

PR16 commits fast-forwarded into PR15 without rewriting history. V77 removes the dormant related-ID view with RESTRICT; V75/V76 files remain immutable. The current synthetic suite checks its absence; the historical candidate test is retained as experiment evidence. Full local Test-CI through77 passed.

DEV V76 private snapshot restored and V77 rehearsed without data changes, then DEV migrated/validated77. PROD V58 snapshot restored; full59–77 rehearsal preserved existing values except the compatible Delete Requested default field. Schema baseline reconciliation precedes live writes. Recovery originals and restore directories are private outside Git.

PROD baselines: OLTP3.000264 (owner-confirmed logo repair), OLAP1.100209 (logo and generated configuration normalization), SQL58. Preserve restored logos and each PROD theme in definition-only RC copies. App rollback uses264/209; SQL rollback requires compatible retention or reviewed forward-fix, never blind data restoration over later transactions.

Single execution record: [promotion checklist](../outputs/r051-production/promotion-checklist.md). Live SQL/App Upgrades, final mapping/validation, RC cleanup, dictionary closure and publication remain in progress. No new monitoring deployment or unrelated access/runtime change is included.
