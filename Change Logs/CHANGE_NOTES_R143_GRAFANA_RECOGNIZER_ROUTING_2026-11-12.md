# Change notes — Grafana recognizer model follows per-caller routing (R143), 12 November 2026

## Purpose
After R142 the owner reported on 12 November 2026: "the Grafana dashboard has not been updated to reflect the latest model change. i still see Gemini 3.5 flash there." The collector `debian-health.py` reported only the global `receipt_recognition_provider` (gemini), while R142 routes the receipt reader per caller. Monitoring tooling only; no application, SQL or infrastructure change.

## Scope addition (owner, 12 November 2026)
The owner approved: "yes merge and deploy, add Anthropic status too". R143 also adds Anthropic's public status to the Grafana "Providers · status" panel, implemented by Byte in the same pull request (#291). Grafana reads the public status page directly through the Infinity datasource `mw-public-status`; the collector is not involved.
- Endpoint: `https://status.claude.com/api/v2/summary.json` (`status.anthropic.com` redirects there). Only the component "Claude API (api.anthropic.com)" counts.
- States: Outage (major outage, or an open critical incident on the API); Incident open (any open incident on the API, or degraded or partial outage); Maintenance (in progress, verifying or under maintenance); No incident (operational, nothing open); Feed unreadable (anything else, including a fetch failure).
- Files (Byte): new `project/scripts/monitoring/anthropic-status.jq`; `dashboards/lib.cjs` (optional Anthropic row, allowed host `status.claude.com`, description); `dashboards/agent.cjs` (the panel has 12 rows, was 9, and the tiles below move down); `mw-agent.json` regenerated.
- Forge adds `https://status.claude.com` to the datasource's `allowedHosts` in `infrastructure/grafana/owned-services.tf.json`; until it is applied the row reads "Feed unreadable".

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
| `npm run test:monitoring` for the status row (Byte): dashboard query tests 82 OK; `test_debian_health` OK; layout-model pass | Pass |
| Collector install and run (Forge) | Pass: 02:46:49Z install, 02:46:51Z run exit 0, no journal errors; Cloud Monitoring read-back 02:51:16Z |
| Grafana plan, apply, re-plan and read-back (Forge) | Pass: 3 changes applied 02:52:44Z to 02:52:58Z, re-plan clean, `mw-agent` v15 and `mw-pwa` v15, recognizer panel Claude, Anthropic row "No incident" |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |
| CI on the pull request | Pending |

## Not run
None beyond the pull request CI. A skipped check is not a pass.

## Deployment record (Forge, 12 November 2026 UTC)
Pull request #291 merged as `055e25fe`. No PROD application promotion, no SQL, no image or Terraform change for the application.
- Collector: only `debian-health.py` changed, new sha256 `d24ba62e...`, installed 02:46:49Z at `/opt/mw-resource-monitoring`. The previous copy is kept as `debian-health.before-R143-20261112.py` (sha256 `71fa41cb...`). No unit change; the VM checkout is at `055e25fe` and the agent package is untouched. The 02:46:51Z run exited 0 with no journal errors. `audit_relay` showed 0 once, which is unrelated to the R143 diff; later runs showed 1. Cloud Monitoring `worker_timing` for `recognizer` and `receipt_cycle` (02:51:16Z): provider 3 (Claude), fallback 1 (Gemini), `model:claude-opus-5-5`.
- Grafana through `scripts/grafana/manage.py`: plan at 02:52:06Z with 3 changes (the `mw-public-status` allowed hosts gain `status.claude.com`; `mw-agent` panels 11 and 12 changed with 10 and 13 moved; `mw-pwa` panel 33); saved plan sha256 `fdac214f806f88552c20c1de48e4d8956d1588dc74d8b6161b1aff866a719a8e`; applied 02:52:44Z to 02:52:58Z; re-plan at 02:53:11Z showed no changes. Read-back: `mw-agent` version 15 and `mw-pwa` version 15; "Recognizer · model" shows "Claude · claude-opus-5-5"; "Providers · status": Railway 1, Google Cloud 1, Anthropic 1 ("No incident"). Private plan and logs are under the operator private root (`r143-grafana`).

## Recovery
Git baseline `761bcc24`. Collector: copy `debian-health.before-R143-20261112.py` back over `/opt/mw-resource-monitoring/debian-health.py` on the VM. Grafana: a revert plan from the previous commit through `scripts/grafana/manage.py`, or the earlier dashboard versions (`mw-agent` and `mw-pwa` before version 15). Nothing else depends on the new fields.

## Open questions
None. The owner decided to add the Anthropic status (see Scope addition).

## Remaining work
None. R143 stays Open for further owner scope; its closure needs no PROD application promotion.
