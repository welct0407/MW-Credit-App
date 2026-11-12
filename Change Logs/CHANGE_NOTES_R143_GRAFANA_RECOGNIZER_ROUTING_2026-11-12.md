# Change notes — Grafana recognizer model follows per-caller routing (R143), 12 November 2026

## Purpose
After R142 the owner reported on 12 November 2026: "the Grafana dashboard has not been updated to reflect the latest model change. i still see Gemini 3.5 flash there." The collector `debian-health.py` reported only the global `receipt_recognition_provider` (gemini), while R142 routes the receipt reader per caller. Monitoring tooling only; no application, SQL or infrastructure change.

## Changes
- `project/scripts/monitoring/debian-health.py` (Byte): the recognizer provider comes from the `command-prod` caller's route (its `provider`, else the global `receipt_recognition_provider`); `claude` maps to `receipt_claude_model`; a `fallback` field is exported; a new `worker_timing{receipt_cycle}` component carries the Instagram receipt cycle's provider, fallback and model.
- `project/scripts/monitoring/dashboards/agent.cjs` and `pwa.cjs`: the recognizer model panel description names the per-caller routing; `infrastructure/grafana/dashboards/mw-agent.json` and `mw-pwa.json` regenerated (only the description line changed).
- `project/scripts/monitoring/test_debian_health.py`: new route and cycle cases.
- Records (Dewey): this note, `Release_Tracker.md` (R143 scope), `Development_Changes.md` (R143 row), `project/scripts/monitoring/README.md` (collector field), `Resource_Monitoring_Dashboard_Guide.md` (panel examples).

## Checks
| Command | Result |
| --- | --- |
| `npm run test:monitoring` (Byte, branch at main `761bcc24` plus the uncommitted diff) | Pass |
| `test_debian_health.py` (Byte, same tree) | Pass, 80 OK |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |
| CI on the pull request | Pending |

## Not run
Deployment and the live panel read-back: the dashboard still shows the old model until Forge applies the collector and the dashboard description. A skipped check is not a pass.

## Pending deployment
Not applied. Forge installs the updated collector at `/opt/mw-resource-monitoring/debian-health.py` on `vm-mw-credit-agent` and applies the dashboard description through `scripts/grafana/manage.py`; the read-back should show the PROD caller's provider and model (Claude and `claude-opus-5-5` after the R142 cutover) and the cycle component. Record the applied state in the [Environment Inventory](../project/Documents/Environment_Inventory.md) at deployment.

## Recovery
Git baseline `761bcc24`. Reinstall the previous collector copy on the VM and re-apply the previous dashboard JSON; nothing else depends on the new fields.

## Open questions
Whether to add an Anthropic status panel to this scope (owner decision).

## Remaining work
Deployment by Forge and the live read-back.
