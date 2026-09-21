# MW Integration Agent

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM.

Status: **daily cash statement production schedule active**. The Debian receiver is live through `https://hooks.mw-credit.com/instagram`. PostgreSQL uses a dedicated loopback role restricted to business-table SELECT and temporary objects. The statement runs at 00:15 Asia/Bangkok with Partner-master Instagram routing and Microsoft Graph email fallback. Receipt review/payment processing and persistent Partner conversations have separate activation switches; see their operating guides and deployment logs. Codex selects general AppSheet Add/Edit calls from inspected schema metadata, and approved receipt payments retain their separate adapter. No durable SQL writes are enabled. The existing Windows Partner Operations worker and webhooks remain stopped.

## Initial target

[Persistent Partner conversations](docs/PARTNER_CONVERSATIONS.md) add isolated follow-up memory, fresh business-data tools and Codex-selected operational API calls. This capability has separate processing/write switches and a signed-message activation cutoff. Codex chooses the API payloads; no fixed business-operation list or per-operation scripts are required. AppSheet GUI automation is not enabled. Deployment status is in the [change log](Change%20Logs/CHANGE_NOTES_PARTNER_CONVERSATIONS_2026-09-22.md).

[Daily cash statements](docs/CASH_STATEMENT.md) cover 00:00–00:00 Bangkok posting activity, per-account English/Thai PNGs and the current Partner opt-in. The [maintained business process](docs/BUSINESS_PROCESS.md) documents the Instagram-first and email-fallback flow.

- GCP project: `clever-oasis-508610-n7`
- Region: `asia-southeast1`
- VM/hostname: `vm-mw-credit-agent`
- Machine profile: E2 shared-core, 2 GB memory (`e2-small`; 0.5 fractional vCPU across 2 exposed vCPUs)
- OS: Debian 13
- System timezone: `Asia/Bangkok` (`UTC+07:00`), synchronized by NTP
- Backups: regional Compute Engine snapshot policy `default-schedule-1`, attached and verified after VM creation
- Network: static regional external IPv4 `136.85.96.197` (`vm-mw-credit-agent-ip`) retained without public SSH/RDP; normal administration uses Tailscale `100.71.171.91`, with targeted IAP SSH as recovery
- Installed source: `/opt/mw-integration-agent-src`
- Installed application: `/opt/mw-integration-agent`
- Service account: `mwagent` with a non-login shell
- GCP identity: `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com`; Cloud SQL Client is conditionally limited to the production instance, with project-level Monitoring Metric Writer and Logs Writer for Ops Agent telemetry
- Telemetry: Google Cloud Ops Agent 2.71.0 managed by the existing VM policy, collecting guest memory, process, filesystem and system metrics every 60 seconds
- VM Manager inventory: Google OS Config agent enabled with guest attributes publishing Debian OS details on the default inventory cadence
- Administrative overlay: Tailscale 1.102.4 with ordinary public-key OpenSSH; the VM is not an exit node or subnet router
- Cloud SQL transport: Auth Proxy 2.25.4 on `127.0.0.1:5432`; dedicated read-only PostgreSQL credentials are installed
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
sudo -u mwagent -H env CODEX_HOME=/var/lib/mw-integration-agent/codex-runtime /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/codex-runtime/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

The Instagram receiver binds only to `127.0.0.1:8000` and is intended to sit behind the authenticated Cloudflare tunnel. Captured messages are durably deduplicated with status `CAPTURED_NO_PROCESSING`. The outbound adapter cannot send while `instagram_delivery` or `sending_enabled` is false.

`appsheet-probe` performs a bounded official-API `Find` against the production OLTP Partners table and reports only metadata, never row contents. PostgreSQL connects only through the Cloud SQL Auth Proxy on loopback; its dedicated role defaults to read-only transactions and has SELECT plus TEMPORARY privileges, not durable table DML.

See [migration plan](docs/MIGRATION_PLAN.md), [operations](docs/OPERATIONS.md), and the [service catalogue](SERVICE_CATALOGUE.md).

The editable [Debian VM connectivity architecture](docs/VM_CONNECTIVITY_ARCHITECTURE.drawio) shows the current network and service boundaries; see its [maintainer notes and preview](docs/VM_CONNECTIVITY_ARCHITECTURE.md).
