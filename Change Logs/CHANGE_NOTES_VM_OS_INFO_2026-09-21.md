# VM Manager OS information — 2026-09-21

## Scope and purpose

Restore the Compute Engine OS Info inventory for `vm-mw-credit-agent` after VM Manager was enabled but the console remained blank.

Starting Git commit: `fb71301e`.

## Diagnosis

- The OS Config API and full VM Manager feature set were enabled.
- `google-osconfig-agent` version `20260624.00-g1` was installed, enabled and active, with the VM service account and `cloud-platform` access scope available.
- Instance metadata already had `enable-osconfig=TRUE`, but `enable-guest-attributes` was absent. The missing guest-attributes setting prevented the inventory used by the Compute Engine OS Info view from being published.

## Changes

- Added instance metadata `enable-guest-attributes=TRUE`.
- Restarted `google-osconfig-agent` to trigger collection.
- Temporarily set a one-minute OS Config poll interval for bounded verification, then removed that override to restore the default cadence.
- Updated the maintained VM and operations documentation.

No firewall rule, network resource, service account, or credential was created or changed.

## Verification

- `google-osconfig-agent` remained active after restart.
- Guest inventory published `Debian GNU/Linux 13 (trixie)`, version `13`, kernel release `6.12.107+deb13-cloud-amd64`, and OS Config agent version `20260624.00-g1`.
- The inventory timestamp advanced to `2026-09-21T12:36:40Z`.
- Metadata readback confirmed `enable-osconfig=TRUE` and `enable-guest-attributes=TRUE`; the temporary custom poll interval is absent.

The console can require a refresh or several minutes to display a newly published inventory record.

## Rollback

Remove the `enable-guest-attributes` instance metadata key only if deliberately abandoning the Compute Engine OS Info inventory. Retain `enable-osconfig=TRUE` while VM Manager is in use.

Status: guest OS inventory is publishing successfully.
