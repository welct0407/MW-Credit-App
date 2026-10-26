# Loan Reports redesign — execution plan

26 October 2026. How the next session builds the proposed pages as a **parallel dashboard** for owner review and comparison, from the [detailed design](DESIGN.md) and [layout.json](layout.json). Nothing in this plan edits the live `Loan Reports` (dashboard 3).

## Outcome

A second dashboard, `Loan Reports · proposed`, in a new sub-collection `Loan Reports / Loan Reports · proposed`, with the 12 tabs, 22 filters and 240 placements of the design: 183 reused saved questions placed by id, 10 new questions saved in the sub-collection, the matrix iframe copied from the live dashcard. The owner opens both dashboards side by side; feedback is applied with a scoped `--refine`; cutover is a separate decision.

## Authority and prerequisites

- Owner instruction of 26 October 2026: create the detailed design and plan, then rebuild a parallel dashboard outside the existing one for review and comparison, reusing the existing data model and questions, with the data dictionary updated during execution. That instruction authorizes the additive Metabase objects, the new dictionary records and the records below. It does not authorize editing dashboard 3, any model, snippet, view or migration, or any cutover.
- Metabase administrator API key 3 from Secret Manager `mw-metabase-admin-api-key`, read by `ReportingApi.mjs` (branch `claude/metabase-admin-key-secret`, commit `abc9786`; merge it or run on VM-01).
- Open the build under the current Open release or the next number, as the [release tracker](../../Documents/Release_Tracker.md#current-development-release) rules say; the record pattern is the R044 Partners tab ([outputs/r044-partners](../r044-partners/README.md)).
- Team: this is PWA product development, so the six-agent process applies. Archie closes the open design points below and writes the test plan; Byte writes the installer and the ten new questions; Chase runs the verifier and the browser checks; Dewey keeps the dictionary, change note and release records; Echo reviews the phone layout of Today and Collection on the built dashboard; Forge is not needed unless Secret Manager access changes.

## Steps

### 1 · Prepare (read-only)

1. Capture the full live definition of dashboard 3 (dashcards, tabs, parameters) and the 183 reused cards privately outside Git, as the installers do today (`priv` directory). This is the comparison baseline and the source of every copied parameter mapping.
2. Confirm the 183 reused card ids in `layout.json → summary.reused_questions` still exist and are unarchived; confirm live dashcard 1501 still carries the matrix iframe.
3. Create `project/outputs/loan-reports-redesign-20261026/state.json` on first publish only; the installer refuses to publish again while it exists.

### 2 · Installer `project/scripts/metabase/ProposedLoanReports.mjs`

Same shape as `PartnersTab.mjs` and `ForecastPlanning.mjs`: `--plan`, `--prepare`, `--publish`, `--refine --only=...`, `--verify`, importing `ReportingApi.mjs`. It reads `layout.json` and:

1. Creates the sub-collection (parent 5) once and records its id in `state.json`.
2. Saves the ten new questions from `layout.json → new_questions` into the sub-collection. Byte writes each as MBQL on the named model or native SQL copied from the named pattern question (203, 207, 217–219, 331, snippet 2), keeping the pattern's template tags, grain and date rules; descriptions name the origin. No query touches a base table.
3. Creates the dashboard with the 22 parameters. Static value lists marked `copy` are copied from the dashboard-3 parameter; card-sourced lists keep the same source card (199, 277, 77, 324).
4. Creates the 12 tabs in `tabs` order and every placement. For `reuse_card_id` it copies the card's live dashcard `parameter_mappings` from the baseline, substituting the new parameter id through `parameters[].replaces`, and keeps only the mappings the placement's `params` list names; for `new_question` it maps the question's own template tags; for `copy_dashcard: 1501` it copies that dashcard's `visualization_settings` verbatim at run time; `title` becomes `card.title` on the placement; virtual cards become heading/text dashcards.
5. Applies the presentation overrides the design allows (goal lines on the two Today charts, column order and sort on 275 and the lane tables, phone column sets), nothing else.
6. Sets click behaviour on borrower names (289, lane tables, category table) to the new dashboard's Borrower Detail tab with the `borrower` and `period` parameters, mirroring today's R043 links.
7. Writes `state.json` (object ids) and a sanitized `saved.json` (definitions, no data rows) in this folder; private copies and screenshots stay outside Git.

### 3 · Verification `--verify` and `VerifyProposedLoanReports.mjs`

| Check | Expectation |
| --- | --- |
| Structure | 12 tabs, 240 placements, 22 parameters; every placement in `layout.json` has a live dashcard with the same row, col, size and card |
| Mapping parity | For each reused card, the live mapping targets equal the dashboard-3 targets after id substitution; the Collection lanes map nothing; 64 on Collection maps nothing |
| Execution | Every dashcard runs through the dashboard query endpoint with default filters, with no error, for each tab |
| Reused values | For ten sampled reused cards per tab, the value with default filters equals the dashboard-3 value at the same moment (same question, same mapping) |
| `today.principal-smart` | Latest value equals question 62's last completed day; change equals the difference to the first day of the period |
| `today.realization` | Equals Realized Profit MTD ÷ Projected Monthly Profit from questions 51 and 52 |
| `today.collection-rate` | Equals Amount Collected Today ÷ Amount Due Today from model 73; on Collection it matches 237 against the model's due amount |
| `cash.pool-selected`, `cash.principal-selected` | Today equals questions 47 and 48; a past date equals model 205 for that date; a date before openings is blank |
| `income.vs-previous` | This-period row equals 168, 169, 170 and 171 for the same period; previous row equals the same questions with the preceding period set by hand |
| `income.monthly` | Each month's income and expenses equal the sum of question 213's rows for that month |
| `cashflow.by-type-row` | Row set equals question 203 for three period/account cases |
| `perf.vs-previous` | This-period row equals 217, 218, 219; previous row equals them with the preceding period set by hand |
| `partners.capital-share-row` | Rows equal question 331 |
| Preservation | Dashboard 3 dashcards, tabs and parameters are byte-equal to the baseline after every publish and refine |
| Browser | Desktop screenshots of all 12 tabs and 390 px screenshots of Today and Collection, stored privately; Echo's review notes coded in the change note |

Financial values never enter Git; the sanitized verification file records pass/fail and counts only.

### 4 · Data dictionary (same batch as the publish)

The owner's instruction covers these new dictionary files; no further approval is needed.

1. Add `project/Documents/Data Dictionary/systems/metabase/dashboards/loan-reports-proposed.yaml` with the same envelope as `loan-reports.yaml`: identity `Loan Reports · proposed / <id>`, verification source `outputs/loan-reports-redesign-20261026/saved.json`, content with `dashboard_id`, `collection_id`, `tabs`, `parameters` (with `replaces`), `layout` per tab and the design reference. Record the parallel status and that dashboard 3 remains canonical.
2. Add one `questions/proposed-<key>.yaml` per new question with its saved definition (name, display, dataset_query, visualization_settings, description) and the basis model, following `borrower-health-active.yaml`.
3. Update `loan-reports.yaml` only with a one-line `parallel_review` pointer; its content stays the live definition.
4. Update `unresolved.yaml → REPORTING-COVERAGE` to say the proposed dashboard is fully recorded and that dashboard 3 coverage is unchanged.
5. Rebuild the index and validate: `python scripts/dictionary/dictionary.py index` and `validate`. Run `npm run check:docs`.

### 5 · Records

- One change note under `Change Logs/` with the template; the release row and `Development_Changes.md` entry per the workflow; `project/scripts/metabase/README.md` gains the installer paragraph (publish once, refine scoped, verify, never replay publish).
- This folder gains `state.json`, `saved.json`, `verification.json`, `browser-verification.json` (all sanitized) and a README section "Build record".

### 6 · Review and comparison

1. The owner opens dashboard 3 and the proposed dashboard in two tabs, page by page, with the same filters. The comparison checklist: same numbers for the same question; faster first screen; fewer clicks to the daily answers; readable on the phone.
2. Feedback goes into `--refine --only=<tab or card keys>`; each refine re-runs `--verify`.
3. Open design points for Archie before the build, decided with the owner where they change behaviour:
   - `period` is one filter for Borrowers and Borrower Detail, so the comparison click-through no longer needs to carry a date range. Confirm.
   - The Income waterfall (204) is dropped in favour of the equation band and the monthly chart. Confirm, or keep it below the monthly chart.
   - Question 64 (overdue charges trend) sits on Collection with its fixed window and no filter. Confirm.
   - The utilization gauge (68) appears on Today and Cash Position. Confirm, or Today only.
   - Risks: 112, 113 and 118 are not placed (duplicates of 285, the status split in 114/115, and the comparison table). Confirm.
   - Data health lists 20 cards; confirm none should stay on its page.

### 7 · Cutover (not part of this build)

After acceptance the owner decides between renaming the proposed dashboard to replace dashboard 3 (keeping dashboard 3 as a recovery copy, as R050 did with dashboard 26) and migrating tab by tab. Either path needs its own change note, the dictionary swap and the link updates on charts and in the scripts README.

## Definition of done for the build

1. `--verify` passes every row of the table above and dashboard 3 is byte-equal to its baseline.
2. Dictionary records added, index rebuilt, validation and `npm run check:docs` pass.
3. Change note and release records pushed; the proposed dashboard link and the comparison checklist handed to the owner.

## Recovery

Archive the proposed dashboard and its sub-collection (recoverable in Metabase); the reused questions are untouched. Delete the ten new questions only after archiving the dashboard. Remove the dictionary records and rebuild the index. Dashboard 3 needs no recovery because it is never written.
