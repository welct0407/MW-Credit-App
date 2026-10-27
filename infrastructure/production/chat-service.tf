# R090 in-app chatbot (prepared, default off). chat_authorized adds the fifth PROD service from
# the PROD API image (services/chat/server.mjs) with its own identity: Cloud SQL client/instance
# user, Vertex AI user, the auth-status custom role and the PROD capability policy secret only.
# No VPC egress, receipt, notification, agent or owner-identity settings and no new secret. SQL
# role membership (mw_chat_api_prod, mw_chat_read_prod) is granted by the operator outside
# Terraform. Enabling the gate needs the owner's promotion instruction.
# R102 (prepared, default off): chat_relay.enabled adds Direct VPC egress (private ranges only)
# to the VM chat relay (http://10.148.0.2:8791; firewall and the PROD Anthropic key secret in
# ../ecosystem-debian), CHAT_RELAY_URL and the claude-* models in CHAT_MODELS_JSON. Enable it
# at promotion only, with a chat image that understands claude-* models.
variable "chat_authorized" {
  description = "Owner-gated PROD chat service (R090). Requires the business runtime gates."
  type        = bool
  default     = false
}

variable "chat_relay" {
  description = "R102 PROD chat relay wiring (promotion-gated): enabled adds Direct VPC egress, CHAT_RELAY_URL and the claude-* models (otherwise filtered out of CHAT_MODELS_JSON)."
  type = object({
    enabled = optional(bool, false)
  })
  default = {}
}

variable "chat_models" {
  description = "CHAT_MODELS_JSON for the PROD chat service (R090 design section 3.2). Not a secret."
  type = object({
    version               = number
    location              = string
    default               = string
    thinkingLevel         = string
    maxRounds             = number
    requestTimeoutSeconds = number
    turnTimeoutSeconds    = number
    historyTokenLimit     = number
    seedChars             = number
    maxOutputTokens       = number
    models = list(object({
      id        = string
      label     = string
      available = bool
      reason    = optional(string)
    }))
  })
  default = {
    version               = 1
    location              = "global"
    default               = "gemini-4-argon"
    thinkingLevel         = "MEDIUM"
    maxRounds             = 16
    requestTimeoutSeconds = 120
    turnTimeoutSeconds    = 240
    historyTokenLimit     = 150000
    seedChars             = 40000
    maxOutputTokens       = 16384
    models = [
      # R102: listed only while chat_relay.enabled (filtered in local.chat_models_list).
      { id = "claude-opus-5-5", label = "Claude Opus 5.5", available = true },
      { id = "gemini-4-argon", label = "Gemini 4 Argon", available = true },
      { id = "gemini-3.8-flash", label = "Gemini 3.8 Flash", available = true },
      { id = "gemini-3.5-flash", label = "Gemini 3.5 Flash", available = true },
    ]
  }
  validation {
    condition = (var.chat_models.version == 1 && var.chat_models.location == "global"
      && length(var.chat_models.models) >= 1 && length(var.chat_models.models) <= 8
      && length(distinct([for m in var.chat_models.models : m.id])) == length(var.chat_models.models)
      && alltrue([for m in var.chat_models.models : can(regex("^(gemini-[0-9]+([.][0-9]+)?-[a-z0-9-]+|claude-[a-z]+-[0-9]+(-[0-9]+)?)$", m.id)) && length(m.label) >= 1 && length(m.label) <= 60 && (m.available ? m.reason == null : m.reason != null)])
      && contains([for m in var.chat_models.models : m.id if m.available], var.chat_models.default)
      && contains(["LOW", "MEDIUM", "HIGH", "MAX"], var.chat_models.thinkingLevel)
      && var.chat_models.maxRounds >= 4 && var.chat_models.maxRounds <= 40
      && var.chat_models.requestTimeoutSeconds >= 30 && var.chat_models.requestTimeoutSeconds <= 240
      && var.chat_models.turnTimeoutSeconds >= 60 && var.chat_models.turnTimeoutSeconds <= 240 && var.chat_models.turnTimeoutSeconds >= var.chat_models.requestTimeoutSeconds
      && var.chat_models.historyTokenLimit >= 50000 && var.chat_models.historyTokenLimit <= 400000
      && var.chat_models.seedChars >= 0 && var.chat_models.seedChars <= 200000
    && var.chat_models.maxOutputTokens >= 1024 && var.chat_models.maxOutputTokens <= 65536)
    error_message = "chat_models must follow the R090 section 3.2 rules: version 1, location global, 1-8 unique gemini-* or claude-* ids, available default, LOW|MEDIUM|HIGH|MAX, bounded rounds/timeouts/history/seed, reason only on unavailable models."
  }
}

locals {
  # R102: claude-* models are served only through the VM relay; without it they are not listed.
  chat_models_list = [for m in var.chat_models.models : m if var.chat_relay.enabled || !startswith(m.id, "claude-")]
  chat_models_json = jsonencode(merge(var.chat_models, {
    models = [for m in local.chat_models_list : merge({ id = m.id, label = m.label, available = m.available }, m.reason == null ? {} : { reason = m.reason })]
  }))
  # VM (vm-mw-credit-agent) pinned network_ip; the ID-token audience is exactly this URL.
  chat_relay_url = "http://10.148.0.2:8791/v1/chat/messages"
}

resource "google_service_account" "chat" {
  count        = var.chat_authorized ? 1 : 0
  project      = var.application_project_id
  account_id   = "mw-credit-app-chat-prod"
  display_name = "MW Credit PROD in-app chat"
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.foundation_authorized && var.runtime_authorized && var.business_infrastructure_authorized && var.business_runtime_authorized
      error_message = "PROD chat requires the authorized foundation and business runtime."
    }
  }
}

