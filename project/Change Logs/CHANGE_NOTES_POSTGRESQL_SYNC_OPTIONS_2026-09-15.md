# PostgreSQL sync options — four apps — 2026-09-15

## Scope and authorization

Owner explicitly requested updating all four apps' sync options for the current PostgreSQL setup using Google's recommendations. Changes use the new AppSheet editor, Settings > Performance. Production and development app data sources remain separate; no binding, database, financial record, schema, offline-mode, security or bot changes were made.

## Saved settings

| Option | All four apps | Reason |
|---|---|---|
| Server caching | Off | Operational/reporting tables may change in the other app, automations or SQL logic; avoid stale read-only table caches. |
| Delta sync | Off | Google documents applicability only to Google Sheets and AppSheet databases, not PostgreSQL; calculated results also need refresh. |
| Quick sync | Off | Database-side calculation and dependent virtual columns need complete sync. Quick sync is not a substitute for fetching trigger/other-app changes. |
| Sync on start | On | Refresh when each app starts. |
| Delayed sync | Off | Send user changes promptly, allowing SQL triggers to execute and the subsequent read sync to retrieve results. |
| Automatic updates | On | Google's recommended pattern for data changed by automation or directly in the source. |

This is a configuration choice applying Google's guidance to this solution, not a universal PostgreSQL preset. Automatic updates periodically retrieve other users' changes (the editor states about every 30 minutes); they do not guarantee instant cross-app or SQL-trigger notifications. Use manual Sync when another user's latest changes are needed immediately. The post-write read sync cannot include asynchronous bot changes that have not yet finished. Full sync and disabling caching can add reads; no speed improvement is claimed.

## Rollback versions and exact changes

| App | Before / rollback | Saved version | Changes |
|---|---|---|---|
| Loan Business Insights — DEV | 1.000026 | 1.000027 | Quick sync and Delayed sync On → Off |
| Loan Manager — DEV | 1.000012 | 1.000013 | Quick sync and Delayed sync On → Off |
| Loan Business Insights | 1.100046 | 1.100047 | Server caching, Quick sync and Delayed sync On → Off |
| Loan Manager ผู้จัดการสินเชื่อ | 3.000070 | 3.000071 | Server caching, Quick sync and Delayed sync On → Off |

Each version was read from live Settings > Information before editing. Saved versions and all six switches were reread after Save; Save was disabled and no editor issue was reported. Evidence: `outputs/postgresql-sync-settings-20260915/verification.json`. Boolean array order: Server caching, Delta sync, Quick sync, Sync on start, Delayed sync, Automatic updates.

Rollback preferably restores only the switches to the recorded before state in Settings > Performance. Alternatively, Manage > Versions > Version History can restore the recorded version; check for intervening work before restoring an entire version.

## Verification and acceptance

All four apps loaded in the new desktop interface and completed a manually requested full sync. For each, the sync progress cleared, Sync was enabled again, no alert was visible, and the app status displayed a last-sync time of a few seconds ago. No production loan/payment write or two-user concurrent-write test is part of this settings change. User acceptance remains pending: both users should sync/reopen the apps to load the new definition, confirm existing dashboards and loan details load, and confirm the next normal authorized save completes and its calculated results appear. If another app/user changed data, manually sync before checking the corresponding figures.

Evidence consistency check: `scripts/verify-postgresql-sync-settings.mjs` checks all four saved versions, six final settings and recorded new-desktop sync results. It validates captured evidence, not the remote services independently.

No data-model changes: the overview/workbook are not modified. No direct Looker dependency changes or report audit is required.

## Official sources

- https://support.google.com/appsheet/answer/10104985?hl=en — caching, Delta sync applicability, startup and automatic sync trade-offs.
- https://support.google.com/appsheet/answer/10107724?hl=en — Offline and Sync essentials, Quick sync limitations and automatic-update pattern. Search-index text and live editor guidance reviewed; full-page fetch was blocked by Google's browsing challenge.
- https://support.google.com/appsheet/answer/10105761?hl=en — updates followed by read-only sync.
