# MW Integration Agent

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM.

Status: **repository scaffold only**. All integrations and schedules are disabled. The existing Windows Partner Operations worker and webhooks remain paused; this repository performs no cutover.

## Initial target

- GCP project: `clever-oasis-508610-n7`
- Region: `asia-southeast1`
- VM/hostname: `vm-mw-credit-agent`
- Machine profile: E2 shared-core, 4 GB memory (`e2-medium`)
- OS: Debian 13
- Backups: Compute Engine default backup selection, verified after VM creation

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

The bootstrap script installs only host prerequisites and the Codex CLI. It does not copy credentials, configure webhooks, enable systemd services, or start business processing.

```bash
sudo bash scripts/bootstrap-debian.sh
sudo bash scripts/install-layout.sh
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/.codex/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

See [migration plan](docs/MIGRATION_PLAN.md), [operations](docs/OPERATIONS.md), and the [service catalogue](SERVICE_CATALOGUE.md).
