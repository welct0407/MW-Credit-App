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

This bootstrap is usable on the authorized Azure VM-01. Porting to another Azure executor requires an explicitly authorized attachment of this UAMI and verification there. Off-Azure, the Linux cloud executor `codex-cloud` (Google unique ID `101264312607096935907`) is trusted through the federated credential `codex-cloud-google` (issuer `https://accounts.google.com`, audience `api://AzureADTokenExchange`). There are no session hooks (removed 16 October 2026, ALL-INFRA-07). `scripts/azure-cloud-session.sh <command>` mints a one-hour Google ID token per command into a 0600 temporary file, runs the command with Azure OIDC settings and removes the file on exit. In Claude Code cloud sessions, VM-01 power uses `scripts/vm01-power.sh start|deallocate|restart`, and any other Azure Terraform command is wrapped the same way. Nothing is stored. Revoke by removing that credential. Copying `operator.json` alone supplies no authority. The trust is bootstrapped by one apply of this root from VM-01 with the wrapper above, because the cloud executor cannot reach Azure before it exists.

## Cloud executor identity and key rotation

This root also declares access that predates it. These were imported unchanged on 16 October 2026 (R063 W3):
- the project `roles/owner` bindings of `codex-cloud` and of the human owner, both with `prevent_destroy`;
- the custom role `codexCloudVmLookup` and its `codex-cloud` binding.

The project has no `roles/editor` binding. Bindings are non-authoritative (`google_project_iam_member`), so other members are not touched.

Routine cloud-session database reads use `codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com`, which is declared here:
- `roles/cloudsql.client` and `roles/cloudsql.instanceUser`, limited to the shared instance;
- Token Creator for `codex-cloud`;
- Cloud SQL IAM user `codex-cloud-read@clever-oasis-508610-n7.iam`.

The read user's database access is set in SQL, not Terraform: membership of `pg_read_all_data` (instance-wide) and `CONNECT` on `loan_manager_dev`. Sign in with `gcloud sql generate-login-token --impersonate-service-account=codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com`. Admin membership stays on `codex-cloud@…iam` for the guarded runner only.

`codex-cloud` signs in with one user-managed key, held in the cloud environment as `GCP_SA_KEY_B64`. The current key is `37df51c6…`, created 15 October 2026. Rotate it every 90 days; the next rotation is due **13 January 2027**. To rotate:
1. The owner creates a new key on a trusted machine (`gcloud iam service-accounts keys create … --iam-account=codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com`).
2. Replace `GCP_SA_KEY_B64` in the environment, then delete the local key file.
3. Start a new session and check that the credential's `private_key_id` equals the new key ID (print only the ID) and that `gcloud auth list` works.
4. Run `gcloud iam service-accounts keys disable <old id>`.
5. After 7 days with no use in the audit logs, run `keys delete` on the old key.

Record each rotation in the change log. The older key `f6729ca0…` was disabled on 16 October 2026. Its last use was on 4 October from another machine, and deleting it is pending owner confirmation.

## Recovery and boundaries

The backend is the existing protected GCS bucket `mw-credit-app-tfstate-737787224638`, prefix `unattended-admin`. All provider versions are pinned. Preserve existing human recovery access. To revoke unattended access, disable the new WIF provider and/or remove the new role bindings and UAMI attachment under explicit recovery authority; do not delete existing runtime identities or alter controller access. No secret rotation or power operation is part of setup. The dedicated identity can administer its own scoped resources, so protect VM-01 administrative access accordingly.
