# Change notes — Loan Reports decommission, 9 November 2026

## Purpose
The owner asked to update the question, "decommission the old dashboards" and "update the chart service default too". Dashboard 32 becomes the only Loan Reports dashboard. Everything is archived, not deleted.

## Changes
- Metabase, through `project/scripts/metabase/DecommissionLoanReports.mjs`: dashboards 1 to 31 archived (dashboard 1 already was); dashboard 3 renamed "Loan Reports · retired 2026-11-09"; 94 questions placed only on those dashboards archived; no model archived by the first step (27 models checked).
- Dashboard 32 renamed "Loan Reports" and collection 10 "Loan Reports · dashboard"; `custom-homepage-dashboard` stays 32. Kept copies 419, 420 and 421 replace the archived originals 210, 212 and 196.
- At the owner's request ("archive the three unused models too") Byte archived models 76 Partner Outlook, 319 Partners · capital source and 320 Partners · earnings source with the new `--models` step; a live re-check found no active question, dashboard 32 card or filter, chart `query.sql`, question 276, subscription or alert using them. 24 models remain active. The evidence file records before false and after true and the unarchive list.
- Later the same day questions 213 and 178 were archived (`--followup=213`, and 178) after the owner-feedback copies 422 and 423 replaced them (see the [presentation note](CHANGE_NOTES_LOAN_REPORTS_PRESENTATION_2026-11-09.md)); the unarchive lists in the evidence file cover them.
- UX fixes on dashboard 32: dashcard 9334 titled "Transactions · newest first", 9308 legend off, 9322 Income colour #178F8A.
- `ProposedLoanReports.mjs`: the guard now asserts dashboard 3 is archived; `--rebaseline-dashboard3` removed.
- Chart service: `chart.js` default `detail` is 32:382 and the legacy dashboard 3 link format is removed (sha256 `0069bbf3e2c14ab95f77e8db737c7837cdabb268bbe0bae51b00a663085e1ece`).
- Chart deploy by Forge on `vm-mw-credit-agent`: IAP SSH as `codex-cloud` through `/usr/local/bin/mw-debian-ssh`, hostname verified, the three files matched the inventory before the copy; `/opt/mw-report-charts/chart.js` installed root:root 0644, no restart; previous `chart.js`, `chart.css` and `index.html` kept in `/opt/mw-report-charts/recovery-decommission-20261109/`.
- Records: dictionary `loan-reports.yaml` (retired) and `loan-reports-proposed.yaml` (canonical, name "Loan Reports / 32"), a `retired` note on the 17 archived questions that have records, status text on the 30 dashboard 32 question records, `index.json`; `Environment_Inventory.md` (Metabase row, chart line, landing text); `project/scripts/metabase/README.md` (decommission, retired Refine scripts, historical rebaseline notes, chart default); `project/outputs/r030-custom-matrix/README.md` (default detail); `Release_Tracker.md` (R137 scope); `Development_Changes.md`; docstring of `chart_service/preview.py`.
- `Refine-WriteOffSegregation.mjs` and `Refine-LateCharges.mjs` are marked retired: their own `--verify` fails now that questions 415 and 417 are archived.
- Evidence: `project/outputs/loan-reports-redesign-20261026/decommission-2026-11-09.json`. A private baseline is kept outside Git as `loan-reports-decommission-20261109`.

## Checks
| Command | Result |
| --- | --- |
| `DecommissionLoanReports.mjs --verify` | Pass, 10 checks (archived flags, names, homepage, no active card depends on an archived one, no model archived, copies 419 to 421 active, matrix iframe 200 with 30 rows) (Byte) |
| Chase read-only review | No defects. Cards 49, 56, 379, 380 and 381 executed; none of 153 dashboard 32 card references is archived; question 276 and models 76, 319, 320 not archived; rollback lists match 94 questions and 30 dashboards; evidence file clean |
| Chart deploy checks (Forge) | Shell 200; served `chart.js` hash matches and contains `32` and `382`; unauthenticated `/api/matrix` 401 |
| `DecommissionLoanReports.mjs --verify` after `--models` | Pass, 10 of 10 (24 models remain active); `ProposedLoanReports.mjs --verify` 32 of 32; `node --test` 29 of 29 (Byte) |
| `dictionary.py index` and `validate` | Pass |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
The archived flags and the homepage were confirmed only through Byte's `--verify`; the Metabase tools used by Chase do not expose them. The UX fixes were verified by `--verify` only, with no browser render recorded.

## Recovery
Unarchive the lists in the evidence file (`PUT card/{id}` and `PUT dashboard/{id}` with `{"archived": false}`), put the three renames back, and restore any dashcard Metabase dropped from the private baseline. Chart: copy the three files from `/opt/mw-report-charts/recovery-decommission-20261109/` back to `/opt/mw-report-charts/`; no restart.

## Open questions
None.

## Remaining work
None for this batch.
