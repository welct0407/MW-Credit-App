mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  sql_ssd_import             = false # mock providers cannot import
  application_project_id     = "clever-oasis-508610-n7"
  application_project_number = "737787224638"
  region                     = "asia-southeast1"
  hosting_site_id            = "mw-credit-prod-737787224638"
}

run "chat_default_off" {
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
  }
  assert {
    condition     = length(google_service_account.chat) == 0 && length(google_project_iam_member.chat) == 0 && length(google_project_iam_member.chat_auth) == 0 && length(google_sql_user.chat) == 0 && length(google_secret_manager_secret_iam_member.chat_policy) == 0 && length(google_cloud_run_v2_service.chat) == 0
    error_message = "Without chat_authorized the PROD business runtime proposes no chat identity, grant or service."
  }
  assert {
    condition     = length(google_logging_metric.chat_turns) == 0 && length(google_logging_metric.chat_turn_latency) == 0 && length(google_logging_metric.chat_turn_rounds) == 0 && length(google_logging_metric.api_result_codes) == 1
    error_message = "R093: without chat_authorized there are no chat turn metrics; the R089 runtime metrics stay."
  }
}

run "chat_requires_business_runtime" {
  command = plan
  variables {
    foundation_authorized = true
    chat_authorized       = true
  }
  expect_failures = [google_service_account.chat]
}

