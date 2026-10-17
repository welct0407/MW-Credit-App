# AGENTS.md — MW Integration Agent

This directory (`integration-agent/`) is the Linux-native integration-agent runtime for Debian 13 on Google Cloud, part of the MW-Credit-App repository. Project-wide rules (authority, credentials, records, publication) are in the root [AGENTS.md](../AGENTS.md); the rules below add runtime safety. It is intentionally separate from the paused Windows MW-Partner-Operations runtime; migrate reviewed capabilities deliberately and do not copy the Windows runtime wholesale.

## Safety and authority

- Instagram browser automation is prohibited by the owner following an account restriction. Use official API access only; do not replace missing group API capabilities with browser automation. Group sends remain untested and unauthorized.

- Default deny: no production integration, webhook, sending, financial write, scheduled job, or partner operation is enabled until the owner explicitly authorizes that capability.
- Treat the Windows MW-Partner-Operations repository as a dated source reference. Its private state, credentials, browser profiles, journals, queues, task definitions, and activation flags are not source code and must never be copied automatically.
- Preserve the current paused state of the Windows agent. Provisioning or testing this runtime does not authorize cutover, route changes, replay, partner messaging, or financial writes.
- Use the established Secret Manager/workload-identity route. Protected runtime configuration remains under `/etc/mw-integration-agent` and mutable state under `/var/lib/mw-integration-agent`; never commit either. Codex authentication is a credential.
- Use least-privilege service identities. Do not put long-lived secrets in VM metadata, startup-script text, Git, shell history, logs, or command output.
- Public ingress must use an authenticated tunnel or explicitly reviewed firewall/load-balancer path. Never expose the worker, Codex, debugging, or health endpoints directly to the internet.
- Before any live migration, back up and integrity-check the source journals, establish a new activation cutoff, reconcile delayed webhook retries, and prove single ownership of every scheduled job and public route.

## Development workflow

AppSheet is retired. Use native MW Credit API capabilities; preserve existing payment idempotency, receipt evidence and service-catalogue boundaries. Work directly by default and honor requests for personal execution. Use affected checks and reuse valid results under the [project PWA delivery policy](../project/Documents/Rules/PWA_Orchestration.md); do not repeat full CI for documentation, merge or closure. Production activation remains separately authorized.


- Read `SERVICE_CATALOGUE.md`, `service-catalogue.json`, and the affected documentation before runtime changes.
- Keep the Markdown catalogue and JSON manifest aligned; validation must fail closed on unknown or enabled-but-unimplemented services.
- Use Python 3.13 on Debian 13. Keep one root `.venv`; pin deployed dependencies.
- Add automated tests for authorization, idempotency, unknown outcomes, restart recovery, and negative paths before enabling an integration.
- Every coherent change requires `integration-agent/Change Logs/CHANGE_NOTES_<SUBJECT>_<YYYY-MM-DD>.md` using the [change-note template](../project/Documents/Rules/Development_Workflow.md#records-change-notes-and-retention).
- Commit and push completed work to the configured upstream. Never commit secrets, private state, browser sessions, borrower data, or unrestricted production exports.

## Infrastructure boundaries

- VM target: GCP project `clever-oasis-508610-n7`, region `asia-southeast1`, Debian 13, hostname `vm-mw-credit-agent`.
- Infrastructure creation does not enable business services. Systemd units are installed disabled until the owner authorizes a specific activation.
- Snapshot schedules protect disks, not full instance configuration or external services. Keep build/configuration reproducible in Git and keep credentials in a separately verified recovery path.
- Repository publication, VM creation, package installation, authentication setup, webhook cutover, and business activation are distinct stages.

## Reviewed branch cleanup

After verified merge or closure, clean up finished task head branches within the owner's scoped approval. First read fresh remote branches and PRs, check stacked PR/base dependencies and active workers, and preserve unique useful evidence in the owning task documents. Keep default branches and active work. Delete a head only after its completed status, exact SHA, durable history/evidence preservation and normal GitHub restoration path are verified; closure alone does not prove recoverability. Retain abandoned branches with unique history until recovery is established or the owner explicitly approves that exact irreversible deletion. Verify and record the final remote inventory.

Use `delete_branch_on_merge=true` where explicitly approved, verify the saved setting, and report failures. Automatic deletion does not replace dependency/evidence checks. This workflow grants no broader standing permission, force-push, tag deletion, access or credential changes, production deployment, or irreversible unique-history deletion.
