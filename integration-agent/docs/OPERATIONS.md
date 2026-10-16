# Operations

## Current state

R053 native workload transport and catalogue revision27 are deployed. R057 removes the remaining AppSheet probe/credential setup and rejects attempts to re-enable that transport. Read [Partner conversations](PARTNER_CONVERSATIONS.md) for current native endpoint, manifest and recovery controls, and [PostgreSQL operations and recovery](POSTGRESQL_OPERATIONS.md) for journal recovery. Existing switches, cutoffs, durable threads and history remain in force. The earlier revision descriptions below are dated activation evidence.

Daily cash statements are implemented and scheduled under catalogue revision 9; see [cash statement operations](CASH_STATEMENT.md). The owner authorized a 00:15 Asia/Bangkok daily production timer for current Partners with `IG Integration Enabled=true`, plus Microsoft Graph email fallback to each Partner's current Email. The dedicated schedule and fallback controls are enabled; generic sending, processing and writes remain false.

Catalogue revision 9 adds [receipt-only borrower processing and IG-first Partner summaries with email fallback](RECEIPTS.md) active under a dedicated activation switch and cutoff (21 September 2026, 02:50:41 Bangkok). AppSheet Find reads and dedicated PostgreSQL connectivity remain bounded. At that earlier revision, AppSheet edits and durable SQL DML were disabled; current R015 authority is described above. A one-time Instagram reply was accepted by Meta on 20 September 2026, and `sending_enabled` was immediately restored to `false`.

## Native production API connections

Use `native-api-probe --scope oltp` and `--scope olap` with the private config and catalogue paths to verify the authenticated native capability catalogue and a key-only read. The native command origin/audience and capability-manifest pin identify the approved API. AppSheet IDs, access keys and schema-export paths are retired runtime inputs; the old probe, connection installer and AppSheet schema verifier are removed. `appsheet_enabled` may be absent or explicitly false; true is rejected. Preserve old private recovery snapshots without restoring their retired credentials into active configuration.

All Partner notices are Instagram first, email fallback. The former SQLite updater is historical. Current journal recovery uses Cloud SQL backups/PITR and a verified private logical restore; package/configuration/Codex files retain private VM recovery copies. It never resets receipt activation or replays history. See the [16-page process diagram](BUSINESS_PROCESS.md).

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

