mock_provider "google" {
  mock_data "google_secret_manager_secret_version" {
    defaults = { secret_data = "{\"clientId\":\"synthetic\",\"clientSecret\":\"synthetic\"}" }
  }
}
mock_provider "google-beta" {}
override_resource {
  target          = google_service_account.chat_runtime[0]
  override_during = plan
  values          = { email = "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000003" }
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
  target          = google_project_iam_custom_role.read_auth_user
  override_during = plan
  values          = { name = "projects/clever-oasis-508610-n7/roles/mwCreditAppReadAuthUser" }
}
override_resource {
  target = google_identity_platform_default_supported_idp_config.google
  values = { id = "projects/clever-oasis-508610-n7/defaultSupportedIdpConfigs/google.com", project = "clever-oasis-508610-n7", idp_id = "google.com", client_id = "synthetic", client_secret = "synthetic", enabled = true, deletion_policy = "ABANDON" }
}
variables {
  sql_ssd_import            = false # mock providers cannot import
  github_repository_id      = "1408349602"
  capability_policy_version = "1"
  capability_policy_sha256  = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  chat_image                = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

run "chat_absent_without_image" {
  command = plan
  variables { chat_image = null }
  plan_options { target = [google_cloud_run_v2_service.chat_api, google_service_account.chat_runtime, google_project_iam_member.chat_runtime, google_sql_user.chat_runtime, google_secret_manager_secret_iam_member.chat_capability_policy] }
  assert {
    condition     = length(google_cloud_run_v2_service.chat_api) == 0 && length(google_service_account.chat_runtime) == 0 && length(google_project_iam_member.chat_runtime) == 0 && length(google_sql_user.chat_runtime) == 0 && length(google_secret_manager_secret_iam_member.chat_capability_policy) == 0 && output.chat_api_url == null
    error_message = "No chat identity, grant or service exists until a tested image is pinned."
  }
}

run "chat_identity_and_roles" {
  command = plan
  plan_options { target = [google_project_iam_member.chat_runtime, google_project_iam_member.chat_auth_user, google_sql_user.chat_runtime, google_secret_manager_secret_iam_member.chat_capability_policy] }
  assert {
    condition = (keys(google_project_iam_member.chat_runtime) == ["roles/aiplatform.user", "roles/cloudsql.client", "roles/cloudsql.instanceUser"]
      && alltrue([for b in google_project_iam_member.chat_runtime : b.member == "serviceAccount:mw-credit-app-chat-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" && b.project == "clever-oasis-508610-n7"])
      && google_project_iam_member.chat_auth_user[0].role == "projects/clever-oasis-508610-n7/roles/mwCreditAppReadAuthUser"
      && google_sql_user.chat_runtime[0].name == "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam" && google_sql_user.chat_runtime[0].type == "CLOUD_IAM_SERVICE_ACCOUNT" && google_sql_user.chat_runtime[0].instance == "mw-credit-pg-20261017"
      && google_secret_manager_secret_iam_member.chat_capability_policy[0].role == "roles/secretmanager.secretAccessor"
    && google_secret_manager_secret_iam_member.chat_capability_policy[0].secret_id == "projects/clever-oasis-508610-n7/secrets/mw-credit-app-dev-capability-policy")
    error_message = "Chat identity mw-credit-app-chat-dev holds Cloud SQL client/instance user, Vertex AI user, the auth-status role and only the DEV capability policy secret."
  }
}

run "chat_service_runtime" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  assert {
    condition = (google_cloud_run_v2_service.chat_api[0].name == "mw-credit-app-chat-dev" && google_cloud_run_v2_service.chat_api[0].ingress == "INGRESS_TRAFFIC_ALL" && google_cloud_run_v2_service.chat_api[0].invoker_iam_disabled
      && google_cloud_run_v2_service.chat_api[0].template[0].timeout == "300s" && google_cloud_run_v2_service.chat_api[0].template[0].max_instance_request_concurrency == 10
      && google_cloud_run_v2_service.chat_api[0].template[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.chat_api[0].template[0].scaling[0].max_instance_count == 2
      && google_cloud_run_v2_service.chat_api[0].template[0].containers[0].resources[0].limits == tomap({ cpu = "1", memory = "512Mi" }) && google_cloud_run_v2_service.chat_api[0].template[0].containers[0].resources[0].startup_cpu_boost && !google_cloud_run_v2_service.chat_api[0].template[0].containers[0].resources[0].cpu_idle
      && google_cloud_run_v2_service.chat_api[0].template[0].service_account == "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"
      && one(google_cloud_run_v2_service.chat_api[0].template[0].containers[0].args) == "services/chat/server.mjs"
    && length(google_cloud_run_v2_service.chat_api[0].template[0].vpc_access) == 0)
    error_message = "Chat runs services/chat/server.mjs as mw-credit-app-chat-dev, 300 s, concurrency 10, min 0/max 2, 1 CPU/512Mi with boost, CPU always allocated (cpu_idle false) and no VPC egress."
  }
  assert {
    condition = (one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "FOUNDATION_ROLE"]) == "chat"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "DB_USER"]) == "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "RUNTIME_SERVICE_ACCOUNT"]) == "mw-credit-app-chat-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "DB_NAME"]) == "loan_manager_dev"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "APP_ENV"]) == "dev"
    && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value_source[0].secret_key_ref[0].version if e.name == "DEV_CAPABILITY_POLICY_JSON"]) == "1")
    error_message = "Chat carries the shared DEV business environment with role chat, its own DB user and the pinned DEV capability policy."
  }
  assert {
    condition = alltrue([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env :
      !startswith(e.name, "RECEIPT_") && !startswith(e.name, "DEV_RECEIPT") && !startswith(e.name, "AGENT_") && !startswith(e.name, "NOTIFICATION_") && !startswith(e.name, "WEB_PUSH_") && !startswith(e.name, "PROD_")
    && !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "DEV_RECEIPTS", "OWNER_IDENTITY_MODE", "OWNER_FIREBASE_UID", "COMMAND_MODE", "COMMAND_FIXTURE_JSON", "GEMINI_API_KEY", "GOOGLE_API_KEY"], e.name)])
    error_message = "The chat service fails closed on any DEV_RECEIPT*, RECEIPT_*, AGENT_*, NOTIFICATION_*, WEB_PUSH_* or PWA_NOTIFICATIONS key; none may reach it (nor PROD, retired owner/fixture or API-key names)."
  }
  assert {
    condition = (jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).default == "gemini-4-argon"
      && jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).location == "global"
      && jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).maxRounds == 16
      && [for m in jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models : m.id] == ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash"]
    && alltrue([for m in jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models : m.available && !can(m.reason)]))
    error_message = "CHAT_MODELS_JSON lists the three approved models, default gemini-4-argon on global, 16 rounds, with no null reason keys."
  }
}

