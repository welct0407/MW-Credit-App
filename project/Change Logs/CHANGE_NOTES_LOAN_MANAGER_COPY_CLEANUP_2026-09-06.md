# Loan Manager copy cleanup — 6 September 2026

Status: **completed and verified**. Two obsolete app definitions and one isolated database removed.

The user explicitly requested removal of other Loan Manager app/database copies, retaining only the full backup from production implementation. This authorizes deleting the isolated test evidence in AppSheet; local historical documents remain available. No additional backup is created because that would defeat the requested single-backup policy.

## Verified inventory and retention

- Keep production OLTP `93844270-6aa5-420b-a960-bcdf08abd357`, v3.000002, and production Money database `9Y5vh3TFzZ4sIe2JgNh4l0` (12 tables). Production source mapping was verified during cutover.
- Keep deployed OLAP `e74dd368-654f-44d7-bccf-83cf361d1cdb`; this is the reporting app, not an obsolete Loan Manager copy.
- Keep full backup app `243eb391-5f6d-4720-a7e2-f0dc67151e78`, v1.000002, and Money FULL BACKUP 20260906 database `SAYscSVuS847EarNTaAiwc` (10 tables). Verified present in owned inventories before cleanup. Production rollback baseline remains v2.300005.
- Remove release candidate `68bc9be3-acf3-468e-b305-e38db0d29b8f`, internal LoanMgrRELEASE20260906-578763613. Current UI name duplicates production, but its URL/ID and Prototype state distinguish it; live version v1.000015 recorded. It uses the production database, so delete the app definition only, never its source data.
- Remove test app `1b901dff-2e47-477c-8d2c-28aad5556102`, LoanMgr Payments TEST 20260905, recorded v1.000068.
- Remove isolated test database `eEwpmrK1Zr4_ao2UcQzF42`, Money Payments TEST 20260905 (12 tables), after deleting test app.

No production configuration, schema or financial records are intended to change. No full restoration drill is implied. Deleted copies are not retained as additional backups; future tests must be recreated from retained configuration/local documentation in a fresh isolated environment. The retained pre-migration full backup is not a substitute for post-migration test data.

## Results

- Deleted release candidate through its verified Prototype row; AppSheet reported App deleted. Production's identically titled Deployed row remained.
- Deleted LoanMgr Payments TEST 20260905; AppSheet reported App deleted.
- Deleted Money Payments TEST 20260905 after confirming its exact name and that all its tables would be deleted; AppSheet reported Database deleted.
- Final Owned apps inventory: three entries — production Loan Manager (Deployed), LoanMgr FULL BACKUP 20260906 (Prototype), Loan Business Insights (Deployed).
- Final Owned databases inventory: two entries — Money database (12 tables) and Money FULL BACKUP 20260906 (10 tables).
- No production app configuration or database schema/data was edited. No new backup was made. Local change logs, JSON checkpoints and historical dictionary sheets are retained as documentation, not additional AppSheet copies.
- Migration runbook and production log now record retirement so their earlier clone/candidate references are understood as historical. Production data model is unchanged; no dictionary/model inventory change is required for removing isolated copies.

Recovery: do not assume deleted test apps/data can be restored through production app version history. Recreate a fresh isolated test copy if needed using the current production configuration and local implementation records. The retained pre-migration full backup pair and production rollback v2.300005 remain the recovery points documented in the production log. No manual financial test is required for this inventory-only cleanup; reopen the app list if its UI still caches the removed entries.