The source checkout is `/opt/mw-integration-agent-src`, a clone of `welct0407/MW-Credit-App` `main` (this code is its `integration-agent/` directory; cut over 15 October 2026). Its `origin` uses a repository-scoped read-only GitHub deploy key at `/etc/mw-integration-agent/git/github_deploy_key_mw_credit_app` (outside Git). Run `sudo integration-agent/scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update on `main`; it only moves the checkout and installs nothing. Install and activate through the deploy helper below. There is no automatic update timer.

## Deploying a reviewed commit

Code-only deploys use one route, `integration-agent/scripts/deploy-runtime.py`, run as root from the checkout. The retired `update-reviewed-runtime.sh` and a manual `pip install` are not used. The deploy needs an owner go for the exact commit. Config switches, cutoffs and catalogue entries are preserved; only `code_version` changes to the pinned commit.

Before running it, the commit must be in the checkout and the checkout HEAD must equal it (`update-from-github.sh` is fast-forward-only on `main`, so merge to `main` first). The live and repository catalogues must have the same `revision`, service names and `implemented` flags, or the helper refuses. Activation runs a native read-only probe and needs an unused UUID (`--probe-request-id`).

```bash
sudo python3 integration-agent/scripts/deploy-runtime.py dry-run  --commit <sha>
sudo python3 integration-agent/scripts/deploy-runtime.py freeze   --commit <sha>
sudo python3 integration-agent/scripts/deploy-runtime.py install  --commit <sha>
sudo python3 integration-agent/scripts/deploy-runtime.py activate --commit <sha> --probe-request-id <unused-uuid>
sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit <sha>
```

- `dry-run` writes nothing. It compares the checkout, installed package, units and live `code_version` with the commit and prints the plan.
- `freeze` stops the worker timers, waits for running workers, and backs up config, catalogue, package and units to `/var/lib/mw-integration-agent/rollback/runtime-<stamp>` (pointer `runtime-current`). It records the receiver InvocationID and whether the old `code_version` is an ancestor. Ancestry reads `unknown-object` until a deploy has set `code_version` to a monorepo commit.
- `install` runs `pip install --no-deps` from the checkout, deletes installed `.py` files absent from source, checks that the installed names and hashes equal source, installs changed unit files, runs `daemon-reload`, and creates the Graph token `.bak` file if missing.
- `activate` runs the probe, writes the pinned `code_version`, restarts `mw-instagram-webhook`, and waits up to 30 s for `/ready` to report that commit from a new InvocationID. Only then does it start the paused timers.
- If activation fails, it rolls back automatically (package, config, units, receiver restart) and leaves the timers stopped. `rollback` restores the backup on request and resumes timers only after verification.
- `install` and `activate` refuse when the live `config.json` or catalogue differs from the freeze ("Live configuration drift"). Make a config edit that the new package needs before `freeze` (first copy the file to `/root/config.json.pre-<wave>`), then run `check` with the new package after `install`. A config-only change with no package change does not use the helper: stop the six worker timers, wait until their services are inactive, change and `check`, restart `mw-instagram-webhook`, run `receiver-ready --wait 30`, then start the timers (used for the ALL-ARCH-03 switch, its rollback and the retry on 16 October 2026). After such a change, also check the host monitor's next run (`journalctl -u mw-resource-health`), not only `/ready` and the workers.
- Dependencies come from the hash-pinned `integration-agent/requirements.lock`: `/opt/mw-integration-agent/.venv/bin/python -m pip install --require-hashes -r integration-agent/requirements.lock` before `install` (no-op when the venv already matches; it did on 16 October 2026). The helper itself installs with `--no-deps`.

The deploy also installs the repository copy of `project/scripts/monitoring/debian-health.py` to `/opt/mw-resource-monitoring`. The helper does not do this. `mw-report-charts` and `mw-resource-health` units live outside `integration-agent/systemd/`.

The receiver serves `/ready` on the loopback port: 200 with `ready: true` and `code_version` when the config, catalogue, secrets and state checks pass and the running process still matches the configured `code_version` and installed package hash (`current`). Tunnelled requests (`Cf-Ray`/`Cf-Connecting-Ip`) get 404 until the tunnel path is restricted. `mw-integration-agent receiver-ready --config … [--wait 30]` runs the same check; the unit calls it after start as a non-fatal gate. A handler exception writes one `ingress_error` JSON line to stderr. `debian-health.py` sets `webhook_local` from `/ready` and prints `webhook_code_version`.

The host timezone is `Asia/Bangkok`. Keep the hardware clock in UTC and NTP synchronization active; application requests that need an explicit business timezone continue to use `Asia/Bangkok` rather than relying only on the host default.

The VM uses the `e2-small` shared-core profile: 2 GB memory and 0.5 fractional vCPU across 2 exposed vCPUs. It was reduced from `e2-medium` on 21 September 2026 after guest telemetry showed about 15% average memory and CPU utilization over the available pre-change sample. Continue monitoring memory, CPU and OOM events under the production workload; rollback is a stop, machine-type change back to `e2-medium`, and start.

Google Cloud Ops Agent 2.71.0 is installed through the VM's existing `goog-ops-agent-policy`/OS Config setup. The VM service account has `roles/monitoring.metricWriter` and `roles/logging.logWriter`; its instance access scope is `cloud-platform`. The default host-metrics pipeline exports every 60 seconds. Memory and process charts require these guest metrics; basic Compute Engine CPU/network metrics alone do not prove the agent is working.

VM Manager OS inventory uses the active Google OS Config agent. Project feature settings must report the full `OSCONFIG_C` feature set. Instance metadata must retain both `enable-osconfig=TRUE` and `enable-guest-attributes=TRUE`; the latter also publishes the earlier guest-attributes inventory. No custom poll interval is configured, so the agent uses the default inventory cadence. A new or re-applied full-feature setting can take up to two hours to propagate before the OS Config inventory API and Compute Engine OS Info view load successfully.

Normal administration uses ordinary public-key OpenSSH over Tailscale at `100.71.171.91`. From a Claude Code cloud session (no Tailscale), use `mw-debian-ssh` from `project/scripts/cloud-session-setup.sh`: OpenSSH through an IAP tunnel as instance-level user `codex-cloud` (key in Secret Manager `mw-credit-cloud-operator-ssh-key`, pinned host key), for example `mw-debian-ssh 'cd /opt/mw-integration-agent-src && sudo integration-agent/scripts/update-from-github.sh'`. `tailscaled` is enabled, but Tailscale SSH, subnet routing, exit-node advertising and Tailscale DNS acceptance are off. The worldwide `default-allow-ssh` and `default-allow-rdp` VPC rules are disabled. Recovery SSH uses `allow-ssh-iap-mw-integration-agent`, which permits TCP 22 only from `35.235.240.0/20` and targets the VM's dedicated service account. Keep `sshd` active for both Tailscale and IAP. The existing tailnet retains its owner-managed general access policy; public-key authentication remains an independent SSH authorization boundary.

Three files are not installed by the deploy helper (`UNIT_FILES` covers the receiver and the six workers): `mw-cloudflared-instagram.service`, the Cloud SQL Auth Proxy IAM unit `systemd/cloud-sql-auth-proxy-iam.service` and its drop-in `systemd/cloud-sql-auth-proxy.service.d/iam-listener.conf`. Install them by hand in a maintenance window with `systemd-analyze verify`; the commands used are in the [W3 agent change note](../Change%20Logs/CHANGE_NOTES_W3_AGENT_2026-10-16.md#deployment-16-october-2026).

Applied 16 October 2026 (R063 W3 deploy, `20b6849`, then `300aeb5`): the cloudflared unit drops a duplicate `ProtectHome=true` and adds `RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK` (AGT-HOST-03). ALL-ARCH-03 is active since 10:20 UTC (`300aeb5`, after a first attempt was rolled back): a second proxy listener on `127.0.0.1:5433` with `auto-iam-authn`, since 11:49 UTC in its own process `cloud-sql-auth-proxy-iam.service` (pulled in and restarted with the base proxy by the drop-in `cloud-sql-auth-proxy.service.d/iam-listener.conf`). Keep it separate: in one process an `auto-iam-authn` listener makes every listener use the IAM certificate, and IAM users signing in with a token on 5432 (the cloud-session read route) fail; `database_auth=iam` and `agent_database_auth=iam`. The worker, relay, reporting and host-monitor connections log in as the IAM user and `SET ROLE` (keys in [PostgreSQL operations](POSTGRESQL_OPERATIONS.md#database-authentication-all-arch-03)). Reviewer DML and the receipt projector stay on password roles on 5432 until W4. The three old password files and their roles' LOGIN stay until the cleanup prepared in the W3 change note. Since 16 October 2026 the tunnel admits only `^/instagram$` on `hooks.mw-credit.com` (AGT-WEBHOOK-03); `/health` and `/ready` are local only and answer 404 from outside. The GCP uptime check calls `GET /instagram` and expects 403 with `Forbidden`.

Do not store credentials in the repository, VM metadata, startup scripts, or systemd unit text.

Instagram secrets belong in `/etc/mw-integration-agent/secrets` with root ownership, group `mwagent`, directory mode `0750`, and file mode `0640`. The live config references those files and must not contain secret values.

## Verification

```bash
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  check --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login status
systemctl is-active cloud-sql-auth-proxy.service cloud-sql-auth-proxy-iam.service
ss -ltn '( sport = :5432 or sport = :5433 )'
systemctl is-active mw-instagram-webhook.service
systemctl is-active mw-cloudflared-instagram.service
systemctl is-active google-cloud-ops-agent-opentelemetry-collector.service
systemctl is-active google-cloud-ops-agent-fluent-bit.service
systemctl is-active google-osconfig-agent.service
systemctl is-active tailscaled.service
tailscale status
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/ready
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  instagram-probe --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  messages --config /etc/mw-integration-agent/config.json --limit 10
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  native-api-probe --scope oltp --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
```

The example config is not installed as the active config. Live ingress uses `receiver_enabled=true`; generic processing, sending and writes remain false. The cash statement schedule and email fallback have separate enabled controls. Receipt summaries require their own `receipt_summary_enabled` switch. `messages` omits message text unless `--include-text` is explicitly supplied.

The production proxy endpoints are `127.0.0.1:5432` (`cloud-sql-auth-proxy.service`; password logins for reviewer DML and receipt projector, token logins for IAM users such as the cloud-session read route) and `127.0.0.1:5433` (`cloud-sql-auth-proxy-iam.service`; automatic IAM login for the VM service account). The VM identity is conditionally granted `roles/cloudsql.client` and `roles/cloudsql.instanceUser` only for `mw-credit-pg-20261017`. Reporting reads log in as IAM user `mw-integration-agent@clever-oasis-508610-n7.iam` and `SET ROLE mw_integration_agent`, which defaults to read-only transactions and has CONNECT, TEMPORARY, public-schema USAGE, and SELECT on business tables. It has no durable table DML privileges. The IAM user is `NOINHERIT` and holds `mw_agent_worker`, `mw_agent_relay` and `mw_integration_agent` with `INHERIT FALSE, SET TRUE`, plus CONNECT on `mw_agent` and `loan_manager_prod` only. The password-only `test-postgres-access.sh`, `configure-postgres-access.sh` and `inspect-cash-statement.py` were retired on 16 October 2026.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Restore-to-new-VM rehearsal

Purpose (ALL-INFRA-04): prove the VM can be rebuilt from the daily disk snapshot. The VM has `deletion_protection = true`.

Procedure (rehearsed 16 October 2026, 257 s end to end):

1. Take the latest snapshot of the boot disk (`default-schedule-1` daily policy; rehearsal used `…20261016070420-a54tkmxk`).
2. Isolate before booting: the project has no Cloud NAT or router and Private Google Access is off; add two temporary deny-all firewall rules (ingress and egress) for a rehearsal network tag (27 s).
3. Create a disk from the snapshot (24 s) and a VM from it with that tag, no external IP and `--no-service-account --no-scopes` (15 s).
4. Read `gcloud compute instances get-serial-port-output`: login prompt about 27 s after create; kernel 6.12.111+deb13-cloud-amd64, Debian 13, clean filesystem check, all `mw-*` timers started; the Cloud SQL proxy and tailscaled failed to connect, as intended.
5. Delete the VM, the disk and both temporary rules, and read back that they are gone (116 s).

Result: passed. The restored disk carries the production Tailscale and cloudflared identities and the timers start on boot, so a real restore must keep the copy isolated until the original VM is stopped. The guest agent creates new SSH host keys on first boot, so the pinned host key changes after a restore.

## Journal output and retention

Timer-driven services print aggregate output only: counts, states and hashed partner keys, never message text. Message content reaches the journal only through the manual commands `messages --include-text` and `instagram-probe` (which prints the account username); do not run them casually, because journald retains whatever they print. Log access route (AGT-HOST-01, applied 16 October 2026): `codex-cloud` is in `systemd-journal` (`sudo usermod -aG systemd-journal codex-cloud`), effective in a new SSH session; readback `mw-debian-ssh 'id -nG; journalctl -u mw-instagram-webhook.service -n 1'`. `codex-cloud` is a metadata-managed user, so re-check `id codex-cloud` after a guest-agent restart or reboot. Rollback: `sudo gpasswd -d codex-cloud systemd-journal`. Retention (read 16 October 2026): `/etc/systemd/journald.conf` and `journald.conf.d/` set no `Storage`, `SystemMaxUse` or `MaxRetentionSec`, so the Debian default applies: 10% of the 9.7G root filesystem (about 1 GiB) and no time limit. `journalctl --disk-usage` was 942.9M, so the journal is at its size cap and older entries are rotated out by size.

## Scheduled cash statement

`mw-cash-statement.timer` runs at 00:15 Asia/Bangkok and invokes a one-shot service. `mw-cash-statement-email-retry.timer` checks every five minutes for only definitely unsent fallback messages. Inspect them with:

```bash
systemctl list-timers mw-cash-statement.timer mw-cash-statement-email-retry.timer
systemctl status mw-cash-statement.service mw-cash-statement-email-retry.service
journalctl -u mw-cash-statement.service -u mw-cash-statement-email-retry.service --since today
```

The Graph OAuth JSON is `/etc/mw-integration-agent/secrets/outlook-email-oauth.json`, mode 0600 and owned by `mwagent` because Microsoft can rotate its refresh token. It is the only mutable secret. Back it up outside Git and never print it. The installed sender must verify as `welctcodex@outlook.com`.

Before each rotation the agent copies the current file to `outlook-email-oauth.json.bak` (same directory, 0600) and only then rewrites the original in place, so an interrupted write leaves the previous refresh token recoverable. The four email-capable units list that path as an optional `ReadWritePaths=` entry (`-` prefix), which systemd can only bind when the file exists. The deploy helper creates it when missing and reloads units; to do it by hand, as root:

```bash
install -o mwagent -g mwagent -m 0600 /dev/null /etc/mw-integration-agent/secrets/outlook-email-oauth.json.bak
systemctl daemon-reload
```

Until it exists, a rotation still succeeds and the worker prints one `credential_backup_failed` line to its journal.

## Activation boundary

The owner authorized the receiver, two-way transport foundation, daily cash statement schedule and its email fallback on 20 September 2026. This does not authorize automated conversational replies: keep `sending_enabled=false` except for a deliberate operator action. The owner separately authorized receipt-only processing on 21 September 2026; its dedicated timer is active. Generic processing and all data writes remain disabled.

## Conversation polling

The owner-authorized [API-only conversation reader](CONVERSATION_POLL.md) runs every five minutes for conversations containing AI-enabled borrowers. Browser automation is prohibited. History gaps fail without advancing the checkpoint; inspect mw-conversation-poll.service for errors. Financial writes remain disabled.

## Partner receipt review

See [Partner review](PARTNER_REVIEW.md). New ordinary receipts post automatically under the configured owner policy. New overpayments require linked reviewer approval for full-amount Lump Sum; potential closures remain manual. This supersedes earlier statements that all financial writes are unavailable. General commands and direct SQL writes remain disabled.


## Reviewer-only corrections and DML — 22 September 2026

The earlier no-DML/general-command status above is superseded for current AI Reviewers by [Reviewer DML](REVIEWER_DML.md). Reporting connectivity and receipt-review authority remain separate. Both conversational API edits and the new structured database operations require fresh reviewer membership. Runtime setup grants no schema/trigger administration to the agent and does not modify AppSheet definitions or Flyway history.

## Resource monitoring — 22 September 2026

Owner-authorized infrastructure monitoring now runs separately from the business runtime: `/opt/mw-resource-monitoring/debian-health.py`, executed by `mw-resource-health.service`/`.timer` as mwagent every two minutes using the existing Python virtual environment. Maintained source, tests, GCP uptime check definition and Grafana definitions belong to `C:\GitHub\AppSheet-Loan-Project\scripts\monitoring` and its Resource_Monitoring.md reference. The business catalogue and activation flags are unchanged.

The collector reads timer results/cadence, local webhook and Cloudflare connection health, Tailscale node state, read-only database connectivity, existing bounded AppSheet probes and local Codex login readiness. It invokes no business cycle and sends no test message/model prompt. It exports numeric health only through the existing VM identity to GCP Monitoring; stale reports become UNKNOWN in Grafana. Public webhook checks run independently in Google Cloud. Azure VM-01 is not a monitoring dependency. Tailscale is node health, not external peer reachability.

For rollback, disable/stop only `mw-resource-health.timer` and its service, then remove only its dedicated script/units after preserving evidence. Do not stop the existing business timers or restore application journals. See the linked monitoring change record in the AppSheet repository for dashboard/uptime-check rollback and verification.

Revision 21 provides read-only queue health in `receipt_health.py`. The [monitoring handover](MONITORING_IMPLEMENTATION_HANDOVER.md) covers the proposed Payment processing group and collector patch. Worker deployment does not activate the monitoring changes.
