# Debian VM timezone — 2026-09-20

## Scope and purpose

Set `vm-mw-credit-agent` to Bangkok local time and make the host setting reproducible during Debian bootstrap.

Starting Git commit: `3bb65403977ab96dd10ede6fdabb7e07d33cd22e`.

## Changes

- Changed the live Debian timezone from `Etc/UTC` to `Asia/Bangkok` (`UTC+07:00`).
- Added the same `timedatectl` setting to `scripts/bootstrap-debian.sh`.
- Documented the host timezone in the README and operations guide.

## Verification

- `timedatectl` reported `Asia/Bangkok (+07, +0700)`.
- System clock synchronization remained enabled and NTP remained active.
- The RTC remained in UTC.
- Cloud SQL Auth Proxy, Instagram webhook, and Cloudflare tunnel services remained active.

## Rollback

Run `sudo timedatectl set-timezone Etc/UTC` and revert the documentation/bootstrap change with a normal follow-up commit.

Status: complete. No application data, credential, schedule definition, message, or cloud resource was changed.
