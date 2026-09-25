# R033 — custom matrix cutover

Owner accepted the iframe and requested removal of the old plot. Remove native matrix placement849 (question274) and its four text labels1280–1283 from dashboard3/tab31. Retain saved question274, custom iframe1501, method note1278 and borrower details275. Move iframe to row31, method note to row53, and later rows upward20. All other definitions, tabs, filters, Apps, SQL and chart service stay unchanged.

Rollback: dashboard recovery copy8 and secret-bearing before.json stored outside Git under the R033 private directory. Restore removed placements/rows from that baseline only after checking for intervening changes. Do not publish the private iframe URL.

Deployed and verified: all expected placements/layouts, iframe configuration, saved question definitions, other tabs and filters preserved. Browser shows one working iframe with23 borrowers and no old quadrant labels. The saved question’s dashboard_count correctly falls by one; verification compares definition fields rather than that derived count. [Verification](verification.json), [manifest](release-manifest.json), [checklist](promotion-checklist.md). Published under R033; R034 remains Open.