run "business_env_carries_no_chat_forbidden_key" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  assert {
    condition     = alltrue([for k in keys(local.business_env) : !startswith(k, "DEV_RECEIPT") && !startswith(k, "RECEIPT_") && !startswith(k, "AGENT_") && !startswith(k, "NOTIFICATION_") && !startswith(k, "WEB_PUSH_") && k != "PWA_NOTIFICATIONS"])
    error_message = "local.business_env is shared with the chat service and must hold no key the chat role refuses."
  }
}

run "chat_unavailable_model_carries_reason" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_models = {
      version = 1, location = "global", default = "gemini-4-argon", thinkingLevel = "MEDIUM", maxRounds = 24, requestTimeoutSeconds = 120, turnTimeoutSeconds = 240, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }, { id = "gemini-3.5-flash", label = "Gemini 3.5 Flash", available = false, reason = "Not answering on global" }]
    }
  }
  assert {
    condition     = jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models[1].reason == "Not answering on global"
    error_message = "An unavailable model is listed with its reason."
  }
}

run "reject_unavailable_default" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_models = {
      version = 1, location = "global", default = "gemini-3.5-flash", thinkingLevel = "MEDIUM", maxRounds = 24, requestTimeoutSeconds = 120, turnTimeoutSeconds = 240, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }, { id = "gemini-3.5-flash", label = "Gemini 3.5 Flash", available = false, reason = "Unavailable" }]
    }
  }
  expect_failures = [var.chat_models]
}

run "reject_bad_bounds" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_models = {
      version = 1, location = "global", default = "gemini-4-argon", thinkingLevel = "XHIGH", maxRounds = 24, requestTimeoutSeconds = 200, turnTimeoutSeconds = 120, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }]
    }
  }
  expect_failures = [var.chat_models]
}

