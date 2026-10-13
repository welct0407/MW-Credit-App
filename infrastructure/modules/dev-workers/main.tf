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
resource "google_sql_user" "worker" {
  for_each        = local.roles
  project         = local.project
  instance        = "appsheet-pg-prod-20260914"
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
          APP_ENV                      = var.environment
          WORKER_ROLE                  = each.key
          WORKER_ACTIVATION            = (each.key == "notify" ? var.notification_enabled : var.jobs_enabled) ? "enabled" : "disabled"
          APPLICATION_PROJECT_ID       = local.project
          INSTANCE_CONNECTION_NAME     = "${local.project}:${local.region}:appsheet-pg-prod-20260914"
          DB_NAME                      = "loan_manager_${var.environment}"
          DB_USER                      = google_sql_user.worker[each.key].name
          RUNTIME_SERVICE_ACCOUNT      = google_service_account.worker[each.key].email
          WORKER_AUDIENCE              = local.audiences[each.key]
          SCHEDULER_SERVICE_ACCOUNT    = google_service_account.scheduler[0].email
          SQL_REGISTERED_CREATORS_JSON = jsonencode(var.registered_creators)
        }, each.key == "notify" ? { WEB_PUSH_SUBJECT = var.push_subject } : {})
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
    max_doublings        = each.value.role == "jobs" ? 2 : 0
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
output "identities" { value = { for role, sa in google_service_account.worker : role => { service_account = sa.email, sql_user = google_sql_user.worker[role].name, audience = local.audiences[role] } } }