resource "google_project_iam_member" "chat" {
  for_each = var.chat_authorized ? toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser", "roles/aiplatform.user"]) : toset([])
  project  = var.application_project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.chat[0].email}"
}

resource "google_project_iam_member" "chat_auth" {
  count   = var.chat_authorized ? 1 : 0
  project = var.application_project_id
  role    = google_project_iam_custom_role.auth_user[0].name
  member  = "serviceAccount:${google_service_account.chat[0].email}"
}

resource "google_sql_user" "chat" {
  count           = var.chat_authorized ? 1 : 0
  project         = var.application_project_id
  instance        = "mw-credit-pg-20261017"
  name            = trimsuffix(google_service_account.chat[0].email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "chat_policy" {
  count     = var.chat_authorized ? 1 : 0
  project   = var.application_project_id
  secret_id = google_secret_manager_secret.business["capability-policy"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.chat[0].email}"
}

resource "google_cloud_run_v2_service" "chat" {
  count                = var.chat_authorized ? 1 : 0
  project              = var.application_project_id
  name                 = "mw-credit-app-chat-prod"
  location             = var.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.business_image != null && var.capability_policy_version != null && var.capability_policy_sha256 != null && length(var.business_registered_creators) > 0
      error_message = "PROD chat requires the tested business image, the reviewed numeric capability policy pin/hash and registered creators."
    }
    precondition {
      condition     = !var.workers.chat_dispatch_enabled || (var.workers.enabled && var.workers.image != null && var.workers.notification_enabled)
      error_message = "PROD chat dispatch wake requires the enabled PROD notify worker."
    }
    precondition {
      condition     = contains([for m in local.chat_models_list : m.id if m.available], var.chat_models.default)
      error_message = "The chat default must be an available listed model; a claude-* default needs chat_relay.enabled."
    }
  }
  template {
    service_account = google_service_account.chat[0].email
    # One request per turn: turn deadline 240 s < Cloud Run 300 s.
    # R102: private-range egress to the VM chat relay only; Vertex AI and Cloud SQL stay on Google paths.
    dynamic "vpc_access" {
      for_each = var.chat_relay.enabled ? [1] : []
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = "default"
          subnetwork = "default"
        }
      }
    }
    timeout                          = "300s"
    max_instance_request_concurrency = 10
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = lookup(var.runtime_image_overrides, "chat", var.business_image)
      command = ["node"]
      args    = ["services/chat/server.mjs"]
      resources {
        limits = { cpu = "1", memory = "512Mi" }
        # Instance-based CPU: a turn keeps running and is journaled after the client drops the stream.
        cpu_idle          = false
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge({
          APP_ENV                               = "prod"
          BUSINESS_ACTIVATION                   = "approved-candidate"
          BUSINESS_MODE                         = "business-candidate"
          FOUNDATION_ROLE                       = "chat"
          APPLICATION_PROJECT_ID                = var.application_project_id
          APPLICATION_PROJECT_NUMBER            = var.application_project_number
          DATA_PROJECT_ID                       = "clever-oasis-508610-n7"
          AUTH_MODE                             = "firebase"
          FIREBASE_PROJECT_ID                   = var.application_project_id
          DB_NAME                               = "loan_manager_prod"
          INSTANCE_CONNECTION_NAME              = "clever-oasis-508610-n7:asia-southeast1:mw-credit-pg-20261017"
          HOSTING_SITE_ID                       = var.hosting_site_id
          ALLOWED_WEB_ORIGINS                   = jsonencode(["https://lm.mw-credit.com", "https://${var.hosting_site_id}.web.app"])
          DB_USER                               = google_sql_user.chat[0].name
          RUNTIME_SERVICE_ACCOUNT               = google_service_account.chat[0].email
          PROD_CAPABILITY_POLICY_SECRET_VERSION = "projects/${var.application_project_id}/secrets/mw-credit-app-prod-capability-policy/versions/${var.capability_policy_version == null ? "UNBOUND" : var.capability_policy_version}"
          PROD_CAPABILITY_POLICY_SHA256         = var.capability_policy_sha256 == null ? "UNBOUND" : var.capability_policy_sha256
          PROD_SQL_APPLICATION_ROLE             = "mw_app_prod"
          PROD_SQL_JOURNAL_OWNER_ROLE           = "mw_app_prod_journal_owner"
          PROD_SQL_REGISTERED_CREATORS          = jsonencode(var.business_registered_creators)
          CHAT_MODELS_JSON                      = local.chat_models_json
          }, var.chat_relay.enabled ? {
          CHAT_RELAY_URL = local.chat_relay_url
          } : {}, var.workers.chat_dispatch_enabled ? {
          NOTIFICATION_DISPATCH_ENABLED  = "true"
          NOTIFICATION_DISPATCH_URL      = "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app/internal/dispatch"
          NOTIFICATION_DISPATCH_AUDIENCE = "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app"
        } : {})
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name = "PROD_CAPABILITY_POLICY_JSON"
        value_source {
          secret_key_ref {
            secret  = "mw-credit-app-prod-capability-policy"
            version = var.capability_policy_version
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
  depends_on = [google_project_iam_member.chat, google_project_iam_member.chat_auth, google_secret_manager_secret_iam_member.chat_policy]
}

output "chat_api_url" { value = try(google_cloud_run_v2_service.chat[0].uri, null) }
output "chat_runtime_identity" { value = try(google_service_account.chat[0].email, null) }
