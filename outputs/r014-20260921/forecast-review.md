# R014 forecast review — proposal only

Reviewed 21 September 2026 against bounded, read-only, repeatable-read PROD V30 and DEV V31 snapshots. Starting Git checkpoint: `b025b2084f50fd88c80f35926c122962c365c00c`. No app definition, database object, financial row, notification, or production forecast was changed. This proposal is not part of the implemented DEV definition yet.

## Findings and proposed semantics

- Existing forecasts are based on current contracts and entered charges, not statistical extrapolation. Preserve that approach: no new lending, renewals, historical collection ratios, or unrecorded plan changes assumed.
- `Expected Daily Interest` sums automatic daily-interest rates and automatic installment averages. It excludes disabled arrangements and fixed-date loans, and is not the cash interest due on a given day. Recommend a clearly renamed **Interest Due Today** based on dated charges plus eligible unposted charges, including manual arrangements. Keep received interest separate. An optional remaining-days average can divide future scheduled interest by remaining calendar days; it must be explicitly labeled an average and unavailable on month-end.
- `Expected Interest This Month` mixes daily accrual to month-end with dated manual/fixed plans. Recommend one payment-date schedule: existing future Interest Remaining first; simulate only missing charges using current loan type, auto flag, rate, interval and anchor. Daily interest falling due next month stays next month.
- Disabled plans use entered charges only; retain nominal rates without resurrecting automatic income. Loaded future charges also take precedence for automatic loans, avoiding duplicates and subtracting already-paid interest.
- Mirror fixed due dates and installment principal apportionment, including the final installment and rounding. Do not invent a missing initial installment charge. Invalid terms must produce diagnostics rather than guessed income.
- No automatic projections for closed/defaulted/fully repaid loans. Preserve already-posted receivables separately rather than silently writing them off. Assume explicit scheduled future principal is paid as arranged and stop new interest after full principal payoff; no unrecorded early settlement assumed. Daily amounts stay at the configured current rate; no invented proportional rate reduction.
- Keep uncollected interest due through today separate from future scheduled interest. The existing Projected Monthly Profit adds all of this backlog to this month's actual receipts and forecast. A comparable total can be retained as a labeled **including arrears** scenario; it is not evidence that arrears will be collected this month. These figures are interest income, not net profit after business expenses.
- Already-entered amounts in Interest Due/Remaining retain their ledger classification, including any arrangement amounts incorporating penalties. No speculative future penalties are added.

## Trial and verification

Maintained read-only snapshot: `scripts/database/Read-ForecastReview.ps1` / `.sql`. Full instance/host/database identity is checked by the existing Common.ps1 helper, SSL is required, and SQL runs in a READ ONLY REPEATABLE READ transaction with a bounded timeout. Only forecast dependencies are selected; no contacts, bank identifiers, or payment documents are extracted. Raw snapshots and identifiable numerical results remain outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/forecast-review-20260921/`.

Local Decimal-based trial: `scripts/database/trial-forecast-review.py`. PROD snapshot has 73 loans, DEV 74. Baseline daily total, per-loan forecast sum and posted interest backlog each reconcile exactly to the current SQL portfolio totals. PROD and DEV generator function definitions match. Both runs have zero projection diagnostics. Five active three-day-interval loans account for the live month-end difference. There are no active fixed-date/installment loans, active defaulted/nonpositive-principal loans, or future-start loans in the current PROD snapshot; those cases are validated synthetically, not claimed as live workflow tests.

`scripts/database/test-forecast-review.py`: **25 passing synthetic boundary checks**, covering daily intervals/anchors; disabled plans; partial/full prepayment; dates beyond month-end; existing future charge precedence; fixed-date loans; closed/defaulted/fully repaid loans; future starts; known principal payoff; installment rounding and forced final dates; missing initial charge; zero-rate manual amounts; missing today's charge; month-end boundary.

No GUI workflow was changed, so no live financial trial or GUI write test was needed. No new database columns/tables are proposed in this review. If adopted, implementation should use a governed SQL date schedule for both apps and reconcile borrower contribution charts/assessment consumers; do not silently change materialized daily-rate helpers with different existing consumers. This report does not claim those downstream integrations are implemented or tested.

## Numerical result handling

Owner-facing before/after numbers and named-arrangement explanations are in the private `REPORT.md` beside the snapshots and in the task response. Customer-level schedules and raw production financial data are intentionally excluded from repository publication. The proposal changes both timing semantics and labels; daily rate versus amount due today must not be presented as identical measures.

Rollback: no live rollback required. Revert the local review scripts/documentation if needed; existing R014 app/SQL recovery points are unchanged. Model dictionary and current environment versions are unchanged because this was a review and isolated trial only.
