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
# Off-Azure trust: the Linux cloud executor (codex-cloud, key-based) signs in
# as this identity with a Google ID token; see scripts/azure-cloud-session.sh.
resource "azurerm_federated_identity_credential" "cloud_executor" {
  name                      = "codex-cloud-google"
  user_assigned_identity_id = azurerm_user_assigned_identity.operator.id
  issuer                    = "https://accounts.google.com"
  subject                   = "101264312607096935907" # codex-cloud@clever-oasis-508610-n7 unique ID
  audience                  = ["api://AzureADTokenExchange"]
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

# Project Owner bindings that predate this root (R063 W3 ALL-INFRA-01/03).
# Declared non-authoritatively so they are reviewable; the role is unchanged.
# There is no roles/editor binding in the project (readback 16 October 2026).
import {
  to = google_project_iam_member.cloud_executor_owner
  id = "clever-oasis-508610-n7 roles/owner serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
resource "google_project_iam_member" "cloud_executor_owner" {
  project = local.project
  role    = "roles/owner"
  member  = "serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
  lifecycle { prevent_destroy = true }
}
import {
  to = google_project_iam_member.human_owner
  id = "clever-oasis-508610-n7 roles/owner user:welct0407@mw-credit.com"
}
resource "google_project_iam_member" "human_owner" {
  project = local.project
  role    = "roles/owner"
  member  = "user:welct0407@mw-credit.com"
  lifecycle { prevent_destroy = true }
}
import {
  to = google_project_iam_custom_role.codex_cloud_vm_lookup
  id = "projects/clever-oasis-508610-n7/roles/codexCloudVmLookup"
}
resource "google_project_iam_custom_role" "codex_cloud_vm_lookup" {
  project     = local.project
  role_id     = "codexCloudVmLookup"
  title       = "Codex Cloud VM lookup"
  description = "Compute lookup for approved Codex IAP operator; no metadata writes"
  permissions = ["compute.instances.get", "compute.instances.list"]
  stage       = "GA"
}
import {
  to = google_project_iam_member.codex_cloud_vm_lookup
  id = "clever-oasis-508610-n7 projects/clever-oasis-508610-n7/roles/codexCloudVmLookup serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
resource "google_project_iam_member" "codex_cloud_vm_lookup" {
  project = local.project
  role    = google_project_iam_custom_role.codex_cloud_vm_lookup.name
  member  = "serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}

# Read-only database identity for routine cloud sessions (R063 W3 DB-ACCESS-03).
# codex-cloud impersonates it; its Cloud SQL IAM user receives only the
# instance-wide pg_read_all_data membership (granted in SQL, see README).
# Admin membership stays on codex-cloud@…iam for the guarded runner only.
locals {
  cloud_sql_instance_ssd = "mw-credit-pg-20261017"
  cloud_sql_condition    = "resource.name == 'projects/${local.project}/instances/${local.cloud_sql_instance_ssd}' && resource.service == 'sqladmin.googleapis.com'"
}
resource "google_service_account" "cloud_read" {
  project      = local.project
  account_id   = "codex-cloud-read"
  display_name = "Cloud session read-only database identity"
  lifecycle { prevent_destroy = true }
}
resource "google_project_iam_member" "cloud_read_sql" {
  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  project  = local.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.cloud_read.email}"
  # A condition change replaces the binding; create the new one first.
  lifecycle { create_before_destroy = true }
  condition {
    title       = "shared-cloud-sql-only"
    description = "Only the shared Cloud SQL instance"
    expression  = local.cloud_sql_condition
  }
}
resource "google_service_account_iam_member" "cloud_read_token_creator" {
  service_account_id = google_service_account.cloud_read.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:codex-cloud@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
# SSD move: the restore carries this user to the new instance. Forget the old
# instance's user (left in place for rollback) and adopt the restored one.
# Plan only after the restore: an import of a missing user fails.
removed {
  from = google_sql_user.cloud_read
  lifecycle {
    destroy = false
  }
}
import {
  to = google_sql_user.cloud_read_ssd
  id = "${local.project}/${local.cloud_sql_instance_ssd}/codex-cloud-read@${local.project}.iam"
}
resource "google_sql_user" "cloud_read_ssd" {
  project         = local.project
  instance        = local.cloud_sql_instance_ssd
  name            = trimsuffix(google_service_account.cloud_read.email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}
