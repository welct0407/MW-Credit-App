# MW Integration Agent

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM.

Status: **installed foundation, inactive**. The VM, host prerequisites, Codex CLI, and repository layout are installed. All integrations and schedules are disabled, no live configuration or credentials have been installed, and the existing Windows Partner Operations worker and webhooks remain paused. This repository performs no cutover.

## Initial target

- GCP project: `clever-oasis-508610-n7`
- Region: `asia-southeast1`
- VM/hostname: `vm-mw-credit-agent`
- Machine profile: E2 shared-core, 4 GB memory (`e2-medium`)
- OS: Debian 13
- Backups: regional Compute Engine snapshot policy `default-schedule-1`, attached and verified after VM creation
- Network: ephemeral external IPv4 `136.85.96.197`, authorized only for this VM by project-level organization-policy override; SSH remains available through IAP
- Installed source: `/opt/mw-integration-agent-src`
- Installed application: `/opt/mw-integration-agent`
- Service account: `mwagent` with a non-login shell

## Local verification

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
python -m unittest discover -s tests -v
mw-integration-agent check --config config.example.json
```

## Debian preparation

The bootstrap script installs only host prerequisites and the Codex CLI. It does not copy credentials, configure webhooks, enable systemd services, or start business processing. Run it from any working directory; it changes to the service account's home before invoking the Codex installer.

```bash
sudo bash scripts/bootstrap-debian.sh
sudo bash scripts/install-layout.sh
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/.codex/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

See [migration plan](docs/MIGRATION_PLAN.md), [operations](docs/OPERATIONS.md), and the [service catalogue](SERVICE_CATALOGUE.md).
