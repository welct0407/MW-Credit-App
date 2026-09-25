# R034 — chart first and whole-baht amounts

The owner requested the accepted custom matrix above the four category tables on dashboard 3, Borrower Health Review tab 31, and whole-baht presentation for financial amounts on that page.

Place iframe 1501 at row 9 and its explanation at row 31. Move category count/table placements 840–847 down 25 rows, remove redundant chart heading 848, and leave the detailed matrix table 1279 at row 56. Preserve every question, other placement, tab, filter and iframe definition. Set `decimals: 0` only on the `฿` column settings of affected saved questions 254, 259, 261, 263, 265, 267, 269, 271, 272 and 275. The iframe tooltip's interest and principal amounts also display zero decimals. Payment scores, contribution ratios and coverage percentages retain their existing formats. SQL and underlying values do not change.

Rollback: recovery dashboard 9, complete private dashboard and ten question metadata baselines under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r034-matrix-order`, and the previous static chart file in `/opt/mw-report-charts/recovery-r034/chart.js`. Restore only after checking for intervening changes; the private iframe secret must stay outside Git.

Verification pending.
