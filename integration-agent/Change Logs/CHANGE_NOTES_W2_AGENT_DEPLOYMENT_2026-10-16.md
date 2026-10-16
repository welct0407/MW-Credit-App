# W2 agent — receiver readiness and deployment recovery — 2026-10-16

## Purpose

Make the webhook receiver report when it is ready and give the agent one safe deploy route that restarts the receiver and waits for readiness before workers resume. Code commits `776a1f2` and `a141e06` on branch `claude/review-w2-agent`, branched from `main` `9cab7d1`. Merged to `main` as `5d39db6` (PR #27) and deployed to the Debian host on 16 October 2026 on owner instruction. No migration or grant.

## Changes

Package commit `a141e0610ab5b41cbcb0a82c32072e8ea0c319b7` (code `776a1f2`, dry-run label fix `a141e06`). Each finding was re-verified at its cited line first; all reproduced.

- **AGT-DEPLOY-01**: already done. Wave 1 recovery commit `58929d7` is on `main`, so no new recovery commit. The installed tree equals `58929d7a81487a80ae0c2924564b272ff3310c9c` hash for hash, apart from the dead installed-only `appsheet.py`. Recorded in `project/Documents/Environment_Inventory.md`.
- **AGT-DEPLOY-02** (`deploy-shared-receipt-api.py`, `activate-conversation-poll.sh`, `activate-partner-conversations.sh`, `deploy-cash-statement.sh`, `deploy-operator-audit.py`, `deploy-receipt-audit-repair.py`, `deploy-receipt-evidence.py`, `deploy-receipt-summary.sh`, `install-cash-statement-schedule.sh`, `install-postgresql-config.py`, `verify-receipt-evidence.py`): `CHECKOUT` is the clone root for Git; `REPO` is `<clone>/integration-agent` for install, source, catalogue, units and tests. `checkout()` requires `REPO/pyproject.toml`. The fourteenth script, `update-reviewed-runtime.sh`, is deleted (AGT-DEPLOY-04).
- **AGT-DEPLOY-03** (`deploy-shared-receipt-api.py`, `verify-receipt-evidence.py`): `compare_tree` fails on an empty source set and on any extra, missing or changed `.py` file. `verify-receipt-evidence.py` uses the same function.
- **AGT-DEPLOY-04** (`update-reviewed-runtime.sh` deleted, `deploy-runtime.py` new): one Python route. `deploy-runtime.py` changes only `code_version`, and refuses unless the live and repository catalogues match in revision, service names and `implemented` flags. Rollback pointer `/var/lib/mw-integration-agent/rollback/runtime-current`.
- **AGT-DEPLOY-05** (`deploy-shared-receipt-api.py`): install is `pip install --no-deps --no-build-isolation REPO`. It then deletes installed `.py` files absent from source (kept in the backup, listed in `removed_files`), so the first deploy removes `appsheet.py`, and verifies the full name set and hashes.
- **AGT-DEPLOY-06**: no code change. `/ready` reports `code_version`, which is the deployed identity. The package version stays `0.1.0`.
- **AGT-DEPLOY-07**: the host clone was unshallowed on 16 October 2026 (owner-authorized, the only host change). HEAD unchanged at `9f4e5b37bb4b9ca6ce660efc15dcf29496c0c308`, tree clean, `origin/main` now `9cab7d1`, `.git` 268M to 276M. Dry-run and freeze record `merge-base --is-ancestor <installed code_version> HEAD` as `ancestor`, `not-ancestor`, `unknown-object` or `unknown`. `a8cf949` is not an object in the monorepo, so the first deploy records `unknown-object`.
- **AGT-R063-01** (`server.py`, `cli.py`, `deploy-shared-receipt-api.py`, `deploy-runtime.py`): `/ready` checks `config`, `catalogue`, `secrets`, `state` (PostgreSQL `SELECT 1` through the generation fence) and `current` (live `code_version` and package hash equal those at start) within 3 s. 200 when ready, else 503 with the failed names; no secrets, paths or exception text. Tunnelled requests (`Cf-Ray`/`Cf-Connecting-Ip`) get 404. The helper phases are `dry-run|freeze|install|activate|rollback`. Freeze records the receiver InvocationID, unit hashes and ancestry. Install also installs changed unit files, runs `daemon-reload` and creates the Graph `.bak` file if missing. Activate restarts the receiver, waits for `/ready` with the pinned `code_version` from a new InvocationID, and only then resumes timers. On failure it rolls back package, config, catalogue and units, restarts the receiver, and leaves timers stopped. Manual rollback resumes timers only after verification. A pointer is archived only when its phase is `activated` or `rolled-back`.
- **AGT-R063-02** (`project/scripts/monitoring/debian-health.py`): `webhook_local` is 1 only for `/ready` 200 with `ready: true` and a non-empty `code_version`. `webhook_code_version` is printed, not exported. No Grafana or alert change.
- **AGT-R063-03** (`systemd/mw-instagram-webhook.service`): `After=`/`Wants=` the proxy (not `Requires=`), `UMask=0077`, `HOME`, `ExecStartPost=-… receiver-ready --wait 30`, `TimeoutStartSec=45s`, `StartLimitIntervalSec=300`, `StartLimitBurst=5`. The gate is non-fatal (`-`) on purpose: a long proxy outage at boot, or a rollback to a package without `receiver-ready`, must not stop the receiver. The helper does the strict check. `receiver-ready --config … [--wait N]` polls `/ready` and exits 0 or 1.
- **AGT-R063-04** (`server.py`): each handler exception prints one stderr line `{"event":"ingress_error","method":…,"error":<class>,"code":<ConfigurationError text or "">}`. No payload or header.
- **AGT-R063-05** (`server.py`): `serve()` imports `audit`, `conversation_api`, `receipt_api`, `receipt_storage`, `state` (and `psycopg` on PostgreSQL) before `serve_forever`, so a later package replacement cannot mix versions in the running receiver.
- **Docs**: `docs/OPERATIONS.md` (single deploy route, `/ready`), `SERVICE_CATALOGUE.md` (note only), `project/Documents/Development_Changes.md`, `project/Documents/Environment_Inventory.md`. `service-catalogue.json` is unchanged on purpose: a new key or revision would make `deploy-runtime.py` refuse.

Pre-deploy host readback (16 October 2026, read-only): the receiver `mw-instagram-webhook` has been active since 2026-10-14 18:43:32 +07 with NRestarts=0; `/health` 200, `/ready` 404 (not deployed). Receiver, proxy, cloudflared, verify units and all six repo timers match the repo. The six worker services differ only by the undeployed Wave 1 edits (`Wants` vs `Requires` for the proxy, `.bak` in `ReadWritePaths`). Against `main` `9cab7d1` the installed tree differs in 7 files from Wave 1 (`graph_email.py`, `instagram.py`, `journal.py`, `partner_notice.py`, `receipt_health.py`, `server.py`, `webhook.py`). Package metadata still points at the old checkout root.

## Checks

Independent run by Agent C (Testing) on `776a1f2`; the unit suite was rerun on `a141e06`.

| Check | Command or setup | Result |
| --- | --- | --- |
| Unit suite | fresh Python 3.13 venv, `pip install ./integration-agent`, `python -m unittest discover -s tests -v` | `Ran 409 tests`, `OK (skipped=44)` (baseline `main`: 373, skipped 44). Skips: 19 isolated PostgreSQL 18 lab, 14 disposable PostgreSQL fixture, 6 private lab, 3 isolated lab, 2 Debian Thai renderer. Rerun on `a141e06`: `Ran 409 tests`, `OK (skipped=44)` |
| New tests | `test_server` (12), `test_deploy_runtime` (5), dry-run, flow and helper cases in `test_deploy_shared_receipt_api` (22 in the module), receiver case in `test_systemd_units` | all pass; each new behaviour test failed on the old source |
| Host monitor | `project/scripts/monitoring`: `python -m unittest test_debian_health` | `Ran 31 tests`, `OK` |
| PostgreSQL lab suites (7 modules) | disposable UTF8 PostgreSQL 18 cluster, 127.0.0.1:15520, socket `/tmp/mwpg`; `bootstrap.sql`; `state_migration.migrate()` V1–V4 then `[]`; roles `LOGIN`; app roles from `Test-AppRolePrerequisites.sql` plus `_prod` copies; Flyway to V92; `configure-reviewer-dml`; `business-grants.sql` (with `mw_design.execution_approved`) | `Ran 50 tests`, `FAILED (errors=1)`: 49 pass. The error is the pre-existing AGT-TEST-02 (`ReadOnlySqlTransaction`), Wave 3. Cluster stopped and removed |
| Helper dry run on the host | `mw-debian-ssh 'python3 - dry-run --commit <sha>' < scripts/deploy-shared-receipt-api.py` as `codex-cloud`, for `776a1f2`, for `9cab7d1`, and a `runtime-current` copy | rc 0 each. Plan, timers, receiver InvocationID `188d8771…`, installed-vs-checkout (extra `appsheet.py`, 5 changed) printed. `installed_code_version` unreadable, so ancestry `unknown`. `776a1f2` is not on the host clone; units then compared with the old checkout and read "unchanged" (misleading; fixed in `a141e06` to "unknown") |
| Host readback | `systemctl show/list-timers`, `curl` | receiver active since 2026-10-14 18:43:32 +07, NRestarts 0; 7 timers active; `/health` 200, `/ready` 404 |
| Expected unit changes | `git show 776a1f2:integration-agent/systemd/<unit>` vs host text | receiver: proxy `After`/`Wants`, start limits, `UMask`, `HOME`, `ExecStartPost`, `TimeoutStartSec`. `mw-conversation-poll`, `mw-audit-relay`: proxy `Requires` to `Wants`. `mw-receipt-summary`, `mw-cash-statement`, `mw-cash-statement-email-retry`, `mw-partner-conversation`: the same, plus `-…/outlook-email-oauth.json.bak` in `ReadWritePaths` |

## Not run

| Item | Reason |
| --- | --- |
| journald and `/etc/mw-integration-agent` reads | Permission denied for `codex-cloud` |
| Debian Thai renderer tests | Fonts are not in the container |
| Grafana card or alert | Deferred by the owner |
| Tunnel path restriction (AGT-WEBHOOK-03) | Wave 3 |

## Recovery

Revert `776a1f2`, `a141e06` and the documentation commits in Git. The host is unchanged apart from the unshallow, which needs no rollback. After a deploy, the previous package, config and units are in the helper backup under `/var/lib/mw-integration-agent/rollback/runtime-<stamp>`, and `deploy-runtime.py rollback --commit <sha>` restores them. Two short windows remain: between install and activate the old receiver keeps running the previous modules, and the activate restart briefly refuses connections (Meta retries).

## Deploy request

As prepared before the owner go; performed as recorded under [Deployment](#deployment-16-october-2026).

- Package: commit `a141e0610ab5b41cbcb0a82c32072e8ea0c319b7` (`integration-agent/src`, `systemd` and scripts; Waves 1 and 2). The host clone fetches `main` only and the helper requires HEAD to equal the pin. Merge the branch to `main` first; the pin is then the resulting `main` commit. Its `integration-agent/` tree must equal `a141e06`; the dry run shows this.
- Commands, as root on the host from `/opt/mw-integration-agent-src`:
  1. `integration-agent/scripts/update-from-github.sh` (fast-forward to the pinned `main` commit).
  2. `python3 integration-agent/scripts/deploy-runtime.py dry-run --commit <pin>`. Check the commit matches, the expected units and that ancestry reads `unknown-object`.
  3. `… freeze --commit <pin>`, `… install --commit <pin>`, `… activate --commit <pin> --probe-request-id <unused UUID>`.
  4. Diff and copy `project/scripts/monitoring/debian-health.py` over the host copy in `/opt/mw-resource-monitoring`, keeping the previous file.
- Expected changes: the six worker timers pause during the deploy and resume after the receiver is ready. Package files are replaced and `appsheet.py` is removed. Seven unit files change (above), followed by `daemon-reload` and one receiver restart. The `.bak` file is created if missing. Config `code_version` changes to the pin; no other config or catalogue change. No migration, grant or capability change.
- Verification: activate prints `phase: activated` with `timers_resumed`. Then `curl http://127.0.0.1:8000/ready` returns 200 with `code_version` equal to the pin, and `/health` returns 200. `systemctl list-timers 'mw-*'` shows all 7 timers. The next `mw-resource-health` run reports `webhook_local=1`. A genuine inbound message is captured; no synthetic message is sent.
- Rollback: automatic on readiness failure (timers stay stopped; start them after investigation). Manual: `python3 integration-agent/scripts/deploy-runtime.py rollback --commit <pin>`, which restores package, config, catalogue and units from `/var/lib/mw-integration-agent/rollback/runtime-<stamp>`, restarts the receiver, verifies `/health` and resumes timers. Restore the previous `debian-health.py`.

## Deployment 16 October 2026

Owner instruction: "Merge to main and deploy to the Debian host".

- CI on PR #27 first failed: four engine tests assumed a root runner, and the GitHub runner is not root (non-root git calls add `-c safe.directory`). Fixed in tests only (`6e9662e`), reproduced and verified as `nobody`. Agent tests then passed; merged as `5d39db6c613710859b6dcfa3236f7599d4db9b51`. Its `integration-agent/src`, `systemd` and `scripts` equal `a141e06`.
- Host clone fast-forwarded with `update-from-github.sh` to `5d39db6`, clean.
- `deploy-runtime.py dry-run` as root: identity ok, commit matches, installed `code_version` `a8cf94999aee33e9762614241b31904a967b7cac`, ancestry `unknown-object`, pointer absent, seven units changed, six timers to pause.
- `freeze`: backup `/var/lib/mw-integration-agent/rollback/runtime-20261016T061942514997Z`, metadata SHA-256 `c11b154e9aae5cca1fdcb7180974c236c94e53663072a46655306d23eab5dffa`.
- `install`: installed `.py` names and hashes equal source; `removed_files` empty because pip's uninstall of the previous distribution already removed `appsheet.py`; seven units changed, `daemon-reload`.
- `activate` (unused probe UUID, read-only native probe passed): config `code_version` set to `5d39db6`; receiver restarted, `/ready` reported that commit from a new InvocationID; six timers resumed.
- Monitor: `/opt/mw-resource-monitoring/debian-health.py` replaced by the repository copy (SHA-256 `691bc7df…`); previous copy kept as `debian-health.before-r063w2-20261016.py` (same content as `main` apart from CRLF line endings).

Verification (13:20–13:21 Bangkok):

| Check | Result |
| --- | --- |
| `curl 127.0.0.1:8000/ready` | 200 `{"ready": true, "code_version": "5d39db6c…", "failed": []}` |
| `curl 127.0.0.1:8000/health` | 200 `mw-instagram-webhook` |
| `/ready` with `Cf-Ray` header | 404 |
| Receiver | active since 13:20:18, new InvocationID `5b59c66dbcb944aeaa84823a52022f29`, `ExecStartPost` status 0 |
| Timers | all 7 `mw-*` timers listed; first runs of conversation poll, receipt summary and partner conversation exit 0 |
| Units | `mw-receipt-summary` `Wants=` the proxy, no proxy `Requires=` |
| Graph `.bak` | present, `-rw------- mwagent mwagent`, 0 bytes |
| GCP Monitoring `health` | all 15 components 1 at 06:20:52 UTC, including `webhook_local` from `/ready` |

Not verified: a genuine inbound Instagram message after the restart (none is manufactured); journald (permission denied for `codex-cloud`).

Rollback: `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 5d39db6c613710859b6dcfa3236f7599d4db9b51`, then restore `debian-health.before-r063w2-20261016.py`.

## Open questions

- Deploys run from `main` only: the helper requires the checkout HEAD to equal the pin and `update-from-github.sh` is fast-forward-only on `main`.
- `/ready` is reachable on the public tunnel path apart from the `Cf-Ray`/`Cf-Connecting-Ip` guard until AGT-WEBHOOK-03.
- The `mw-report-charts` and `mw-resource-health` units live outside `integration-agent/systemd/`, and `mw-audit-relay.timer` has no catalogue service key. Both are documented only.

## Remaining work

- Wave 3: AGT-WEBHOOK-03 tunnel path; AGT-QUALITY-05 delete the one-off activation scripts; change the `deploy-operator-audit.py` per-file copy method.
- Confirm the next genuine inbound message is captured.
- Grafana card for `ingress_review_open` and any `webhook_code_version` view: later, with the owner's Grafana revamp.
