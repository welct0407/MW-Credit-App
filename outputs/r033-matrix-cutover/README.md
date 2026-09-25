# R033 — custom matrix cutover

Owner accepted the iframe and requested removal of the old plot. Remove native matrix placement849 (question274) and its four text labels1280–1283 from dashboard3/tab31. Retain saved question274, custom iframe1501, method note1278 and borrower details275. Move iframe to row31, method note to row53, and later rows upward20. All other definitions, tabs, filters, Apps, SQL and chart service stay unchanged.

Rollback: dashboard recovery copy8 and secret-bearing before.json stored outside Git under the R033 private directory. Restore removed placements/rows from that baseline only after checking for intervening changes. Do not publish the private iframe URL.

Verification pending.
