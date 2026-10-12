# All gates default off. Payload versions are supplied by a separately authorized
# operator; Terraform never reads or stores capability/catalog secret payloads.
variable "business_runtime_authorized" {
  type    = bool
  default = false
}
variable "business_image" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.business_image == null ? true : can(regex("^${var.region}-docker[.]pkg[.]dev/${var.application_project_id}/mw-credit-app-prod/api@sha256:[a-f0-9]{64}$", var.business_image))
    error_message = "Business runtime requires an immutable tested production registry digest."
  }
}
variable "capability_policy_version" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.capability_policy_version == null ? true : can(regex("^[1-9][0-9]*$", var.capability_policy_version))
    error_message = "Use an explicit immutable numeric capability policy version."
  }
}
variable "capability_policy_sha256" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.capability_policy_sha256 == null ? true : can(regex("^[a-f0-9]{64}$", var.capability_policy_sha256))
    error_message = "Use the reviewed capability policy evidence hash."
  }
}
variable "business_registered_creators" {
  type    = list(string)
  default = []
  validation {
    condition     = length(var.business_registered_creators) <= 50 && length(distinct(var.business_registered_creators)) == length(var.business_registered_creators) && alltrue([for name in var.business_registered_creators : length(name) > 0 && length(name) <= 63 && !can(regex("[\\x00-\\x1f]", name))])
    error_message = "Register exact inspected distinct SQL creator names."
  }
}
variable "business_receipts_authorized" {
  type    = bool
  default = false
}
variable "native_catalog_version" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.native_catalog_version == null ? true : can(regex("^[1-9][0-9]*$", var.native_catalog_version))
    error_message = "Use an explicit numeric native catalog version."
  }
}
variable "receipt_source_evidence_sha256" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.receipt_source_evidence_sha256 == null ? true : can(regex("^[a-f0-9]{64}$", var.receipt_source_evidence_sha256))
    error_message = "Use exact production source/catalog evidence hash."
  }
}
variable "receipt_compatibility_evidence_sha256" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.receipt_compatibility_evidence_sha256 == null ? true : can(regex("^[a-f0-9]{64}$", var.receipt_compatibility_evidence_sha256))
    error_message = "Use exact qualified render/binding evidence hash."
  }
}
locals {
  business_secret_names = var.business_infrastructure_authorized ? toset(concat(["capability-policy"], var.business_receipts_authorized ? ["native-receipt-catalog"] : [])) : toset([])
  native_receipt_root   = "appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/"
  receipt_bucket        = "mw-payment-receipts-prod-508610-n7"
}
resource "google_secret_manager_secret" "business" {
  for_each  = local.business_secret_names
  project   = var.application_project_id
  secret_id = "mw-credit-app-prod-${each.key}"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "prod" }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "business_policy" {
  for_each  = local.business_roles
  project   = var.application_project_id
  secret_id = google_secret_manager_secret.business["capability-policy"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application[each.key].email}"
}
resource "google_secret_manager_secret_iam_member" "business_catalog" {
  count     = var.business_infrastructure_authorized && var.business_receipts_authorized ? 1 : 0
  project   = var.application_project_id
  secret_id = google_secret_manager_secret.business["native-receipt-catalog"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application["command"].email}"
}
resource "google_project_iam_custom_role" "business_receipt" {
  for_each    = var.business_infrastructure_authorized && var.business_receipts_authorized ? toset(["get", "create"]) : toset([])
  project     = var.application_project_id
  role_id     = each.key == "get" ? "mwCreditProductionReceiptGet" : "mwCreditProductionReceiptCreate"
  title       = "MW Credit production receipt ${each.key}"
  permissions = ["storage.objects.${each.key}"]
}
resource "google_storage_bucket_iam_member" "business_receipt" {
  for_each = google_project_iam_custom_role.business_receipt
  bucket   = local.receipt_bucket
  role     = each.value.name
  member   = "serviceAccount:${google_service_account.application["command"].email}"
  condition {
    title      = "prod_receipt_${each.key}_only"
    expression = each.key == "get" ? "resource.name.startsWith('projects/_/buckets/${local.receipt_bucket}/objects/${local.native_receipt_root}') || resource.name.startsWith('projects/_/buckets/${local.receipt_bucket}/objects/receipts/prod/')" : "resource.name.startsWith('projects/_/buckets/${local.receipt_bucket}/objects/${local.native_receipt_root}pwa/')"
  }
}
