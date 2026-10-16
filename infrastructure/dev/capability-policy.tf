# ALL-ARCH-01: DEV business runtime membership. The private payload (owner-only member,
# DEV Partner mapping) is uploaded separately as a secret version; Terraform pins only the
# numeric version and the policy evidence hash, never the payload.
variable "capability_policy_version" {
  description = "Reviewed numeric version of mw-credit-app-dev-capability-policy; latest is forbidden."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.capability_policy_version == null ? true : can(regex("^[1-9][0-9]*$", var.capability_policy_version))
    error_message = "Pin a numeric capability policy version; latest is forbidden."
  }
}
variable "capability_policy_sha256" {
  description = "evidenceSha256 carried inside the pinned DEV capability policy; the runtime refuses a mismatch."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.capability_policy_sha256 == null ? true : can(regex("^[a-f0-9]{64}$", var.capability_policy_sha256))
    error_message = "Use the lowercase SHA-256 policy evidence hash."
  }
}
variable "registered_creators" {
  description = "SQL roles registered as creators for the DEV business runtime."
  type        = list(string)
  default     = ["postgres"]
  validation {
    condition     = length(var.registered_creators) > 0 && length(var.registered_creators) <= 50
    error_message = "Register between one and fifty SQL creators."
  }
}

resource "google_secret_manager_secret" "capability_policy" {
  secret_id = "mw-credit-app-dev-capability-policy"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "read_capability_policy" {
  secret_id = google_secret_manager_secret.capability_policy.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.read_runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "command_capability_policy" {
  count     = var.command_infrastructure_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.capability_policy.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
}

locals {
  web_origins = ["https://${google_firebase_hosting_site.dev.site_id}.web.app", "https://dev-lm.mw-credit.com"]
  # Shared business-server.mjs environment for both DEV services (FOUNDATION_ROLE and DB_USER are per service).
  business_env = {
    APP_ENV                              = "dev"
    BUSINESS_ACTIVATION                  = "approved-candidate"
    BUSINESS_MODE                        = "business-candidate"
    APPLICATION_PROJECT_ID               = local.project
    APPLICATION_PROJECT_NUMBER           = "737787224638"
    DATA_PROJECT_ID                      = local.project
    AUTH_MODE                            = "firebase"
    FIREBASE_PROJECT_ID                  = local.project
    DB_NAME                              = "loan_manager_dev"
    INSTANCE_CONNECTION_NAME             = "${local.project}:${local.region}:${local.instance}"
    HOSTING_SITE_ID                      = google_firebase_hosting_site.dev.site_id
    ALLOWED_WEB_ORIGINS                  = jsonencode(local.web_origins)
    DEV_CAPABILITY_POLICY_SECRET_VERSION = "projects/${local.project}/secrets/${google_secret_manager_secret.capability_policy.secret_id}/versions/${var.capability_policy_version == null ? "UNBOUND" : var.capability_policy_version}"
    DEV_CAPABILITY_POLICY_SHA256         = var.capability_policy_sha256 == null ? "UNBOUND" : var.capability_policy_sha256
    DEV_SQL_APPLICATION_ROLE             = "mw_app_dev"
    DEV_SQL_JOURNAL_OWNER_ROLE           = "mw_app_dev_journal_owner"
    DEV_SQL_REGISTERED_CREATORS          = jsonencode(var.registered_creators)
  }
}
