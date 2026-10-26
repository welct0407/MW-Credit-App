# Change notes — Loan Reports proposed dashboard build, 26 October 2026

## Purpose
Owner instruction of 26 October 2026: follow the design and plan and create a parallel Metabase dashboard so the owner can compare and evaluate it against the existing Loan Reports (dashboard 3), carried end to end. This batch builds and verifies that dashboard in PROD Metabase (reporting is read-only, source database 2 `loan_manager_prod`) and records it. Dashboard 3 stays canonical and was not changed.

## Changes
- Metabase PROD (`reports.mw-credit.com`): sub-collection 10 "Loan Reports · proposed" under collection 5; dashboard 32 "Loan Reports · proposed" with 12 tabs, 22 parameters and 240 placements (183 placements of 171 reused saved questions, 10 new questions 379 to 388, 45 text and heading cards, 1 matrix iframe copied at run time from dashboard 3 dashcard 1501; its key is redacted in `saved.json` and never in Git). Ids are in `project/outputs/loan-reports-redesign-20261026/state.json`.
- `project/scripts/metabase/ProposedLoanReports.mjs`: the installer (`--plan`, `--prepare`, `--publish`, `--refine --only=<question key|tab key>,...`, `--verify`). Publish runs once and refuses to replay while `state.json` exists; refine is scoped and re-guards dashboard 3; every run asserts dashboard 3 equals the private baseline (directory set with `MW_METABASE_PRIVATE_DIR`, outside Git).
- `project/outputs/loan-reports-redesign-20261026/`: `state.json` (ids), `saved.json` (sanitized definitions), `verification.json` (result of `--verify`); README gains the Build record.
- Data dictionary: new `dashboards/loan-reports-proposed.yaml` (tabs, parameters with `replaces`, layout per tab, parallel status), ten `questions/proposed-<key>.yaml` records, a `parallel_review` pointer in `dashboards/loan-reports.yaml`, the `REPORTING-COVERAGE` text in `unresolved.yaml`, and the rebuilt `index.json`.
- `project/scripts/metabase/README.md` (installer paragraph) and `project/Documents/Development_Changes.md` (one row). No release number is allocated: this is Metabase reporting with no application, database or infrastructure change, so it rides the Open release R102 and the tracker is unchanged.
- Implementation decisions and deviations from `DESIGN.md`:
  1. `income.vs-previous` and `perf.vs-previous` are one row per measure with the columns This period, Previous period, Change and Change %, instead of two period rows and a change row, so each column has one unit; the previous period is blank when it would start before the reporting calendar.
  2. `today.principal-smart` compares with 29 periods ago (the first day of the default 30-day Period) instead of 30.
  3. `cashflow.by-type-row` drops question 203's TOTAL row so the bars stay readable.
  4. `partners.capital-share-row` adds "Capital share %" (each row's share of question 331's rows) as the plotted value.
  5. `cash.pool-selected` and `cash.principal-selected` are native queries with snippet 4's date routing written out (snippet 4 does not output Total Cash Pool or Outstanding Principal): today reads model 73, a past date reads model 205, a date before the first snapshot is blank.
  6. Reused placements copy the dashboard 3 visualization settings (formatting, click behaviour) with the design title; borrower links go to dashboard 32's Borrower Detail tab with `borrower` and `period`; Today attention chips link to the dashboard 32 tab that holds the same card; goal lines are 120,000 (question 62) and 10,000 (question 222); question 275 column order is Category, Borrower, Score, Contribution, Schedule.
  7. Not applied, because Metabase cannot set them on a placement without editing saved questions: lane-table sort by amount and phone-specific column sets.
  8. The six open design points of `PLAN.md` section 6.3 were built as the design proposes and stay open for the owner's review.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/metabase/ProposedLoanReports.mjs --verify` | Pass, 17 of 17 checks (`verification.json`, 26 October 2026): structure (12 tabs, 240 placements, 22 parameters); mapping parity 183 of 183; collection lanes and question 64 map nothing, 64 unmapped; 194 dashcards executed with default filters, 0 errors; 111 sampled reused values equal dashboard 3; the ten new-question reconciliations; 25 links all target dashboard 32; dashboard 3 unchanged (272 dashcards, 12 tabs, 28 parameters) |
| `python3 project/scripts/dictionary/dictionary.py --root "project/Documents/Data Dictionary" index` then `validate` | Pass: 449 documents, 0 errors |
| `npm run check:docs` | Pass: 0 failures, 0 warnings on the working tree over `cf71e79` |

## Not run
- Browser screenshots: the cloud session has no Metabase UI login, so the owner reviews in their browser. `browser-verification.json` named in the plan is not produced.
- Chase's API filter checks and Echo's phone review: results are added here when received.
- Models, snippets, views and migrations were not touched, so no database test applies.

## Recovery
Archive dashboard 32 and sub-collection 10 in Metabase (recoverable), then archive questions 379 to 388. Remove the dictionary records and `state.json`, `saved.json`, `verification.json`, rebuild the index. Dashboard 3 needs no recovery because it was never written. Git baseline `cf71e79`.

## Open questions
- The owner's comparison of dashboard 32 with dashboard 3 and the six design points of `PLAN.md` section 6.3 (shared Period on the borrower pages, Income waterfall dropped, question 64 on Collection, the gauge on two tabs, the unplaced Risks cards, the Data health card list).
- Cutover (rename to replace dashboard 3 or migrate tab by tab) is not part of this build and needs its own decision and change note.

## Remaining work
Add Chase's and Echo's results to this note; apply the owner's feedback with `--refine --only=...` and rerun `--verify`; then the owner's cutover decision.
