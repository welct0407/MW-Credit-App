# Change notes — receipt wake path and one-minute conversation poll, batch B (host units), 20 October 2026

## Purpose
Owner plan of 20 October 2026, batch B: start the receipt cycle as soon as a receipt is captured, and read group conversations every minute instead of every five. It follows [batch A](CHANGE_NOTES_RECEIPT_CYCLE_SPEED_2026-10-20.md) and has its own deployment go.

## Changes
- B1 `systemd/mw-receipt-wake.path` (new; `PathChanged=/var/lib/mw-integration-agent/state/receipt-wake`, `Unit=mw-receipt-summary.service`); new `src/mw_integration_agent/receipt_wake.py`; `server.py` touches the file after an insert with an image, a reply or a standalone command, never on 403, 400, 503 or a duplicate, and a touch failure never fails the delivery; `conversation_poll.py` touches it when `image_jobs` > 0; `cli.py` wraps the `receipt-cycle` run so up to two extra passes follow a change of the wake file (not after a failed or `already_running` pass); the lock is released briefly between passes. `mw-receipt-summary.service` gets `StartLimitIntervalSec=0` so burst wakes cannot hit systemd's start limit. The 20 s timer stays as fallback. Reason for the extra passes: systemd may not restart a running oneshot on `PathChanged`.
- B1 `scripts/deploy-shared-receipt-api.py` (shared by `deploy-runtime.py`, unchanged): path unit in `UNIT_FILES`; `freeze` stops it beside the worker timers and records it in `resume_timers`; `activate` and `rollback` resume it; `install` and `activate` refuse while it is active ("Timers or path units not paused"); a first deploy treats it as absent; a fresh install does not enable it (enabling is the owner's step in the Batch B window).
- B1 `project/scripts/monitoring/debian-health.py`: no change; `timer_status` uses service start and exit plus timer state, there is no expected-unit list, and the poll thresholds (600 s) hold. A failed path unit is not monitored itself; the 20 s timer covers it. Resource monitoring and the Grafana receipts row stay as they are.
- B2 `systemd/mw-conversation-poll.timer`: `OnUnitInactiveSec` 5min to 1min (about 60 Meta requests an hour; the 5-minute watermark overlap stays). Timer files are not in `UNIT_FILES`, so this timer is installed by hand in the Batch B window.
- Tests: `test_server`, `test_conversation_poll`, new `test_receipt_wake`; the unit and deploy tests Forge changed (`test_systemd_units`, `test_deploy_runtime`, `test_deploy_shared_receipt_api`).
- Docs: `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md` (poll cadence, freeze lists, hand-installed timer), `docs/RECEIPTS.md` (Wake on capture, halt instruction), `integration-agent/README.md` (timer list), `project/Documents/Rules/Grafana_Alert_Troubleshooting_Runbook.md` (polling row cadence).

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements) | Batch B alone 595 tests OK, 85 skipped (lab suites); combined tree with batch A, V7 and the preflight 636 OK, 86 skipped (Chase, uncommitted tree before the final commit) |
| `ruff check --no-cache integration-agent` | Clean |
| `systemd-analyze verify` on the path unit | Clean, except the absent `/opt` binary on the build host |
| `npm run check:docs` | 0 failures, 0 warnings |
| Pull request `Development checks` and Agent tests | Same pull request #101 as batch A: see the [batch A note](CHANGE_NOTES_RECEIPT_CYCLE_SPEED_2026-10-20.md#checks) |

## Not run
- Deployment on `vm-mw-credit-agent` and enabling the path unit in the maintenance window: waits for the owner's go (config-only route from Operations for the timer).
- Measurement after batch B: not run in this session.
- Real systemd behaviour of the path unit on the VM. CI runs the Agent tests job, pending push.

## Recovery
Revert the merge commit. Live: `systemctl disable --now mw-receipt-wake.path`, restore the poll timer from the copy taken before the manual install (the freeze backup does not hold timer files), `systemctl daemon-reload`, start the timers.

## Open questions
None.

## Remaining work
- Deploy batch B in its own window after batch A is verified (owner instruction of 20 October 2026, see the [promotion record](CHANGE_NOTES_RECEIPT_CYCLE_SPEED_2026-10-20.md#promotion-record)), then measure a third time (group receipt to POSTED median under 1.5 min; pick-up about 1 s after capture).
- Pins go to the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host) after deployment.
