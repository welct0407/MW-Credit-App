# MW Integration Agent

## Current state

- Runs on the Debian 13 VM `vm-mw-credit-agent` (GCP project `clever-oasis-508610-n7`, `asia-southeast1`) as the `mwagent` service user, installed from `/opt/mw-integration-agent-src` (a clone of this repository).
- Always on: the signed Instagram webhook receiver (`mw-instagram-webhook`) behind the Cloudflare tunnel, and the Cloud SQL Auth Proxy units.
- Timers (installed from `systemd/`; which ones are enabled is set by the owner, see the [catalogue](SERVICE_CATALOGUE.md)): conversation poll (every minute), receipt summary (with the `mw-receipt-wake.path` trigger), daily cash statement and its email retry, audit relay (every 30 s) and audit retention.
- State and audit live in the Cloud SQL database `mw_agent`; business data stays in `loan_manager_prod`. AppSheet is retired.
- The Instagram Partner conversation is retired (R091, 23 October 2026; stopped since R090 phase 0): the in-app chat replaced it. Source has no conversation modules, units or keys; catalogue revision 32; agent migration V11 deletes the conversation journal. The live host runs the old package until the R091 deploy, recorded in the [R091 change note](Change%20Logs/CHANGE_NOTES_R091_IG_CONVERSATION_DECOMMISSION_2026-10-23.md).
- Deployed version and pins: see the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments).
- Read next: [Operations](docs/OPERATIONS.md) (deploy route, verification, recovery).

Linux-native foundation for MW Credit integrations on a Debian 13 Google Compute Engine VM. This directory was an earlier standalone repository (archived) and is now part of MW-Credit-App; project-wide rules are in the root [AGENTS.md](../AGENTS.md).

Status: **daily cash statements and receipt review active on Debian; the Partner conversation was retired in R091**. The Debian receiver is live through `https://hooks.mw-credit.com/instagram`. Database roles and sign-in: [PostgreSQL operations](docs/POSTGRESQL_OPERATIONS.md). The statement runs at 00:15 Asia/Bangkok with Partner-master Instagram routing and Microsoft Graph email fallback. Receipt review/payment processing has its own activation switch; see its operating guide and deployment logs. Receipt payments use the shared receipt command API. New ordinary receipts can post automatically under the owner-authorized policy; other actions retain reviewer/manual handling. Lisa-forwarded receipts use verified three-member group identity. See [receipt policy](docs/PARTNER_REVIEW.md). Reviewer-only structured database DML was part of the conversation and is retired (R091).

## Initial target

PostgreSQL state, generic audit and the reviewer/native DELETE route are implemented: see [PostgreSQL operations](docs/POSTGRESQL_OPERATIONS.md).

The earlier persistent Partner conversations (Codex, Gemini, Claude) were retired in R091; their last documentation is in Git history before the R091 commit.

[Daily cash statements](docs/CASH_STATEMENT.md) cover 00:00–00:00 Bangkok posting activity, per-account English/Thai PNGs and the current Partner opt-in. The [maintained business process](docs/BUSINESS_PROCESS.md) documents the Instagram-first and email-fallback flow.

- Machine profile: E2 shared-core, 2 GB memory (`e2-small`; 0.5 fractional vCPU across 2 exposed vCPUs)
- System timezone: `Asia/Bangkok` (`UTC+07:00`), synchronized by NTP
- Backups: regional Compute Engine snapshot policy `default-schedule-1`, attached and verified after VM creation
- Network: static regional external IPv4 `136.85.96.197` (`vm-mw-credit-agent-ip`) retained without public SSH/RDP; normal administration uses Tailscale `100.71.171.91`, with targeted IAP SSH as recovery
- Installed application: `/opt/mw-integration-agent`
- Service account: `mwagent` with a non-login shell
- GCP identity: `mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com`; Cloud SQL Client is conditionally limited to the production instance, with project-level Monitoring Metric Writer and Logs Writer for Ops Agent telemetry
- Telemetry: Google Cloud Ops Agent 2.71.0 managed by the existing VM policy, collecting guest memory, process, filesystem and system metrics every 60 seconds
- VM Manager inventory: Google OS Config agent enabled with guest attributes publishing Debian OS details on the default inventory cadence
- Administrative overlay: Tailscale 1.102.4 with ordinary public-key OpenSSH; the VM is not an exit node or subnet router
- Cloud SQL transport: Auth Proxy on loopback; role and listener details in [PostgreSQL operations](docs/POSTGRESQL_OPERATIONS.md)
- GitHub transport: repository-scoped read-only deploy key for `MW-Credit-App`; updates are manual, clean-checkout, and fast-forward-only. The Debian source checkout was cut over to this repository on 15 October 2026

## Local verification

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install ./integration-agent
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
sudo -u mwagent -H env CODEX_HOME=/var/lib/mw-integration-agent/codex-runtime /var/lib/mw-integration-agent/.local/bin/codex login --device-auth
```

Use device-code authentication on the headless VM. Treat `/var/lib/mw-integration-agent/codex-runtime/auth.json` as a secret and include it only in an explicitly approved credential-recovery design.

The Instagram receiver binds only to `127.0.0.1:8000` and is intended to sit behind the authenticated Cloudflare tunnel. Captured messages are durably deduplicated with status `CAPTURED_NO_PROCESSING`. The outbound adapter cannot send while `instagram_delivery` or `sending_enabled` is false.

The `native-api-probe` command left with the Instagram conversation (R091). The retired `appsheet-probe` command and AppSheet credential installer are removed; AppSheet access keys and app IDs are not runtime inputs. PostgreSQL connects only through the Cloud SQL Auth Proxy on loopback; the reporting role defaults to read-only transactions and has SELECT plus TEMPORARY privileges.

See [operations](docs/OPERATIONS.md) and the [service catalogue](SERVICE_CATALOGUE.md).

The editable [Debian VM connectivity architecture](docs/VM_CONNECTIVITY_ARCHITECTURE.drawio) shows the current network and service boundaries; see its [maintainer notes and preview](docs/VM_CONNECTIVITY_ARCHITECTURE.md).
