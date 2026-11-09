# Change notes — Loan Reports (dashboard 32) presentation batch, 9 November 2026

## Purpose
The owner asked for a presentation pass on the Loan Reports proposed dashboard (Metabase dashboard 32): amounts on the Today progress cards, signed holder bars, good and bad period tints, a waterfall and newest-first tables. Dashboard 3 stays untouched.

## Changes
- Today: questions 380 and 381 are now native text scalars "x of n (y%)" (for example "49,036 of 336,168 (14.6%)"); their dashcards 9260 and 9261 are titled "Interest · of projection ฿" and "Today's charges · paid ฿".
- Cash Position: new question 419 `cash.holders-signed` (a copy of 210; Net Cash Balance split into Positive #267DCC and Negative #D1495B, stacked, no legend) on dashcard 9274.
- Income: question 384 has a hidden Signal column that tints the whole row (green when the change is good for profit, red when bad; a rise in Expenses or Write-offs is red). Question 385 series colours are Income #178F8A, Expenses #D6816B, Write-offs #9B2C2C, Net profit #84BB4C. New question 420 `income.expense-detail-desc` (a copy of 212, newest first) on dashcard 9289.
- Cashflow: question 386 is a waterfall (increase #13855B, decrease #D1495B, total #267DCC, total shown). New question 421 `cashflow.transactions-desc` (a copy of 196, newest first) on dashcard 9300.
- The four tabs were rebuilt through `build_design.py`, `layout.json` and `ProposedLoanReports.mjs --refine`. Dashcard ids changed on those tabs; 224 other placements are identical. The dashboard now has 229 placements and 30 new questions.
- Owner question answered in chat: "Modified plans" (question 270, Borrower Health) counts borrowers with at least one active loan on a modified schedule (auto-charge off, at least 7 observed days, at least 2 expected dates, 30-day interest or charge-date coverage below 80%; V42).
- Records: dictionary `dashboards/loan-reports-proposed.yaml` (counts, new question ids and records, layout regenerated from `saved.json`, presentation text), question records for 380, 381, 384, 385, 386 updated and 419, 420, 421 added; the records for 416 (income.writeoffs) and 418 (income.latecharges), missing since R116 and R118, were added; `index.json` rebuilt; `unresolved.yaml`, `Development_Changes.md` and `project/scripts/metabase/README.md` updated.
- Owner feedback rounds, 9 November 2026 ("Today: progress bar, not text"; "Income: expenses and write-offs red and negative, income and net profit green, formula must make sense"), later in the same day:
  - Today: questions 380 and 381 are one-row stacked bars (Received or Paid green #067647, Remaining #D9DEE5) with the dimension label "x of n · y%". Metabase 0.63 cannot hide the legend (also dashcard 9308).
  - Later on 9 November 2026 the owner asked for the numbers below the bar so the bar looks longer. Questions 380 and 381 are now Metabase native progress with the goal taken from a column (supported on v0.63, which corrects the note above that a progress goal must be static): amount above the bar, "Goal n" below, full card width, no percent, unfilled part a lighter green set by the viz. `ProposedLoanReports.mjs --verify` 35 of 35 (the first run had 11 transient failures while live payments changed values; the re-run passed), `DecommissionLoanReports.mjs --verify` 10 of 10, `node --test` 29 of 29 (Byte).
  - Income band: questions 392 and 416 show costs as -abs in red #D1495B; titles "Income", "+ Expenses", "+ Write-offs", "= Net profit"; header "Net profit = Income + Expenses + Write-offs (costs negative)".
  - Question 384: costs negative, Net profit is the sum, Change % = change / abs(previous), column rules red below 0 and green above 0 (the Signal column is dropped).
  - Question 385: grouped bars, all labelled, costs negative, Net profit a line #84BB4C without labels, legend order Income, Expenses, Write-offs, Net profit. Question 420: Expenses negative.
  - New question 422 `income.daily-signed` replaces question 213 (archived with `--followup=213`); new question 423 `income.expense-categories-signed` (negative red bars) replaces question 178 (archived). The dashboard now has 32 new questions.
- Dashboard 3 and questions 210, 196, 212 and 203 are not changed by the first round (dashboard 3 and 196, 210, 212 are archived later by the [decommission](CHANGE_NOTES_LOAN_REPORTS_DECOMMISSION_2026-11-09.md)). Byte saved a fresh private dashboard 3 baseline outside the repository.

## Checks
| Command | Result |
| --- | --- |
| `ProposedLoanReports.mjs --verify` | Pass, 32 of 32 (Byte) |
| `node --test` | Pass, 29 of 29 (Byte) |
| `node --check`, `py_compile` | Pass (Byte) |
| `ProposedLoanReports.mjs --verify` after the feedback rounds | Pass, 35 of 35; `DecommissionLoanReports.mjs --verify` 10 of 10; `node --test` 29 of 29 (Byte) |
| Chase, feedback rounds | Questions 380 and 381 executed, Received + Remaining equals the model 73 totals; SQL signs of 384, 385 and 422 correct, no double negation |
| Echo, pass 3 | Must-fixes TD-03, IN-03, IN-04 and IN-06 resolved at 1440 px and 390 px |
| `dictionary.py index` and `validate` | Pass |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |
| Chase read-only verification on live Metabase | No defects. Questions 380 and 381 executed ("49,036 of 336,168 (14.6%)", "3,700 of 9,125 (40.5%)"), matching `olap_portfolio_summary`. Signal (384), the sign split (419), the descending order (420, 421) and the waterfall settings (386) verified statically from live SQL and settings. Questions 210, 196, 212 and 203 still show their September update dates; dashboard 3 unchanged. Repository diff (commit `ca58bf3`) holds no secrets or personal data and no new baseline files. |

## Not run
No row-level execution of questions 384, 419, 420, 421 and 386: the Metabase tools cannot execute card-reference queries. No browser render check is recorded in this note.

## Recovery
Re-run `ProposedLoanReports.mjs --refine` from the previous `layout.json` (Git before `ca58bf3`) for the four tabs. Dashboard 3 is the canonical copy and the homepage setting can go back to 3.

## Open questions
None.

## Remaining work
The formal cutover closure of dashboard 3 stays a separate decision.
