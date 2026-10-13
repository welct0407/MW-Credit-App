# Unattended GCP and Azure administration

This root owns a dedicated Azure user-assigned managed identity, four scoped Azure role assignments, a dedicated Google service account, project Owner binding and exact-principal Azure workload federation. The existing VM-01 attachment is managed by the owning `ecosystem-azure-metadata` root, preserving its SystemAssigned identity. The VM controller resources, certificate, identity and existing roles are unchanged.

The operator has full GCP administration in `clever-oasis-508610-n7`, including IAM and Secret Manager. It is not an organization administrator or an administrator of the parked project. Azure Contributor and Role Based Access Control Administrator cover `rg-mwcredit`; Reader covers the shared backup vault, and Backup Contributor covers only VM-01's protected item. RG authority includes the existing backup-staging storage account, but this change reads no storage keys or contents. No role covers `rg-vm01-controller`.

Authentication is keyless: an explicit client-ID request to Azure IMDS obtains the dedicated identity's ARM token; Google STS accepts only the exact tenant, principal ID, client ID, issuer and ARM audience, and permits impersonation of only the dedicated Google service account. ARM tokens can therefore be used for both Azure and GCP by this dedicated operator. Existing GitHub deployment trust and runtime identities are not repurposed.

No service-account key, Azure client secret or certificate is needed, so there is no new credential payload to store in Secret Manager. `operator.json` contains nonsecret identifiers only and provides bootstrap without depending on a secret that would itself require GCP access. The three existing network operator credentials remain in Secret Manager and can be resolved in memory after federation.

## Use

Run `scripts/Invoke-UnattendedAdmin.ps1` with an external `PrivateDirectory` and either `-VerifyOnly` or the exact `TerraformRoot` plus `TerraformArguments`. Preserve each existing root's required activation/configuration tfvars in the argument list; the wrapper does not invent defaults or approval. Example:

```powershell
./scripts/Invoke-UnattendedAdmin.ps1 -PrivateDirectory 'C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/r057-adoption' -VerifyOnly
./scripts/Invoke-UnattendedAdmin.ps1 -PrivateDirectory 'C:/Users/ideaadmin/Documents/ChatGPT/MW-Credit-App/terraform/r057-adoption' -TerraformRoot "$PWD/infrastructure/unattended-admin" -TerraformArguments @('plan','-input=false','-detailed-exitcode')
```

The wrapper clears ambient credentials and Terraform debug logging, creates empty isolated Azure/gcloud configuration directories, requests IMDS with the exact UAMI client ID, forces Azure MSI and disables CLI/OIDC fallback. Google bearer tokens and any provider credentials stay in process memory/environment and are restored/cleared afterward. It never calls human CLI sign-in. Each invocation requests a Google token valid for up to one hour; start a new invocation for a fresh token, and do not assume an operation longer than one hour will renew it. Terraform exit2 is reported as changes requiring review rather than silently applying them.

This bootstrap is usable on the authorized Azure VM-01. Porting to another Azure executor requires an explicitly authorized attachment of this UAMI and verification there. Off-Azure operation requires a separate reviewed federation trust; copying `operator.json` alone supplies no authority.

## Recovery and boundaries

The backend is the existing protected GCS bucket `mw-credit-app-tfstate-737787224638`, prefix `unattended-admin`. All provider versions are pinned. Preserve existing human recovery access. To revoke unattended access, disable the new WIF provider and/or remove the new role bindings and UAMI attachment under explicit recovery authority; do not delete existing runtime identities or alter controller access. No secret rotation or power operation is part of setup. The dedicated identity can administer its own scoped resources, so protect VM-01 administrative access accordingly.
