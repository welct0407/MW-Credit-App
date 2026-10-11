# R053 worker enrollment is separate from worker execution and schedule ownership.
variable "workers" {
  type = object({
    enabled                       = optional(bool, false)
    image                         = optional(string)
    vapid_version                 = optional(string)
    policy_version                = optional(string)
    push_subject                  = optional(string)
    registered_creators           = optional(list(string), [])
    notification_enabled          = optional(bool, false)
    jobs_enabled                  = optional(bool, false)
    notification_schedule_enabled = optional(bool, false)
    jobs_schedule_enabled         = optional(bool, false)
    command_notification_enabled  = optional(bool, false)
    web_push_public_key           = optional(string)
  })
  default = {}
}
module "workers" {
  source                        = "../modules/dev-workers"
  enabled                       = var.workers.enabled
  image                         = var.workers.image
  vapid_version                 = var.workers.vapid_version
  policy_version                = var.workers.policy_version
  push_subject                  = var.workers.push_subject
  registered_creators           = var.workers.registered_creators
  notification_enabled          = var.workers.notification_enabled
  jobs_enabled                  = var.workers.jobs_enabled
  notification_schedule_enabled = var.workers.notification_schedule_enabled
  jobs_schedule_enabled         = var.workers.jobs_schedule_enabled
  depends_on                    = [google_project_service.required, google_project_iam_custom_role.read_auth_user, google_secret_manager_secret.vapid]
}
output "worker_identities" { value = module.workers.identities }

# Command enrollment reads the owner policy, never the VAPID private key.
resource "google_secret_manager_secret_iam_member" "command_notification_policy" {
  count     = var.workers.command_notification_enabled ? 1 : 0
  project   = local.project
  secret_id = "mw-credit-app-dev-notification-policy"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
  lifecycle {
    precondition {
      condition     = var.workers.enabled && var.command_infrastructure_enabled && var.workers.policy_version != null && var.workers.web_push_public_key != null
      error_message = "Owner enrollment requires reviewed policy version/public key and separate command identity."
    }
  }
  depends_on = [module.workers]
}