run "reject_mutable_image" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables { chat_image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api:latest" }
  expect_failures = [var.chat_image]
}

run "reject_unpinned_policy" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables { capability_policy_version = null }
  expect_failures = [google_cloud_run_v2_service.chat_api]
}

run "chat_dispatch_wake_env_when_enabled" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    workers = {
      enabled                      = true
      image                        = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      notification_enabled         = true
      command_notification_enabled = true
      chat_dispatch_enabled        = true
      policy_version               = "1"
      vapid_version                = "1"
      push_subject                 = "mailto:synthetic@example.invalid"
      registered_creators          = ["postgres"]
      web_push_public_key          = "synthetic-public-key"
    }
  }
  assert {
    condition = (one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_ENABLED"]) == "true"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_URL"]) == "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app/internal/dispatch"
      && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "NOTIFICATION_DISPATCH_AUDIENCE"]) == "https://mw-credit-app-notify-dev-737787224638.asia-southeast1.run.app"
    && alltrue([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY", "NOTIFICATION_POLICY_JSON"], e.name) && !startswith(e.name, "AGENT_") && !startswith(e.name, "RECEIPT_")]))
    error_message = "Chat dispatch adds exactly the three wake keys bound to the DEV notify origin and nothing else from notifications."
  }
}

run "chat_dispatch_requires_notify_worker" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables { workers = { chat_dispatch_enabled = true } }
  expect_failures = [google_cloud_run_v2_service.chat_api]
}

run "chat_turn_metrics" {
  command = plan
  plan_options { target = [google_logging_metric.chat_turns, google_logging_metric.chat_turn_latency, google_logging_metric.chat_turn_rounds] }
  assert {
    condition = (google_logging_metric.chat_turns.name == "mw_chat_turns_dev" && google_logging_metric.chat_turn_latency.name == "mw_chat_turn_latency_dev" && google_logging_metric.chat_turn_rounds.name == "mw_chat_turn_rounds_dev"
      && alltrue([for m in [google_logging_metric.chat_turns, google_logging_metric.chat_turn_latency, google_logging_metric.chat_turn_rounds] : m.project == "clever-oasis-508610-n7" && m.filter == "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mw-credit-app-chat-dev\" AND jsonPayload.event=\"chat_turn\"" && m.metric_descriptor[0].metric_kind == "DELTA"])
      && google_logging_metric.chat_turns.metric_descriptor[0].value_type == "INT64" && google_logging_metric.chat_turns.label_extractors["code"] == "EXTRACT(jsonPayload.code)" && google_logging_metric.chat_turns.label_extractors["model"] == "EXTRACT(jsonPayload.model)" && length(google_logging_metric.chat_turns.label_extractors) == 2
      && google_logging_metric.chat_turn_latency.metric_descriptor[0].value_type == "DISTRIBUTION" && google_logging_metric.chat_turn_latency.metric_descriptor[0].unit == "ms" && google_logging_metric.chat_turn_latency.value_extractor == "EXTRACT(jsonPayload.latencyMs)"
      && google_logging_metric.chat_turn_latency.bucket_options[0].exponential_buckets[0].num_finite_buckets == 20 && google_logging_metric.chat_turn_latency.bucket_options[0].exponential_buckets[0].growth_factor == 1.5 && google_logging_metric.chat_turn_latency.bucket_options[0].exponential_buckets[0].scale == 1000
      && google_logging_metric.chat_turn_rounds.value_extractor == "EXTRACT(jsonPayload.rounds)" && google_logging_metric.chat_turn_rounds.bucket_options[0].linear_buckets[0].num_finite_buckets == 17
    && google_logging_metric.chat_turn_rounds.bucket_options[0].linear_buckets[0].width == 1 && google_logging_metric.chat_turn_rounds.bucket_options[0].linear_buckets[0].offset == 0)
    error_message = "R093: the three DEV chat turn metrics read only mw-credit-app-chat-dev chat_turn records with the agreed labels, extractors and buckets."
  }
}

run "chat_relay_off_lists_no_claude" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  assert {
    condition = (length(google_cloud_run_v2_service.chat_api[0].template[0].vpc_access) == 0
      && alltrue([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.name != "CHAT_RELAY_URL"])
    && alltrue([for m in jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models : !startswith(m.id, "claude-")]))
    error_message = "R102: without chat_relay.enabled there is no VPC egress, no CHAT_RELAY_URL and no claude-* model in CHAT_MODELS_JSON."
  }
}

