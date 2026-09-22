# Operations

## Current state

R015 is active from 22 September 2026, 13:58 Bangkok. Catalogue revision 15 uses PostgreSQL state/audit and current-reviewer API-first Add/Edit/Delete, with bounded SQL fallback. Read [PostgreSQL operations and recovery](POSTGRESQL_OPERATIONS.md) before a runtime update or recovery. The previous SQLite updater is not the current cutover procedure. [Partner conversations](PARTNER_CONVERSATIONS.md) retain their separate switches, durable threads and history.

Daily cash statements are implemented and scheduled under catalogue revision 9; see [cash statement operations](CASH_STATEMENT.md). The owner authorized a 00:15 Asia/Bangkok daily production timer for current Partners with `IG Integration Enabled=true`, plus Microsoft Graph email fallback to each Partner's current Email. The dedicated schedule and fallback controls are enabled; generic sending, processing and writes remain false.

Catalogue revision 9 adds [receipt-only borrower processing and IG-first Partner summaries with email fallback](RECEIPTS.md) active under a dedicated activation switch and cutoff (21 September 2026, 02:50:41 Bangkok). AppSheet Find reads and dedicated PostgreSQL connectivity remain bounded. At that earlier revision, AppSheet edits and durable SQL DML were disabled; current R015 authority is described above. A one-time Instagram reply was accepted by Meta on 20 September 2026, and `sending_enabled` was immediately restored to `false`.

## Production API connections — owner update, 21 September

Both PROD OLTP and OLAP inbound APIs are enabled directly outside the product release process; DEV is unchanged. `appsheet-probe --app oltp` and `--app olap` verify each named connection. OLTP keeps the existing key; OLAP uses its own protected `appsheet-olap-key.txt`. `scripts/configure-appsheet-apis.py` backs up configuration and installs the owner-authorized OLAP connection without displaying credentials. The read client is Find-only; current reviewer mutations use the separate generic audited transport. Receipt posting retains its independent approval workflow.

Do not assume App Upgrade preserves API Enable. The previous recorded enabled OLTP state was found disabled on 21 September. The vendor upgrade guide does not explicitly guarantee this setting; check both production APIs after upgrades without enabling DEV as a workaround.

All Partner notices are Instagram first, email fallback. The former SQLite updater is historical. Current journal recovery uses Cloud SQL backups/PITR and a verified private logical restore; package/configuration/Codex files retain private VM recovery copies. It never resets receipt activation or replays history. See the [16-page process diagram](BUSINESS_PROCESS.md).

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

The source checkout is `/opt/mw-integration-agent-src`. Its `origin` uses a repository-scoped read-only GitHub deploy key stored outside Git. Run `sudo scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update. There is no automatic update timer.

The host timezone is `Asia/Bangkok`. Keep the hardware clock in UTC and NTP synchronization active; application requests that need an explicit business timezone continue to use `Asia/Bangkok` rather than relying only on the host default.

The VM uses the `e2-small` shared-core profile: 2 GB memory and 0.5 fractional vCPU across 2 exposed vCPUs. It was reduced from `e2-medium` on 21 September 2026 after guest telemetry showed about 15% average memory and CPU utilization over the available pre-change sample. Continue monitoring memory, CPU and OOM events under the production workload; rollback is a stop, machine-type change back to `e2-medium`, and start.

Google Cloud Ops Agent 2.71.0 is installed through the VM's existing `goog-ops-agent-policy`/OS Config setup. The VM service account has `roles/monitoring.metricWriter` and `roles/logging.logWriter`; its instance access scope is `cloud-platform`. The default host-metrics pipeline exports every 60 seconds. Memory and process charts require these guest metrics; basic Compute Engine CPU/network metrics alone do not prove the agent is working.

VM Manager OS inventory uses the active Google OS Config agent. Project feature settings must report the full `OSCONFIG_C` feature set. Instance metadata must retain both `enable-osconfig=TRUE` and `enable-guest-attributes=TRUE`; the latter also publishes the earlier guest-attributes inventory. No custom poll interval is configured, so the agent uses the default inventory cadence. A new or re-applied full-feature setting can take up to two hours to propagate before the OS Config inventory API and Compute Engine OS Info view load successfully.

Normal administration uses ordinary public-key OpenSSH over Tailscale at `100.71.171.91`. `tailscaled` is enabled, but Tailscale SSH, subnet routing, exit-node advertising and Tailscale DNS acceptance are off. The worldwide `default-allow-ssh` and `default-allow-rdp` VPC rules are disabled. Recovery SSH uses `allow-ssh-iap-mw-integration-agent`, which permits TCP 22 only from `35.235.240.0/20` and targets the VM's dedicated service account. Keep `sshd` active for both Tailscale and IAP. The existing tailnet retains its owner-managed general access policy; public-key authentication remains an independent SSH authorization boundary.

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
  appsheet-probe --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent /opt/mw-integration-agent-src/scripts/test-postgres-access.sh
```

