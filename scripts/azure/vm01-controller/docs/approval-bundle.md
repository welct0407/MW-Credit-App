# Live approval bundle

[approval-manifest.json](approval-manifest.json) is the concrete source of proposed resources, exact target/actions/scopes, identity changes and outstanding values. It is deliberately **not an executable authorization**: registrations, final hostname, package/commit pin, credential mechanism and regional quote still require completion. Source publication to the existing private AppSheet repository audience is authorized; merge and every live Azure stage remain unapproved.

## Separate requested approval groups

| Group | Concrete effects to approve |
| --- | --- |
| Resource/provider provisioning | Dedicated rg-vm01-controller; available Function/storage names in Southeast Asia; FC1/Node24/512MB/zero always-ready/HTTP4/max40; storage configuration and roles; Microsoft.App registration if required. Reconfirm names/quota. |
| Entra and base RBAC | Three exact single-tenant registrations, API v2/idtyp/scope/roles, approved owner object ID, exact redirect and consents; separate five-action role definition in RG-MWCREDIT and assignment only at VM-01; preserve Grafana role. |
| Optional operation read | One separate Microsoft.Compute/locations/operations/read action; explicitly approve candidate scope and verification, or broader subscription alternative. It never joins the VM base role. |
| Cloud credentials/environment | Real supported issuer/subject/audience, or certificate/private storage/rotation/revocation; any saved-environment change independently recorded. Never owner's Azure password or Contributor credentials. |
| Deployment/activation | Exact reviewed commit and final ZIP SHA256, compiled template/public parameters, disabled bootstrap, status-only verification, then runtime/ledger admission switches. |
| Power test timing | Exact actions/counts/window, held VM task admission, saved work, independent reconnect observation, recovery operator. No general authorization to test power repeatedly. |

Operator Owner/Global Administrator privileges exist per authenticated discovery; access is not authorization. Use the existing operator only for approved provisioning/consent, never pass those credentials to Cloud or the controller runtime. No broad permanent role is requested for Codex.

## Operation-status scope discrepancy

The generic [ARM async guidance](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations#permission-for-tracking-async-status) states sufficient resource-group permissions are needed. [Update Manager's explicit table](https://learn.microsoft.com/en-us/azure/update-manager/roles-permissions) places Microsoft.Compute/locations/operations/read at **Machine subscription** scope. Therefore the VM resource scope is insufficient, RG-MWCREDIT is an unproven narrower candidate, and the subscription is a broader separately approved candidate. Do not represent RG scope as verified or silently try subscription scope.

Granting this action can expose other compute operation status within the effective scope. Server-side URL validation narrows application behavior but does not narrow the identity's underlying grant. Approved verification must use a real operation URL from a separately approved action; do not initiate a power operation merely to test permissions. Poll403 preserves the operation and pauses new commands until access is corrected, with no POST replay.

Under the strict base role, asynchronous restart is accepted/unverified and may require administrator reconciliation. Accept that limitation before base-only activation, or finish this separate read decision and verification before claiming complete automated restart support.

## Concrete deployment record

Complete tested Git commit, final ZIP hash, compiled ARM template hashes, public parameter values, generated resource/principal/app/role-assignment IDs, actual redirect hostname, rollback package compatibility, permission readback and owner approval references. Record actual applied changes and remaining verification independently. Preserve unresolved ledgers and Windows/security/network configuration. Live deployment is not complete merely because a template was accepted.

## Budget decision

The owner target is **under USD1/month excluding VM, disks and existing public IP/networking**, not a verified ceiling. With 10,000 monthly requests, 512MB and one billed second, the illustrative model is about USD0.29 with available grant or USD0.43 without; five seconds approaches USD0.95 without grant before overhead. These assumptions and Microsoft grant/storage references are in [operations](operations.md#cost-and-logs). Selected-region/offer rates, subscription eligibility/remaining shared grant, host transactions, public traffic and actual billing duration remain unverified. No hard cap or paid logging service is provisioned. Approve the verified quote/operating budget separately from source publication.
