# Tailscale administrative access hardening — 2026-09-21

## Scope and purpose

Replace worldwide direct SSH exposure with Tailscale for normal cross-cloud administration while retaining narrowly scoped Google Cloud IAP SSH as an independent recovery path. Remove the unused worldwide RDP exposure only after both access paths are verified.

Starting Git commit: `83e1b56afef56a660aeff518ec32a09eee520790`.

## Changes

- Created `allow-ssh-iap-mw-integration-agent` on the default VPC: ingress TCP 22 from `35.235.240.0/20`, targeted only to the VM's dedicated service account, with firewall logging enabled.
- Verified SSH through a forced IAP tunnel before changing any existing access rule.
- Installed Tailscale 1.102.4 from the official Debian Trixie repository and enabled `tailscaled`.
- Installed Tailscale 1.102.4 on the Windows administration host.
- Corrected the initial enrollment and joined both hosts to the intended owner tailnet. Debian uses stable Tailscale address `100.71.171.91`; the Windows administration host uses `100.105.34.28`.
- Kept ordinary OpenSSH rather than enabling Tailscale SSH. Tailscale DNS, subnet routing and exit-node advertising remain off.
- Tightened the existing Windows `google_compute_engine` private-key ACL after OpenSSH rejected its inherited `OWNER RIGHTS` entry; only the current Windows identity has ordinary read access, while SYSTEM and Administrators retain full control.
- Disabled, but did not delete, the worldwide `default-allow-ssh` and `default-allow-rdp` rules after both private paths passed.

The existing tailnet has an owner-managed general rule allowing its devices to reach one another. It was not replaced because doing so would change connectivity for four pre-existing devices outside this VM task. Debian SSH still requires the authorized public key.

## Verification

- Tailscale reported the Debian and Windows hosts online in the intended tailnet and a direct peer connection.
- A TCP 22 probe and ordinary public-key OpenSSH from Windows to `100.71.171.91` passed before and after the firewall cutover.
- Forced `gcloud compute ssh --tunnel-through-iap` passed before and after the cutover.
- A direct TCP 22 probe to public IPv4 `136.85.96.197` failed after the rule change, as intended.
- Effective firewall readback showed the targeted IAP rule enabled with logging and both worldwide administrative rules disabled.
- `tailscaled`, `sshd`, Cloud SQL Auth Proxy, Instagram webhook, Cloudflare tunnel, Ops Agent and OS Config agent were active; the local webhook health check passed.

## Rollback

If both private paths fail, temporarily re-enable `default-allow-ssh` only for recovery and disable it again after repair; do not re-enable RDP for this Debian VM. To abandon the overlay, first restore and verify a narrowly sourced administrative path, then log the VM out of Tailscale and uninstall the package. Remove the targeted IAP rule only after another tested recovery path exists.

Status: complete. Normal SSH is private through Tailscale, IAP is the tested recovery path, and public SSH/RDP are disabled.
