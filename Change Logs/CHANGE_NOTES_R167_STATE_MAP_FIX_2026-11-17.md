# Change notes — Grafana state value map fix (R167), 17 November 2026

## Purpose
Fix the R166 known issue: on 17 November 2026 tile 26 "Group chat · last run" showed "Run took: Down" beside "Last run: OK". Owner approval of 17 November 2026: "Yes, fix and apply to prod."

## Changes
- Cause (Forge, from the R166 change note): the tile's panel-level default value map (0 Down to 4 Unknown) still applies in Grafana 13.4 to the duration fields despite their own mapping overrides, so durations of 0 to 4 s render as state words. The data was correct.
- `project/scripts/monitoring/dashboards/agent.cjs`: tiles 26 "Group chat · last run" and 6 "Recognizer · service" keep only null to "No report" in the panel defaults; the state words 0 to 4 move to a by-name override on the `State` field (tile 26) and the `Service` field (tile 6), through a `stateField()` helper.
- `project/scripts/monitoring/dashboards/lib.cjs`: `DASHBOARD_RELEASE` is `R167`, so all five dashboards are regenerated (`infrastructure/grafana/dashboards/mw-{agent,now,pwa,infra,cost}.json`); only the `mw-agent` panels 6 and 26 change in substance, and the other four change by the release tag only.
- Other panels checked by Byte, none affected: Now 17 and Agent 11 (provider status) and PWA 2 (API health), where every field is a state; PWA 1, PWA 32 and Agent 13, with one state field; Now 7 and PWA 22, where the -1 and -2 job codes on ages are intentional.
- `project/scripts/monitoring/test_build_dashboards.cjs`: a new build test.
- Not changed: the agent, collector, alert rule, SQL, Cloud Run and Hosting.
- Documents (Dewey): `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md` and `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (panels 6 and 26). The Environment Inventory and Data Dictionary are unchanged until the PROD apply is recorded at closure.

Data rules: no borrower data, chat text or secrets are recorded here.

## Checks
| Command | Result |
| --- | --- |
| `npm run test:monitoring` (base `main` `8855799b`, uncommitted tree) | Exit 0, including the new build test, which flags any stat panel that maps the state words 0 to 4 in its defaults while it has non-state fields. Run against the R166 dashboard it flags exactly tiles 6 and 26 (Byte) |
| `npm run lint` | Pass; one old warning or info in old tests (Byte) |
| `node scripts/promotion/component-versions.mjs check-source` | OK: Open release R167, 5 dashboard files (Byte) |
| Echo's render check of tiles 26 and 6 (local Grafana 13.3.1, the newest 13.x available; 13.4 is not published for download; TestData values) | Pass, no findings. New JSON: tile 26 State 1, Last run 1, Run took 0 renders OK · 1.0 s · 0 s; with Last run 7, OK · 7.0 s · 0 s; tile 6 Running for 0 renders OK · 0 s, 1154 renders OK · 19.2 mins. The R166 JSON (`a76535f6`) on the same Grafana reproduces the PROD fault: Last run 1 → OK, Run took 0 and Running for 0 → Down. Echo's earlier 12.2.1 render missed it because no sample value was exactly 0 or 1 |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, work tree) |
| `Development checks` run on the pull request head | Pending: the run id is added after the push |
| PROD apply and read-back of tile 26 | Pending: Forge's record is added when the promotion runs |

## Not run
Chase's verification was not started for R167: the change is dashboard configuration only, covered by the build test, Echo's render check and the PROD read-back (lean check routine). No DEV Grafana exists, so there is no DEV read-back. Echo's local Grafana 12.2.1 render did not show the original fault (R166 note), so the PROD read-back of tile 26 is the check that matters.

## Recovery
Before deployment, revert the commit. After the apply, re-apply the saved Grafana plan from the R166 baseline (the previous dashboard JSON); no data, alert or SQL change is involved.

## Open questions
None.

## Remaining work
The CI run, the PROD apply under the owner's approval and its record, the tag, and the closure.
