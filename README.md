# MW Integration Agent

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM.

Status: **two-way Instagram transport verified; bounded production data connectivity configured**. The Debian receiver is live through `https://hooks.mw-credit.com/instagram`. AppSheet access is Find-only, and PostgreSQL uses a dedicated loopback role restricted to business-table SELECT and temporary objects. No automatic reply, durable SQL write, AppSheet edit, message processing, or schedule is enabled. The existing Windows Partner Operations worker and webhooks remain stopped.

## Initial target

Manual [daily cash statements](docs/CASH_STATEMENT.md) are implemented for owner review: 06:00–06:00 Bangkok posting activity, per-account English/Thai PNGs, current Partner opt-in and API-only delivery. Scheduling remains off; see the current change log for deployment/delivery evidence.

- GCP project: `clever-oasis-508610-n7`
- Region: `asia-southeast1`
- VM/hostname: `vm-mw-credit-agent`
- Machine profile: E2 shared-core, 4 GB memory (`e2-medium`)
- OS: Debian 13
- System timezone: `Asia/Bangkok` (`UTC+07:00`), synchronized by NTP
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
sudo bash scripts/configure-postgres-access.sh /tmp/admin-password.txt
sudo -u mwagent -H /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/.codex/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

The Instagram receiver binds only to `127.0.0.1:8000` and is intended to sit behind the authenticated Cloudflare tunnel. Captured messages are durably deduplicated with status `CAPTURED_NO_PROCESSING`. The outbound adapter cannot send while `instagram_delivery` or `sending_enabled` is false.

`appsheet-probe` performs a bounded official-API `Find` against the production OLTP Partners table and reports only metadata, never row contents. PostgreSQL connects only through the Cloud SQL Auth Proxy on loopback; its dedicated role defaults to read-only transactions and has SELECT plus TEMPORARY privileges, not durable table DML.

See [migration plan](docs/MIGRATION_PLAN.md), [operations](docs/OPERATIONS.md), and the [service catalogue](SERVICE_CATALOGUE.md).
