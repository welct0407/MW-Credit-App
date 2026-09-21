# VM Manager OS information — 2026-09-21

## Scope and purpose

Restore the Compute Engine OS Info inventory for `vm-mw-credit-agent` after VM Manager was enabled but the console remained blank.

Starting Git commit: `fb71301e`.

## Diagnosis

- The OS Config API and full VM Manager feature set were enabled.
- `google-osconfig-agent` version `20260624.00-g1` was installed, enabled and active, with the VM service account and `cloud-platform` access scope available.
- Instance metadata already had `enable-osconfig=TRUE`, but `enable-guest-attributes` was absent. The missing setting prevented the earlier guest-attributes inventory path from publishing.
- A subsequent console retest showed `Failed to load data`. Direct API verification reproduced the underlying `FAILED_PRECONDITION` response even though the feature-settings resource already displayed the full `OSCONFIG_C` value. This distinguished project control-plane propagation from a VM, browser, or user-permission problem.

## Changes

- Added instance metadata `enable-guest-attributes=TRUE`.
- Restarted `google-osconfig-agent` to trigger collection.
- Temporarily set a one-minute OS Config poll interval for bounded verification, then removed that override to restore the default cadence.
- Re-applied the documented full VM Manager project feature setting to reconcile the OS Config control plane. Google documents up to two hours for this setting to propagate.
- Updated the maintained VM and operations documentation.

No firewall rule, network resource, service account, or credential was created or changed.

## Verification

- `google-osconfig-agent` remained active after restart.
- Guest inventory published `Debian GNU/Linux 13 (trixie)`, version `13`, kernel release `6.12.107+deb13-cloud-amd64`, and OS Config agent version `20260624.00-g1`.
- The inventory timestamp advanced to `2026-09-21T12:36:40Z`.
- Metadata readback confirmed `enable-osconfig=TRUE` and `enable-guest-attributes=TRUE`; the temporary custom poll interval is absent.
- Project feature-setting readback confirmed `patchAndConfigFeatureSet=OSCONFIG_C` after reconciliation was requested.

The earlier guest-attributes inventory is healthy. The later OS Config inventory API remained in its documented propagation window at the final immediate check, so the console can continue showing `Failed to load data` until the project control plane converges. Refresh the page after the propagation window; if the API still returns the precondition after two hours, escalate it as a Google Cloud control-plane fault rather than changing the VM again.

## Rollback

Remove the `enable-guest-attributes` instance metadata key only if deliberately abandoning the Compute Engine OS Info inventory. Retain `enable-osconfig=TRUE` while VM Manager is in use.

Status: guest OS inventory is publishing successfully; full VM Manager control-plane propagation is pending final confirmation.
