# Change notes — Config-only change helper, 28 October 2026

## Purpose
During R102 an ad hoc config-only script restored `config.json` with `cp -p` from a backup that had just been made 0600, so `mwagent` could not read it and the agent was down for 2.5 minutes ([VM incident](https://github.com/welct0407/MW-Credit-App/blob/cf01602/Change%20Logs/CHANGE_NOTES_R102_AGED_OVERDUE_AND_CLAUDE_CHAT_2026-10-27.md)). R103 replaces the hand-run route with a repository script that always sets owner and mode explicitly.

## Changes
- `integration-agent/scripts/config-only-change.py` (new, root only on `vm-mw-credit-agent`):
  - `apply --tag <tag> --config <new> [--catalogue <new>]` refuses when `/root/<file>.pre-<tag>` already exists or the input is not a JSON object, writes the backups, stops the worker triggers and waits until their services are inactive, installs the new files and runs `check` as `mwagent`. When the install or `check` fails, or the run is interrupted (KeyboardInterrupt or another `BaseException`) after the install began, it restores the backups and runs `check` again; an interrupt is then re-raised. When the check after a restore fails, it prints the backup paths and the manual `install -m 0640 -o root -g mwagent <backup> <live>` command and exits non-zero. `check` output is captured; only its exit code is reported.
  - `restore --tag <tag>` installs the tagged backups through the same path.
  - Every write (backups included) is a temporary file in the target directory: `fchown` root:mwagent, `fchmod` 0640, `fsync`, `os.replace` (a hard link for a backup, so an existing one is never overwritten). Owner and mode never come from another file.
  - A `finally` block always brings the services back. It restarts `mw-instagram-webhook` and runs `receiver-ready --wait 30`. It restarts `mw-receipt-recognition` and `mw-chat-relay` when they are enabled or running and checks each `/healthz` for the expected `enabled` state. It starts exactly the triggers that were active before. Each step runs even when an earlier one fails.
  - The run ends by asserting that the live files it handled are `root:mwagent` 0640, and exits non-zero otherwise.
  - Triggers are derived from the repository units: every `.timer` and `.path` whose service runs as `mwagent`, in `integration-agent/systemd` and `project/scripts/monitoring`. Today that is seven timers (including `mw-resource-health.timer`, whose collector reads `config.json`) and `mw-receipt-wake.path`.
  - A trigger in the repository but not installed on the host (`LoadState=not-found`, or `stop` exit 5) is skipped and logged; any other stop failure refuses.
  - Paths, the systemctl runner, the agent (check) runner, the owner lookup and the health reader are injectable.
- `integration-agent/tests/test_config_only_change.py` (new, 16 tests with fake runners in a temporary directory). They cover:
  - the apply path, and apply with a catalogue and an enabled relay;
  - a failed `check` restoring the backup as 0640 although the backup was made 0600;
  - services coming back when `check` raises, and an interrupt during `check` restoring the backup before re-raising;
  - a failed check after restore naming the backups and the manual command;
  - captured `check` output (exit code only);
  - not-installed triggers skipped and logged, any other stop failure refused;
  - an existing backup, bad JSON and bad tags refused before anything stops;
  - the final mode assertion;
  - the worker drain timeout;
  - restore, and a restore whose `check` fails;
  - the derived trigger list, pinned against the repository units.
- Chase's review: the interrupt restore, the not-installed triggers, the manual recovery command and the captured `check` output were fixed in this batch.
- `integration-agent/docs/OPERATIONS.md`: the config-only route now uses the script. The manual steps stay as a fallback that installs with explicit `install -m 0640 -o root -g mwagent` and never `cp -p`. The pre-freeze config backup uses the same `install` command, and the "six worker timers" wording is replaced by the derived list.
- Older documents: no current document describes a `cp -p` config rollback. The remaining `cp -p` lines are dated change-note records for binaries, units and the monitor collector, and stay as they are. No catalogue or deploy allowlist lists operator scripts, so nothing needed registering.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 654 OK, 70 skipped (lab suites), base `547e314` (Byte) |
| `ruff check --no-cache integration-agent` | All checks passed (local ruff 0.16.9; CI pins 0.16.8) (Byte) |
| `npm run check:docs` | 0 failures (Byte) |

## Not run
Nothing touched the VM. The script has not run on the host yet. Its first live use needs an owner-authorized config change.

## Recovery
Revert the batch commit. The manual fallback in `docs/OPERATIONS.md` stays available.

## Open questions
None.

## Remaining work
Chase verifies the helper. The next live config-only change uses the script.
