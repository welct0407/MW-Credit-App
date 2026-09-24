# R018 — Weekly Loan Return on 6R

24 September 2026. Owner requested the screenshot's Loan Return as a weekly chart with 100% reference, and explicitly chose a separate chart preserving Daily capital yield. Prepared and tested; publication pending.

## Metric and date contract

Loan Return = SUM(gross interest received) / SUM(principal issued) for the selected completed dates within each Monday–Sunday week. Screenshot examples: 14,440 / 28,100 = 51.39%; 46,180 / 40,000 = 115.45%. This is a period ratio, not a loan-cohort return, principal repayment rate, net-profit margin or annualized capital yield. Values above 100% are valid.

Metabase query-builder question over existing model 74 plus calendar 36. No handwritten SQL, DB, model or financial-data change. Existing 6R Performance period filters daily input before weekly grouping. Weeks are labeled by Monday dates, including year; partial boundary/current weeks include selected completed days only. Today/future are excluded in Bangkok time. Missing inputs invalidate that week's ratio; zero issued total produces null through Metabase's guarded division. Zero gross interest stays zero; signed corrections remain signed. No average of daily percentages.

Green vertical bars; percent formatting with two decimals; reference value 1 displayed as 100%; one Y-axis with signed values and no cap at 100%. The new chart occupies row 53 left (12 columns); existing EOD activity placement 618 moves to the right at half-width without changing its query/settings. All prior questions, including capital yield 232 and original Performance, remain unchanged.

## Verification and recovery

17 preflight checks: Monday/Bangkok settings, daily grain, independent ratio-of-sums reconciliation for single/month/full/partial weeks, today/future/prehistory/cleared filters; real Metabase synthetic fixtures for weighted ratio, zero denominator, missing inputs, signed correction, zero income and >100%. Installed mappings and browser review pending.

Starting commit b9b40b9ab7a2f2fb56cbaeff4d4b33e6f3219f2b. Exact before-images captured privately under C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r018-weekly-return. Roll back by removing new placement, restoring placement 618 to col 0/width 24 and recoverably archiving the new question, preserving intervening owner edits. No DB rollback or operational job changes.

Dependencies: already-deployed R016 reporting sources and R017 capital-yield placement. No AppSheet/RC/migration/grant/scheduler change. Wider R016 acceptance remains separate.
