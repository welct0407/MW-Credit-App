# W2 agent — receiver readiness and deployment recovery — 2026-10-16

## Purpose

Make the webhook receiver report when it is ready and give the agent one safe deploy route that restarts the receiver and waits for readiness before workers resume. Code commit `776a1f2` on branch `claude/review-w2-agent`, branched from `main` `9cab7d1`. Source only: no deploy, restart, timer change, migration or grant.

## Changes

- **AGT-DEPLOY-01**: already merged. Wave 1 (including recovery commit `58929d7`) is on `main`; no new recovery commit was needed. The installed tree equals `58929d7` hash for hash, apart from the dead installed-only `appsheet.py`. Recorded in `project/Documents/Environment_Inventory.md`.
- **AGT-DEPLOY-02** (`scripts/deploy-shared-receipt-api.py`, `activate-conversation-poll.sh`, `activate-partner-conversations.sh`, `deploy-cash-statement.sh`, `deploy-operator-audit.py`, `deploy-receipt-audit-repair.py`, `deploy-receipt-evidence.py`, `deploy-receipt-summary.sh`, `install-cash-statement-schedule.sh`, `install-postgresql-config.py`, `verify-receipt-evidence.py`): `CHECKOUT` is the monorepo clone and `REPO` is `<clone>/integration-agent`; the other scripts use the same paths.
- **AGT-DEPLOY-03** (`deploy-shared-receipt-api.py`): install checks the installed `.py` names and hashes against a non-empty source, removes stale `.py` files, installs changed unit files and runs `daemon-reload`.
- **AGT-DEPLOY-04** (`scripts/update-reviewed-runtime.sh` deleted, `scripts/deploy-runtime.py` new): the old helper is retired. The new code-only entry point changes only `code_version`, and requires the live and repository catalogues to match in revision, service names and `implemented` flags.
- **AGT-DEPLOY-05** (`deploy-shared-receipt-api.py`): phases `dry-run|freeze|install|activate|rollback`. Activate restarts the receiver, waits for `/ready` with the pinned `code_version` and a new InvocationID, then resumes timers. Failure rolls back automatically and leaves timers stopped. Manual rollback resumes timers only after verification. The `.bak` file is created if missing. Stale terminal pointers are archived.
- **AGT-DEPLOY-06**: no code change. `/ready` `code_version` is the deployed-version identity.
- **AGT-DEPLOY-07**: ancestry of the old `code_version` is recorded at dry-run and freeze. The host clone was unshallowed on 16 October 2026 (owner-authorized, the only host change): HEAD unchanged at `9f4e5b37bb4b9ca6ce660efc15dcf29496c0c308`, tree clean, `origin/main` now `9cab7d1`, `.git` 268M to 276M. `a8cf949` is not an object in the monorepo, so ancestry reads `unknown-object` until the first deploy sets `code_version` to a monorepo commit. The clone fetches `main` only.
- **AGT-R063-01** (`server.py`, `cli.py`): `/ready` checks config, catalogue, secrets, state and that the running version equals the configured `code_version` and installed package hash. It answers 404 to tunnelled requests (`Cf-Ray`/`Cf-Connecting-Ip`) until AGT-WEBHOOK-03 restricts the tunnel path.
- **AGT-R063-02** (`cli.py`): `receiver-ready --config … [--wait N]` polls `/ready` and exits 0 or 1.
- **AGT-R063-03** (`systemd/mw-instagram-webhook.service`): `After=`/`Wants=` the proxy, `UMask=0077`, `HOME`, non-fatal `ExecStartPost=-… receiver-ready --wait 30`, `TimeoutStartSec=45s`, `StartLimitIntervalSec=300`, `StartLimitBurst=5`.
- **AGT-R063-04** (`server.py`): one stderr `ingress_error` JSON line per handler exception.
- **AGT-R063-05** (`server.py`): imports happen before `serve_forever`, so a broken package fails at start instead of on the first request.
- **Host monitor** (`project/scripts/monitoring/debian-health.py`): `webhook_local` comes from `/ready` (200, `ready: true`, non-empty `code_version`) and `webhook_code_version` is printed, not exported as a metric. No Grafana or alert change.
- **Docs**: `docs/OPERATIONS.md` (single deploy route, `/ready`), `SERVICE_CATALOGUE.md` (note only), `project/Documents/Development_Changes.md`, `project/Documents/Environment_Inventory.md`. `service-catalogue.json` is unchanged on purpose.

Host readback (16 October 2026, read-only): the receiver `mw-instagram-webhook` has been active since 2026-10-14 18:43:32 +07 with NRestarts=0; `/health` 200, `/ready` 404 (not deployed). Receiver, proxy, cloudflared, verify units and all six repo timers match the repo. The six worker services differ only by the undeployed Wave 1 edits (`Wants` vs `Requires` for the proxy, `.bak` in `ReadWritePaths`). Against `main` `9cab7d1` the installed tree differs in 7 files from Wave 1 (`graph_email.py`, `instagram.py`, `journal.py`, `partner_notice.py`, `receipt_health.py`, `server.py`, `webhook.py`). Package metadata still points at the old checkout root.

## Checks

| Check | Command or setup | Result |
| --- | --- | --- |
| _pending Agent C_ | | |

## Not run

| Item | Reason |
| --- | --- |
| Debian deploy, restart, timer change | Not authorized in this wave |
| journald and `/etc/mw-integration-agent` reads | Permission denied for `codex-cloud` |
| Debian Thai renderer tests | Fonts are not in the container |
| Grafana card or alert | Deferred by the owner |
| Tunnel path restriction (AGT-WEBHOOK-03) | Wave 3 |

## Recovery

Revert `776a1f2` and the documentation commit in Git. The host is unchanged apart from the unshallow, which needs no rollback. After a deploy, the previous package, config and units are in the helper backup under `/var/lib/mw-integration-agent/rollback/runtime-<stamp>`, and `deploy-runtime.py rollback --commit <sha>` restores them.

## Deploy request

_pending orchestrator_

## Open questions

- The deploy commit must be on the host clone. The helper requires the checkout HEAD to equal the pinned commit, and `update-from-github.sh` is fast-forward-only on `main`. Merge the branch to `main` first, or the owner approves a detached checkout.
- `/ready` is reachable on the public tunnel path apart from the `Cf-Ray`/`Cf-Connecting-Ip` guard until AGT-WEBHOOK-03.
- The `mw-report-charts` and `mw-resource-health` units live outside `integration-agent/systemd/`, and `mw-audit-relay.timer` has no catalogue service key. Both are documented only.

## Remaining work

- Wave 3: AGT-WEBHOOK-03 tunnel path; AGT-QUALITY-05 delete the one-off activation scripts; change the `deploy-operator-audit.py` per-file copy method.
- Deploy Waves 1 and 2 after the owner go. Install the repo `debian-health.py` to `/opt/mw-resource-monitoring` as part of that deploy.
- Close the R063 outstanding row ("Integration receiver deployment tooling") after the deploy is verified.
- Grafana card for `ingress_review_open` and any `webhook_code_version` view: later, with the owner's Grafana revamp.
