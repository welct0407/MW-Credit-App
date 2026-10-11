mock_provider "google" {
  mock_data "google_secret_manager_secret_version" {
    defaults = { secret_data = "{\"clientId\":\"synthetic\",\"clientSecret\":\"synthetic\"}" }
  }
}
mock_provider "google-beta" {}
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
run "existing_command_default_unchanged" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers, google_secret_manager_secret_iam_member.command_notification_policy] }
  assert {
    condition     = length(module.workers.identities) == 0 && length(google_secret_manager_secret_iam_member.command_notification_policy) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "NOTIFICATION_POLICY_JSON", "WEB_PUSH_VAPID_JSON"], e.name)])
    error_message = "Default worker module must not enable or bind notifications to the existing command service."
  }
}
run "api_enrollment_without_dispatch" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, module.workers, google_secret_manager_secret_iam_member.command_notification_policy] }
  variables {
    workers = { enabled = true, command_notification_enabled = true, policy_version = "1", web_push_public_key = "synthetic-public-key" }
  }
  assert {
    condition     = length(google_secret_manager_secret_iam_member.command_notification_policy) == 1 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !contains(["WEB_PUSH_VAPID_JSON", "WEB_PUSH_PRIVATE_KEY"], e.name)]) && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "PWA_NOTIFICATIONS"]) == "enabled"
    error_message = "Command may enroll with reviewed owner policy and public key, never VAPID private access."
  }
}



