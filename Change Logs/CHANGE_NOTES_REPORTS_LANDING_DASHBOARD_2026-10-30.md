# Change notes — Reports landing page switched to the proposed dashboard, 30 October 2026

## Purpose
The owner asked to "change the DNS to point the dashboard CNAME to the new dashboard". Finding: no DNS record points at a dashboard (ecosystem-dns manages only the alerts, charts, hooks, monitor and reports CNAMEs, and reports points at Railway Metabase). `reports.mw-credit.com` lands on dashboard 3 because of the Metabase setting `custom-homepage-dashboard`. The owner chose "switch for everyone", so the setting now points at dashboard 32.

## Changes
- Metabase setting `custom-homepage-dashboard` changed from 3 to 32 through the administrator API (`custom-homepage` stays true). No DNS or Terraform change.
- Collection 10 "Loan Reports · proposed" was at the root, because Metabase ignores `parent_collection_id` on create; it is now under collection 5 (location `/5/`).
- Loan Report Partners (2 members) were granted read on collection 10, as they have on collections 5 and 8 (collection graph revision 6 to 7). Administrators keep write.
- `project/scripts/metabase/ProposedLoanReports.mjs`: `--publish` now sends `parent_id`.
- Records: the dictionary record `dashboards/loan-reports-proposed.yaml` (landing status, collection parent, access, known gap), the pointer in `dashboards/loan-reports.yaml`, `project/Documents/Environment_Inventory.md`, `project/scripts/metabase/README.md`, `project/Documents/Development_Changes.md`.
- Follow-up, 30 October 2026: at the owner's request ("remove the SELECT 1 card from dashboard 32") question 276 was removed from the Data health tab (question 257 "Queried at · Bangkok" is now 24 by 3). Before that, the R102 hand edits (long-overdue lane 414, five-lane board, lane re-tile) were ported into `build_design.py` so regeneration reproduces the applied layout. Applied with `--refine --only=data-health`; dashboard 32 has 227 dashcards and no 276; `--verify` passes. Counts are 227 placements, 152 reused questions, 25 new questions.
- Dashboard 3 guard baseline renewed by hand to the live 274 dashcards, because R102's `--rebaseline-dashboard3=R102` step needs R102's private state, which this session does not have. The difference from the 26 October baseline was limited to tab 19 (lane cards 412 and 413 added, eight lanes re-tiled) and the collection-detail-status filter, i.e. R102 only. The old baseline is kept privately as `dashboard-3-before-pre-r102.json`. For the verifier's lane checks a private reference file gives lane ids 412 and 413 (from `outputs/r025-20260924/state.json`).
- Dashboard 3 is not changed by this batch. It stays reachable by link and remains the recovery and canonical copy until the cutover in `PLAN.md` section 7 is formally closed.

## Checks
| Command | Result |
| --- | --- |
| Administrator API read of the setting | Reads 32 |
| Browser opening `https://reports.mw-credit.com/` | Lands on `/dashboard/32` |
| Collection 10 location and permission graph | Location `/5/`; partners read, revision 7 |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
No partner sign-in was tested. A private baseline of the settings, collection and permission graph was saved outside Git.

## Recovery
Set `custom-homepage-dashboard` back to 3. Optionally revoke the partner read on collection 10.

## Open questions
- The long-overdue lane (question 414) on dashboard 32 copies question 241's tint rule (status = 'Overdue'), which never matches its rows, so that lane has no row tint. A one-line fix is available; the owner decides.
- Resolved: question 276 (the SELECT 1 card) is removed from dashboard 32. Resolved: the dashboard 3 baseline is renewed to 274 dashcards (see Changes).

## Remaining work
The owner's decision on the long-overdue lane tint; the formal cutover closure (rename or retire dashboard 3) is still a separate decision.
