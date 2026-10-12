mock_provider "google" {
  mock_data "google_secret_manager_secret_version" {
    defaults = { secret_data = "{\"clientId\":\"synthetic\",\"clientSecret\":\"synthetic\"}" }
  }
}
mock_provider "google-beta" {}
override_resource {
  target          = google_service_account.command_runtime[0]
  override_during = plan
  values          = { email = "mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" }
}
override_resource {
  target = google_identity_platform_default_supported_idp_config.google
  values = { id = "projects/clever-oasis-508610-n7/defaultSupportedIdpConfigs/google.com", project = "clever-oasis-508610-n7", idp_id = "google.com", client_id = "synthetic", client_secret = "synthetic", enabled = true, deletion_policy = "ABANDON" }
}
variables {
  github_repository_id           = "1408349602"
  owner_identity_mode            = "uid-pinned"
  owner_uid_secret_version       = "1"
  command_infrastructure_enabled = true
  command_mode                   = "dev-owner-testing"
  command_image                  = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
run "conversation_existing_command_default_unchanged" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers, google_secret_manager_secret_iam_member.command_notification_policy] }
  assert {
    condition     = length(google_secret_manager_secret.agent_conversation_policy) == 0 && length(google_secret_manager_secret_iam_member.command_agent_conversation_policy) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !startswith(e.name, "AGENT_CONVERSATION_")])
    error_message = "Machine conversation API must remain absent by default."
  }
  assert {
    condition     = length(module.workers.identities) == 0 && length(google_secret_manager_secret_iam_member.command_notification_policy) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "NOTIFICATION_POLICY_JSON", "WEB_PUSH_VAPID_JSON"], e.name)])
    error_message = "Default worker module must not enable or bind notifications to the existing command service."
  }
}
run "conversation_agent_policy_pinned_command_only" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables {
    agent_conversation_api = { policy_infrastructure_enabled = true, enabled = true, policy_version = "7" }
  }
  assert {
    condition     = length(google_secret_manager_secret.agent_conversation_policy) == 1 && length(google_secret_manager_secret_iam_member.command_agent_conversation_policy) == 1 && google_secret_manager_secret_iam_member.command_agent_conversation_policy[0].role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.command_agent_conversation_policy[0].member == "serviceAccount:${google_service_account.command_runtime[0].email}"
    error_message = "Only the command identity may access the optional policy container."
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "AGENT_CONVERSATION_POLICY_SECRET_VERSION"]) == "projects/clever-oasis-508610-n7/secrets/mw-credit-app-dev-agent-conversation-policy/versions/7" && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "AGENT_CONVERSATION_POLICY_JSON"]) == "7"
    error_message = "Runtime provenance and injected policy must use the same exact numeric DEV version."
  }
}
run "conversation_reject_agent_policy_latest" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables { agent_conversation_api = { policy_version = "latest" } }
  expect_failures = [var.agent_conversation_api]
}
run "conversation_reject_unprepared_agent_route" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables { agent_conversation_api = { enabled = true, policy_version = "1" } }
  expect_failures = [google_cloud_run_v2_service.command_api]
}
run "conversation_test_caller_default_off" {
  plan_options { target = [google_service_account.conversation_test_caller, google_service_account_iam_member.conversation_test_caller_owner_oidc] }
  command = plan
  assert {
    condition     = length(google_service_account.conversation_test_caller) == 0 && length(google_service_account_iam_member.conversation_test_caller_owner_oidc) == 0 && output.conversation_test_caller == null
    error_message = "No rehearsal identity or token grant may exist by default."
  }
}
run "conversation_test_caller_only_owner_oidc" {
  plan_options { target = [google_service_account.conversation_test_caller, google_service_account_iam_member.conversation_test_caller_owner_oidc] }
  command = plan
  variables { conversation_test_caller_enabled = true }
  override_resource {
    target          = google_service_account.conversation_test_caller[0]
    override_during = plan
    values = {
      name      = "projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-app-agent-test-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"
      email     = "mw-credit-app-agent-test-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"
      unique_id = "123456789012345678901"
    }
  }
  assert {
    condition     = length(google_service_account.conversation_test_caller) == 1 && length(google_service_account_iam_member.conversation_test_caller_owner_oidc) == 1 && google_service_account_iam_member.conversation_test_caller_owner_oidc[0].role == "roles/iam.serviceAccountOpenIdTokenCreator" && google_service_account_iam_member.conversation_test_caller_owner_oidc[0].member == "user:welct0407@mw-credit.com" && google_service_account_iam_member.conversation_test_caller_owner_oidc[0].service_account_id == google_service_account.conversation_test_caller[0].name
    error_message = "Only the exact owner may mint ID tokens for the dedicated DEV caller."
  }
  assert {
    condition     = output.conversation_test_caller.subject == google_service_account.conversation_test_caller[0].unique_id
    error_message = "Subject must come from the created SA, with policy activation still separate."
  }
}


