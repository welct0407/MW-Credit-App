# Change notes — Loan Reports redesign design package, 26 October 2026

## Purpose
The owner reviewed the Metabase Loan Reports pages and asked for a detailed design of every proposed tab plus the project design and plan artifacts, so another session can build a parallel dashboard for side-by-side review. This batch delivers the design package; it changes nothing in Metabase or the database.

## Changes
- `project/outputs/loan-reports-redesign-20261026/`: `README.md` (index), `REVIEW.md` (page-by-page review and enhancement plan), `DESIGN.md` (principles, filter semantics, reuse policy, generated per-tab card tables), `layout.json` (installer specification: 12 tabs, 22 filters, 10 new questions, 240 placements, 183 reused saved questions), `build_design.py` (the single specification that generates the two files), `PLAN.md` (installer, verification, data dictionary, records, review and cutover boundary).
- Inputs read live through the Metabase API with the administrator key from Secret Manager: dashboard 3 definition, the 196 card definitions and the 25 model field lists. No data rows were read for the design; definitions and screenshots stay outside Git.
- Prototype boards published as a private Claude Design canvas with illustrative figures.

## Checks
| Command | Result |
| --- | --- |
| `python3 -I project/outputs/loan-reports-redesign-20261026/build_design.py` | Pass: 12 tabs, 240 placements, 22 parameters, 183 reused questions, 10 new questions |
| Grid validation of `layout.json` (no overlapping or out-of-grid cells per tab) | Pass: 0 conflicts on all 12 tabs |
| Reused card ids against the live card list | Pass: 182 present on dashboard 3 on 26 October 2026; question 276 is the monitoring probe in collection 9 |
| `npm run check:docs` | Pass |

## Not run
- No installer exists yet; nothing was published to Metabase.
- No dictionary record was added; the plan reserves that for the build batch (owner-approved by the instruction to update the dictionary during execution).

## Recovery
Delete the folder and this note; Git baseline `abc9786` on `claude/metabase-admin-key-secret`.

## Open questions
- The six design points listed in `PLAN.md` step 6.3 (shared Period on the borrower pages, the Income waterfall, question 64 on Collection, the gauge on two tabs, the unplaced Risks cards, the Data health card list). They do not block the build; Archie resolves them with the owner first.
- Under which release number the build is opened.

## Remaining work
The build itself, per `PLAN.md`, in another session.
