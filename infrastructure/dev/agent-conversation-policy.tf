# Private policy payload/version creation is a separate reviewed operation.
# Terraform owns only the optional container, command accessor and numeric pin.
variable "agent_conversation_api" {
  type = object({
    policy_infrastructure_enabled = optional(bool, false)
    enabled                       = optional(bool, false)
    policy_version                = optional(string)
  })
  default = {}
  validation {
    condition     = var.agent_conversation_api.policy_version == null ? true : can(regex("^[1-9][0-9]*$", var.agent_conversation_api.policy_version))
    error_message = "Agent conversation policy must use a reviewed numeric version, never latest."
  }
}

resource "google_secret_manager_secret" "agent_conversation_policy" {
  count     = var.agent_conversation_api.policy_infrastructure_enabled ? 1 : 0
  project   = local.project
  secret_id = "mw-credit-app-dev-agent-conversation-policy"
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
resource "google_secret_manager_secret_iam_member" "command_agent_conversation_policy" {
  count     = var.agent_conversation_api.policy_infrastructure_enabled ? 1 : 0
  project   = local.project
  secret_id = google_secret_manager_secret.agent_conversation_policy[0].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.command_runtime[0].email}"
}

# Isolated optional operator rehearsal identity; no runtime/data roles.
variable "conversation_test_caller_enabled" {
  type    = bool
  default = false
}
resource "google_service_account" "conversation_test_caller" {
  count        = var.conversation_test_caller_enabled ? 1 : 0
  project      = local.project
  account_id   = "mw-credit-app-agent-test-dev"
  display_name = "DEV conversation API rehearsal caller"
  lifecycle {
    prevent_destroy = true
  }
}
resource "google_service_account_iam_member" "conversation_test_caller_owner_oidc" {
  count              = var.conversation_test_caller_enabled ? 1 : 0
  service_account_id = google_service_account.conversation_test_caller[0].name
  role               = "roles/iam.serviceAccountOpenIdTokenCreator"
  member             = "user:welct0407@mw-credit.com"
}
output "conversation_test_caller" {
  value = var.conversation_test_caller_enabled ? {
    email   = google_service_account.conversation_test_caller[0].email
    subject = google_service_account.conversation_test_caller[0].unique_id
  } : null
}
