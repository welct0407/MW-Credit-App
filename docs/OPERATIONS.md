# Operations

## Current state

This repository has no production business runtime. All service flags are false and the catalogue is revision 0. The disabled one-shot configuration verifier is installed alongside an enabled loopback-only Cloud SQL Auth Proxy; the proxy provides an authenticated transport but has no database password and cannot start business processing.

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

The source checkout is `/opt/mw-integration-agent-src`. Its `origin` uses a repository-scoped read-only GitHub deploy key stored outside Git. Run `sudo scripts/update-from-github.sh` from the checkout for a clean, fast-forward-only update. There is no automatic update timer.

Do not store credentials in the repository, VM metadata, startup scripts, or systemd unit text.

## Verification

```bash
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  check --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login status
systemctl is-active cloud-sql-auth-proxy.service
ss -ltn '( sport = :5432 )'
```

The example config is not installed as the active config. Create `/etc/mw-integration-agent/config.json` deliberately and keep every activation flag false during foundation work.

The production proxy endpoint is `127.0.0.1:5432`. The VM identity is conditionally granted `roles/cloudsql.client` only for `appsheet-pg-prod-20260914`. Proxy transport authentication does not replace PostgreSQL authentication: a separately approved, least-privilege database role/credential is still required before an application can log in.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Activation boundary

Installing packages, authenticating Codex, or passing the verifier does not authorize service enablement. No receiver, tunnel, worker, scheduler, delivery, or data-write unit may be enabled until its implementation is migrated, tested, documented, and explicitly authorized.
