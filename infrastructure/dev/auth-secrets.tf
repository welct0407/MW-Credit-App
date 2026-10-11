resource "google_secret_manager_secret" "google_auth_config" {
  secret_id = "mw-credit-app-dev-google-auth"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret" "firebase_web_config" {
  secret_id = "mw-credit-app-dev-firebase-web"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}

data "google_secret_manager_secret_version" "google_auth_config" {
  secret  = google_secret_manager_secret.google_auth_config.id
  version = "1"
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  provider        = google-beta
  project         = local.project
  idp_id          = "google.com"
  enabled         = true
  client_id       = jsondecode(data.google_secret_manager_secret_version.google_auth_config.secret_data).clientId
  client_secret   = sensitive(jsondecode(data.google_secret_manager_secret_version.google_auth_config.secret_data).clientSecret)
  deletion_policy = "ABANDON"
  lifecycle { prevent_destroy = true }
}

import {
  to = google_identity_platform_default_supported_idp_config.google
  id = "projects/clever-oasis-508610-n7/defaultSupportedIdpConfigs/google.com"
}
