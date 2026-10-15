# VM-01 Terraform power actions — 15 October 2026

**Purpose.** Owner request: Terraform should be able to manage VM-01 power (switch off and deallocate, start, restart). This is the Terraform part of Phase 4 in the [cleanup proposal](../project/outputs/infrastructure-cleanup-phase1/proposal.md).

**Scope.** New `infrastructure/ecosystem-azure-metadata/power.tf`: three invoke-only `azapi_resource_action` actions (`vm01_start`, `vm01_deallocate`, `vm01_restart`) against `azapi_resource.vm`, and an `instanceView` read with output `vm01_power_state`. There is no `action_trigger`, so ordinary applies never change power. AzAPI was chosen over AzureRM because `azurerm_virtual_machine_power` in the pinned 5.9.0 has no deallocate. No provider, lockfile, resource or state change. Root README and proposal updated.

**Checks.** `terraform fmt -check` and `terraform validate` (Terraform 1.16.5, committed lockfile, `-backend=false`) pass. An offline `plan -invoke` of the deallocate action renders the expected POST. A trial deallocate from the cloud session failed before reaching Azure: there is no Azure CLI or credential there. The VM was not touched.

**Remaining.** The first live invoke needs an Azure login with start/deallocate rights, run from a host other than VM-01 when starting it. The Phase 4 runner, serialization/reconciliation and controller retirement are not done.

**Recovery.** Revert the commit. The actions hold no state.

## Cloud-session Azure access

**Purpose.** Owner choice: let the Claude Code cloud environment authenticate to Azure as the existing `mw-credit-unattended-admin` identity (same roles), keyless, instead of storing an Azure secret.

**Scope.** `infrastructure/unattended-admin/main.tf` adds `azurerm_federated_identity_credential.cloud_executor`, which trusts Google ID tokens for `codex-cloud` (subject `101264312607096935907`, audience `api://AzureADTokenExchange`). The new `scripts/azure-cloud-session.sh` mints the token and runs a command with OIDC `ARM_*` variables. The root README and environment inventory are updated.

**Checks.** `terraform fmt`/`validate` pass with the committed lockfile, and `bash -n` passes. The wrapper mints a token with the expected issuer, audience and subject. Entra token exchange before apply returns AADSTS70025 (no federated credential yet), which confirms reachability and the target.

**Wrapper fix.** VM-01 has only Windows PowerShell 5.1. There, `Invoke-UnattendedAdmin.ps1` failed closed with "Dedicated managed identity unavailable" because `Invoke-RestMethod -NoProxy` exists only in PowerShell 6+. A direct IMDS request on VM-01 succeeded. The wrapper now passes `-NoProxy` only on 6+. `scripts/tests/Test-UnattendedAdmin.ps1` passes.

**Outcome.** The owner applied `unattended-admin` from VM-01 (Windows PowerShell 5.1, wrapper `e2c5ce7`): 1 imported (`cloud_executor_token_creator`), 1 added (`cloud_executor`), 0 changed or destroyed. Terraform 1.16.5 was missing from the documented `AppData/Local/MWCredit/tools/terraform` path on VM-01, so it was reinstalled there from the official zip (SHA-256 checked). From the cloud session, the Entra token exchange then succeeded. `plan -invoke` showed only the deallocate action, and on the owner's instruction `apply -invoke=action.azapi_resource_action.vm01_deallocate` completed. A refresh-only plan reports `vm01_power_state = "VM deallocated"`.

**Remaining.** Start VM-01 with `scripts/azure-cloud-session.sh terraform -chdir=infrastructure/ecosystem-azure-metadata apply -invoke=action.azapi_resource_action.vm01_start`. The Phase 4 runner and controller retirement are still open.

**Recovery.** Remove the federated credential (Terraform) and revert the commit.
