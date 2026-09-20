# Operations

## Current state

This repository has no production business runtime. Catalogue revision 1 enables signed Instagram receipt ingress and explicit Instagram delivery; live delivery remains disabled by the runtime flag. The receiver stores messages without processing or replying. A one-time outbound reply was accepted by Meta on 20 September 2026, and `sending_enabled` was immediately restored to `false`. The loopback-only Cloud SQL Auth Proxy remains independent and has no database password.

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

The source checkout is `/opt/mw-integration-agent-src`. Its `origin` uses a repository-scoped read-only GitHub deploy key stored outside Git. Run `sudo scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update. There is no automatic update timer.

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
```

The example config is not installed as the active config. Live ingress sets only `receiver_enabled=true`; processing, sending, writes, and schedules remain false. `messages` omits message text unless `--include-text` is explicitly supplied.

The production proxy endpoint is `127.0.0.1:5432`. The VM identity is conditionally granted `roles/cloudsql.client` only for `appsheet-pg-prod-20260914`. Proxy transport authentication does not replace PostgreSQL authentication: a separately approved, least-privilege database role/credential is still required before an application can log in.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Activation boundary

The owner authorized the receiver, two-way transport foundation, and one controlled outbound reply on 20 September 2026. That test is complete. It does not authorize automated replies: keep `sending_enabled=false` except for another deliberate operator action. Processing, scheduler, and data-write activation remain separate decisions.
