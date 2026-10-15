# VM-01 Terraform power actions — 15 October 2026

**Purpose.** Owner request: Terraform should be able to manage VM-01 power (switch off and deallocate, start, restart). This is the Terraform part of Phase 4 in the [cleanup proposal](../project/outputs/infrastructure-cleanup-phase1/proposal.md).

**Scope.** New `infrastructure/ecosystem-azure-metadata/power.tf`: three invoke-only `azapi_resource_action` actions (`vm01_start`, `vm01_deallocate`, `vm01_restart`) against `azapi_resource.vm`, and an `instanceView` read with output `vm01_power_state`. There is no `action_trigger`, so ordinary applies never change power. AzAPI was chosen over AzureRM because `azurerm_virtual_machine_power` in the pinned 5.9.0 has no deallocate. No provider, lockfile, resource or state change. Root README and proposal updated.

**Checks.** `terraform fmt -check` and `terraform validate` (Terraform 1.16.5, committed lockfile, `-backend=false`) pass. An offline `plan -invoke` of the deallocate action renders the expected POST. A trial deallocate from the cloud session failed before reaching Azure: there is no Azure CLI or credential there. The VM was not touched.

**Remaining.** The first live invoke needs an Azure login with start/deallocate rights, run from a host other than VM-01 when starting it. The Phase 4 runner, serialization/reconciliation and controller retirement are not done.

**Recovery.** Revert the commit. The actions hold no state.
