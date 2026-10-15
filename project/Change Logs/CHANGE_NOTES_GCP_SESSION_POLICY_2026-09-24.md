# Google Cloud session policy — 24 September 2026

## Scope and authorization

Owner explicitly approved disabling periodic Google Cloud reauthentication for the M&W Credit organizational unit after being informed of organization-wide scope. Purpose: remove daily Cloud SDK reauthentication caused by the existing 16-hour policy.

## Change and verification

- Google Admin > Security > Access and data control > Google Cloud session control, applied at M&W Credit.
- Previous policy: Require reauthentication every 16 hours, password method; trusted-app exemption unchecked.
- Saved policy: Never require reauthentication, explicit organizational-unit override.
- Admin Console confirmed settings updated; saved readback selected Never require reauthentication and showed no unsaved changes. The disabled trusted-app exemption displayed checked in the saved form; the frequency and method controls are inactive under this policy.
- Normal sign-in policies continue to apply. This removes the periodic Cloud session challenge, not all possible future sign-in requirements.
- Google states propagation can take up to 24 hours, usually sooner. An already-expired CLI session may need one final interactive login; future daily behavior has not yet been observed.

## Recovery and publication

Rollback: select Require reauthentication, 16 hours, Password, clear Exempt Trusted apps, and save for the same organizational unit.

Starting repository commit: `a37d0b15570f78f39417d64f0dac8a93baaf95e0`; working tree was clean. No application, database or runtime source change. No product release number required.

Status: policy saved and verified. Reference: https://knowledge.workspace.google.com/admin/security/set-session-length-for-google-cloud-services
