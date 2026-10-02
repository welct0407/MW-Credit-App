# Live approval bundle

[approval-manifest.json](approval-manifest.json) is the concrete source of proposed resources, exact target/actions/scopes, identity changes and outstanding values. It records completed owner-approved resource/provider, Entra/base RBAC and disabled package/ledger bootstrap, plus remaining gates. Actual registrations, hostname and deployed commit/ZIP are in the [receipt](../../../../outputs/r050-vm01-controller/bootstrap/README.md). Credentials/environment, optional operation-read, mutation/admission activation and live power timing remain unapproved. Source publication to the existing private AppSheet repository audience is authorized; merge and any redeploy are not authorized by this repair task.

The user subsequently approved switching browser access to MW Credit (`mwcredit@idea.100-5.com`). Its user-specific consent and both allowlists are verified; the old controller consent is retired. Existing Azure roles and all disabled controls are preserved. [Applied switch](../../../../outputs/r050-vm01-controller/account-switch/README.md). This approval covers no domain, code deployment, credentials, new Azure role or power action.

## Separate requested approval groups

| Group | Concrete effects to approve |
| --- | --- |
| Resource/provider provisioning | Dedicated rg-vm01-controller; available Function/storage names in Southeast Asia; FC1/Node24/512MB/zero always-ready/HTTP4/max40; storage configuration and roles; Microsoft.App registration if required. Reconfirm names/quota. |
| Entra and base RBAC | Three exact single-tenant registrations, API v2/idtyp/scope/roles, approved owner object ID, exact redirect and consents; separate five-action role definition in RG-MWCREDIT and assignment only at VM-01; preserve Grafana role. |
| Optional operation read | One separate Microsoft.Compute/locations/operations/read action; explicitly approve candidate scope and verification, or broader subscription alternative. It never joins the VM base role. |
| Cloud credentials/environment | Real supported issuer/subject/audience, or certificate/private storage/rotation/revocation; any saved-environment change independently recorded. Never owner's Azure password or Contributor credentials. |
| Deployment/activation | Disabled bootstrap from e025017 and its final ZIP is approved/completed. Allowed-caller status acceptance remains pending. Runtime mutation and ledger admission activation require separate approval. This source repair is not redeployed. |
| Power test timing | Exact actions/counts/window, held VM task admission, saved work, independent reconnect observation, recovery operator. No general authorization to test power repeatedly. |

Operator Owner/Global Administrator privileges exist per authenticated discovery; access is not authorization. Use the existing operator only for approved provisioning/consent, never pass those credentials to Cloud or the controller runtime. No broad permanent role is requested for Codex.

## Operation-status scope discrepancy

The generic [ARM async guidance](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations#permission-for-tracking-async-status) states sufficient resource-group permissions are needed. [Update Manager's explicit table](https://learn.microsoft.com/en-us/azure/update-manager/roles-permissions) places Microsoft.Compute/locations/operations/read at **Machine subscription** scope. Therefore the VM resource scope is insufficient, RG-MWCREDIT is an unproven narrower candidate, and the subscription is a broader separately approved candidate. Do not represent RG scope as verified or silently try subscription scope.

Granting this action can expose other compute operation status within the effective scope. Server-side URL validation narrows application behavior but does not narrow the identity's underlying grant. Approved verification must use a real operation URL from a separately approved action; do not initiate a power operation merely to test permissions. Poll403 preserves the operation and pauses new commands until access is corrected, with no POST replay.

Under the strict base role, asynchronous restart is accepted/unverified and may require administrator reconciliation. Accept that limitation before base-only activation, or finish this separate read decision and verification before claiming complete automated restart support.

## Concrete deployment record

Complete tested Git commit, final ZIP hash, compiled ARM template hashes, public parameter values, generated resource/principal/app/role-assignment IDs, actual redirect hostname, rollback package compatibility, permission readback and owner approval references. Record actual applied changes and remaining verification independently. Preserve unresolved ledgers and Windows/security/network configuration. Live deployment is not complete merely because a template was accepted.

## Budget decision

The owner approved **US$2/month as a planning budget**, excluding VM, disks and existing public IP/networking, with commands disabled. The verified Southeast Asia planning model is approximately USD0.292 with available grant, USD0.481 without at1 billed second, or USD1.221 without at5 seconds before host/storage/network overhead. Remaining shared grant and actual overhead are unmeasured. No hard cap or paid logging service is provisioned. See [cost and logs](operations.md#cost-and-logs) and the actual bootstrap receipt.
