# Owner-selected existing-project state bootstrap; parked new-project state is unrelated.
terraform {
  required_version = "= 1.16.5"
  required_providers {
    google = { source = "hashicorp/google", version = "= 8.6.0" }
  }
  backend "gcs" {}
}
provider "google" { project = "clever-oasis-508610-n7" }
variable "state_bootstrap_authorized" {
  type    = bool
  default = false
}
resource "google_storage_bucket" "state" {
  count                       = var.state_bootstrap_authorized ? 1 : 0
  project                     = "clever-oasis-508610-n7"
  name                        = "mw-credit-app-prod-tfstate-737787224638"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  soft_delete_policy { retention_duration_seconds = 604800 }
  lifecycle { prevent_destroy = true }
  labels = { application = "mw-credit-app", environment = "prod", purpose = "terraform-state" }
}
output "state_target" {
  value = var.state_bootstrap_authorized ? { bucket = google_storage_bucket.state[0].name, bootstrap_prefix = "bootstrap", application_prefix = "application" } : null
}
