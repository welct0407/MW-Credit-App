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


