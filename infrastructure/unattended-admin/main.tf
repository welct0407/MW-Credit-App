terraform {
  required_version = "= 1.16.5"
  required_providers {
    google  = { source = "hashicorp/google", version = "= 8.6.0" }
    azurerm = { source = "hashicorp/azurerm", version = "= 5.9.0" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "unattended-admin"
  }
}
provider "google" { project = "clever-oasis-508610-n7" }
provider "azurerm" {
  features {}
  subscription_id                 = "50f792fa-803e-4280-833d-1fe60fef5293"
  tenant_id                       = "9e29c895-606a-420b-acc2-1c24375df4d9"
  resource_provider_registrations = "none"
}
locals {
  project        = "clever-oasis-508610-n7"
  project_number = "737787224638"
  tenant         = "9e29c895-606a-420b-acc2-1c24375df4d9"
  subscription   = "/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293"
  resource_group = "${local.subscription}/resourceGroups/rg-mwcredit"
  backup_vault   = "${local.subscription}/resourceGroups/rg-backup/providers/Microsoft.RecoveryServices/vaults/vm-backup-vault"
  backup_item    = "${local.backup_vault}/backupFabrics/Azure/protectionContainers/IaasVMContainer;iaasvmcontainerv2;RG-MWCREDIT;VM-01/protectedItems/VM;iaasvmcontainerv2;RG-MWCREDIT;VM-01"
}
resource "azurerm_user_assigned_identity" "operator" {
  name                = "mw-credit-unattended-admin"
  resource_group_name = "rg-mwcredit"
  location            = "southeastasia"
  lifecycle { prevent_destroy = true }
}
resource "azurerm_role_assignment" "resource_admin" {
  for_each             = toset(["Contributor", "Role Based Access Control Administrator"])
  scope                = local.resource_group
  role_definition_name = each.value
  principal_id         = azurerm_user_assigned_identity.operator.principal_id
  principal_type       = "ServicePrincipal"
}
resource "azurerm_role_assignment" "backup_reader" {
  scope                = local.backup_vault
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.operator.principal_id
  principal_type       = "ServicePrincipal"
}
resource "azurerm_role_assignment" "backup_operator" {
  scope                = local.backup_item
  role_definition_name = "Backup Contributor"
  principal_id         = azurerm_user_assigned_identity.operator.principal_id
  principal_type       = "ServicePrincipal"
}
resource "google_service_account" "operator" {
  project      = local.project
  account_id   = "mw-credit-unattended-admin"
  display_name = "MW Credit unattended infrastructure admin"
  lifecycle { prevent_destroy = true }
}
resource "google_project_iam_member" "operator" {
  project = local.project
  role    = "roles/owner"
  member  = "serviceAccount:${google_service_account.operator.email}"
}
resource "google_iam_workload_identity_pool" "azure" {
  project                   = local.project
  workload_identity_pool_id = "mw-credit-azure-admin"
  display_name              = "MW Credit Azure admin"
  lifecycle { prevent_destroy = true }
}
resource "google_iam_workload_identity_pool_provider" "azure" {
  project                            = local.project
  workload_identity_pool_id          = google_iam_workload_identity_pool.azure.workload_identity_pool_id
  workload_identity_pool_provider_id = "vm01"
  display_name                       = "Dedicated VM01 managed identity"
  attribute_mapping                  = { "google.subject" = "assertion.oid" }
  attribute_condition                = "assertion.tid == '${local.tenant}' && assertion.oid == '${azurerm_user_assigned_identity.operator.principal_id}' && assertion.appid == '${azurerm_user_assigned_identity.operator.client_id}'"
  oidc {
    issuer_uri        = "https://sts.windows.net/${local.tenant}/"
    allowed_audiences = ["https://management.azure.com/"]
  }
  lifecycle { prevent_destroy = true }
}
resource "google_service_account_iam_member" "federation" {
  service_account_id = google_service_account.operator.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.azure.name}/subject/${azurerm_user_assigned_identity.operator.principal_id}"
}
output "operator_metadata" {
  value = {
    azure_client_id        = azurerm_user_assigned_identity.operator.client_id
    azure_principal_id     = azurerm_user_assigned_identity.operator.principal_id
    azure_identity_id      = azurerm_user_assigned_identity.operator.id
    azure_tenant_id        = local.tenant
    azure_subscription_id  = "50f792fa-803e-4280-833d-1fe60fef5293"
    audience               = "https://management.azure.com/"
    google_provider        = google_iam_workload_identity_pool_provider.azure.name
    google_service_account = google_service_account.operator.email
  }
}
# The Linux cloud executor (key-based codex-cloud, project Owner) acts as this
# operator for operator-pinned delivery such as scripts/promotion/
# deploy-business-hosting.mjs. Applied first with gcloud on 15 October 2026
# because this root needs VM-01's Azure identity; the import adopts it.
import {
  to = google_service_account_iam_member.cloud_executor_token_creator
  id = "projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-unattended-admin@clever-oasis-508610-n7.iam.gserviceaccount.com roles/iam.serviceAccountTokenCreator serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
resource "google_service_account_iam_member" "cloud_executor_token_creator" {
  service_account_id = google_service_account.operator.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
