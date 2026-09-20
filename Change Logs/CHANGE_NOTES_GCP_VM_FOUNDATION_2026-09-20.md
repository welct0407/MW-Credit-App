# GCP VM foundation — 2026-09-20

## Scope and purpose

Provisioned and prepared the Debian 13 host for the Linux integration-agent foundation without activating any integration, schedule, webhook, data write, notification, or cutover.

## Changed infrastructure and files

- Created Compute Engine VM `vm-mw-credit-agent` in project `clever-oasis-508610-n7`, zone `asia-southeast1-a`, using `e2-medium`, Debian 13, and a 10 GB balanced persistent boot disk.
- Attached regional snapshot policy `default-schedule-1` to the boot disk and verified the disk reports the policy.
- Retained Shielded VM vTPM and integrity monitoring; Secure Boot remains off.
- Added a project-level `constraints/compute.vmExternalIpAccess` allowlist containing only this VM, following the owner's explicit request for an external IP, and attached ephemeral IPv4 `136.85.96.197`.
- Installed Debian prerequisites, Codex CLI 0.155.1, the dedicated non-login `mwagent` account, source under `/opt/mw-integration-agent-src`, and the application virtual environment under `/opt/mw-integration-agent`.
- Installed the fail-closed example configuration and service catalogue under `/etc/mw-integration-agent`.
- Installed but did not enable or start `mw-integration-agent-verify.service`; no runtime worker service exists.
- Updated `scripts/bootstrap-debian.sh` so the Codex installer runs from the service account's accessible home directory.
- Updated `README.md` with the installed but inactive host state.

## Rollback

- Stop/delete the VM to remove compute usage; retain or delete its disk/snapshots according to the desired recovery outcome.
- Remove the VM access configuration and delete the project-level external-IP policy override to return to the inherited deny-all policy.
- On the retained VM, remove `/opt/mw-integration-agent`, `/opt/mw-integration-agent-src`, `/etc/mw-integration-agent`, `/var/lib/mw-integration-agent`, the `mwagent` account, and the disabled verification unit only after preserving any later approved state.
- Repository changes can be reverted with a normal follow-up commit.

## Checks

- VM reports `RUNNING`, hostname `vm-mw-credit-agent`, and Debian 13.
- Boot disk reports snapshot resource policy `regions/asia-southeast1/resourcePolicies/default-schedule-1` and `READY` status.
- IAP SSH login succeeded.
- Direct outbound HTTPS succeeded after the external IP was attached; the temporary package proxy, reverse SSH tunnel, and VM APT proxy configuration were removed and verified closed.
- Repository commit `11c36b5c60d47f9d86361327fab305d9fb6842ee` was installed from a SHA-256-verified Git bundle.
- Codex reports `codex-cli 0.155.1`.
- Agent configuration validation reports `status=ok` and `activation=disabled`; runtime status reports `scaffold` and `disabled`.
- Verification unit reports `disabled` and `inactive`; `/etc/mw-integration-agent/config.json` is absent.
- No credentials or state were copied from the Windows agent.

## Status and remaining work

Foundation installation is complete and inactive. Authenticate Codex interactively by device code, design the credential recovery path, and migrate/test useful features individually before any activation or traffic cutover.
