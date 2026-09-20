# Operations

## Current state

This repository has no production runtime. All service flags are false, the catalogue is revision 0, and the only systemd unit is a disabled one-shot configuration verifier.

## Filesystem layout

| Path | Purpose | Ownership |
| --- | --- | --- |
| `/opt/mw-integration-agent` | installed package and virtual environment | root:root |
| `/etc/mw-integration-agent` | private configuration and secret references | root:mwagent, 0750 |
| `/var/lib/mw-integration-agent` | service home, Codex runtime, journals, state | mwagent:mwagent, 0750 |

Do not store credentials in the repository, VM metadata, startup scripts, or systemd unit text.

## Verification

```bash
sudo -u mwagent /opt/mw-integration-agent/.venv/bin/mw-integration-agent \
  check --config /etc/mw-integration-agent/config.json \
  --catalogue /etc/mw-integration-agent/service-catalogue.json
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login status
```

The example config is not installed as the active config. Create `/etc/mw-integration-agent/config.json` deliberately and keep every activation flag false during foundation work.

## Backups and recovery

Compute Engine snapshot schedules cover disk blocks, not the complete VM definition or external platform configuration. Git is the recovery source for code and documentation. Maintain a separate, verified recovery method for credentials and journals before any activation. Never restore an older journal over accepted sends or data writes.

## Activation boundary

Installing packages, authenticating Codex, or passing the verifier does not authorize service enablement. No receiver, tunnel, worker, scheduler, delivery, or data-write unit may be enabled until its implementation is migrated, tested, documented, and explicitly authorized.
