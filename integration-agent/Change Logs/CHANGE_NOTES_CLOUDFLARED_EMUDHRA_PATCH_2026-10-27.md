# Change notes — cloudflared eMudhra patch, 27 October 2026

## Purpose
Cloudflare's [eMudhra certificate compromise advisory](https://blog.cloudflare.com/emudhra-certificate-compromise/) (20 October 2026) requires cloudflared 2026.10.2 or newer. The only connector of tunnel `mw-collection-webhook` ran 2026.9.1. Owner approved the read-only check's patch plan on 27 October 2026.

## Changes
- `integration-agent/scripts/install-cloudflared.sh`: pin 2026.9.1 to 2026.10.3, sha256 `053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0` (the release asset digest and the release-notes checksum agree). 2026.10.3 is the version the running connector recommended.
- `vm-mw-credit-agent` (16:24:46Z to 16:24:52Z UTC): previous binary copied to `/usr/local/bin/cloudflared.2026.9.1` (sha256 `03f1f25d…68cc`); the pinned installer verified and installed 2026.10.3; `systemd-analyze verify` passed; `mw-cloudflared-instagram.service` restarted. Four edge connections were registered within 4 seconds. No unit, token, ingress, DNS or Cloudflare setting change; `--no-autoupdate` kept.
- `integration-agent/docs/OPERATIONS.md`: records the version and the rollback copy.

## Checks
| Check | Result |
| --- | --- |
| Before: disk, `/proc/<pid>/exe`, metrics `build_info`, Cloudflare API connector | All 2026.9.1; one connector, no replicas, no Docker/package installs; ingress rules are loopback HTTP only (no HTTPS origins) |
| After: `/proc/<pid>/exe` sha256 | Equals the installed 2026.10.3 binary |
| After: metrics / API connector | `build_info` 2026.10.3; `ha_connections` 4; API connector `3711d798…` on 2026.10.3 |
| After: applied ingress (`/config`) | Version 3 unchanged: `hooks.mw-credit.com` `^/instagram$` → `127.0.0.1:8000`, `charts.mw-credit.com` → `127.0.0.1:8011`, catch-all 404; `noTLSVerify` false |
| Public routes | `GET https://hooks.mw-credit.com/instagram` 403 `Forbidden` (as before); `GET https://charts.mw-credit.com/` 200 (as before) |
| Receiver `ingress_error` lines since restart | 0 |
| `npm run check:docs` | 0 failures, 0 warnings |

## Not run
No test business webhook, replay or forced notification. VM-01 was not started; its 2026.9.1 CLI binary (recorded 11 October 2026, not a tunnel connector) is unverified. Debian `ca-certificates` was not changed.

## Recovery
`sudo cp -p /usr/local/bin/cloudflared.2026.9.1 /usr/local/bin/cloudflared && sudo systemctl restart mw-cloudflared-instagram.service`, then repeat the checks above; revert this commit for the pin.

## Open questions
None.

## Remaining work
Update the cloudflared CLI on VM-01 the next time it is running. Delete `/usr/local/bin/cloudflared.2026.9.1` after the new version has run cleanly for a week.
