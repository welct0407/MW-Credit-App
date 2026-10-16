variable "command_image" {
  description = "Tested immutable image digest for the separate owner-authenticated DEV command service."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.command_image == null ? true : can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:[a-f0-9]{64}$", var.command_image))
    error_message = "Pin an immutable digest in the existing DEV artifact repository."
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
      condition     = !var.agent_receipt_api.enabled || (var.agent_receipt_api.policy_infrastructure_enabled && var.agent_receipt_api.policy_version != null)
      error_message = "Machine receipt API requires its reviewed DEV policy container and numeric secret version."
    }
    precondition {
      condition     = !var.agent_conversation_api.enabled || (var.agent_conversation_api.policy_infrastructure_enabled && var.agent_conversation_api.policy_version != null)
      error_message = "Machine conversation API requires its reviewed DEV policy container and numeric secret version."
    }
    precondition {
      condition     = !var.workers.command_dispatch_enabled || (var.workers.enabled && var.workers.image != null && var.workers.command_notification_enabled)
      error_message = "Direct dispatch requires the reviewed worker image and owner-only command enrollment."
    }
    precondition {
      condition     = !var.workers.command_notification_enabled || (var.workers.enabled && var.workers.web_push_public_key != null)
      error_message = "Owner enrollment requires the enrolled workers and the reviewed public key."
    }
    precondition {
      condition     = var.command_infrastructure_enabled && var.capability_policy_version != null && var.capability_policy_sha256 != null
      error_message = "Command runtime requires its separate identity and the reviewed numeric DEV capability policy pin and evidence hash."
    }
  }
  template {
    service_account                  = google_service_account.command_runtime[0].email
    timeout                          = "15s"
    max_instance_request_concurrency = 5
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = var.command_image
      command = ["node"]
      args    = ["services/production/business-server.mjs"]
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.business_env, {
          FOUNDATION_ROLE                = "command"
          DB_USER                        = google_sql_user.command_runtime_ssd[0].name
          RUNTIME_SERVICE_ACCOUNT        = google_service_account.command_runtime[0].email
          DEV_RECEIPTS                   = "enabled"
          RECEIPT_BUCKET                 = local.bucket
          RECEIPT_SQL_PREFIX             = "manual-receipts/dev/pwa/"
          RECEIPT_OBJECT_PREFIX          = "appsheet/data/MW_OLTP_DEV_20260919_578763613/manual_receipts/dev/pwa/"
          RECEIPT_COMPATIBILITY_EVIDENCE = "r052-4f:receipt-compatibility-4f.json:generated-png-appsheet-render"
          }, var.workers.command_notification_enabled ? {
          PWA_NOTIFICATIONS   = "enabled"
          WEB_PUSH_PUBLIC_KEY = var.workers.web_push_public_key
          } : {}, var.workers.command_dispatch_enabled ? {
          NOTIFICATION_DISPATCH_ENABLED  = "true"
          NOTIFICATION_DISPATCH_URL      = "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app/internal/dispatch"
          NOTIFICATION_DISPATCH_AUDIENCE = "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app"
          } : {}, var.agent_receipt_api.enabled ? {
          AGENT_RECEIPT_API_ENABLED           = "true"
          AGENT_RECEIPT_POLICY_SECRET_VERSION = "projects/${local.project}/secrets/mw-credit-app-dev-agent-receipt-policy/versions/${var.agent_receipt_api.policy_version == null ? "UNBOUND" : var.agent_receipt_api.policy_version}"
          } : {}, var.agent_conversation_api.enabled ? {
          AGENT_CONVERSATION_API_ENABLED           = "true"
          AGENT_CONVERSATION_POLICY_SECRET_VERSION = "projects/${local.project}/secrets/mw-credit-app-dev-agent-conversation-policy/versions/${var.agent_conversation_api.policy_version == null ? "UNBOUND" : var.agent_conversation_api.policy_version}"
        } : {})
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
      dynamic "env" {
        for_each = var.agent_receipt_api.enabled ? [var.agent_receipt_api.policy_version] : []
        content {
          name = "AGENT_RECEIPT_POLICY_JSON"
          value_source {
            secret_key_ref {
              secret  = "mw-credit-app-dev-agent-receipt-policy"
              version = env.value
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.agent_conversation_api.enabled ? [var.agent_conversation_api.policy_version] : []
        content {
          name = "AGENT_CONVERSATION_POLICY_JSON"
          value_source {
            secret_key_ref {
              secret  = "mw-credit-app-dev-agent-conversation-policy"
              version = env.value
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.native_receipt_catalog_secret_version == null ? [] : [var.native_receipt_catalog_secret_version]
        content {
          name = "RECEIPT_NATIVE_CATALOG_JSON"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.native_receipt_catalog[0].secret_id
              version = env.value
            }
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
  depends_on = [google_project_iam_member.command_sql, google_project_iam_member.command_auth_user, google_secret_manager_secret_iam_member.command_capability_policy, google_secret_manager_secret_iam_member.command_native_receipt_catalog, google_storage_bucket_iam_member.command_receipts, google_secret_manager_secret_iam_member.command_agent_receipt_policy, google_secret_manager_secret_iam_member.command_agent_conversation_policy]
}
# ALL-ARCH-01: DEV commands run the shared business runtime with the DEV capability policy.
# Browser business routes use Firebase auth plus policy membership; no shared/public bucket or
# organization policy changes. Review this service-specific invocation boundary.
output "command_api_url" { value = try(google_cloud_run_v2_service.command_api[0].uri, null) }

