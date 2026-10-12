# Phase 3 staged preparation. No retained-data authority or DNS records.
terraform {
  required_version = "= 1.16.5"
  required_providers {
    google      = { source = "hashicorp/google", version = "= 8.6.0" }
    google-beta = { source = "hashicorp/google-beta", version = "= 8.6.0" }
  }
  # Supply a separately approved production bucket/prefix outside the repository.
  # Never initialize this root against the DEV backend.
  backend "gcs" {}
}

provider "google" {
  project               = var.application_project_id
  region                = var.region
  billing_project       = var.application_project_id
  user_project_override = true
}
provider "google-beta" {
  project               = var.application_project_id
  region                = var.region
  billing_project       = var.application_project_id
  user_project_override = true
}

variable "application_project_id" {
  description = "Owner-selected existing application/data project; no project creation."
  type        = string
  validation {
    condition     = var.application_project_id == "clever-oasis-508610-n7"
    error_message = "Use the owner-selected existing project only."
  }
}
variable "application_project_number" {
  description = "Verified numeric identity of the selected application project."
  type        = string
  validation {
    condition     = var.application_project_number == "737787224638"
    error_message = "Use the verified existing project number."
  }
}
variable "region" {
  description = "Explicit approved application region."
  type        = string
}
variable "foundation_authorized" {
  description = "Leave false until the owner approves the concrete target and saved foundation plan."
  type        = bool
  default     = false
}

locals {
  # Proposed account names become real only after separately authorized creation.
  identities = var.foundation_authorized ? toset(["read", "command", "build", "deploy"]) : toset([])
  secrets    = var.foundation_authorized ? toset(["owner-identity"]) : toset([])
}

resource "google_service_account" "application" {
  for_each     = local.identities
  project      = var.application_project_id
  account_id   = "mw-credit-app-${each.key}-prod"
  display_name = "MW Credit PROD ${each.key}"
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret" "application" {
  for_each  = local.secrets
  project   = var.application_project_id
  secret_id = "mw-credit-app-prod-${each.key}"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "prod" }
  lifecycle { prevent_destroy = true }
}

resource "google_artifact_registry_repository" "application" {
  count         = var.foundation_authorized ? 1 : 0
  project       = var.application_project_id
  location      = var.region
  repository_id = "mw-credit-app-prod"
  format        = "DOCKER"
  lifecycle { prevent_destroy = true }
}

output "foundation_status" {
  value = {
    authorized                 = var.foundation_authorized
    application_project_id     = var.application_project_id
    application_project_number = var.application_project_number
    runtime_deployment         = var.runtime_authorized ? "contained owner-only foundation" : "disabled pending enrolled owner and reviewed image"
    retained_data_access       = "not granted by this root"
  }
}
