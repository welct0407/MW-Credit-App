# Change notes — R175 database timeouts and upcoming-view cost, 18 November 2026

## Purpose
The PROD Grafana "5xx · all services" panel was above 0 almost every day since 5 November 2026. This batch removes the two causes found: the cost of the upcoming views and an unhandled database client error that crashed a service once.

## Changes
- Evidence: 9 Postgres statement timeouts from 10 to 16 November: 6 in `read-prod` (`upcoming_summary`) and 3 in `command-prod` (`offline_dataset`). They coincided with CPU spikes to 67–92% on `db-g1-small`. One more timeout, `notify-prod` `pwa_notify_candidates_v1` on 11 November, is not explained and has no change here.
- Cause (Archie's trace): the spikes come from the app's own offline dataset bursts, 45–141 requests within 2–9 minutes after the app opens (for example the first open after the Bangkok date rollover). Each upcoming view simulated all 156 loans because `raw AS MATERIALIZED` blocked the borrower filter. PROD `pg_stat_statements`: reader snapshot mean 540 ms (max 4526 ms); offline `borrowerUpcomingCte` mean about 850 ms (max 7738 ms).
- Crash: `command-prod`, 17 November 2026 at 16:18:51Z, an unhandled `error` event (ECONNRESET) on a checked-out pg client.
- Change 1, `services/lib/pool.mjs`: a `connect` listener so a client error no longer ends the process. Every service that bundles `services/lib` picks it up.
- Change 2, `database/migrations/V151` (views only, no table, column, grant, function or data change): `oltp_upcoming_charge_events_v1` loses `MATERIALIZED` on `raw`, so the borrower filter reaches the simulation; `oltp_upcoming_charge_coverage_v1` becomes one aggregate. Documented in `database/README.md`.
- Change 3, `services/business/offline-dataset-chunks.mjs`: `borrowerUpcomingCte` derives `forecast_dates` from `forecast_events` and filters the targeted borrowers.
- Lab before and after: one borrower's view 88 to 22 ms; reader snapshot 186 to about 45 ms; whole offline walk 304 to 203 ms; targeted walk 304 to 112 ms.
- Dropped from scope: the standalone-upcoming change (Archie item 4).
- Team: Archie design, Byte code, Chase verification, Dewey records. Echo and Forge not applicable: no UI and no infrastructure change. The database tier stays `db-g1-small`; a larger tier is an owner decision, deferred.
- Release: the R175 batch goes to session `session_01BhyycxP2gGQahbGVf5ruWf` (branch `claude/cool-brown-suis0o`) by pull request. That session owns promotion and the R175 row in the release tracker.
- Promotion facts for that session: V151 needs a verified PROD backup before it is applied. The Cloud Run images rebuild for read and command, and for every service that bundles `services/lib` (chat, jobs, notify).

## Checks
| Command | Result |
| --- | --- |
| Byte checks | pending |
| Chase review | pending |
| `mw-db-ci` | pending |
| Pull request `Development checks` | pending |

## Not run
Nothing is skipped yet. The lab timings above are Byte's and Archie's measurements on disposable data, not PROD measurements; the PROD effect is read from Grafana after deployment.

## Recovery
Revert the pull request for the code changes; the images redeploy from the previous commit. V151 is views only: rolling back means re-creating the two views from V150's definitions after a verified PROD backup, with no data change.

## Open questions
Open follow-up for the owner, separate scope: in the integration agent, the `mw_agent` `audit.events` query by `event_kind` is a sequential scan. It made 18,161 calls and read 98.8 M blocks, the largest I/O consumer. Whether to index or change it is not part of this batch.

## Remaining work
Promotion of V151 and the images by the session named above. After deployment, check that the Grafana "5xx · all services" panel returns to 0 and refresh the two dictionary entries from a PROD capture.
