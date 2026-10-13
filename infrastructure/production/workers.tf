# R053 worker enrollment is separate from worker execution and schedule ownership.
variable "workers" {
  type = object({
    enabled                          = optional(bool, false)
    image                            = optional(string)
    image_overrides                  = optional(map(string), {})
    notification_retry_max_doublings = optional(number, 0)
    vapid_version                    = optional(string)
    policy_version                   = optional(string)
    push_subject                     = optional(string)
    registered_creators              = optional(list(string), [])
    notification_enabled             = optional(bool, false)
    jobs_enabled                     = optional(bool, false)
    notification_schedule_enabled    = optional(bool, false)
    jobs_schedule_enabled            = optional(bool, false)
    command_notification_enabled     = optional(bool, false)
    command_dispatch_enabled         = optional(bool, false)
    web_push_public_key              = optional(string)
  })
  default = {}
}
module "workers" {
  source                           = "../modules/dev-workers"
  environment                      = "prod"
  enabled                          = var.workers.enabled
  image                            = var.workers.image
  image_overrides                  = var.workers.image_overrides
  notification_retry_max_doublings = var.workers.notification_retry_max_doublings
  vapid_version                    = var.workers.vapid_version
  policy_version                   = var.workers.policy_version
  push_subject                     = var.workers.push_subject
  registered_creators              = var.workers.registered_creators
  notification_enabled             = var.workers.notification_enabled
  command_dispatch_enabled         = var.workers.command_dispatch_enabled
  jobs_enabled                     = var.workers.jobs_enabled
  notification_schedule_enabled    = var.workers.notification_schedule_enabled
  jobs_schedule_enabled            = var.workers.jobs_schedule_enabled
  depends_on                       = [google_project_iam_custom_role.auth_user, google_secret_manager_secret.vapid]
}
output "worker_identities" { value = module.workers.identities }

# PROD command enrollment reuses its existing capability-policy membership.

# Private VAPID key material is initialized separately; never a TF version payload.
resource "google_secret_manager_secret" "vapid" {
  count     = var.workers.enabled ? 1 : 0
  project   = var.application_project_id
  secret_id = "mw-credit-app-prod-vapid"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "prod" }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.foundation_authorized && var.business_infrastructure_authorized
      error_message = "Production worker enrollment requires the existing authorized business identities."
    }
  }
}