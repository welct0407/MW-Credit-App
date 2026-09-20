# AGENTS.md — MW Integration Agent

This repository is the Linux-native integration-agent runtime for Debian 13 on Google Cloud. It is intentionally separate from `MW-Partner-Operations`; migrate reviewed capabilities deliberately and do not copy the Windows runtime wholesale.

## Safety and authority

- Default deny: no production integration, webhook, sending, financial write, scheduled job, or partner operation is enabled until the owner explicitly authorizes that capability in this repository.
- Treat `C:\GitHub\MW-Partner-Operations` as a dated source reference. Its private state, credentials, browser profiles, journals, queues, task definitions, and activation flags are not source code and must never be copied automatically.
- Preserve the current paused state of the Windows agent. Provisioning or testing this repository does not authorize cutover, route changes, replay, partner messaging, or AppSheet writes.
- Store secrets under `/etc/mw-integration-agent` and mutable state under `/var/lib/mw-integration-agent`; never commit either. Codex authentication is a credential.
- Use least-privilege service identities. Do not put long-lived secrets in VM metadata, startup-script text, Git, shell history, logs, or command output.
- Public ingress must use an authenticated tunnel or explicitly reviewed firewall/load-balancer path. Never expose the worker, Codex, debugging, or health endpoints directly to the internet.
- Before any live migration, back up and integrity-check the source journals, establish a new activation cutoff, reconcile delayed webhook retries, and prove single ownership of every scheduled job and public route.

## Development workflow

- Read `SERVICE_CATALOGUE.md`, `service-catalogue.json`, and the affected documentation before runtime changes.
- Keep the Markdown catalogue and JSON manifest aligned; validation must fail closed on unknown or enabled-but-unimplemented services.
- Use Python 3.13 on Debian 13. Keep one root `.venv`; pin deployed dependencies.
- Add automated tests for authorization, idempotency, unknown outcomes, restart recovery, and negative paths before enabling an integration.
- Every coherent change requires `Change Logs/CHANGE_NOTES_<SUBJECT>_<YYYY-MM-DD>.md` with scope, rollback, checks, status, and remaining work.
- Commit and push completed work to the configured upstream. Never commit secrets, private state, browser sessions, borrower data, or unrestricted production exports.

## Infrastructure boundaries

- VM target: GCP project `clever-oasis-508610-n7`, region `asia-southeast1`, Debian 13, hostname `vm-mw-credit-agent`.
- Infrastructure creation does not enable business services. Systemd units are installed disabled until the owner authorizes a specific activation.
- Snapshot schedules protect disks, not full instance configuration or external services. Keep build/configuration reproducible in Git and keep credentials in a separately verified recovery path.
- Repository publication, VM creation, package installation, authentication setup, webhook cutover, and business activation are distinct stages.
