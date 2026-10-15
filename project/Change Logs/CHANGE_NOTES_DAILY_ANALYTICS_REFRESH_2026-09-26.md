# Production daily analytics refresh — 26 September 2026

## Scope and result

At the owner's request, ran the maintained bounded reconstruction of production `Daily Analytics` and `Cash Account Daily Analytics` from 24 September through Bangkok today, 26 September 2026. The routine reported three refreshed dates. It updates derived snapshots only; no source loan, charge, payment, cash movement, account opening, app definition or schema changed. The existing hourly Recent bot subsequently refreshed 25–26 September as usual.

## Target and recovery

- Target verified as `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`. Starting repository commit: `81439226c2f56639ac7804f12e03a48a31b12eee`.
- Before the write, created private dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/daily-analytics-refresh-before-20260926.dump`, SHA-256 `AD0DDBB06444D15C825084529EDB193966ABDA394F248D8E5FB153479A1ED68A`. A local restore succeeded with matching normalized schema; Cloud SQL cron extension/settings are outside the logical-backup scope.
- Invoked `scripts/database/Invoke-AnalyticsRebuild.ps1 -Environment production -From 2026-09-24` with the owner's scoped request and verified-backup reference. To reverse snapshot values, reconcile intervening writes and rerun the same deterministic reconstruction over the needed range; do not restore the full backup over later PROD transactions.

## Verification and limit

- The existing portfolio keys for 24–26 September were preserved, with four account rows per date, model version 3, no duplicate portfolio dates and matching portfolio/account generation timestamps.
- All 17 independent cash/account checks passed. The independent portfolio reconciliation matched all three requested dates, with zero mismatches from 24 September onward.
- The maintained full-history verifier reported 17 portfolio mismatches, all dated 7–23 September. Its script then raised a PowerShell property error while formatting that failure; the generated [verification result](../outputs/r016-20260922/daily-snapshots/production-verification.json) retains the actual check counts. Those older dates were outside the requested rebuild and remain unreconciled against current source data.

Status: requested 24–26 September refresh complete and verified. A separate rebuild beginning no later than 7 September would be needed to reconcile the earlier historical snapshots.
