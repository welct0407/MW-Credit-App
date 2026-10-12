variable "hosting_site_id" {
  description = "Explicit new production Hosting site; availability must be verified during authorized provisioning."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$", var.hosting_site_id)) && var.hosting_site_id != "mw-credit-app-dev-737787224638"
    error_message = "Use an explicit distinct production site."
  }
}

resource "google_firebase_web_app" "application" {
  count           = var.foundation_authorized ? 1 : 0
  provider        = google-beta
  project         = var.application_project_id
  display_name    = "MW Credit Production"
  deletion_policy = "ABANDON"
  lifecycle { prevent_destroy = true }
}
resource "google_firebase_hosting_site" "application" {
  count    = var.foundation_authorized ? 1 : 0
  provider = google-beta
  project  = var.application_project_id
  site_id  = var.hosting_site_id
  app_id   = google_firebase_web_app.application[0].app_id
  lifecycle { prevent_destroy = true }
}
resource "google_firebase_hosting_custom_domain" "application" {
  count                 = var.foundation_authorized ? 1 : 0
  provider              = google-beta
  project               = var.application_project_id
  site_id               = google_firebase_hosting_site.application[0].site_id
  custom_domain         = "lm.mw-credit.com"
  wait_dns_verification = false
  deletion_policy       = "ABANDON"
  lifecycle { prevent_destroy = true }
}

# Existing default Google provider is reused unchanged; no new OAuth configuration.
# No client secret or owner UID data source/version payload enters Terraform.
output "enrollment_targets" {
  value = var.foundation_authorized ? {
    web_app_id      = google_firebase_web_app.application[0].app_id
    hosting_site_id = google_firebase_hosting_site.application[0].site_id
    auth_domain     = "${var.application_project_id}.firebaseapp.com"
    dns_updates     = google_firebase_hosting_custom_domain.application[0].required_dns_updates
  } : null
}
