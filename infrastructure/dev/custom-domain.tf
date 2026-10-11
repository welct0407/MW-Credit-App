# Owner-selected DEV hostname; preserve the default web.app address as fallback.
resource "google_firebase_hosting_custom_domain" "dev" {
  provider              = google-beta
  project               = local.project
  site_id               = google_firebase_hosting_site.dev.site_id
  custom_domain         = "dev-lm.mw-credit.com"
  wait_dns_verification = false
  deletion_policy       = "ABANDON"
  lifecycle { prevent_destroy = true }
}

output "dev_custom_domain_dns" {
  value = google_firebase_hosting_custom_domain.dev.required_dns_updates
}
