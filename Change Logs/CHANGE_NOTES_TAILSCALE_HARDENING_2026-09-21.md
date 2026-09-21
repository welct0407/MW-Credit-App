# Tailscale administrative access hardening — 2026-09-21

## Scope and purpose

Replace worldwide direct SSH exposure with Tailscale for normal cross-cloud administration while retaining narrowly scoped Google Cloud IAP SSH as an independent recovery path. Remove the unused worldwide RDP exposure only after both access paths are verified.

Starting Git commit: `83e1b56afef56a660aeff518ec32a09eee520790`.

## Changes in progress

- Created `allow-ssh-iap-mw-integration-agent` on the default VPC: ingress TCP 22 from `35.235.240.0/20`, targeted only to the VM's dedicated service account, with firewall logging enabled.
- Verified SSH through a forced IAP tunnel before changing any existing access rule.
- Installed Tailscale 1.102.4 from the official Debian Trixie repository and enabled `tailscaled`.
- Installed Tailscale 1.102.4 on the Windows administration host.

No public access rule has yet been disabled. Debian enrollment and private SSH verification are waiting for the owner to complete or approve Tailscale OAuth consent. The existing Windows installation also has a pre-existing server-mode ownership state that must be reconciled without overwriting unknown access.

## Planned completion checks

- Confirm both devices are in the intended tailnet.
- Prove ordinary public-key OpenSSH over the Debian VM's Tailscale address.
- Reconfirm forced IAP SSH independently.
- Disable the worldwide `default-allow-ssh` and `default-allow-rdp` rules only after both checks pass.
- Confirm the Instagram webhook, Cloudflare tunnel, Cloud SQL Auth Proxy and monitoring services remain healthy.

## Rollback

Until the worldwide rules are disabled, remove the new IAP rule and uninstall Tailscale if the migration is abandoned. After hardening, re-enable direct SSH only as a time-bounded recovery measure if both Tailscale and IAP are unavailable.

Status: implementation paused at required Tailscale identity consent; public administrative access is unchanged.
