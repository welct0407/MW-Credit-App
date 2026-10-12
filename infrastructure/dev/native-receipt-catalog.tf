# Payloads are initialized separately through private stdin. Never read or manage
# catalog secret versions in Terraform: exact receipt references stay out of state.
variable "native_receipt_catalog_secret_version" {
  description = "Reviewed numeric DEV native receipt catalog version; null retains the built-in catalog."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.native_receipt_catalog_secret_version == null ? true : can(regex("^[1-9][0-9]*$", var.native_receipt_catalog_secret_version))
    error_message = "Pin a numeric catalog secret version; latest is forbidden."
  }
}

resource "google_secret_manager_secret" "native_receipt_catalog" {
  count     = var.command_infrastructure_enabled ? 1 : 0
  secret_id = "mw-credit-app-dev-native-receipt-catalog"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "command_native_receipt_catalog" {
  count     = var.command_infrastructure_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.native_receipt_catalog[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
}