run "chat_authorized_exact_prod_service" {
  command = plan
  override_resource {
    target          = google_service_account.chat[0]
    override_during = plan
    values          = { email = "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com" }
  }
  override_resource {
    target          = google_project_iam_custom_role.auth_user[0]
    override_during = plan
    values          = { name = "projects/clever-oasis-508610-n7/roles/mwCreditProductionAuthUser" }
  }
  override_resource {
    target          = google_secret_manager_secret.business["capability-policy"]
    override_during = plan
    values          = { secret_id = "mw-credit-app-prod-capability-policy" }
  }
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
  }
  assert {
    condition = (keys(google_project_iam_member.chat) == ["roles/aiplatform.user", "roles/cloudsql.client", "roles/cloudsql.instanceUser"]
      && alltrue([for b in google_project_iam_member.chat : b.member == "serviceAccount:mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com"])
      && google_project_iam_member.chat_auth[0].role == "projects/clever-oasis-508610-n7/roles/mwCreditProductionAuthUser"
      && google_sql_user.chat[0].name == "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam" && google_sql_user.chat[0].instance == "mw-credit-pg-20261017"
    && google_secret_manager_secret_iam_member.chat_policy[0].secret_id == "mw-credit-app-prod-capability-policy" && google_secret_manager_secret_iam_member.chat_policy[0].role == "roles/secretmanager.secretAccessor")
    error_message = "PROD chat identity holds Cloud SQL client/instance user, Vertex AI user, the PROD auth-status role and only the PROD capability policy secret."
  }
  assert {
    condition = (google_cloud_run_v2_service.chat[0].name == "mw-credit-app-chat-prod" && google_cloud_run_v2_service.chat[0].template[0].timeout == "300s"
      && google_cloud_run_v2_service.chat[0].template[0].max_instance_request_concurrency == 10 && google_cloud_run_v2_service.chat[0].template[0].scaling[0].max_instance_count == 2
      && google_cloud_run_v2_service.chat[0].template[0].containers[0].image == var.business_image && one(google_cloud_run_v2_service.chat[0].template[0].containers[0].args) == "services/chat/server.mjs"
      && !google_cloud_run_v2_service.chat[0].template[0].containers[0].resources[0].cpu_idle && google_cloud_run_v2_service.chat[0].template[0].containers[0].resources[0].startup_cpu_boost
    && length(google_cloud_run_v2_service.chat[0].template[0].vpc_access) == 0)
    error_message = "PROD chat runs the business image's services/chat/server.mjs, 300 s, concurrency 10, max 2, CPU always allocated (cpu_idle false), no VPC egress."
  }
  assert {
    condition = (one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "FOUNDATION_ROLE"]) == "chat"
      && one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "DB_NAME"]) == "loan_manager_prod"
      && one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "DB_USER"]) == "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam"
      && one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "PROD_CAPABILITY_POLICY_JSON"]) == "2"
      && jsondecode(one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).default == "gemini-4-argon"
      && jsondecode(one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).maxRounds == 16
      && alltrue([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : !startswith(e.name, "DEV_") && !startswith(e.name, "AGENT_") && !startswith(e.name, "NOTIFICATION_") && !startswith(e.name, "WEB_PUSH_") && !startswith(e.name, "PROD_RECEIPT") && !startswith(e.name, "RECEIPT_") && !strcontains(e.name, "RECEIPT")
    && !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "OWNER_IDENTITY_MODE", "OWNER_IDENTITY_SECRET_VERSION", "PROD_OWNER_FIREBASE_UID", "FOUNDATION_MODE"], e.name)]))
    error_message = "PROD chat carries the PROD business environment with role chat and no DEV, receipt, notification, agent or owner-identity settings."
  }
  assert {
    condition     = alltrue([for role, service in google_cloud_run_v2_service.foundation : one(service.template[0].containers[0].args) == "services/production/business-server.mjs" && service.template[0].timeout == (role == "command" ? "55s" : "15s")])
    error_message = "Enabling chat leaves the reader and command definitions unchanged."
  }
  assert {
    condition = (google_logging_metric.chat_turns[0].name == "mw_chat_turns_prod" && google_logging_metric.chat_turn_latency[0].name == "mw_chat_turn_latency_prod" && google_logging_metric.chat_turn_rounds[0].name == "mw_chat_turn_rounds_prod"
      && alltrue([for m in [google_logging_metric.chat_turns[0], google_logging_metric.chat_turn_latency[0], google_logging_metric.chat_turn_rounds[0]] : m.project == "clever-oasis-508610-n7" && m.filter == "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mw-credit-app-chat-prod\" AND jsonPayload.event=\"chat_turn\"" && m.metric_descriptor[0].metric_kind == "DELTA"])
      && google_logging_metric.chat_turns[0].metric_descriptor[0].value_type == "INT64" && google_logging_metric.chat_turns[0].label_extractors["code"] == "EXTRACT(jsonPayload.code)" && google_logging_metric.chat_turns[0].label_extractors["model"] == "EXTRACT(jsonPayload.model)" && length(google_logging_metric.chat_turns[0].label_extractors) == 2
      && google_logging_metric.chat_turn_latency[0].metric_descriptor[0].value_type == "DISTRIBUTION" && google_logging_metric.chat_turn_latency[0].metric_descriptor[0].unit == "ms" && google_logging_metric.chat_turn_latency[0].value_extractor == "EXTRACT(jsonPayload.latencyMs)"
      && google_logging_metric.chat_turn_latency[0].bucket_options[0].exponential_buckets[0].num_finite_buckets == 20 && google_logging_metric.chat_turn_latency[0].bucket_options[0].exponential_buckets[0].growth_factor == 1.5 && google_logging_metric.chat_turn_latency[0].bucket_options[0].exponential_buckets[0].scale == 1000
      && google_logging_metric.chat_turn_rounds[0].value_extractor == "EXTRACT(jsonPayload.rounds)" && google_logging_metric.chat_turn_rounds[0].bucket_options[0].linear_buckets[0].num_finite_buckets == 17
    && google_logging_metric.chat_turn_rounds[0].bucket_options[0].linear_buckets[0].width == 1 && google_logging_metric.chat_turn_rounds[0].bucket_options[0].linear_buckets[0].offset == 0)
    error_message = "R093: the three PROD chat turn metrics read only mw-credit-app-chat-prod chat_turn records with the agreed labels, extractors and buckets."
  }
}

