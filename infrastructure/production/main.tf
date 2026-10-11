# Phase 3 preparation only. This root does not create a project, enable APIs,
# configure auth, deploy services, grant retained-data access, or manage DNS.
terraform {
  required_version = "= 1.16.5"
  required_providers {
    google = { source = "hashicorp/google", version = "= 8.6.0" }
  }
  # Supply a separately approved production bucket/prefix outside the repository.
  # Never initialize this root against the DEV backend.
  backend "gcs" {}
}

provider "google" {
  project = var.application_project_id
  region  = var.region
}

variable "application_project_id" {
  description = "Verified separately provisioned PROD application project; no default or project creation."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.application_project_id)) && var.application_project_id != "clever-oasis-508610-n7"
    error_message = "Use a verified separate application project, never the existing DEV/data project."
  }
}
variable "application_project_number" {
  description = "Verified numeric identity of the selected application project."
  type        = string
  validation {
    condition     = can(regex("^[0-9]+$", var.application_project_number)) && var.application_project_number != "737787224638"
    error_message = "Use the verified separate application project number."
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
  secrets    = var.foundation_authorized ? toset(["google-auth", "firebase-web", "owner-identity", "native-receipt-catalog"]) : toset([])
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
  repository_id = "mw-credit-app"
  format        = "DOCKER"
  lifecycle { prevent_destroy = true }
}

output "foundation_status" {
  value = {
    authorized                 = var.foundation_authorized
    application_project_id     = var.application_project_id
    application_project_number = var.application_project_number
    runtime_deployment         = "not implemented or authorized by this root"
    retained_data_access       = "not granted by this root"
  }
}
