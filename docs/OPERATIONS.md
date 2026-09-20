# Operations

## Current state

Daily cash statements are implemented and scheduled under catalogue revision 7; see [cash statement operations](CASH_STATEMENT.md). The owner authorized a 00:15 Asia/Bangkok daily production timer for current Partners with `IG Integration Enabled=true`, plus Microsoft Graph email fallback to each Partner's current Email. The dedicated schedule and fallback controls are enabled; generic sending, processing and writes remain false.

This repository has no automated production business runtime. Catalogue revision 2 adds bounded AppSheet Find reads and dedicated PostgreSQL connectivity to the verified Instagram transport. AppSheet edits and durable SQL DML remain disabled. A one-time Instagram reply was accepted by Meta on 20 September 2026, and `sending_enabled` was immediately restored to `false`.

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

The source checkout is `/opt/mw-integration-agent-src`. Its `origin` uses a repository-scoped read-only GitHub deploy key stored outside Git. Run `sudo scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update. There is no automatic update timer.

The host timezone is `Asia/Bangkok`. Keep the hardware clock in UTC and NTP synchronization active; application requests that need an explicit business timezone continue to use `Asia/Bangkok` rather than relying only on the host default.

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

The example config is not installed as the active config. Live ingress sets only `receiver_enabled=true`; processing, sending, writes, and schedules remain false. `messages` omits message text unless `--include-text` is explicitly supplied.

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

The owner authorized the receiver, two-way transport foundation, daily cash statement schedule and its email fallback on 20 September 2026. This does not authorize automated conversational replies: keep `sending_enabled=false` except for a deliberate operator action. Processing and data-write activation remain separate decisions.