run "chat_image_override" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat] }
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    runtime_image_overrides            = { chat = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
  }
  assert {
    condition     = google_cloud_run_v2_service.chat[0].template[0].containers[0].image == "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    error_message = "A chat image override pins the chat service only."
  }
}

run "chat_rejects_dev_image" {
  command = plan
  variables {
    runtime_image_overrides = { chat = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" }
  }
  expect_failures = [var.runtime_image_overrides]
}

run "chat_dispatch_prod_behind_chat_authorized" {
  command = plan
  override_resource {
    target          = module.workers.google_service_account.scheduler[0]
    override_during = plan
    values          = { email = "mw-credit-app-scheduler-prod@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000001" }
  }
  override_resource {
    target          = google_service_account.chat[0]
    override_during = plan
    values          = { email = "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000004" }
  }
  override_resource {
    target          = google_secret_manager_secret.business["capability-policy"]
    override_during = plan
    values          = { secret_id = "mw-credit-app-prod-capability-policy" }
  }
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    workers                            = { enabled = true, image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", vapid_version = "1", policy_version = "2", push_subject = "mailto:synthetic@example.invalid", registered_creators = ["postgres"], notification_enabled = true, chat_dispatch_enabled = true }
  }
  assert {
    condition     = one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_URL"]) == "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app/internal/dispatch" && one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_AUDIENCE"]) == "https://mw-credit-app-notify-prod-737787224638.asia-southeast1.run.app" && contains(module.workers.notify_callers, "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com")
    error_message = "PROD chat dispatch binds the exact PROD notify origin and pins the PROD chat identity as a notify caller."
  }
}

run "chat_dispatch_prod_off_by_default" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
  }
  override_resource {
    target          = google_service_account.chat[0]
    override_during = plan
    values          = { email = "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000004" }
  }
  assert {
    condition     = alltrue([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : !startswith(e.name, "NOTIFICATION_")])
    error_message = "PROD chat carries no dispatch keys unless chat dispatch is enabled."
  }
  assert {
    condition     = alltrue([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.name != "CHAT_COMMAND_URL"])
    error_message = "R106: PROD chat carries no CHAT_COMMAND_URL unless chat_commands.enabled is set at promotion."
  }
}

run "chat_relay_prod_gated" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat] }
  override_resource {
    target          = google_service_account.chat[0]
    override_during = plan
    values          = { email = "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com" }
  }
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    chat_relay                         = { enabled = true }
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
  }
  assert {
    condition = (google_cloud_run_v2_service.chat[0].template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY"
      && google_cloud_run_v2_service.chat[0].template[0].vpc_access[0].network_interfaces[0].subnetwork == "default"
      && one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_RELAY_URL"]) == "http://10.148.0.2:8791/v1/chat/messages"
      && jsondecode(one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models[0].id == "claude-opus-5-5"
    && jsondecode(one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).default == "gemini-4-argon")
    error_message = "R102: the PROD relay gate adds private-range egress, CHAT_RELAY_URL and Claude Opus 5.5 first; the default stays gemini-4-argon."
  }
}

run "chat_commands_prod_gated" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat] }
  override_resource {
    target          = google_service_account.chat[0]
    override_during = plan
    values          = { email = "mw-credit-app-chat-prod@clever-oasis-508610-n7.iam.gserviceaccount.com" }
  }
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    chat_authorized                    = true
    chat_commands                      = { enabled = true }
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
  }
  assert {
    condition = (one([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : e.value if e.name == "CHAT_COMMAND_URL"]) == "https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app"
      && length(google_cloud_run_v2_service.chat[0].template[0].vpc_access) == 0
    && alltrue([for e in google_cloud_run_v2_service.chat[0].template[0].containers[0].env : !startswith(e.name, "DEV_") && !startswith(e.name, "RECEIPT_") && !startswith(e.name, "AGENT_") && !startswith(e.name, "NOTIFICATION_")]))
    error_message = "R106: the PROD chat commands gate adds only CHAT_COMMAND_URL for the PROD command service; no egress, DEV, receipt, notification or agent keys."
  }
}
