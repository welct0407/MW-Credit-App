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

The source checkout is `/opt/mw-integration-agent-src`, a clone of `welct0407/MW-Credit-App` `main` (this code is its `integration-agent/` directory; cut over 15 October 2026). Its `origin` uses a repository-scoped read-only GitHub deploy key at `/etc/mw-integration-agent/git/github_deploy_key_mw_credit_app` (outside Git). Run `sudo integration-agent/scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update; install with `pip install /opt/mw-integration-agent-src/integration-agent` in the existing venv. There is no automatic update timer.

The host timezone is `Asia/Bangkok`. Keep the hardware clock in UTC and NTP synchronization active; application requests that need an explicit business timezone continue to use `Asia/Bangkok` rather than relying only on the host default.

The VM uses the `e2-small` shared-core profile: 2 GB memory and 0.5 fractional vCPU across 2 exposed vCPUs. It was reduced from `e2-medium` on 21 September 2026 after guest telemetry showed about 15% average memory and CPU utilization over the available pre-change sample. Continue monitoring memory, CPU and OOM events under the production workload; rollback is a stop, machine-type change back to `e2-medium`, and start.

Google Cloud Ops Agent 2.71.0 is installed through the VM's existing `goog-ops-agent-policy`/OS Config setup. The VM service account has `roles/monitoring.metricWriter` and `roles/logging.logWriter`; its instance access scope is `cloud-platform`. The default host-metrics pipeline exports every 60 seconds. Memory and process charts require these guest metrics; basic Compute Engine CPU/network metrics alone do not prove the agent is working.

VM Manager OS inventory uses the active Google OS Config agent. Project feature settings must report the full `OSCONFIG_C` feature set. Instance metadata must retain both `enable-osconfig=TRUE` and `enable-guest-attributes=TRUE`; the latter also publishes the earlier guest-attributes inventory. No custom poll interval is configured, so the agent uses the default inventory cadence. A new or re-applied full-feature setting can take up to two hours to propagate before the OS Config inventory API and Compute Engine OS Info view load successfully.

Normal administration uses ordinary public-key OpenSSH over Tailscale at `100.71.171.91`. From a Claude Code cloud session (no Tailscale), use `mw-debian-ssh` from `project/scripts/cloud-session-setup.sh`: OpenSSH through an IAP tunnel as instance-level user `codex-cloud` (key in Secret Manager `mw-credit-cloud-operator-ssh-key`, pinned host key), for example `mw-debian-ssh 'cd /opt/mw-integration-agent-src && sudo integration-agent/scripts/update-from-github.sh'`. `tailscaled` is enabled, but Tailscale SSH, subnet routing, exit-node advertising and Tailscale DNS acceptance are off. The worldwide `default-allow-ssh` and `default-allow-rdp` VPC rules are disabled. Recovery SSH uses `allow-ssh-iap-mw-integration-agent`, which permits TCP 22 only from `35.235.240.0/20` and targets the VM's dedicated service account. Keep `sshd` active for both Tailscale and IAP. The existing tailnet retains its owner-managed general access policy; public-key authentication remains an independent SSH authorization boundary.

Do not store credentials in the repository, VM metadata, startup scripts, or systemd unit text.

Instagram secrets belong in `/etc/mw-integration-agent/secrets` with root ownership, group `mwagent`, directory mode `0750`, and file mode `0640`. The live config references those files and must not contain secret values.

## Verification

```bash
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  check --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login status
systemctl is-active cloud-sql-auth-proxy.service
ss -ltn '( sport = :5432 )'
systemctl is-active mw-instagram-webhook.service
systemctl is-active mw-cloudflared-instagram.service
systemctl is-active google-cloud-ops-agent-opentelemetry-collector.service
systemctl is-active google-cloud-ops-agent-fluent-bit.service
systemctl is-active google-osconfig-agent.service
systemctl is-active tailscaled.service
tailscale status
curl --fail http://127.0.0.1:8000/health
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  instagram-probe --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  messages --config /etc/mw-integration-agent/config.json --limit 10
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  native-api-probe --scope oltp --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent /opt/mw-integration-agent-src/integration-agent/scripts/test-postgres-access.sh
```

The example config is not installed as the active config. Live ingress uses `receiver_enabled=true`; generic processing, sending and writes remain false. The cash statement schedule and email fallback have separate enabled controls. Receipt summaries require their own `receipt_summary_enabled` switch. `messages` omits message text unless `--include-text` is explicitly supplied.

The production proxy endpoint is `127.0.0.1:5432`. The VM identity is conditionally granted `roles/cloudsql.client` only for `appsheet-pg-prod-20260914`. PostgreSQL login uses `mw_integration_agent`, which defaults to read-only transactions and has CONNECT, TEMPORARY, public-schema USAGE, and SELECT on business tables. It has no durable table DML privileges. Its password and the AppSheet access key remain in the protected secrets directory outside Git.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Journal output and retention

Timer-driven services print aggregate output only: counts, states and hashed partner keys, never message text. Message content reaches the journal only through the manual commands `messages --include-text` and `instagram-probe` (which prints the account username); do not run them casually, because journald retains whatever they print. Journald retention on the host has not been verified by the review identity (the journal is readable only by `adm`/`systemd-journal` members). Whoever has that access should record here the effective `SystemMaxUse`/`MaxRetentionSec` from `/etc/systemd/journald.conf` (and `journald.conf.d/`) together with `journalctl --disk-usage`; until then assume the Debian default (10% of the filesystem, capped at 4 GiB, no time limit).

## Scheduled cash statement

`mw-cash-statement.timer` runs at 00:15 Asia/Bangkok and invokes a one-shot service. `mw-cash-statement-email-retry.timer` checks every five minutes for only definitely unsent fallback messages. Inspect them with:

```bash
systemctl list-timers mw-cash-statement.timer mw-cash-statement-email-retry.timer
systemctl status mw-cash-statement.service mw-cash-statement-email-retry.service
journalctl -u mw-cash-statement.service -u mw-cash-statement-email-retry.service --since today
```

The Graph OAuth JSON is `/etc/mw-integration-agent/secrets/outlook-email-oauth.json`, mode 0600 and owned by `mwagent` because Microsoft can rotate its refresh token. It is the only mutable secret. Back it up outside Git and never print it. The installed sender must verify as `welctcodex@outlook.com`.

Before each rotation the agent copies the current file to `outlook-email-oauth.json.bak` (same directory, 0600) and only then rewrites the original in place, so an interrupted write leaves the previous refresh token recoverable. The four email-capable units list that path as an optional `ReadWritePaths=` entry (`-` prefix), which systemd can only bind when the file exists; create it once as root, then reload units:

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
