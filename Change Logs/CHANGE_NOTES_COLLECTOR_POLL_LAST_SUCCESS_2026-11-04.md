# Change notes — Resource-health collector false polling Down, 4 November 2026

## Purpose
Owner request (4 November 2026, Asia/Bangkok): "Fix the collector with the team". The resource-health collector reported `polling` Down when the conversation poll was working, because its samples phase-locked with the poll runs. This is a monitoring-script fix, not product work, and it carries no release number. Owner authorization (5 November 2026, Bangkok): "Go ahead and get everything done", covering the merge of PR #245 and deployment to `vm-mw-credit-agent`. Deployed 4 November 2026 21:23Z; see [Deployment record](#deployment-record-forge-4-november-2026-utc).

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

Team: Archie (design), Byte (code), Chase (verification), Dewey (records), Forge (host deployment and its record). Echo not applicable.

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
- Full `npm run check`: the pull request's Development checks is the broad run.

## Deployment record (Forge, 4 November 2026 UTC)
Host `vm-mw-credit-agent`, as `codex-cloud` through `mw-debian-ssh`. Source: `main` at merge commit `189b91ea90094ade7e808370a2285c4194c9d771` (PR #245).

- Gate (read-only, before apply): live `/opt/mw-resource-monitoring/debian-health.py` sha256 `1fc11993f7b9c86e204070e06eb45495e1e255945182c69f52307a1de87e4093` and `/etc/systemd/system/mw-resource-health.service` sha256 `08d561d292fb3f6d84a1a189cb754da8c151d1181f44d9a5c653e0365c398e29` equalled `main` at `6720874`; the timer, `metabase_probes.py` and `metabase_pitr.py` also equalled `main`; no unit drop-ins; group `systemd-journal` (gid 999) exists. Both files root:root 0644.
- Staged copies in `/tmp` checked against the PR hashes before install, then removed.
- Backups (root:root 0644): `/opt/mw-resource-monitoring/debian-health.before-pollsuccess-20261105.py` (`1fc11993…`) and `/opt/mw-resource-monitoring/mw-resource-health.service.before-pollsuccess-20261105` (`08d561d2…`).
- Installed 21:23:01Z (root:root 0644): `debian-health.py` sha256 `6c72952ebc9a653535ac32d7441e2fab61109e90c39ad0d5d534c9ffcc37dd85`, unit sha256 `2494a17df8512edd1f435e0408c9bad6e795192620630332f1fb02a1474d9150`. `systemd-analyze verify` ok, `daemon-reload` 21:23:02Z, `SupplementaryGroups=systemd-journal` active.
- One manual run `systemctl start mw-resource-health.service`, 21:23:02Z to 21:23:11Z: `Result=success`, exit 0, `exported: true`, all 19 health components 1 including `polling`. The conversation poll and its timer were not touched.

| Post-check (read-only) | Result |
| --- | --- |
| Collector journal after install | No permission, denied or traceback lines |
| Journal read as `mwagent` with `systemd-journal` (same query as the collector) | Newest `UNIT_SUCCESS` for `mw-conversation-poll.service`, `_PID` 1, epoch 1793827330 |
| `polling_last_success` in `/var/lib/mw-resource-monitoring/last-points.json` | 1793827330, equal to the journal entry |
| Cloud Monitoring `custom.googleapis.com/mw_resource_monitoring/health`, `component=polling` | 21:23:11Z (manual run) 1; 21:25:22Z (first timer run, 21:25:16Z start, `Result=success`, journal `"polling": 1`, no permission errors) 1 |

Rollback (not needed): `sudo cp -p /opt/mw-resource-monitoring/debian-health.before-pollsuccess-20261105.py /opt/mw-resource-monitoring/debian-health.py`, `sudo cp -p /opt/mw-resource-monitoring/mw-resource-health.service.before-pollsuccess-20261105 /etc/systemd/system/mw-resource-health.service`, `sudo systemctl daemon-reload`.

## Recovery
Revert the commit of this batch (Git baseline `6720874`) and restore the host with the rollback in the deployment record.

## Open questions
None.

## Remaining work
None for deployment: deployed, verified and recorded in the Environment Inventory collector entry. Watch `polling` on the dashboard during the next slow-poll period (median run above 30 s); a false Down there would reopen this fix.
