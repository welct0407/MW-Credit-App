terraform {
  required_version = "= 1.16.5"
  required_providers { google = { source = "hashicorp/google", version = "= 8.6.0" } }
  backend "gcs" {
    bucket = "mw-credit-app-prod-tfstate-737787224638"
    prefix = "grafana-access"
  }
}
provider "google" { project = "clever-oasis-508610-n7" }
resource "google_secret_manager_secret" "provisioning_token" {
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-provisioning-token"
  deletion_protection = true
  replication {
    auto {}
  }
  labels = { application = "mw-monitoring", purpose = "grafana-provisioning" }
  lifecycle { prevent_destroy = true }
}
# Payload/version and existing Grafana account20/token21 are not Terraform resources.
# No new accessor grant: existing authorized operator only; never runtime bridge SAs.
resource "google_secret_manager_secret" "contact_integrations" {
  project             = "clever-oasis-508610-n7"
  secret_id           = "mw-grafana-contact-integrations"
  deletion_protection = true
  replication {
    auto {}
  }
  labels = { application = "mw-monitoring", purpose = "grafana-recovery" }
  lifecycle { prevent_destroy = true }
}
