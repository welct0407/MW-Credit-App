# Change notes — R175 database timeouts and upcoming-view cost, 18 November 2026

## Purpose
The PROD Grafana "5xx · all services" panel was above 0 almost every day since 5 November 2026. This batch removes the two causes found: the cost of the upcoming views and an unhandled database client error that crashed a service once.

## Changes
- Evidence: 9 Postgres statement timeouts from 10 to 16 November: 6 in `read-prod` (`upcoming_summary`) and 3 in `command-prod` (`offline_dataset`). They coincided with CPU spikes to 67–92% on `db-g1-small`. One more timeout, `notify-prod` `pwa_notify_candidates_v1` on 11 November, is not explained and has no change here.
- Cause (Archie's trace): the spikes come from the app's own offline dataset bursts, 45–141 requests within 2–9 minutes after the app opens (for example the first open after the Bangkok date rollover). Each upcoming view simulated all 156 loans because `raw AS MATERIALIZED` blocked the borrower filter. PROD `pg_stat_statements`: reader snapshot mean 540 ms (max 4526 ms); offline `borrowerUpcomingCte` mean about 850 ms (max 7738 ms).
- Crash: `command-prod`, 17 November 2026 at 16:18:51Z, an unhandled `error` event (ECONNRESET) on a checked-out pg client.
- Change 1, `services/lib/pool.mjs`: a `connect` listener so a client error no longer ends the process. Every service that bundles `services/lib` picks it up.
- Change 2, `database/migrations/V151__upcoming_forecast_borrower_pushdown.sql` (views only, no table, column, grant, function or data change): `oltp_upcoming_charge_events_v1` loses `MATERIALIZED` on `raw`, so the borrower filter reaches the simulation; `oltp_upcoming_charge_coverage_v1` becomes one aggregate. It has a preflight against double application and a self-check (owner, ACL, options, comments and columns unchanged; no materialized or repeated forecast). It needs only the views' owner `postgres` and no special owner window. Documented in `database/README.md`; the two dictionary entries carry the new definitions as `development_definition`.
- Change 3, `services/business/offline-dataset-chunks.mjs`: `borrowerUpcomingCte` derives `forecast_dates` from `forecast_events` and filters the targeted borrowers.
- `services/chat/assets/schema-digest.json` was rebuilt only for the migration number (150 to 151).
- Tests: `tests/unit/request-budget.test.mjs`; `scripts/database/Test-CoverageParity.sql` (frozen V150 events parity and a plan pushdown assertion); `scripts/database/Test-UpcomingCharges.sql` (new fixtures); `tests/integration/phase6-management-independent.test.mjs` (walk dates equal `summary_v2`; a targeted read equals the walk).
- Measured by Byte (EXPLAIN ANALYZE medians of 5 runs; synthetic 320 borrowers, 650 loans, 3,920 charges), V150 to V151: reader coverage for one borrower 165 to 33 ms; reader snapshot 332 to 36 ms; offline walk metadata 1,074 to 666 ms; offline walk events 1,125 to 695 ms; targeted metadata for 1 borrower 1,020 to 428 ms; targeted events for 1 borrower 1,065 to 414 ms.
- Dropped from scope: the standalone-upcoming change (Archie item 4).
- Team: Archie design, Byte code, Chase verification, Dewey records. Echo and Forge not applicable: no UI and no infrastructure change. The database tier stays `db-g1-small`; a larger tier is an owner decision, deferred.
- Release: the R175 batch goes to session `session_01BhyycxP2gGQahbGVf5ruWf` (branch `claude/cool-brown-suis0o`) by pull request. That session owns promotion and the R175 row in the release tracker.
- Pull request 362 (agent V14, `audit.events_kind_idx`) was split out of this batch and the release session already merged it into R175. It resolves the `mw_agent` `audit.events` sequential scan (18,161 calls, 98.8 M blocks read, the largest I/O consumer).
- Promotion facts for that session: V151 needs a verified PROD backup before it is applied, and nothing else beyond a normal PROD migration. The Cloud Run images rebuild for read and command, and for every service that bundles `services/lib` (chat, jobs, notify).

## Checks
| Command | Result |
| --- | --- |
| Byte: `node --test`, 7 unit files | 103 pass |
| Byte: `chat-schema-digest` | 3 pass |
| Byte: lint | Exit 0 |
| Byte: `tsc` | Clean |
| Byte: `mw-db-ci -Group migrations` | Exit 0: chain to 151, SQL including `Test-UpcomingCharges` and `Test-AccessMatrix`, 9 concurrency suites, partial-target chains, `database/current` unchanged |
| Byte: `Run-Phase5` offline bulk | 3 pass; its database head is pinned at V85, so V151 is not covered there |
| Byte: lab V151 check, 320 borrowers | Targeted equals whole; 1,500 dates equal `summary_v2` |
| `python3 project/scripts/dictionary/dictionary.py validate` | 0 errors, 505 documents |
| Chase review | pending |
| Pull request `Development checks` | pending |

## Not run
Nothing is skipped yet. The timings above are Byte's measurements on synthetic data, not PROD measurements; the PROD effect is read from Grafana after deployment.

## Recovery
Revert the pull request for the code changes; the images redeploy from the previous commit. V151 is views only: rolling back means re-creating the two views from V150's definitions after a verified PROD backup, with no data change.

## Open questions
None.

## Remaining work
Promotion of V151 and the images by the session named above. After deployment, check that the Grafana "5xx · all services" panel returns to 0 and refresh the two dictionary entries from a PROD capture.
