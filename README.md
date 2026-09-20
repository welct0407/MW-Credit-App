# MW Integration Agent

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM.

Status: **Instagram transport implemented; live activation pending credentials**. Signed receipt-only webhook ingress and a disabled-by-default outbound API adapter are present. No message processing, automatic reply, AppSheet/database write, or schedule is enabled. The existing Windows Partner Operations worker and webhooks remain stopped.

## Initial target

- GCP project: `clever-oasis-508610-n7`
- Region: `asia-southeast1`
- VM/hostname: `vm-mw-credit-agent`
- Machine profile: E2 shared-core, 4 GB memory (`e2-medium`)
- OS: Debian 13
- Backups: regional Compute Engine snapshot policy `default-schedule-1`, attached and verified after VM creation
- Network: static regional external IPv4 `136.85.96.197` (`vm-mw-credit-agent-ip`), authorized only for this VM by project-level organization-policy override; SSH remains available through IAP
- Installed source: `/opt/mw-integration-agent-src`
- Installed application: `/opt/mw-integration-agent`
- Service account: `mwagent` with a non-login shell
- GCP identity: `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com`, conditionally limited to Cloud SQL Client access for the production instance
- Cloud SQL transport: Auth Proxy 2.25.4 on `127.0.0.1:5432`; PostgreSQL credentials are not installed
- GitHub transport: repository-scoped read-only deploy key; updates are manual, clean-checkout, and fast-forward-only

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
sudo bash scripts/install-cloud-sql-proxy.sh
sudo bash scripts/install-instagram-runtime.sh
sudo bash scripts/install-cloudflared.sh
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/.codex/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

The Instagram receiver binds only to `127.0.0.1:8000` and is intended to sit behind the authenticated Cloudflare tunnel. Captured messages are durably deduplicated with status `CAPTURED_NO_PROCESSING`. The outbound adapter cannot send while `instagram_delivery` or `sending_enabled` is false.

See [migration plan](docs/MIGRATION_PLAN.md), [operations](docs/OPERATIONS.md), and the [service catalogue](SERVICE_CATALOGUE.md).
