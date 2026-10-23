terraform {
  required_providers {
    google = { source = "hashicorp/google", version = "= 8.6.0" }
  }
}

# Environment-bound module. No existing browser service or shared instance
# is managed here. Secret payloads and SQL capability membership stay outside TF.
variable "environment" {
  type    = string
  default = "dev"
  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "Select the exact reviewed dev or prod environment."
  }
}
variable "enabled" {
  type    = bool
  default = false
}
variable "image" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.image == null ? true : can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/${var.environment == "prod" ? "mw-credit-app-prod" : "mw-credit-app"}/api@sha256:[a-f0-9]{64}$", var.image))
    error_message = "Pin the tested immutable image from the matching environment repository."
  }
}
variable "image_overrides" {
  description = "Optional per-worker immutable image pins; omitted roles retain image."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for role, image in var.image_overrides : contains(["notify", "jobs"], role) && can(regex("^asia-southeast1-docker[.]pkg[.]dev/clever-oasis-508610-n7/${var.environment == "prod" ? "mw-credit-app-prod" : "mw-credit-app"}/api@sha256:[a-f0-9]{64}$", image))])
    error_message = "Only notify/jobs immutable matching-environment image overrides are allowed."
  }
}
variable "notification_retry_max_doublings" {
  description = "Preserve the reviewed provider-normalized notification retry value."
  type        = number
  default     = 0
  validation {
    condition     = contains([0, 5], var.notification_retry_max_doublings)
    error_message = "Use the existing source or reviewed provider-normalized retry value."
  }
}
variable "vapid_version" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.vapid_version == null ? true : can(regex("^[1-9][0-9]*$", var.vapid_version))
    error_message = "VAPID must use a privately validated numeric version."
  }
}
variable "policy_version" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.policy_version == null ? true : can(regex("^[1-9][0-9]*$", var.policy_version))
    error_message = "Notification policy must use a reviewed numeric version."
  }
}
variable "push_subject" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.push_subject == null ? true : can(regex("^mailto:[^ @]+@[^ @]+$", var.push_subject))
    error_message = "Use the reviewed VAPID mailto subject."
  }
}
variable "registered_creators" {
  type    = list(string)
  default = []
}
variable "notification_enabled" {
  type    = bool
  default = false
}
variable "command_dispatch_enabled" {
  type    = bool
  default = false
}
variable "chat_dispatch_enabled" {
  description = "R090 batch 2: the chat service may wake the notify worker after a committed chat reply notification."
  type        = bool
  default     = false
}
variable "jobs_dispatch_enabled" {
  description = "R090 batch 2: the jobs worker may wake the notify worker after committing a notification event."
  type        = bool
  default     = false
}
variable "chat_caller" {
  description = "Chat runtime identity pinned as a notify caller (email and unique id); passed by the stack that owns it."
  type = object({
    email     = string
    unique_id = string
  })
  default  = null
  nullable = true
  validation {
    condition     = var.chat_caller == null ? true : can(regex("^mw-credit-app-chat-(dev|prod)@clever-oasis-508610-n7[.]iam[.]gserviceaccount[.]com$", var.chat_caller.email))
    error_message = "Only a chat runtime identity may be a notify caller (the notify worker also checks the numeric unique id)."
  }
}
variable "jobs_enabled" {
  type    = bool
  default = false
}
variable "notification_schedule_enabled" {
  type    = bool
  default = false
}
variable "jobs_schedule_enabled" {
  type    = bool
  default = false
}

