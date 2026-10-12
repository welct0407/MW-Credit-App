override_resource {
  target          = google_service_account.application["command"]
  override_during = plan
  values          = { email = "mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com", name = "projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com" }
}
mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  application_project_id     = "clever-oasis-508610-n7"
  application_project_number = "737787224638"
  region                     = "asia-southeast1"
  hosting_site_id            = "synthetic-phase3-production"
}

run "conversation_command_only" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    workers                            = { enabled = true, image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", vapid_version = "1", policy_version = "2", push_subject = "mailto:synthetic@example.invalid", registered_creators = ["postgres"], command_notification_enabled = true, command_dispatch_enabled = true, web_push_public_key = "synthetic" }
    agent_conversation_api             = { policy_infrastructure_enabled = true, enabled = true, policy_version = "3" }
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.foundation["command"].template[0].containers[0].env : e.value if e.name == "PWA_NOTIFICATIONS"]) == "enabled" && one([for e in google_cloud_run_v2_service.foundation["command"].template[0].containers[0].env : e.value if e.name == "AGENT_CONVERSATION_POLICY_SECRET_VERSION"]) == "projects/clever-oasis-508610-n7/secrets/mw-credit-app-prod-agent-conversation-policy/versions/3" && alltrue([for e in google_cloud_run_v2_service.foundation["read"].template[0].containers[0].env : !startswith(e.name, "AGENT_CONVERSATION_") && e.name != "NOTIFICATION_POLICY_JSON" && e.name != "WEB_PUSH_VAPID_JSON"])
    error_message = "Only command receives notification enrollment and the pinned PROD machine policy."
  }
  assert {
    condition     = google_secret_manager_secret_iam_member.command_agent_conversation_policy[0].member == "serviceAccount:${google_service_account.application["command"].email}" && google_secret_manager_secret_iam_member.command_agent_conversation_policy[0].role == "roles/secretmanager.secretAccessor" && one([for e in google_cloud_run_v2_service.foundation["command"].template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "AGENT_CONVERSATION_POLICY_JSON"]) == "3"
    error_message = "Conversation secret must be numeric-pinned and accessible only by command."
  }

}


run "conversation_reject_latest" {
  command = plan
  variables { agent_conversation_api = { policy_version = "latest" } }
  expect_failures = [var.agent_conversation_api]
}
run "conversation_default_off" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    workers                            = { enabled = true, image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", vapid_version = "1", policy_version = "2", push_subject = "mailto:synthetic@example.invalid", registered_creators = ["postgres"], command_notification_enabled = true, command_dispatch_enabled = true, web_push_public_key = "synthetic" }
    agent_conversation_api             = { policy_infrastructure_enabled = false, enabled = false }
  }
  assert {
    condition     = length(google_secret_manager_secret.agent_conversation_policy) == 0 && length(google_secret_manager_secret_iam_member.command_agent_conversation_policy) == 0 && alltrue([for role, service in google_cloud_run_v2_service.foundation : alltrue([for e in service.template[0].containers[0].env : !startswith(e.name, "AGENT_CONVERSATION_")])])
    error_message = "Default conversation configuration must not create resources or runtime env."
  }
}
run "conversation_reject_unprepared" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    workers                            = { enabled = true, image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", vapid_version = "1", policy_version = "2", push_subject = "mailto:synthetic@example.invalid", registered_creators = ["postgres"], command_notification_enabled = true, command_dispatch_enabled = true, web_push_public_key = "synthetic" }
    agent_conversation_api             = { policy_infrastructure_enabled = false, enabled = true, policy_version = "3" }
  }
  expect_failures = [google_cloud_run_v2_service.foundation]
}


