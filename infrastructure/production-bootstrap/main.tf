terraform {
  required_version = "= 1.16.5"
  required_providers {
    google = { source = "hashicorp/google", version = "= 8.6.0" }
  }
  # Initial bootstrap only. Initialize with an absolute private external path;
  # after authorized creation migrate this state to the new GCS bucket (README).
  backend "local" {}
}

provider "google" {}

variable "project_id" {
  description = "Proposed new project ID; availability is not established until creation succeeds."
  type        = string
  default     = "mw-credit-app-prod-20261011"
  validation {
    condition     = var.project_id == "mw-credit-app-prod-20261011"
    error_message = "Changing the proposed project identity requires a new reviewed bootstrap proposal."
  }
}
variable "organization_id" {
  type    = string
  default = "594773370606"
  validation {
    condition     = var.organization_id == "594773370606"
    error_message = "Use the verified owner-selected organization only."
  }
}
variable "billing_account" {
  type    = string
  default = "0125EC-78CB0F-A74AAD"
  validation {
    condition     = var.billing_account == "0125EC-78CB0F-A74AAD"
    error_message = "Use the verified owner-selected billing association only."
  }
}
variable "bootstrap_authorized" {
  description = "False until the owner authorizes the exact saved creation plan."
  type        = bool
  default     = false
}

resource "google_project" "application" {
  count               = var.bootstrap_authorized ? 1 : 0
  project_id          = var.project_id
  name                = "MW Credit Production"
  org_id              = var.organization_id
  billing_account     = var.billing_account
  auto_create_network = false
  labels              = { application = "mw-credit-app", environment = "prod" }
  lifecycle { prevent_destroy = true }
}

resource "google_project_service" "storage" {
  count              = var.bootstrap_authorized ? 1 : 0
  project            = google_project.application[0].project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_storage_bucket" "state" {
  count                       = var.bootstrap_authorized ? 1 : 0
  project                     = google_project.application[0].project_id
  name                        = "mw-credit-app-prod-tfstate-${google_project.application[0].number}"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  soft_delete_policy { retention_duration_seconds = 604800 }
  lifecycle { prevent_destroy = true }
  labels     = { application = "mw-credit-app", environment = "prod", purpose = "terraform-state" }
  depends_on = [google_project_service.storage]
}

output "created_target" {
  value = var.bootstrap_authorized ? {
    project_id     = google_project.application[0].project_id
    project_number = google_project.application[0].number
    state_bucket   = google_storage_bucket.state[0].name
    state_prefix   = "bootstrap"
  } : null
}
