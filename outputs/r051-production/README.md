# R051 production promotion — 7 October 2026

Production SQL V59–77 and both normal App Upgrades completed under the owner's explicit production authorization. Final apps: OLTP **3.000270**, OLAP **1.100212**; existing canonical IDs are unchanged. DEV remains OLTP206/OLAP56 and SQL77. R052 is the sole Open development release.

The release preserves native related lists, screens and information. Receipt/source corrections reconcile generated accounting; reimbursed-expense deletion retains the historical transfer, with actual cash returns recorded separately. Optional assessments preserve recoverable history without blocking borrower deletion. Historical opening-source corrections use recorded attribution and the approved Lisa fallback. Retained performance work uses one unified receiving engine across all seven channels. The related-list view trial was reverted and its unused SQL view removed by V77; no general sync-speed improvement is claimed.

- [Single promotion checklist](promotion-checklist.md) and [manifest](release-manifest.json).
- [Verified restored/rehearsed production backup](production-backup.json); private dump remains outside Git. V58 baseline catalog matched the retained chain; all nineteen migrations rehearsed and applied with the pinned runner manifest from implementation commit `d3dba72453cd948729d296bf2b27b684789bd410`.
- [SQL readback](sql-verification.json): both databases77, all122 relevant routine hashes match, retired view absent; post-migration Flyway validation passed78 migrations.
- [Candidate mappings](source-mapping-validation.json) and [production validation](production-validation.json):22 OLTP and19 OLAP business sources on production database-2; receipt store PROD; canonical links and scheduled allowlists preserved.
- [Affected PostgreSQL definitions](postgresql-affected-definitions.json) and [affected app definitions](affected-app-definitions.json) document the promoted model. Raw full AppDoc captures remain private.
- Reused [DEV GUI lifecycle tests](../r051-receipt-corrections/vm01-gui-tests-20261006.md) and full local V77 CI; GitHub implementation CI202 passed. Production validation was read-only: both apps load/sync, Payments and Loan Assessment open, saved editors have zero issues, original logos render and themes match. No operational financial test writes or forced notifications.

AppSheet copied the RC1 display name during the first OLTP upgrade (264→267). A definition-only RC2 corrected the name through a second normal upgrade (267→270); OLAP209→212 used its corrected RC2. Both RC2 versions were1.000005. All copies actively excluded data and file copying. The correction did not change accounting or user workflows; the original names are restored. Initial candidate checks passed definition/structure/sign-in/account checks; the standard description/menu/cache recommendations were retained to preserve intended behavior. Deployed final editors are clear.

Recovery: retain production app versions264/209, private verified V58 dump and immutable migration history. App restoration alone does not reverse SQL or later financial transactions; prefer compatible retention/reviewed forward fixes, using the [recovery runbook](../../Documents/Release_Recovery_Runbook.md). No credentials, access, shared instance settings, unrelated runtime or dashboard changes were made. Monitoring work already delivered under R051 remains unchanged; existing evidence limits stay in its owning log.

All four temporary RC definitions were deleted and verified in [cleanup evidence](rc-cleanup.json). PR16 was merged into PR15; its remote branch was already absent and the local branch was retired after proving its commits reachable. Final Git publication is identified by tag R051 and PR15. Shared databases, files and production logo assets are preserved.

![OLTP production branding](oltp-production-header.png)

![OLAP production branding](olap-production-header.png)
