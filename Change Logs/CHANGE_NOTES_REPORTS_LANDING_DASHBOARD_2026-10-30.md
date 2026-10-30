# Change notes — Reports landing page switched to the proposed dashboard, 30 October 2026

## Purpose
The owner asked to "change the DNS to point the dashboard CNAME to the new dashboard". Finding: no DNS record points at a dashboard (ecosystem-dns manages only the alerts, charts, hooks, monitor and reports CNAMEs, and reports points at Railway Metabase). `reports.mw-credit.com` lands on dashboard 3 because of the Metabase setting `custom-homepage-dashboard`. The owner chose "switch for everyone", so the setting now points at dashboard 32.

## Changes
- Metabase setting `custom-homepage-dashboard` changed from 3 to 32 through the administrator API (`custom-homepage` stays true). No DNS or Terraform change.
- Collection 10 "Loan Reports · proposed" was at the root, because Metabase ignores `parent_collection_id` on create; it is now under collection 5 (location `/5/`).
- Loan Report Partners (2 members) were granted read on collection 10, as they have on collections 5 and 8 (collection graph revision 6 to 7). Administrators keep write.
- `project/scripts/metabase/ProposedLoanReports.mjs`: `--publish` now sends `parent_id`.
- Records: the dictionary record `dashboards/loan-reports-proposed.yaml` (landing status, collection parent, access, known gap), the pointer in `dashboards/loan-reports.yaml`, `project/Documents/Environment_Inventory.md`, `project/scripts/metabase/README.md`, `project/Documents/Development_Changes.md`.
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
- Question 276 ("Reporting connection · SELECT 1", collection 9 monitoring) on the Data health tab is not readable by partners, who see a permission notice on that card. Remove it from dashboard 32 or leave it admin-only?
- Dashboard 3 has 274 dashcards against the 272 baseline of 26 October 2026: the R102 Long overdue lane (28 October 2026, lane cards 412/413 on dashboard 3 and lane 414 on dashboard 32; [R102 change note](https://github.com/welct0407/MW-Credit-App/blob/cf01602/Change%20Logs/CHANGE_NOTES_R102_AGED_OVERDUE_AND_CLAUDE_CHAT_2026-10-27.md)) added them, and `ProposedLoanReports.mjs` gained a rebaseline step then. Use that step before the next `--refine` or `--verify`.

## Remaining work
Re-capture the dashboard 3 baseline; the owner's decision on question 276; the formal cutover closure (rename or retire dashboard 3) is still a separate decision.
