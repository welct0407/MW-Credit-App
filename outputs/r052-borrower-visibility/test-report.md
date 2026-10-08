# R052 borrower visibility regression verification

8 October2026. Baseline173feff. Independent Agent C verification used disposable loopback PostgreSQL and synthetic names only. No live database writes, fixture inserts, credentials or borrower data.

17/17 actual-SQL cases passed through tests/integration/Run-Collection.ps1, including one new tri-state regression and16 existing Collection/search/provider cases. The test reader has SELECT-only access. Local fixture setup extends only its disposable Loans shape to exercise the existing related-loan projections; this is not a product schema change.

The regression creates30 directory candidates alternating NULL/FALSE Hidden Flag plus oneTRUE-hidden candidate. Unfiltered and name-search pages return25+5 distinct visible rows, including NULL andFALSE and excludingTRUE. Direct borrower detail, related-loan list and loan detail work for both visible states. TRUE-hidden parents return404 on all three paths; a loan belonging to another borrower also returns404. Changing a fixture parent toTRUE makes subsequent detail/list/loan reads unavailable. Collection's31 borrower DTOs remain byte-for-byte equivalent across that visibility change. A wrong-owner directory call returns403 before any SQL.

B reports47 focused unit cases passed separately. No UI/PWA rerun was needed: this correction changes five store visibility predicates only; query/cursor versions, ordering, authentication and Collection behavior remain unchanged. Existing cursor positions may require a first-page refresh to include newly visible preceding rows. No claim of owner-device validation is made.

The disposable server stopped normally; parent preview and managed build were untouched. Intended C change: tests/integration/collection-postgres.test.mjs plus this report. Await exact-source CI/deployment and owner directory refresh/recheck. R052 remains Open.
