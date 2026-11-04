# Change notes — Resource-health collector false polling Down, 4 November 2026

## Purpose
Owner request (4 November 2026, Asia/Bangkok): "Fix the collector with the team". The resource-health collector reported `polling` Down when the conversation poll was working, because its samples phase-locked with the poll runs. This is a monitoring-script fix, not product work, and it carries no release number. It is not deployed: deployment to `vm-mw-credit-agent` awaits owner authorization.

## Changes
- `project/scripts/monitoring/debian-health.py` (Byte): `last_success` for `polling` also takes the newest systemd `UNIT_SUCCESS` journal entry for `mw-conversation-poll.service` (`journalctl`, `MESSAGE_ID=7ad2d189f7e94e70a38c781354912448`). If the journal cannot be read, the current rule applies unchanged. Only entries with `_PID=1` (systemd itself) count, and a journal success in the future is ignored, not clamped, so it cannot hide a stall after a clock step back. The journal was chosen over `InactiveEnterTimestamp` (Archie), which also counts failed runs.
- `project/scripts/monitoring/mw-resource-health.service` (Byte): adds `SupplementaryGroups=systemd-journal` so the collector can read the journal.
- `project/scripts/monitoring/test_debian_health.py` and `project/scripts/monitoring/README.md` (Byte): tests and tool description.
- Down and Degraded meanings are unchanged, so `Resource_Monitoring.md` and `CONVERSATION_POLL.md` are unchanged. A poll-side success stamp was rejected as cross-scope (it would change the integration agent).
- Records: this note and the outstanding-work row in `project/Documents/Development_Changes.md`. The Environment Inventory collector entry is not changed until the deployment happens, because it holds deployed pins only.

Evidence (read-only, Cloud Monitoring and Cloud Logging syslog, 4 to 5 November 2026):
- 1,049 poll runs in the Bangkok day; 24 exited with status 2, all `Instagram UNKNOWN (HTTP 500, code 1, subcode 99/None)`. Longest run 92 s.
- Median run duration rose from 12 to 15 s to 33 to 41 s from about 17:00 Bangkok.
- The collector period is about 2:06 and the poll cycle about 2:05, so the samples drifted into step with the runs.
- 12 consecutive collector samples (18:21Z to 18:44Z) saw `running=1`, while the journal shows a success about every 2 minutes.
- `polling` was Down at 13:12Z, 17:06Z to 17:19Z and from 18:29Z. About 12 Degraded samples were real HTTP 500 runs.

Team: Archie (design), Byte (code), Chase (verification), Dewey (records). Echo and Forge not applicable.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest test_debian_health test_hosting_health` in `project/scripts/monitoring` (Byte, on `6720874` plus the uncommitted diff) | 79 OK |
| New phase-locked test against the old logic (Byte) | Gives `[1,1,1,1,1,0]`, a false Down on the 6th sample, so the test reproduces the fault |
| `ruff check` on the 2 .py files (Byte) | 51 findings, the same as HEAD, none new (ruff is not a CI gate here) |
| Live read-only on `vm-mw-credit-agent` as `codex-cloud` (Byte) | systemd 257 (257.13-1~deb13u1); the `journalctl` entry has MESSAGE_ID `7ad2d189…`, UNIT `mw-conversation-poll.service`, "Deactivated successfully.", `_PID=1`; `mwagent` is not in `systemd-journal` |
| Chase adversarial review of the diff against Archie's plan | Pass, no blocking defects. Two hardening notes accepted and fixed (future journal success ignored; only `_PID=1` entries count). Not blocking, accepted: a manual stop of a running poll also logs "Deactivated successfully"; the group grants read-only access to all units' logs |
| Chase re-check of the delta | Pass |
| `npm run check:docs` (Dewey) | Pass: 0 failures, 0 warnings |
| CI `Development checks` on the pull request | The one broad run; see the pull request |

## Not run
- No deployment and no live collector run: the owner has not authorized deployment to `vm-mw-credit-agent`.
- Full `npm run check`: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `6720874`). Nothing is deployed, so no host rollback applies yet. After a deployment, restore the backed-up `debian-health.py` and unit in `/opt/mw-resource-monitoring/` and run `daemon-reload`.

## Open questions
Deployment of the fix to `vm-mw-credit-agent` needs the owner's authorization.

## Remaining work
Deploy to `vm-mw-credit-agent` after authorization, verify `polling` stays Healthy across several samples, then record the deployed `debian-health.py` and unit sha256 values and the backups in the Environment Inventory collector entry.
