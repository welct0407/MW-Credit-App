variable "runtime_authorized" {
  type    = bool
  default = false
}
variable "foundation_image" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.foundation_image == null ? true : can(regex("^${var.region}-docker[.]pkg[.]dev/${var.application_project_id}/mw-credit-app-prod/api@sha256:[a-f0-9]{64}$", var.foundation_image))
    error_message = "Pin a tested digest in the separate production artifact repository."
  }
}
variable "owner_secret_version" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.owner_secret_version == null ? true : can(regex("^[1-9][0-9]*$", var.owner_secret_version))
    error_message = "Pin the privately verified existing authoritative shared-default owner's numeric secret version."
  }
}
locals {
  runtime_roles = var.runtime_authorized ? { read = "reader", command = "command" } : {}
}
resource "google_project_iam_custom_role" "auth_user" {
  count       = var.foundation_authorized ? 1 : 0
  project     = var.application_project_id
  role_id     = "mwCreditProductionAuthUser"
  title       = "MW Credit production auth user status"
  permissions = ["firebaseauth.users.get"]
}
resource "google_project_iam_member" "runtime_auth" {
  for_each = local.runtime_roles
  project  = var.application_project_id
  role     = google_project_iam_custom_role.auth_user[0].name
  member   = "serviceAccount:${google_service_account.application[each.key].email}"
}
resource "google_secret_manager_secret_iam_member" "runtime_owner" {
  for_each  = local.runtime_roles
  project   = var.application_project_id
  secret_id = google_secret_manager_secret.application["owner-identity"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.application[each.key].email}"
}
resource "google_cloud_run_v2_service" "foundation" {
  for_each             = local.runtime_roles
  project              = var.application_project_id
  name                 = "mw-credit-app-${each.key}-prod"
  location             = var.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.foundation_authorized && var.foundation_image != null && var.owner_secret_version != null
      error_message = "Runtime requires the reviewed foundation, tested immutable image and actual enrolled owner version."
    }
  }
  template {
    service_account                  = google_service_account.application[each.key].email
    timeout                          = "15s"
    max_instance_request_concurrency = 5
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.foundation_image
      command = ["node"]
      args    = ["services/production/server.mjs"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = {
          APP_ENV                       = "prod"
          FOUNDATION_MODE               = "foundation"
          FOUNDATION_ROLE               = each.value
          APPLICATION_PROJECT_ID        = var.application_project_id
          APPLICATION_PROJECT_NUMBER    = var.application_project_number
          AUTH_MODE                     = "firebase"
          FIREBASE_PROJECT_ID           = var.application_project_id
          OWNER_IDENTITY_MODE           = "uid-pinned"
          RUNTIME_SERVICE_ACCOUNT       = google_service_account.application[each.key].email
          DATA_PROJECT_ID               = "clever-oasis-508610-n7"
          DB_NAME                       = "loan_manager_prod"
          INSTANCE_CONNECTION_NAME      = "clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914"
          HOSTING_SITE_ID               = var.hosting_site_id
          ALLOWED_WEB_ORIGINS           = jsonencode(["https://lm.mw-credit.com", "https://${var.hosting_site_id}.web.app"])
          OWNER_IDENTITY_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-owner-identity/versions/${var.owner_secret_version == null ? "UNBOUND" : var.owner_secret_version}"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "PROD_OWNER_FIREBASE_UID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.application["owner-identity"].secret_id
            version = var.owner_secret_version
          }
        }
      }
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 3
        failure_threshold = 20
      }
    }
  }
  depends_on = [google_project_iam_member.runtime_auth, google_secret_manager_secret_iam_member.runtime_owner]
}
