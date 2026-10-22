# Change notes — monitoring handover dashboard link, 22 October 2026

## Purpose
The Grafana Performance dashboard was retired on the owner's instruction (R090, `Change Logs/CHANGE_NOTES_R090_GRAFANA_LIMITS_RETIREMENT_2026-10-22.md` at the repository root); the handover still linked it.

## Changes
- `docs/MONITORING_IMPLEMENTATION_HANDOVER.md`: the asset row links `/d/mw-now` (home) and `/d/mw-agent` instead of `/d/mw-resource-performance`. Documentation only; no runtime, collector or deploy change.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | See the root R090 change note |

## Not run
- Nothing beyond the docs check.

## Recovery
Revert this commit.

## Open questions
None.

## Remaining work
None.
