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
variable "runtime_image_overrides" {
  description = "Optional exact image pins for independent read/command/chat recovery and delivery."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for role, image in var.runtime_image_overrides : contains(["read", "command", "chat"], role) && can(regex("^${var.region}-docker[.]pkg[.]dev/${var.application_project_id}/mw-credit-app-prod/api@sha256:[a-f0-9]{64}$", image))])
    error_message = "Only read/command/chat immutable production image overrides are allowed."
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
      condition     = !var.workers.command_notification_enabled || (var.business_runtime_authorized && var.workers.enabled && var.workers.policy_version != null && var.workers.web_push_public_key != null)
      error_message = "Production enrollment requires business runtime and reviewed notification policy/public key."
    }
    precondition {
      condition     = !var.workers.command_dispatch_enabled || (var.workers.command_notification_enabled && var.workers.image != null)
      error_message = "Direct dispatch requires the bound worker and enrollment."
    }
    precondition {
      condition     = !var.agent_receipt_api.enabled || (var.business_runtime_authorized && var.agent_receipt_api.policy_infrastructure_enabled && var.agent_receipt_api.policy_version != null)
      error_message = "Machine receipt API requires business runtime and a reviewed numeric PROD policy version."
    }
    precondition {
      condition     = !var.receipt_recognizer.enabled || var.business_runtime_authorized
      error_message = "Receipt recognition requires the business runtime command service."
    }
    precondition {
      condition     = var.foundation_authorized && var.foundation_image != null && var.owner_secret_version != null
      error_message = "Runtime requires the reviewed foundation, tested immutable image and actual enrolled owner version."
    }
    precondition {
      condition     = !var.business_runtime_authorized || (var.business_infrastructure_authorized && var.business_image != null && var.capability_policy_version != null && var.capability_policy_sha256 != null && length(var.business_registered_creators) > 0)
      error_message = "Business runtime requires separately authorized SQL prerequisites, tested image, reviewed numeric policy pin/hash and registered creators."
    }
    precondition {
      condition     = !(var.business_runtime_authorized && var.business_receipts_authorized) || (var.native_catalog_version != null && var.receipt_source_evidence_sha256 != null && var.receipt_compatibility_evidence_sha256 != null)
      error_message = "Receipts require actual numeric catalog version and reviewed source/render-binding evidence."
    }
  }
  template {
    service_account = google_service_account.application[each.key].email
    # R077: the command service waits for receipt recognition (recognizer 42 s <
    # route 45 s < command 55 s < PWA 60 s); the reader keeps 15 s.
    timeout                          = each.key == "command" ? "55s" : "15s"
    max_instance_request_concurrency = 5
    scaling {
      min_instance_count = 0
      # R064: the command service also serves offline dataset walks; a second
      # instance keeps a long walk from blocking writes. The reader stays at one.
      max_instance_count = each.key == "command" ? 2 : 1
    }
    # R075: command only; private-range egress to the VM receipt recognizer.
    dynamic "vpc_access" {
      for_each = each.key == "command" && var.receipt_recognizer.enabled ? [local.receipt_recognizer_egress] : []
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = vpc_access.value.network
          subnetwork = vpc_access.value.subnetwork
        }
      }
    }
    containers {
      image   = lookup(var.runtime_image_overrides, each.key, var.business_runtime_authorized ? var.business_image : var.foundation_image)
      command = ["node"]
      args    = [var.business_runtime_authorized ? "services/production/business-server.mjs" : "services/production/server.mjs"]
      resources {
        limits = { cpu = "1", memory = "512Mi" }
        # R107: request-based CPU (billed only while serving); the post-commit wake no longer relies on CPU after the response.
        cpu_idle          = true
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge({
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
          INSTANCE_CONNECTION_NAME      = "clever-oasis-508610-n7:asia-southeast1:mw-credit-pg-20261017"
          HOSTING_SITE_ID               = var.hosting_site_id
          ALLOWED_WEB_ORIGINS           = jsonencode(["https://lm.mw-credit.com", "https://${var.hosting_site_id}.web.app"])
          OWNER_IDENTITY_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-owner-identity/versions/${var.owner_secret_version == null ? "UNBOUND" : var.owner_secret_version}"
          }, var.business_runtime_authorized ? {
          BUSINESS_ACTIVATION                   = "approved-candidate"
          BUSINESS_MODE                         = "business-candidate"
          DB_USER                               = trimsuffix(google_service_account.application[each.key].email, ".gserviceaccount.com")
          PROD_CAPABILITY_POLICY_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-capability-policy/versions/${var.capability_policy_version == null ? "UNBOUND" : var.capability_policy_version}"
          PROD_CAPABILITY_POLICY_SHA256         = var.capability_policy_sha256
          PROD_SQL_APPLICATION_ROLE             = "mw_app_prod"
          PROD_SQL_JOURNAL_OWNER_ROLE           = "mw_app_prod_journal_owner"
          PROD_SQL_REGISTERED_CREATORS          = jsonencode(var.business_registered_creators)
          PWA_NOTIFICATIONS                     = each.key == "command" && var.workers.command_notification_enabled ? "enabled" : "disabled"
          PROD_RECEIPTS                         = var.business_receipts_authorized && each.key == "command" ? "enabled" : "disabled"
          } : {}, var.business_runtime_authorized && var.business_receipts_authorized && each.key == "command" ? {
          PROD_RECEIPT_CATALOG_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-native-receipt-catalog/versions/${var.native_catalog_version == null ? "UNBOUND" : var.native_catalog_version}"
          PROD_RECEIPT_SOURCE_EVIDENCE_SHA256 = var.receipt_source_evidence_sha256
          PROD_RECEIPT_COMPATIBILITY_JSON = jsonencode({
            status            = "verified-dev-render-and-prod-binding"
            evidenceReference = var.receipt_compatibility_evidence_sha256
            bucket            = local.receipt_bucket
            sqlPrefix         = "manual-receipts/prod/pwa/"
            objectPrefix      = "${local.native_receipt_root}pwa/"
          })
          } : {}, each.key == "command" && var.workers.command_notification_enabled ? {
          WEB_PUSH_PUBLIC_KEY = var.workers.web_push_public_key
          } : {}, each.key == "command" && var.workers.command_dispatch_enabled ? {
          NOTIFICATION_DISPATCH_ENABLED  = "true"
          NOTIFICATION_DISPATCH_URL      = "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app/internal/dispatch"
          NOTIFICATION_DISPATCH_AUDIENCE = "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app"
          } : {}, each.key == "command" && var.agent_receipt_api.enabled ? {
          AGENT_RECEIPT_API_ENABLED           = "true"
          AGENT_RECEIPT_POLICY_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-agent-receipt-policy/versions/${var.agent_receipt_api.policy_version == null ? "UNBOUND" : var.agent_receipt_api.policy_version}"
          } : {}, each.key == "command" && var.receipt_recognizer.enabled ? {
          PROD_RECEIPT_RECOGNITION     = var.receipt_recognizer.activation
          PROD_RECEIPT_RECOGNITION_URL = local.receipt_recognizer_url
        } : {})
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
      dynamic "env" {
        for_each = var.business_runtime_authorized ? merge({
          PROD_CAPABILITY_POLICY_JSON = { secret = "mw-credit-app-prod-capability-policy", version = var.capability_policy_version }
          }, var.business_receipts_authorized && each.key == "command" ? {
          PROD_RECEIPT_NATIVE_CATALOG_JSON = { secret = "mw-credit-app-prod-native-receipt-catalog", version = var.native_catalog_version }
          } : {}, each.key == "command" && var.agent_receipt_api.enabled ? {
          AGENT_RECEIPT_POLICY_JSON = { secret = "mw-credit-app-prod-agent-receipt-policy", version = var.agent_receipt_api.policy_version }
        } : {}) : {}
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
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
  depends_on = [google_project_iam_member.runtime_auth, google_secret_manager_secret_iam_member.runtime_owner, google_project_iam_member.business_sql, google_sql_user.business_runtime_ssd, google_secret_manager_secret_iam_member.business_policy, google_secret_manager_secret_iam_member.business_catalog, google_storage_bucket_iam_member.business_receipt, google_secret_manager_secret_iam_member.command_agent_receipt_policy]
}
