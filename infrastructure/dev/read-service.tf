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
# ALL-ARCH-01: the DEV reader runs the shared business runtime with the DEV capability policy.
resource "google_cloud_run_v2_service" "read_api" {
  count                = var.read_image == null ? 0 : 1
  name                 = "mw-credit-app-read-dev"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  lifecycle {
    precondition {
      condition     = var.capability_policy_version != null && var.capability_policy_sha256 != null
      error_message = "Reader requires the reviewed numeric DEV capability policy pin and evidence hash."
    }
  }
  template {
    service_account                  = google_service_account.read_runtime.email
    timeout                          = "15s"
    max_instance_request_concurrency = 10
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = var.read_image
      command = ["node"]
      args    = ["services/production/business-server.mjs"]
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.business_env, {
          FOUNDATION_ROLE         = "reader"
          DB_USER                 = google_sql_user.read_runtime.name
          RUNTIME_SERVICE_ACCOUNT = google_service_account.read_runtime.email
        })
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "DEV_CAPABILITY_POLICY_JSON"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.capability_policy.secret_id
            version = var.capability_policy_version
          }
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
  depends_on = [google_project_iam_member.read_sql, google_project_iam_member.read_auth_user, google_secret_manager_secret_iam_member.read_capability_policy]
}

# Firebase application authentication protects business routes on this service only.
# Domain-restricted sharing prevents allUsers IAM membership; owner approval is required
# before applying the service-specific Invoker IAM check setting above.

output "read_api_url" {
  value = try(google_cloud_run_v2_service.read_api[0].uri, null)
}
