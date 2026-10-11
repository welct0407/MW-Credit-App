# Private policy payload/version creation is a separate reviewed operation.
# Terraform owns only the optional container, command accessor and numeric pin.
variable "agent_receipt_api" {
  type = object({
    policy_infrastructure_enabled = optional(bool, false)
    enabled                       = optional(bool, false)
    policy_version                = optional(string)
  })
  default = {}
  validation {
    condition     = var.agent_receipt_api.policy_version == null ? true : can(regex("^[1-9][0-9]*$", var.agent_receipt_api.policy_version))
    error_message = "Agent receipt policy must use a reviewed numeric version, never latest."
  }
}

resource "google_secret_manager_secret" "agent_receipt_policy" {
  count     = var.agent_receipt_api.policy_infrastructure_enabled ? 1 : 0
  project   = local.project
  secret_id = "mw-credit-app-dev-agent-receipt-policy"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.command_infrastructure_enabled
      error_message = "Policy preparation requires the separate DEV command identity."
    }
  }
}
resource "google_secret_manager_secret_iam_member" "command_agent_receipt_policy" {
  count     = var.agent_receipt_api.policy_infrastructure_enabled ? 1 : 0
  project   = local.project
  secret_id = google_secret_manager_secret.agent_receipt_policy[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
}
