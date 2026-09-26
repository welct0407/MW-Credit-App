# R043 borrower navigation

Owner-authorized report change, 26 September 2026. Starting commit `291da0105df4b698defd10dacd0d4b0f2c2652e7`.

Canonical sequence: 6 · Borrowers (104), 7 · Borrower Health Review (31), 8 · Borrower Detail (105), 9 · Risks (8), 10 · Collection Monitor (19), 11 · Forecast & Partners (11). Retire original Borrower Insight tab10 and its two exclusive filters; retain its saved questions for recovery.

Borrower names in all ten health tables and the custom matrix link by immutable borrower key to Detail. Portfolio comparison retains its selected activity range; chart links and Health Review use the previous30 completed days. IDs stay hidden. Aggregate Others has no individual borrower and cannot select a detail record. All pies, amount bars, ratio bars, Detail content and calculations are retained.

Preparation: eleven updated queries ran successfully; removing the added hidden key reproduced every prior column and value. Live baseline and affected question definitions are saved privately. Static baseline fetched from vm-mw-credit-agent through IAP; normalized chart source matches Git. Deployment changes two static files only; no service restart, SQL, AppSheet, permissions or financial writes.

Rollback: dashboard recovery copy (recorded in state.json after publication), plus private before.json for shared question definitions; static originals in the private folder and /opt/mw-report-charts/recovery-r043. Restore affected definitions and layout, reconciling any subsequent edits first.

Status: frozen for authorized publication; saved-state, browser verification and dictionary closure pending. Package hashes are in release-manifest.json; full result rows and the iframe bearer URL are excluded from Git.