run "chat_relay_enabled_wiring" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables { chat_relay = { enabled = true } }
  assert {
    condition = (google_cloud_run_v2_service.chat_api[0].template[0].vpc_access[0].egress == "PRIVATE_RANGES_ONLY"
      && google_cloud_run_v2_service.chat_api[0].template[0].vpc_access[0].network_interfaces[0].network == "default"
      && google_cloud_run_v2_service.chat_api[0].template[0].vpc_access[0].network_interfaces[0].subnetwork == "default"
    && one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_RELAY_URL"]) == "http://10.148.0.2:8791/v1/chat/messages")
    error_message = "R102: the relay adds private-range egress on the default subnet and CHAT_RELAY_URL for the VM relay on 8791."
  }
  assert {
    condition = ([for m in jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models : m.id] == ["claude-opus-5-5", "gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash"]
      && jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).models[0].label == "Claude Opus 5.5"
    && jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).default == "gemini-4-argon")
    error_message = "R102: with the relay, Claude Opus 5.5 is listed first and the default stays gemini-4-argon until the DEV proof."
  }
}

run "chat_relay_claude_default" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_relay = { enabled = true }
    chat_models = {
      version = 1, location = "global", default = "claude-opus-5-5", thinkingLevel = "MEDIUM", maxRounds = 16, requestTimeoutSeconds = 120, turnTimeoutSeconds = 240, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "claude-opus-5-5", label = "Claude Opus 5.5", available = true }, { id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }]
    }
  }
  assert {
    condition     = jsondecode(one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_MODELS_JSON"])).default == "claude-opus-5-5"
    error_message = "R102: a claude-* default is accepted with the relay enabled."
  }
}

run "reject_claude_default_without_relay" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_models = {
      version = 1, location = "global", default = "claude-opus-5-5", thinkingLevel = "MEDIUM", maxRounds = 16, requestTimeoutSeconds = 120, turnTimeoutSeconds = 240, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "claude-opus-5-5", label = "Claude Opus 5.5", available = true }, { id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }]
    }
  }
  expect_failures = [google_cloud_run_v2_service.chat_api]
}

run "reject_bad_claude_id" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_relay = { enabled = true }
    chat_models = {
      version = 1, location = "global", default = "gemini-4-argon", thinkingLevel = "MEDIUM", maxRounds = 16, requestTimeoutSeconds = 120, turnTimeoutSeconds = 240, historyTokenLimit = 150000, seedChars = 40000, maxOutputTokens = 16384
      models  = [{ id = "claude-opus-5-5-20260401", label = "Claude dated", available = true }, { id = "gemini-4-argon", label = "Gemini 4 Argon", available = true }]
    }
  }
  expect_failures = [var.chat_models]
}

run "chat_commands_off_by_default" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  assert {
    condition     = alltrue([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.name != "CHAT_COMMAND_URL"])
    error_message = "R106: without chat_commands.enabled the DEV chat service carries no CHAT_COMMAND_URL."
  }
}

run "chat_commands_enabled_exact_url" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables {
    chat_commands = { enabled = true }
    command_image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition = (one([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : e.value if e.name == "CHAT_COMMAND_URL"]) == "https://mw-credit-app-command-dev-737787224638.asia-southeast1.run.app"
      && length(google_cloud_run_v2_service.chat_api[0].template[0].vpc_access) == 0
      && google_cloud_run_v2_service.chat_api[0].invoker_iam_disabled == true
    && alltrue([for e in google_cloud_run_v2_service.chat_api[0].template[0].containers[0].env : !contains(["PWA_NOTIFICATIONS", "WEB_PUSH_PUBLIC_KEY"], e.name) && !startswith(e.name, "AGENT_") && !startswith(e.name, "RECEIPT_") && !startswith(e.name, "NOTIFICATION_")]))
    error_message = "R106: chat commands add only CHAT_COMMAND_URL for the DEV command service; no egress, receipt, notification or agent keys."
  }
}

run "reject_chat_commands_without_command_service" {
  command = plan
  plan_options { target = [google_cloud_run_v2_service.chat_api] }
  variables { chat_commands = { enabled = true } }
  expect_failures = [google_cloud_run_v2_service.chat_api]
}
