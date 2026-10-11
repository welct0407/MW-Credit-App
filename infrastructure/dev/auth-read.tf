resource "google_firebase_web_app" "dev" {
  provider        = google-beta
  project         = local.project
  display_name    = "MW Credit DEV"
  deletion_policy = "ABANDON"
  depends_on      = [google_firebase_project.app]
  lifecycle { prevent_destroy = true }
}

variable "additional_authorized_domains" {
  description = "Reviewed production Hosting domains appended to the existing shared-default auth allowlist."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for domain in var.additional_authorized_domains : contains(["lm.mw-credit.com", "mw-credit-prod-737787224638.web.app"], domain)])
    error_message = "Only the reviewed production Hosting domains may be appended."
  }
}
resource "google_identity_platform_config" "dev" {
  provider = google-beta
  project  = local.project
  authorized_domains = concat([
    "clever-oasis-508610-n7.firebaseapp.com",
    "mw-credit-app-dev-737787224638.web.app",
    "dev-lm.mw-credit.com"
  ], var.additional_authorized_domains)
  sign_in {
    allow_duplicate_emails = false
    anonymous { enabled = false }
    email {
      enabled           = false
      password_required = false
    }
    phone_number { enabled = false }
  }
  depends_on = [google_firebase_project.app, google_project_service.required]
  lifecycle { prevent_destroy = true }
}

resource "google_service_account" "read_runtime" {
  account_id   = "mw-credit-app-read-dev"
  display_name = "MW Credit DEV read-only application"
}

resource "google_project_iam_member" "read_sql" {
  for_each = toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser"])
  project  = local.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.read_runtime.email}"
}

resource "google_sql_user" "read_runtime" {
  instance        = local.instance
  name            = trimsuffix(google_service_account.read_runtime.email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}

resource "google_project_iam_custom_role" "read_auth_user" {
  role_id     = "mwCreditAppReadAuthUser"
  title       = "MW Credit read API auth status"
  permissions = ["firebaseauth.users.get"]
}

resource "google_project_iam_member" "read_auth_user" {
  project = local.project
  role    = google_project_iam_custom_role.read_auth_user.name
  member  = "serviceAccount:${google_service_account.read_runtime.email}"
}

output "dev_web_app_id" { value = google_firebase_web_app.dev.app_id }
output "read_runtime_identity" { value = google_service_account.read_runtime.email }
