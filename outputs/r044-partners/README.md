# R044 — Partners tab

Owner-approved implementation of the [Partners design](../partners-tab-design-20260926/HANDOVER.md). New additive actual-only tab; AppSheet changes require owner review and none are necessary. No source financial records, operational tables/columns, allocation rules or existing dashboard pages change.

## Current checkpoint

DEV V47 migrated and validated. PROD remains V46 until the pinned promotion. The candidate has six read-only reporting views, six planned thin models and twenty questions (nineteen visible plus one picker). Use the [single promotion checklist](promotion-checklist.md) for continuation.

Checks: [DEV source parity](development-verification.json), [DEV report queries](development-queries.json), [schema preflight](schema-preflight.json), [synthetic cases and migration chain](partner-tests.txt), [mandatory CI](database-ci.txt). Source baselines DEV/PROD match. All existing public objects remain unchanged in DEV. Backup/restore fingerprints match for all 26 tables: [DEV](development-backup.json), [PROD](production-backup.json). Backups and full dashboard metadata are private, outside Git.

The design's waterfall uses its allowed labelled bridge-table fallback to keep net-earned/available subtotals unambiguous. Current values use all recorded operational balances; period values use actual Bangkok event dates. Capital shares retain the full-pool denominator. Future/undated Pending entries remain reserved. Unknown statuses remain in reservation arithmetic and suppress safe availability. No forecast, cash-custody inference or settlement action is included.

## Recovery

Starting Git: `9550cb1d3df76494bebc494db75ce5db639bbce5`. Before publication the installer captures a dashboard recovery copy, while private `dashboard-before.json` retains the original layout. Existing questions are not modified. Remove only this release's new placements/parameters/tab to restore the dashboard, preserving later edits. Newly added unused models/questions can be recoverably archived after dependency checks. SQL V47 may remain for compatible rollback; source data and all existing functions/views are unchanged.

Publication, exact IDs, saved definitions, browser QA, final dictionary/core-document closure and unique R044 tag remain pending at this checkpoint. No RC exists.
