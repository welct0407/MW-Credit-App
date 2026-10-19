# Change notes — offline dataset sync efficiency (R078), 19 October 2026

## Purpose
The owner wants offline dataset sync to feel instant, especially right after the owner's own write (payment and receipt upload). On 19 October 2026 the owner told the team to work on all seven recommendations of an independent review of the PROD request logs. Status: in progress on branch `claude/delta-sync-efficiency`; the Changes below are the plan and are marked done as they land.

## Changes
Measurement tooling (done):
- `project/scripts/offline-sync-log-report.py`: read-only report from Cloud Run request logs (endpoint table, unchanged polls, walk bursts, post-write cycles); listed in the [scripts README](../project/scripts/README.md). Run it before and after with the same window rules.

The seven items (status updated as each lands):
1. Pack cash and management pages: `deterministicPages` cash 4 to about 16 and management 1 to about 8, inside the existing byte and value budgets (`services/business/offline-dataset-delta.mjs`, `services/business/offline-dataset-chunks.mjs`). Server only, no migration.
2. Client walk: no 200 ms timer when continuing a walk, progress written every few chunks or at domain completion, two domains in flight (`apps/pwa/src/offline-dataset.ts`, `apps/pwa/src/owner-offline.ts`).
3. Fingerprint scoped per domain: Daily Analytics, Cash Account Daily Analytics and Statistics changes (hourly job) must not re-walk records or collection; check the `olap_portfolio_summary` view before dropping a table from the records set.
4. Cheaper fingerprint: hash `("Row ID", xmin)` per row instead of `to_jsonb(row)`, one scan per poll shared by all domains; same detection.
5. `Access-Control-Max-Age` on the preflight response (`services/lib/http-boundary.mjs`).
6. No forced full cycle after an own write: apply the command result to the local bundle, and seed the own uploaded receipt into the offline media store under the payment address. Archie designs first.
7. Real change tracking (change sequence or per-row version kept by triggers, one "changed since N" request per domain). Needs a new table and migration: scoped owner authorization before any DEV or PROD apply, and a verified PROD backup at promotion. Designed together with item 6, smallest schema footprint.

## Baseline
PROD, window 17 October 00:00 to 19 October 2026 (Bangkok), 17,051 request-log rows, from the report script (metadata only):

| Measure | Baseline |
| --- | --- |
| Unchanged poll | 5 requests, 1.7 s server, 3.2 s wall (73 polls) |
| Walks (7+ dataset requests, gaps 4 s or less) | 181; wall p50 20.0 s, p90 62.7 s; server p50 12.4 s; client gap 41% of wall; 462 KB p50 |
| Dataset POST p50 / p90 / avg size | management 0.29 / 0.37 s, 3.6 KB; cash 0.35 / 0.44 s, 3.3 KB; records 1.01 / 2.26 s, 74.9 KB; collection 0.54 / 0.93 s, 20.7 KB |
| Preflights | 1,031 OPTIONS for 6,142 dataset POSTs |
| Post-payment cycle, owner phone, 18 October 20:28Z | about 35 requests, 33 s wall, 20 s server for the follow-up cycle (the script's 4 s quiet rule counts the whole burst: 101 requests, 66.6 s) |
| Own receipt re-downloaded after own upload | 4 of 12 cases, 160 to 250 KB each |
| Walk triggers (61 full records walks) | 32 app write, 12 hourly analytics job only, 2 Bangkok day change, 15 no visible cause |

## Targets
Post-write cycle under 3 s; unchanged poll under 1 s. After DEV and PROD promotion, re-run the script with the same window rules and record the numbers here. Not yet verified: the database-side cost split of a page and the composition of the iPhone client gap (needs client timing capture).

## Checks
| Command | Result |
| --- | --- |
| `python3 -I project/scripts/offline-sync-log-report.py --env prod --from 2026-10-16T17:00:00Z --to 2026-10-19T17:00:00Z` | Pass, baseline above (commit of this note) |
| `npm run check:docs` | To fill |
| `npm run lint`, `npm run typecheck`, `npm test` | To fill |
| Database guards and rebuild (item 7 only) | To fill |
| Re-run of the report script on DEV and PROD after promotion | To fill |

## Not run
To fill.

## Recovery
Revert the batch's commits on `claude/delta-sync-efficiency`; before promotion nothing is deployed. Item 7 adds a migration: after a PROD apply, recovery is a restore from the verified backup taken at promotion; the migration itself stays immutable.

## Open questions
Owner authorization for the item 7 table and migration (DEV apply and PROD promotion).

## Remaining work
Everything in Changes except the measurement tooling.
