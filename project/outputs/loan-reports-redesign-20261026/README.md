# Loan Reports redesign — design and plan, 26 October 2026

Owner-requested design package for the proposed Loan Reports pages, to be built as a parallel Metabase dashboard for review and comparison. Design only; nothing in Metabase or the database was changed by this package.

| File | What it is |
| --- | --- |
| [REVIEW.md](REVIEW.md) | The page-by-page review of the live dashboard and the enhancement plan that led to the design |
| [DESIGN.md](DESIGN.md) | Detailed design: principles, filter semantics, reuse policy, and the generated per-tab card tables and new-question definitions |
| [layout.json](layout.json) | Machine-readable specification the installer reads: dashboard, 22 filters with the dashboard-3 ids they replace, 10 new questions, 12 tabs with 240 placements |
| [build_design.py](build_design.py) | The single source of the specification; regenerates `layout.json` and the generated section of `DESIGN.md` |
| [PLAN.md](PLAN.md) | Execution plan for the build session: installer, verification, data dictionary updates, records, review and cutover boundary |

Prototype boards (illustrative figures, not live data): [Loan Reports Redesign canvas](https://claude.ai/artifact/Tc1u8rq11FLfhiAb2rbvut).

Inputs: the live definition of dashboard 3 read through the Metabase API on 26 October 2026 (12 tabs, 28 filters, 272 placements, 196 cards), the model field lists of the 25 governed models, the dashboard dictionary record [loan-reports.yaml](../../Documents/Data%20Dictionary/systems/metabase/dashboards/loan-reports.yaml) and the release evidence folders under `project/outputs/`. Live definitions and screenshots stay outside Git.

Build record: none yet; the build session appends `state.json`, `saved.json` and the verification files here.
