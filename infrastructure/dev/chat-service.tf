# R090 in-app chatbot: fifth DEV service from the existing API image (services/chat/server.mjs).
# No resource is created until a tested immutable image is pinned. Own identity with the
# Vertex AI role; no VPC egress, no receipt, notification or agent settings, no new secret.
# SQL role membership (mw_chat_api_dev, mw_chat_read_dev) is granted by the operator outside
# Terraform, as for the other runtime identities.
# R102: chat_relay.enabled adds Direct VPC egress (private ranges only) to the VM chat relay
# (http://10.148.0.2:8791, firewall and Anthropic key secrets in ../ecosystem-debian), the
# CHAT_RELAY_URL env and the claude-* models in CHAT_MODELS_JSON. Enable it only together with
# a chat image that understands claude-* models (an older image rejects them at start).
variable "chat_image" {
  description = "Tested immutable image digest for the DEV chat service (same API image as the other services)."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.chat_image == null ? true : can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:[a-f0-9]{64}$", var.chat_image))
    error_message = "Pin an immutable digest in the existing DEV artifact repository."
  }
}

variable "chat_relay" {
  description = "R102 DEV chat relay wiring: enabled adds Direct VPC egress, CHAT_RELAY_URL and the claude-* models (otherwise filtered out of CHAT_MODELS_JSON)."
  type = object({
    enabled = optional(bool, false)
  })
  default = {}
}

variable "chat_models" {
  description = "CHAT_MODELS_JSON for the chat service (R090 design section 3.2): server-side model allowlist and engine bounds. Not a secret."
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
  chat_enabled = var.chat_image != null
  # R102: claude-* models are served only through the VM relay; without it they are not listed.
  chat_models_list = [for m in var.chat_models.models : m if var.chat_relay.enabled || !startswith(m.id, "claude-")]
  # Unavailable models carry their reason; available ones carry none (no null keys in the JSON).
  chat_models_json = jsonencode(merge(var.chat_models, {
    models = [for m in local.chat_models_list : merge({ id = m.id, label = m.label, available = m.available }, m.reason == null ? {} : { reason = m.reason })]
  }))
  # VM (vm-mw-credit-agent) pinned network_ip; the ID-token audience is exactly this URL.
  chat_relay_url = "http://10.148.0.2:8791/v1/chat/messages"
}

resource "google_service_account" "chat_runtime" {
  count        = local.chat_enabled ? 1 : 0
  account_id   = "mw-credit-app-chat-dev"
  display_name = "MW Credit DEV in-app chat"
}

resource "google_project_iam_member" "chat_runtime" {
  for_each = local.chat_enabled ? toset(["roles/cloudsql.client", "roles/cloudsql.instanceUser", "roles/aiplatform.user"]) : toset([])
  project  = local.project
  role     = each.value
  member   = "serviceAccount:${google_service_account.chat_runtime[0].email}"
}

resource "google_project_iam_member" "chat_auth_user" {
  count   = local.chat_enabled ? 1 : 0
  project = local.project
  role    = google_project_iam_custom_role.read_auth_user.name
  member  = "serviceAccount:${google_service_account.chat_runtime[0].email}"
}

resource "google_sql_user" "chat_runtime" {
  count           = local.chat_enabled ? 1 : 0
  instance        = local.instance
  name            = trimsuffix(google_service_account.chat_runtime[0].email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}

resource "google_secret_manager_secret_iam_member" "chat_capability_policy" {
  count     = local.chat_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.capability_policy.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.chat_runtime[0].email}"
}

resource "google_cloud_run_v2_service" "chat_api" {
  count                = local.chat_enabled ? 1 : 0
  name                 = "mw-credit-app-chat-dev"
  location             = local.region
  deletion_protection  = true
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  lifecycle {
    precondition {
      condition     = var.capability_policy_version != null && var.capability_policy_sha256 != null
      error_message = "Chat requires the reviewed numeric DEV capability policy pin and evidence hash."
    }
    precondition {
      condition     = !var.workers.chat_dispatch_enabled || (var.workers.enabled && var.workers.image != null && var.workers.notification_enabled)
      error_message = "Chat dispatch wake requires the enabled DEV notify worker."
    }
    precondition {
      condition     = contains([for m in local.chat_models_list : m.id if m.available], var.chat_models.default)
      error_message = "The chat default must be an available listed model; a claude-* default needs chat_relay.enabled."
    }
  }
  template {
    service_account = google_service_account.chat_runtime[0].email
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
    # One request per turn: turn deadline 240 s < Cloud Run 300 s.
    timeout                          = "300s"
    max_instance_request_concurrency = 10
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image   = var.chat_image
      command = ["node"]
      args    = ["services/chat/server.mjs"]
      resources {
        limits = { cpu = "1", memory = "512Mi" }
        # Instance-based CPU: a turn keeps running and is journaled after the client drops the stream.
        cpu_idle          = false
        startup_cpu_boost = true
      }
      dynamic "env" {
        for_each = merge(local.business_env, {
          FOUNDATION_ROLE         = "chat"
          DB_USER                 = google_sql_user.chat_runtime[0].name
          RUNTIME_SERVICE_ACCOUNT = google_service_account.chat_runtime[0].email
          CHAT_MODELS_JSON        = local.chat_models_json
          }, var.chat_relay.enabled ? {
          CHAT_RELAY_URL = local.chat_relay_url
          } : {}, var.workers.chat_dispatch_enabled ? {
          NOTIFICATION_DISPATCH_ENABLED  = "true"
          NOTIFICATION_DISPATCH_URL      = "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app/internal/dispatch"
          NOTIFICATION_DISPATCH_AUDIENCE = "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app"
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
  depends_on = [google_project_iam_member.chat_runtime, google_project_iam_member.chat_auth_user, google_secret_manager_secret_iam_member.chat_capability_policy]
}

output "chat_api_url" { value = try(google_cloud_run_v2_service.chat_api[0].uri, null) }
output "chat_runtime_identity" { value = try(google_service_account.chat_runtime[0].email, null) }
