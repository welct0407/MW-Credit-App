# Remove unused Metabase Sample Database — 23 September 2026

The owner requested removal of the Sample Database if unused. Starting Git commit: `8347bcd5f60aae6a51c1eafa10bbc167d5412899`; working tree was clean. Scope: the built-in SQLite Sample Database connection (Metabase source `1`) on `https://reports.mw-credit.com`. The PROD Loan Reporting connection (source `2`) and source PostgreSQL data were not changed.

Preflight confirmed the exact source identities and PROD source binding. None of 155 saved cards, including archived cards, used source `1`; neither of two dashboards had a sample-based placement; three SQL snippets had no apparent sample-table reference. The source's API metadata was saved privately under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-sample-removal-20260923/`. [Sanitized preflight](../outputs/metabase-sample-removal-preflight-20260923.json).

Deleted source `1` through the Metabase API. Readback found source `1` absent and source `2` as the sole connection with its expected PROD database, user and proxy host. All 155 saved cards, both dashboards (seven and 180 placements), and three snippets remained accessible through the API. No report query or physical-browser test was run for this metadata-only cleanup. [Verification](../outputs/metabase-sample-removal-verification-20260923.json).

Recovery: Metabase Admin → Databases offers **Bring the Sample Database back** for the built-in sample; the private metadata snapshot records its previous settings. The removal is complete. R016 final owner review and closure remain separate.
