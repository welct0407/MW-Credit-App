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
    command_dispatch_enabled      = optional(bool, false)
    web_push_public_key           = optional(string)
  })
  default = {}
}
module "workers" {
  source                           = "../modules/workers"
  enabled                          = var.workers.enabled
  image                            = var.workers.image
  vapid_version                    = var.workers.vapid_version
  policy_version                   = var.workers.policy_version
  push_subject                     = var.workers.push_subject
  registered_creators              = var.workers.registered_creators
  notification_retry_max_doublings = 5
  notification_enabled             = var.workers.notification_enabled
  command_dispatch_enabled         = var.workers.command_dispatch_enabled
  jobs_enabled                     = var.workers.jobs_enabled
  notification_schedule_enabled    = var.workers.notification_schedule_enabled
  jobs_schedule_enabled            = var.workers.jobs_schedule_enabled
  depends_on                       = [google_project_service.required, google_project_iam_custom_role.read_auth_user, google_secret_manager_secret.vapid]
}
output "worker_identities" { value = module.workers.identities }
# ALL-ARCH-01: the business runtime resolves notification actors from the DEV capability
# policy, so the command identity no longer reads the worker notification policy.
