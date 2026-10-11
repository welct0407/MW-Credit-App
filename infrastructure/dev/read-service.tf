variable "read_image" {
  description = "Tested Artifact Registry image digest for the DEV borrower read service."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.read_image == null ? true : can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:[a-f0-9]{64}$", var.read_image))
    error_message = "Use an immutable image digest in the existing DEV artifact repository."
  }
}

# No service is created until a tested immutable image is explicitly pinned.
resource "google_cloud_run_v2_service" "read_api" {
  count                = var.read_image == null ? 0 : 1
  name                 = "mw-credit-app-read-dev"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  template {
    service_account                  = google_service_account.read_runtime.email
    timeout                          = "30s"
    max_instance_request_concurrency = 10
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = var.read_image
      command = ["node"]
      args    = ["services/api/dev-read-server.mjs"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = {
          APP_ENV                  = "dev"
          AUTH_MODE                = "firebase"
          FIREBASE_PROJECT_ID      = local.project
          DB_NAME                  = "loan_manager_dev"
          INSTANCE_CONNECTION_NAME = "${local.project}:${local.region}:${local.instance}"
          DB_USER                  = google_sql_user.read_runtime.name
          ALLOWED_WEB_ORIGINS      = jsonencode(["https://${google_firebase_hosting_site.dev.site_id}.web.app", "https://dev-lm.mw-credit.com"])
          OWNER_IDENTITY_MODE      = var.owner_identity_mode
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.owner_identity_mode == "uid-pinned" ? [1] : []
        content {
          name  = "OWNER_FIREBASE_UID"
          value = trimspace(data.google_secret_manager_secret_version.owner_identity[0].secret_data)
        }
      }
      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 1
        period_seconds        = 3
        failure_threshold     = 20
      }
    }
  }
  depends_on = [google_project_iam_member.read_sql, google_project_iam_member.read_auth_user]
}

# Firebase application authentication protects business routes on this service only.
# Domain-restricted sharing prevents allUsers IAM membership; owner approval is required
# before applying the service-specific Invoker IAM check setting above.

output "read_api_url" {
  value = try(google_cloud_run_v2_service.read_api[0].uri, null)
}