locals {
  project       = "clever-oasis-508610-n7"
  region        = "asia-southeast1"
  sql_instance  = "mw-credit-pg-20261017"
  roles         = var.enabled ? toset(["notify", "jobs"]) : toset([])
  runtime_roles = var.enabled && var.image != null ? local.roles : toset([])
  names         = { for role in ["notify", "jobs"] : role => "mw-credit-app-${role}-${var.environment}" }
  audiences     = { for role, name in local.names : role => "https://${name}-737787224638.${local.region}.run.app" }
  schedules = var.enabled && var.image != null ? {
    notifications    = { role = "notify", path = "/internal/dispatch", cron = "* * * * *", enabled = var.notification_schedule_enabled }
    daily_charges    = { role = "jobs", path = "/internal/jobs/daily-charges", cron = "5 0 * * *", enabled = var.jobs_schedule_enabled }
    recent_analytics = { role = "jobs", path = "/internal/jobs/recent-analytics", cron = "0 * * * *", enabled = var.jobs_schedule_enabled }
  } : {}
}
# APP-AUTH-06: callers are pinned by email and by service-account unique id (OIDC sub).
# The command caller is read only when its direct dispatch is enabled; jobs accepts the scheduler only.
data "google_service_account" "command" {
  count      = var.enabled && var.image != null && var.command_dispatch_enabled ? 1 : 0
  project    = local.project
  account_id = "mw-credit-app-command-${var.environment}@${local.project}.iam.gserviceaccount.com"
}
locals {
  chat_dispatch = var.enabled && var.image != null && var.chat_dispatch_enabled && var.chat_caller != null
  jobs_dispatch = var.enabled && var.image != null && var.jobs_dispatch_enabled
  caller_subjects = var.enabled ? {
    for role in local.roles : role => merge(
      { (google_service_account.scheduler[0].email) = google_service_account.scheduler[0].unique_id },
      role == "notify" && length(data.google_service_account.command) == 1 ? { (data.google_service_account.command[0].email) = data.google_service_account.command[0].unique_id } : {},
      role == "notify" && local.chat_dispatch ? { (var.chat_caller.email) = var.chat_caller.unique_id } : {},
      role == "notify" && local.jobs_dispatch ? { (google_service_account.worker["jobs"].email) = google_service_account.worker["jobs"].unique_id } : {}
    )
  } : {}
}
resource "google_project_service" "scheduler" {
  # Shared API enablement remains owned by the existing DEV state.
  count              = var.enabled && var.environment == "dev" ? 1 : 0
  project            = local.project
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}
resource "google_service_account" "worker" {
  for_each     = local.roles
  project      = local.project
  account_id   = local.names[each.key]
  display_name = "MW Credit DEV ${each.key} private worker"
}
resource "google_service_account" "scheduler" {
  count        = var.enabled ? 1 : 0
  project      = local.project
  account_id   = "mw-credit-app-scheduler-${var.environment}"
  display_name = "MW Credit DEV worker scheduler caller"
}
resource "google_project_iam_member" "sql" {
  for_each = { for pair in setproduct(local.roles, ["roles/cloudsql.client", "roles/cloudsql.instanceUser"]) : "${pair[0]}:${pair[1]}" => { worker = pair[0], role = pair[1] } }
  project  = local.project
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.worker[each.value.worker].email}"
}
resource "google_sql_user" "worker_ssd" {
  for_each        = local.roles
  project         = local.project
  instance        = local.sql_instance
  name            = trimsuffix(google_service_account.worker[each.key].email, ".gserviceaccount.com")
  type            = "CLOUD_IAM_SERVICE_ACCOUNT"
  deletion_policy = "ABANDON"
}
resource "google_secret_manager_secret" "policy" {
  count     = var.enabled ? 1 : 0
  project   = local.project
  secret_id = "mw-credit-app-${var.environment}-notification-policy"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = var.environment }
  lifecycle { prevent_destroy = true }
}
resource "google_secret_manager_secret_iam_member" "notify" {
  for_each   = var.enabled ? toset(["mw-credit-app-${var.environment}-vapid", "mw-credit-app-${var.environment}-notification-policy"]) : toset([])
  project    = local.project
  secret_id  = each.key
  role       = "roles/secretmanager.secretAccessor"
  member     = "serviceAccount:${google_service_account.worker["notify"].email}"
  depends_on = [google_secret_manager_secret.policy]
}
resource "google_project_iam_member" "notify_auth" {
  count   = var.enabled ? 1 : 0
  project = local.project
  # Reuse the existing single-permission firebaseauth.users.get custom role.
  role   = "projects/${local.project}/roles/${var.environment == "prod" ? "mwCreditProductionAuthUser" : "mwCreditAppReadAuthUser"}"
  member = "serviceAccount:${google_service_account.worker["notify"].email}"
}
resource "google_cloud_run_v2_service" "worker" {
  for_each             = local.runtime_roles
  project              = local.project
  name                 = local.names[each.key]
  location             = local.region
  deletion_protection  = true
  ingress              = each.key == "notify" ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = false
  # Direct post-commit dispatch and recovery ticks need CPU only during requests.
  scaling {
    min_instance_count = 0
    max_instance_count = 1
  }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = length(var.registered_creators) > 0 && (each.key != "notify" || (var.vapid_version != null && var.policy_version != null && var.push_subject != null))
      error_message = "Runtime requires reviewed SQL creators and notify requires validated numeric secrets/subject."
    }
  }
  template {
    service_account                  = google_service_account.worker[each.key].email
    timeout                          = "120s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = lookup(var.image_overrides, each.key, var.image)
      command = ["node"]
      args    = ["services/workers/server.mjs"]
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
      dynamic "env" {
        for_each = merge({
          APP_ENV                                      = var.environment
          WORKER_ROLE                                  = each.key
          WORKER_ACTIVATION                            = (each.key == "notify" ? var.notification_enabled : var.jobs_enabled) ? "enabled" : "disabled"
          APPLICATION_PROJECT_ID                       = local.project
          INSTANCE_CONNECTION_NAME                     = "${local.project}:${local.region}:${local.sql_instance}"
          DB_NAME                                      = "loan_manager_${var.environment}"
          DB_USER                                      = google_sql_user.worker_ssd[each.key].name
          RUNTIME_SERVICE_ACCOUNT                      = google_service_account.worker[each.key].email
          WORKER_AUDIENCE                              = local.audiences[each.key]
          SCHEDULER_SERVICE_ACCOUNT                    = google_service_account.scheduler[0].email
          SQL_REGISTERED_CREATORS_JSON                 = jsonencode(var.registered_creators)
          WORKER_CALLER_SUBJECTS_JSON                  = jsonencode(local.caller_subjects[each.key])
          }, each.key == "notify" ? { WEB_PUSH_SUBJECT = var.push_subject } : {}, each.key == "jobs" && local.jobs_dispatch ? {
          NOTIFICATION_DISPATCH_ENABLED                = "true"
          NOTIFICATION_DISPATCH_URL                    = "${local.audiences["notify"]}/internal/dispatch"
          NOTIFICATION_DISPATCH_AUDIENCE               = local.audiences["notify"]
        } : {})
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = each.key == "notify" ? {
          WEB_PUSH_VAPID_JSON      = { secret = "mw-credit-app-${var.environment}-vapid", version = var.vapid_version }
          NOTIFICATION_POLICY_JSON = { secret = "mw-credit-app-${var.environment}-notification-policy", version = var.policy_version }
        } : {}
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
        initial_delay_seconds = 1
        period_seconds        = 3
        failure_threshold     = 20
      }
    }
  }
  depends_on = [google_project_iam_member.sql, google_secret_manager_secret_iam_member.notify, google_project_iam_member.notify_auth]
}
resource "google_cloud_run_v2_service_iam_member" "scheduler" {
  for_each = local.runtime_roles
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.worker[each.key].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler[0].email}"
}
resource "google_cloud_run_v2_service_iam_member" "command_dispatch" {
  count    = var.enabled && var.image != null && var.command_dispatch_enabled ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.worker["notify"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:mw-credit-app-command-${var.environment}@${local.project}.iam.gserviceaccount.com"
}
# R090 batch 2: the chat runtime wakes notify after committing a chat reply notification (default off).
resource "google_cloud_run_v2_service_iam_member" "chat_dispatch" {
  count    = var.enabled && var.image != null && var.chat_dispatch_enabled ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.worker["notify"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:mw-credit-app-chat-${var.environment}@${local.project}.iam.gserviceaccount.com"
  lifecycle {
    precondition {
      condition     = var.notification_enabled && var.chat_caller != null && try(var.chat_caller.email, "") == "mw-credit-app-chat-${var.environment}@${local.project}.iam.gserviceaccount.com"
      error_message = "Chat dispatch requires the enabled notify worker and this environment's chat identity as the pinned caller."
    }
  }
}
# R090 batch 2: the jobs worker wakes notify after committing a notification event (default off).
resource "google_cloud_run_v2_service_iam_member" "jobs_dispatch" {
  count    = var.enabled && var.image != null && var.jobs_dispatch_enabled ? 1 : 0
  project  = local.project
  location = local.region
  name     = google_cloud_run_v2_service.worker["notify"].name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.worker["jobs"].email}"
  lifecycle {
    precondition {
      condition     = var.notification_enabled && var.jobs_enabled
      error_message = "Jobs dispatch requires the enabled notify and jobs workers."
    }
  }
}
resource "google_cloud_scheduler_job" "tick" {
  for_each         = local.schedules
  project          = local.project
  region           = local.region
  name             = "mw-credit-app-${var.environment}-${replace(each.key, "_", "-")}"
  schedule         = each.value.cron
  time_zone        = "Asia/Bangkok"
  paused           = !each.value.enabled
  attempt_deadline = "150s"
  retry_config {
    retry_count          = each.value.role == "jobs" ? 5 : 0
    max_retry_duration   = each.value.role == "jobs" ? "600s" : "0s"
    min_backoff_duration = each.value.role == "jobs" ? "30s" : "60s"
    max_backoff_duration = each.value.role == "jobs" ? "120s" : "60s"
    max_doublings        = each.value.role == "jobs" ? 2 : var.notification_retry_max_doublings
  }
  http_target {
    http_method = "POST"
    uri         = "${local.audiences[each.value.role]}${each.value.path}"
    oidc_token {
      service_account_email = google_service_account.scheduler[0].email
      audience              = local.audiences[each.value.role]
    }
  }
  lifecycle {
    precondition {
      condition     = !each.value.enabled || (each.value.role == "notify" ? var.notification_enabled : var.jobs_enabled)
      error_message = "Resume a schedule only after its worker and DEV ownership handoff are authorized."
    }
  }
  depends_on = [google_project_service.scheduler, google_cloud_run_v2_service_iam_member.scheduler]
}
output "identities" { value = { for role, sa in google_service_account.worker : role => { service_account = sa.email, sql_user = google_sql_user.worker_ssd[role].name, audience = local.audiences[role] } } }


output "notify_callers" { value = try(sort(keys(local.caller_subjects["notify"])), []) }
