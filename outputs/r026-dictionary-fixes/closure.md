# R026 — closed at owner direction, partial deployment

On 24 September 2026 the owner instructed: “keep the app as it is, and wrap up your R026. i have other dev work to do”. This ended further R026 app edits, upgrades and instance changes. On 25 September the owner separately authorized deletion of all four R026 RC definitions; that cleanup is complete. R027 was the sole Open release at closure; consult the tracker for current development. No development hold remains from R026. This is not a fully verified Released claim.

## Applied and verified

- V40 applied and validated in DEV and PROD; pg_cron extension/disabled job removed. All non-cron business catalog sections unchanged. Backup 1790257810992 succeeded. Shared instance enable flag remains on; no restart performed.
- Exact export template 1g4xHHsTVvRR5ek4u3DslZAb_UerH05E5 verified in Google Drive Trash. Export bots remain disabled.
- PROD OLAP was upgraded from RC1 1.000007 to saved version 1.100198; its editor showed No issues found. Its production UUID/internal name are unchanged. The copied display name is currently MW-OLAP-R026-RC1, and the copied default folder was not restored before this upgrade. The 19 en-US table settings and regenerated Daily Analytics schema were included in that candidate. Final post-upgrade source/locale/logo/API checks were not completed.
- PROD OLTP was not upgraded; last observed version remains 3.000246. Its 18 blank table locales were not changed.
- DEV OLAP Daily Analytics was regenerated against the existing V37 SQL additions, version 1.000031 → 1.000033. Thirteen stored fields were added; all prior RC column properties were verified unchanged and table READ_ONLY retained. Four generated slice-column warnings remained in DEV at last observation. No financial rows were written. DEV OLTP remains 1.000075.

## Deleted candidates and historical unfinished correction

All copies explicitly used data OFF and file-data OFF. RC1 guards were verified to exclude candidate names; RC2 copied these definitions. No forced business jobs were run.

| Candidate | Identity | Last state |
| --- | --- | --- |
| OLAP RC1 | 2da0b461-a7e3-4e9e-a09c-78149c72e415 / MW-OLAP-R026-RC1-578763613 | Deployed 1.000007; used for partial upgrade |
| OLTP RC1 | 6129132d-77e8-46ed-8621-be49911b4a66 / MW-OLTP-R026-RC1-578763613 | Deployed 1.000006; never promoted |
| OLAP RC2 | 6d1ecc2f-7265-410f-987f-8d88cdedfd56 / MW-OLAP-R026-RC2-578763613 | Display name/folder restored, original logo/color retained, API enabled; initial check passed and deployment submitted; final saved version not captured; not promoted |
| OLTP RC2 | ec9bc31d-5d20-4612-b53c-eb81b2aa55d0 / MW-OLTP-R026-RC2-578763613 | Display name/folder restored and API enabled, saved; initial deployment/validation unfinished; not promoted |

All four candidate definitions above were deleted on 25 September 2026 under the owner's subsequent explicit instruction. Their exact editor URLs returned 404 / Home/NotFound; only the two DEV and two PROD apps remain in the inventory. Shared data/files/logos were not deleted. [Cleanup evidence](rc-cleanup.json). The table records historical pre-deletion states; candidates are no longer live recovery or promotion sources. Do not silently resume this promotion or copy these names/folders into PROD. Later development must use the actual versions above and reconcile affected DEV warnings and production branding before any future promotion.

## Documentation, recovery and limits

Database dictionary and export lifecycle records are updated and structurally validated. App dictionary records from the morning audit are not a complete description of the later partial OLAP upgrade/DEV regeneration; this closure record explicitly supersedes their version/locale/schema assumptions. Exact post-upgrade app reconciliation remains unfinished, rather than being represented as verified. Private candidate captures retain the regenerated column definitions and 37 original source/locale readbacks.

PROD app rollback baselines: OLAP 1.100195, OLTP 3.000246. No rollback was performed after the owner's instruction. SQL recovery uses the verified backup/reviewed higher migration, not Flyway repair or reactivating a duplicate scheduler.

The earlier mistaken personal-account OAuth consent was acknowledged and the account signed out. No app membership or license assignment was changed; billing impact remains unverified and that consent was not revoked. The subsequent work used the existing Workspace Chrome profile. No further personal-account grant occurred.

Checks: dictionary validation 1128 documents, zero structural errors; git diff whitespace check passed. Existing SQL CI and 11 guarded-retirement tests are reused. No final release tag is created: repository publication records partial closure, not completed production validation.

## Owner-requested PROD name correction — 25 September 2026

PROD OLAP Short Name was corrected directly to **Loan Business Insights**, saved version **1.100201**, under explicit owner instruction. UUID/internal name unchanged; no App Upgrade. Initial saves 1.100199/1.100200 did not persist the name; committing Settings > Information > Short Name with Enter before Save completed the correction. Editor reports No issues found. The current default folder was observed as `/appsheet/data/LoanBusinessInsights-975338008` and was not edited; this readback supersedes the earlier unverified folder concern. Earlier versions above remain dated release evidence. Other incomplete R026 verification remains unchanged. [Exact correction evidence](prod-name-correction.json).
