variable "command_image" {
  description = "Tested immutable image digest for the separate DEV synthetic command service."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.command_image == null ? true : can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:[a-f0-9]{64}$", var.command_image))
    error_message = "Pin an immutable digest in the existing DEV artifact repository."
  }
}
variable "command_fixture" {
  description = "Reviewed synthetic-only borrower, charge and cash account allowlist; never real business IDs."
  type        = object({ borrowerId = string, chargeIds = list(string), cashAccountIds = list(string) })
  default     = null
  nullable    = true
  validation {
    condition = var.command_fixture == null ? true : (
      startswith(var.command_fixture.borrowerId, "R052-4G-") &&
      length(var.command_fixture.chargeIds) > 0 && length(var.command_fixture.chargeIds) <= 100 &&
      length(var.command_fixture.cashAccountIds) > 0 && length(var.command_fixture.cashAccountIds) <= 100 &&
      alltrue([for id in concat(var.command_fixture.chargeIds, var.command_fixture.cashAccountIds) : startswith(id, "R052-4G-")])
    )
    error_message = "Use the explicit reviewed R052-4G synthetic fixture only."
  }
}
resource "google_cloud_run_v2_service" "command_api" {
  count                = var.command_image == null ? 0 : 1
  name                 = "mw-credit-app-command-dev"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  lifecycle {
    precondition {
      condition     = var.command_infrastructure_enabled && var.command_fixture != null && var.owner_identity_mode == "uid-pinned" && var.owner_uid_secret_version != null
      error_message = "Command runtime requires its separate identity, reviewed synthetic fixture and pinned owner secret."
    }
  }
  template {
    service_account                  = google_service_account.command_runtime[0].email
    timeout                          = "30s"
    max_instance_request_concurrency = 5
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = var.command_image
      command = ["node"]
      args    = ["services/payment-command/dev-server.mjs"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = {
          APP_ENV                        = "dev"
          AUTH_MODE                      = "firebase"
          FIREBASE_PROJECT_ID            = local.project
          DB_NAME                        = "loan_manager_dev"
          DB_USER                        = google_sql_user.command_runtime[0].name
          INSTANCE_CONNECTION_NAME       = "${local.project}:${local.region}:${local.instance}"
          OWNER_IDENTITY_MODE            = "uid-pinned"
          COMMAND_MODE                   = "synthetic-only"
          COMMAND_FIXTURE_JSON           = jsonencode(var.command_fixture)
          ALLOWED_WEB_ORIGINS            = jsonencode(["https://${google_firebase_hosting_site.dev.site_id}.web.app", "https://dev-lm.mw-credit.com"])
          RECEIPT_BUCKET                 = local.bucket
          RECEIPT_SQL_PREFIX             = "manual-receipts/dev/pwa/"
          RECEIPT_OBJECT_PREFIX          = "appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/"
          RECEIPT_COMPATIBILITY_EVIDENCE = "r052-4f:receipt-compatibility-4f.json:generated-png-appsheet-render"
        }
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "OWNER_FIREBASE_UID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.owner_identity.secret_id
            version = var.owner_uid_secret_version
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
  depends_on = [google_project_iam_member.command_sql, google_project_iam_member.command_auth_user, google_secret_manager_secret_iam_member.command_owner_identity, google_storage_bucket_iam_member.command_receipts]
}
# Browser business routes use pinned Firebase auth; no shared/public bucket or
# organization policy changes. Review this service-specific invocation boundary.
output "command_api_url" { value = try(google_cloud_run_v2_service.command_api[0].uri, null) }

