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
  target          = google_service_account.read_runtime
  override_during = plan
  values          = { email = "mw-credit-app-read-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" }
}
override_resource {
  target          = google_firebase_hosting_site.dev
  override_during = plan
  values          = { site_id = "mw-credit-app-dev-737787224638" }
}
override_resource {
  target          = google_secret_manager_secret.capability_policy
  override_during = plan
  values          = { secret_id = "mw-credit-app-dev-capability-policy", id = "projects/clever-oasis-508610-n7/secrets/mw-credit-app-dev-capability-policy" }
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
  read_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
run "dev_services_run_business_runtime" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, google_cloud_run_v2_service.read_api] }
  assert {
    condition = alltrue([for s in [google_cloud_run_v2_service.command_api[0], google_cloud_run_v2_service.read_api[0]] :
      one(s.template[0].containers[0].args) == "services/production/business-server.mjs" && s.template[0].timeout == (s.name == "mw-credit-app-command-dev" ? "55s" : "15s")
      && one([for e in s.template[0].containers[0].env : e.value if e.name == "APP_ENV"]) == "dev"
      && one([for e in s.template[0].containers[0].env : e.value if e.name == "DB_NAME"]) == "loan_manager_dev"
      && one([for e in s.template[0].containers[0].env : e.value if e.name == "DEV_CAPABILITY_POLICY_SECRET_VERSION"]) == "projects/clever-oasis-508610-n7/secrets/mw-credit-app-dev-capability-policy/versions/1"
      && one([for e in s.template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "DEV_CAPABILITY_POLICY_JSON"]) == "1"
      && one([for e in s.template[0].containers[0].env : e.value if e.name == "DEV_CAPABILITY_POLICY_SHA256"]) == "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    && alltrue([for e in s.template[0].containers[0].env : !contains(["OWNER_IDENTITY_MODE", "OWNER_FIREBASE_UID", "COMMAND_MODE", "COMMAND_FIXTURE_JSON", "NOTIFICATION_POLICY_JSON"], e.name) && !startswith(e.name, "PROD_")])])
    error_message = "DEV reader and command run business-server.mjs with the pinned DEV capability policy, 15 s reader / 55 s command timeout and no retired owner/fixture or PROD names."
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.read_api[0].template[0].containers[0].env : e.value if e.name == "FOUNDATION_ROLE"]) == "reader" && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "FOUNDATION_ROLE"]) == "command" && alltrue([for e in google_cloud_run_v2_service.read_api[0].template[0].containers[0].env : !startswith(e.name, "RECEIPT_") && e.name != "DEV_RECEIPTS"])
    error_message = "Roles are explicit and only the command service carries the DEV receipt mapping."
  }
}
run "policy_accessors_reader_and_command_only" {
  command = plan
  plan_options { target = [google_secret_manager_secret_iam_member.read_capability_policy, google_secret_manager_secret_iam_member.command_capability_policy] }
  assert {
    condition     = google_secret_manager_secret_iam_member.read_capability_policy.member == "serviceAccount:mw-credit-app-read-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" && google_secret_manager_secret_iam_member.command_capability_policy[0].member == "serviceAccount:mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" && google_secret_manager_secret_iam_member.read_capability_policy.role == "roles/secretmanager.secretAccessor"
    error_message = "Only the DEV reader and command identities read the capability policy."
  }
}
run "reject_unpinned_policy" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, google_cloud_run_v2_service.read_api] }
  variables { capability_policy_version = null }
  expect_failures = [google_cloud_run_v2_service.command_api, google_cloud_run_v2_service.read_api]
}
run "reject_policy_latest" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.read_api] }
  variables { capability_policy_version = "latest" }
  expect_failures = [var.capability_policy_version]
}
run "artifact_cleanup_keeps_recent_and_tagged" {
  command = plan
  plan_options { target = [google_artifact_registry_repository.app] }
  assert {
    condition     = !google_artifact_registry_repository.app.cleanup_policy_dry_run && length(google_artifact_registry_repository.app.cleanup_policies) == 3 && one([for p in google_artifact_registry_repository.app.cleanup_policies : p.most_recent_versions[0].keep_count if p.id == "keep-most-recent-20"]) == 20 && one([for p in google_artifact_registry_repository.app.cleanup_policies : one(p.condition[0].tag_prefixes) if p.id == "keep-tagged-keep"]) == "keep" && one([for p in google_artifact_registry_repository.app.cleanup_policies : p.condition[0].older_than if p.id == "delete-older-than-30d"]) == "2592000s"
    error_message = "Cleanup keeps the 20 most recent and keep-tagged versions and deletes others after 30 days."
  }
}
run "receipt_recognizer_default_off" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  assert {
    condition     = length(google_cloud_run_v2_service.command_api[0].template[0].vpc_access) == 0 && alltrue([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : !startswith(e.name, "DEV_RECEIPT_RECOGNITION")])
    error_message = "By default the DEV command service has no VPC egress and no recognizer settings."
  }
}
run "receipt_recognizer_private_egress" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, google_cloud_run_v2_service.read_api] }
  variables { receipt_recognizer = { enabled = true } }
  assert {
    condition = (one(google_cloud_run_v2_service.command_api[0].template[0].vpc_access).egress == "PRIVATE_RANGES_ONLY"
      && one(one(google_cloud_run_v2_service.command_api[0].template[0].vpc_access).network_interfaces).subnetwork == "default"
      && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "DEV_RECEIPT_RECOGNITION_URL"]) == "http://10.148.0.2:8790/v1/receipt-recognition"
      && one([for e in google_cloud_run_v2_service.command_api[0].template[0].containers[0].env : e.value if e.name == "DEV_RECEIPT_RECOGNITION"]) == "disabled"
    && length(google_cloud_run_v2_service.read_api[0].template[0].vpc_access) == 0)
    error_message = "Only the DEV command service gets private-range egress and the recognizer URL with the flag left disabled."
  }
}
run "receipt_recognizer_activation_needs_egress" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api] }
  variables { receipt_recognizer = { activation = "enabled" } }
  expect_failures = [var.receipt_recognizer]
}

run "command_and_reader_use_request_based_cpu" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.command_api, google_cloud_run_v2_service.read_api] }
  assert {
    condition     = google_cloud_run_v2_service.command_api[0].template[0].containers[0].resources[0].cpu_idle && google_cloud_run_v2_service.read_api[0].template[0].containers[0].resources[0].cpu_idle
    error_message = "R107: the DEV command service and the reader use request-based CPU (cpu_idle true)."
  }
}

# R095 Part B: the Claude test-session secret is a DEV container only (no version, no runtime accessor).
run "claude_test_session_container_only" {
  command = plan
  plan_options { target = [google_secret_manager_secret.claude_test_session] }
  assert {
    condition = (google_secret_manager_secret.claude_test_session.secret_id == "mw-credit-app-dev-claude-test-session"
      && google_secret_manager_secret.claude_test_session.labels == tomap({ application = "mw-credit-app", environment = "dev", purpose = "claude-test" })
    && length(google_secret_manager_secret.claude_test_session.replication[0].auto) == 1)
    error_message = "The DEV Claude test-session secret is the labelled, auto-replicated container mw-credit-app-dev-claude-test-session."
  }
}
