# VM downsize — 21 September 2026

## Scope and purpose

Downsize the Debian integration VM `vm-mw-credit-agent` in `asia-southeast1-a` from `e2-medium` to the exact half-size E2 shared-core profile, `e2-small`, while retaining its disks, fixed addresses, access paths and agent services.

Starting repository commit: `ffbbbb9b7c550068746baba61886891edabde1cd`.

## Pre-change evidence and recovery

- Live type was `e2-medium`: 4 GB memory and 1 fractional vCPU across 2 exposed vCPUs.
- Guest inspection showed 660 MiB used and 3.2 GiB available, with no swap configured.
- Cloud Monitoring returned a 14.61% seven-day CPU average across 336 five-minute maximum-aligned points. A short burst reached 103.68% of the baseline utilization metric, which E2 shared-core bursting permits.
- Guest memory telemetry had 35 available points: `used` averaged 14.99% and peaked at 18.34%.
- Scheduled snapshot `vm-mw-credit-agent-asia-southeast1-a-20260921070420-k4y7zc2q` was `READY` before shutdown.
- Rollback: stop the instance, change its machine type to `e2-medium`, start it, and repeat the service/access checks below. The scheduled snapshot is the disk-level recovery point if separately required.

## Change

- Stopped the VM cleanly, changed the machine type to `e2-small`, and restarted it.
- Preserved private IPv4 `10.148.0.2`, reserved public IPv4 `136.85.96.197`, Tailscale IPv4 `100.71.171.91`, the 10 GB balanced persistent disk and snapshot policy `default-schedule-1`.
- Updated the current machine profile in the README, operations guide and editable Draw.io connectivity architecture.

## Verification

- Compute Engine reports `RUNNING` on `e2-small`.
- Debian reports 2 exposed processors and 1.9 GiB memory; immediately after boot, 495 MiB was used and 1.4 GiB available.
- `tailscaled`, OpenSSH, Google Cloud Ops Agent, Google OS Config Agent, Cloud SQL Auth Proxy, Instagram webhook and Cloudflare tunnel services are active.
- The local webhook health endpoint returned `mw-instagram-webhook`.
- Tailscale OpenSSH succeeded at `100.71.171.91`; IAP SSH also succeeded after the normal boot delay.
- Scheduled agent timers were present after restart, and the current boot kernel journal contained no OOM-killer event.
- The static public and private addresses were unchanged.

## Status

Complete. Monitor production-cycle memory, CPU and OOM telemetry before considering any further reduction. No firewall, database, credential, webhook or application-policy setting changed.
