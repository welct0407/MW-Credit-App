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
  sql_ssd_import                 = false # mock providers cannot import
  github_repository_id           = "1408349602"
  command_infrastructure_enabled = true
  capability_policy_version      = "1"
  capability_policy_sha256       = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  command_image                  = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
run "existing_command_default_unchanged" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers] }
  assert {
    condition     = length(google_secret_manager_secret.agent_receipt_policy) == 0 && length(google_secret_manager_secret_iam_member.command_agent_receipt_policy) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !startswith(e.name, "AGENT_RECEIPT_")])
    error_message = "Machine receipt API must remain absent by default."
  }
  assert {
    condition     = length(module.workers.identities) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "NOTIFICATION_POLICY_JSON", "WEB_PUSH_VAPID_JSON"], e.name)])
    error_message = "Default worker module must not enable or bind notifications to the existing command service."
  }
}
run "agent_policy_pinned_command_only" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables {
    agent_receipt_api = { policy_infrastructure_enabled = true, enabled = true, policy_version = "7" }
  }
  assert {
    condition     = length(google_secret_manager_secret.agent_receipt_policy) == 1 && length(google_secret_manager_secret_iam_member.command_agent_receipt_policy) == 1 && google_secret_manager_secret_iam_member.command_agent_receipt_policy[0].role == "roles/secretmanager.secretAccessor" && google_secret_manager_secret_iam_member.command_agent_receipt_policy[0].member == "serviceAccount:${google_service_account.command_runtime[0].email}"
    error_message = "Only the command identity may access the optional policy container."
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "AGENT_RECEIPT_POLICY_SECRET_VERSION"]) == "projects/clever-oasis-508610-n7/secrets/mw-credit-app-dev-agent-receipt-policy/versions/7" && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "AGENT_RECEIPT_POLICY_JSON"]) == "7"
    error_message = "Runtime provenance and injected policy must use the same exact numeric DEV version."
  }
}
run "reject_agent_policy_latest" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables { agent_receipt_api = { policy_version = "latest" } }
  expect_failures = [var.agent_receipt_api]
}
run "reject_unprepared_agent_route" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables { agent_receipt_api = { enabled = true, policy_version = "1" } }
  expect_failures = [google_cloud_run_v2_service.command_api]
}
run "api_enrollment_without_dispatch" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers] }
  variables {
    workers = { enabled = true, command_notification_enabled = true, policy_version = "1", web_push_public_key = "synthetic-public-key" }
  }
  assert {
    condition     = alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !contains(["WEB_PUSH_VAPID_JSON", "WEB_PUSH_PRIVATE_KEY", "NOTIFICATION_POLICY_JSON"], e.name)]) && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "PWA_NOTIFICATIONS"]) == "enabled"
    error_message = "Command enrolls with the public key and its capability policy, never VAPID private access or the worker notification policy."
  }
}
run "command_direct_dispatch_exact_target" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers] }
  variables {
    workers = {
      enabled                      = true
      image                        = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      command_notification_enabled = true
      command_dispatch_enabled     = true
      policy_version               = "1"
      vapid_version                = "1"
      push_subject                 = "mailto:synthetic@example.invalid"
      registered_creators          = ["postgres"]
      web_push_public_key          = "synthetic-public-key"
    }
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_AUDIENCE"]) == "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app" && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_URL"]) == "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app/internal/dispatch"
    error_message = "Command dispatch must bind only the exact DEV notify origin and fixed route."
  }
}