The example config is not installed as the active config. Live ingress uses `receiver_enabled=true`; generic processing, sending and writes remain false. The cash statement schedule and email fallback have separate enabled controls. Receipt summaries require their own `receipt_summary_enabled` switch. `messages` omits message text unless `--include-text` is explicitly supplied.

The production proxy endpoint is `127.0.0.1:5432`. The VM identity is conditionally granted `roles/cloudsql.client` only for `appsheet-pg-prod-20260914`. PostgreSQL login uses `mw_integration_agent`, which defaults to read-only transactions and has CONNECT, TEMPORARY, public-schema USAGE, and SELECT on business tables. It has no durable table DML privileges. Its password and the AppSheet access key remain in the protected secrets directory outside Git.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Scheduled cash statement

`mw-cash-statement.timer` runs at 00:15 Asia/Bangkok and invokes a one-shot service. `mw-cash-statement-email-retry.timer` checks every five minutes for only definitely unsent fallback messages. Inspect them with:

```bash
systemctl list-timers mw-cash-statement.timer mw-cash-statement-email-retry.timer
systemctl status mw-cash-statement.service mw-cash-statement-email-retry.service
journalctl -u mw-cash-statement.service -u mw-cash-statement-email-retry.service --since today
```

The Graph OAuth JSON is `/etc/mw-integration-agent/secrets/outlook-email-oauth.json`, mode 0600 and owned by `mwagent` because Microsoft can rotate its refresh token. It is the only mutable secret. Back it up outside Git and never print it. The installed sender must verify as `welctcodex@outlook.com`.

## Activation boundary

The owner authorized the receiver, two-way transport foundation, daily cash statement schedule and its email fallback on 20 September 2026. This does not authorize automated conversational replies: keep `sending_enabled=false` except for a deliberate operator action. The owner separately authorized receipt-only processing on 21 September 2026; its dedicated timer is active. Generic processing and all data writes remain disabled.

## Conversation polling

The owner-authorized [API-only conversation reader](CONVERSATION_POLL.md) runs every five minutes for conversations containing AI-enabled borrowers. Browser automation is prohibited. History gaps fail without advancing the checkpoint; inspect mw-conversation-poll.service for errors. Financial writes remain disabled.

## Partner receipt review

See [Partner review](PARTNER_REVIEW.md). Scoped ordinary receipt execution requires a linked Partner approval; potential loan closes and overpayments remain manual-only. This supersedes earlier statements that all financial writes are unavailable. General commands and direct SQL writes remain disabled.


## Reviewer-only corrections and DML — 22 September 2026

The earlier no-DML/general-command status above is superseded for current AI Reviewers by [Reviewer DML](REVIEWER_DML.md). Reporting connectivity and receipt-review authority remain separate. Both conversational API edits and the new structured database operations require fresh reviewer membership. Runtime setup grants no schema/trigger administration to the agent and does not modify AppSheet definitions or Flyway history.
