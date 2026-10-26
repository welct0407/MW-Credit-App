# Loan Reports redesign — design, plan and build, 26 October 2026

Owner-requested design package for the proposed Loan Reports pages, to be built as a parallel Metabase dashboard for review and comparison. The design files below changed nothing in Metabase or the database; the parallel dashboard built from them is described in the [Build record](#build-record).

| File | What it is |
| --- | --- |
| [REVIEW.md](REVIEW.md) | The page-by-page review of the live dashboard and the enhancement plan that led to the design |
| [DESIGN.md](DESIGN.md) | Detailed design: principles, filter semantics, reuse policy, and the generated per-tab card tables and new-question definitions |
| [layout.json](layout.json) | Machine-readable specification the installer reads: dashboard, 22 filters with the dashboard-3 ids they replace, 10 new questions, 12 tabs with 240 placements |
| [build_design.py](build_design.py) | The single source of the specification; regenerates `layout.json` and the generated section of `DESIGN.md` |
| [PLAN.md](PLAN.md) | Execution plan for the build session: installer, verification, data dictionary updates, records, review and cutover boundary |

Prototype boards (illustrative figures, not live data): [Loan Reports Redesign canvas](https://claude.ai/artifact/Tc1u8rq11FLfhiAb2rbvut).

Inputs: the live definition of dashboard 3 read through the Metabase API on 26 October 2026 (12 tabs, 28 filters, 272 placements, 196 cards), the model field lists of the 25 governed models, the dashboard dictionary record [loan-reports.yaml](../../Documents/Data%20Dictionary/systems/metabase/dashboards/loan-reports.yaml) and the release evidence folders under `project/outputs/`. Live definitions and screenshots stay outside Git.

## Build record

Built on 26 October 2026 as a parallel dashboard; the live Loan Reports (dashboard 3) is canonical and was not changed. Installer: [ProposedLoanReports.mjs](../../scripts/metabase/ProposedLoanReports.mjs). Record: [change note](../../../Change%20Logs/CHANGE_NOTES_LOAN_REPORTS_PROPOSED_DASHBOARD_2026-10-26.md), dictionary [loan-reports-proposed.yaml](../../Documents/Data%20Dictionary/systems/metabase/dashboards/loan-reports-proposed.yaml). Metabase: sub-collection 10, dashboard 32, new questions 379 to 388.

| File | What it is |
| --- | --- |
| [state.json](state.json) | Ids of the published collection, dashboard, tabs and new questions |
| [saved.json](saved.json) | Sanitized saved definitions: tabs, parameters, new questions and all 240 placements (the matrix iframe key is redacted) |
| [verification.json](verification.json) | Result of `--verify`: 17 of 17 checks passed, no financial values published |

Deviations from the design (one row per measure on the vs-previous tables, 29 periods ago on principal, no TOTAL row on the cash movement bars, Capital share % plotted, native date routing for the selected-date cash cards, placement settings not applied) are listed in the change note. Browser screenshots were not possible from the cloud session; the owner reviews in their browser.
