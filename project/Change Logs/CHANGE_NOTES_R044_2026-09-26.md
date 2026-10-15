# R044 — Partners tab

Owner authorized a new Partners tab based on the accepted actual-only design, with AppSheet changes held for review. No AppSheet change is needed or included. Scoped authorization covers the additive reporting providers and dashboard publication; no financial writes, new base tables/columns, schedules or notifications.

Starting commit `9550cb1d3df76494bebc494db75ce5db639bbce5`. Existing untracked Risks design and R026 outputs remain untouched.

## Implementation

- SQL V47 adds six read-only partner reporting views: capital, allocated earnings, all-status settlements, current positions, dense daily activity/capital balances and capital ledger date-end balances. Existing source objects remain unchanged; SELECT only for the established Metabase reporting role.
- `scripts/metabase/PartnersTab.mjs` builds a new Partners tab with independent partner/activity/status filters, 19 visible questions and one picker. Current metrics ignore activity dates; historical activity uses source event dates. Entitlement bridge uses the handover's explicit table fallback so subtotals cannot double-count.
- `scripts/analysis/verify_partners.py`, `scripts/database/Test-Partners.sql` and `scripts/database/Backup-Partners.py` cover source parity, synthetic edge cases and verified private backup/restore.
- [Accepted handover](../outputs/partners-tab-design-20260926/HANDOVER.md) remains the metric contract. Current all-record balances, historical per-repayment rounding, expense allocations, non-Cancelled reservations, signed corrections and capital/custody separation are preserved.

## Checks and progress

DEV/PROD initially V46; full pre-change public schema definitions match. One partner per A/B role; PROD source preflight found no unexpected capital/status/date records. DEV contains one cancelled undated audit row, correctly retained and excluded from effective reservations. Both private backups restored with all 26 table fingerprints matching.

V47 compiled in the disposable migration chain; 47 migrations applied, second run zero, checksum tampering rejected. Synthetic partner tests passed. Mandatory Test-CI passed. DEV migrated/validated V47; 15 independent source/grain/period/current checks and 20 report queries passed. Existing public objects are unchanged.

Status: DEV implementation verified; PROD migration and report publication pending at this checkpoint. SQL backup paths/hashes and sanitized tests are under [R044 evidence](../outputs/r044-partners/README.md). Full private backups/metadata are outside Git.

## Recovery and remaining work

Restore the scoped Metabase definition baseline/recovery copy after checking intervening edits. Additive SQL views may remain unused on report rollback; do not revert financial data. No RC apps or AppSheet rollback required. Finish exact pinned SQL promotion, report/filter verification, correct-profile browser QA, dictionary/core-document closure and final release publication before marking Released.

Scope frozen at 2026-09-26T16:38:54.763258+00:00 for authorized promotion. Exact tested package `8cbf7f1935fa6570b71a913d931c4efdc52318f2` and Flyway manifest captured in the clean managed r044 worktree. R045 opened as sole development release; shared DEV package is independently pinned.

## Delivered closure

PROD migrated from the clean pinned worktree V46 → V47; validation and15 independent source/grain/period checks passed. New Partners249 published with recovery21; all223 previous placements preserved. Required Metabase model-reference tags were added as a scoped candidate correction, then19 saved dashboard visuals, multi-selection and three ledger statuses passed. No SQL correction or AppSheet edit. Desktop/mobile Chrome inspection passed; native wide-table/note scrolling documented. Exact SQL/model/question/dashboard dictionary and core records updated. Private screenshots/backups are excluded from Git. Final publication: current upstream, unique R044 tag. No RC cleanup needed.
