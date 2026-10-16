mock_provider "google" {}

run "default_no_resources" {
  command = plan
  assert {
    condition     = length(google_service_account.worker) == 0 && length(google_cloud_run_v2_service.worker) == 0 && length(google_cloud_scheduler_job.tick) == 0 && length(google_secret_manager_secret.policy) == 0
    error_message = "Default must add no worker resources."
  }
}
run "enrollment_only" {
  command = plan
  variables { enabled = true }
  assert {
    condition     = length(google_service_account.worker) == 2 && length(google_sql_user.worker_ssd) == 2 && length(google_project_iam_member.sql) == 4 && length(google_cloud_run_v2_service.worker) == 0 && length(google_cloud_scheduler_job.tick) == 0
    error_message = "Enrollment must not start runtimes or schedules."
  }
  assert {
    condition     = length(google_secret_manager_secret_iam_member.notify) == 2 && google_project_iam_member.notify_auth[0].role == "projects/clever-oasis-508610-n7/roles/mwCreditAppReadAuthUser"
    error_message = "Only notification worker gets the two secrets and existing user-read role."
  }
}
run "contained_runtime" {
  command = plan
  variables {
    enabled             = true
    image               = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    vapid_version       = "1"
    policy_version      = "1"
    push_subject        = "mailto:synthetic@example.invalid"
    registered_creators = ["postgres"]
  }
  assert {
    condition     = length(google_cloud_run_v2_service.worker) == 2 && alltrue([for key, s in google_cloud_run_v2_service.worker : !s.invoker_iam_disabled && s.ingress == (key == "notify" ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY") && s.template[0].scaling[0].min_instance_count == 0 && s.template[0].scaling[0].max_instance_count == 1 && s.template[0].max_instance_request_concurrency == 1 && s.scaling[0].min_instance_count == 0 && s.template[0].containers[0].resources[0].cpu_idle])
    error_message = "Both workers must be private IAM-enforced bounded runtimes."
  }
  assert {
    condition     = length(google_cloud_scheduler_job.tick) == 3 && alltrue([for key, j in google_cloud_scheduler_job.tick : j.paused && j.time_zone == "Asia/Bangkok" && j.http_target[0].http_method == "POST" && j.retry_config[0].retry_count == (local.schedules[key].role == "jobs" ? 5 : 0) && j.retry_config[0].max_retry_duration == (local.schedules[key].role == "jobs" ? "600s" : "0s")])
    error_message = "All schedules start paused; jobs have finite same-boundary retries, notify retries at its next tick."
  }
  assert {
    condition     = google_cloud_scheduler_job.tick["notifications"].schedule == "* * * * *" && google_cloud_scheduler_job.tick["daily_charges"].schedule == "5 0 * * *" && google_cloud_scheduler_job.tick["recent_analytics"].schedule == "0 * * * *"
    error_message = "Only approved Bangkok boundaries may be scheduled."
  }
  assert {
    condition     = alltrue([for key, j in google_cloud_scheduler_job.tick : j.http_target[0].oidc_token[0].audience == local.audiences[local.schedules[key].role] && j.http_target[0].uri == "${local.audiences[local.schedules[key].role]}${local.schedules[key].path}"])
    error_message = "Scheduler OIDC audience and fixed route must match exact worker."
  }
  assert {
    condition     = alltrue([for e in google_cloud_run_v2_service.worker["jobs"].template[0].containers[0].env : !contains(["WEB_PUSH_VAPID_JSON", "NOTIFICATION_POLICY_JSON", "WEB_PUSH_SUBJECT"], e.name)]) && alltrue([for s in google_cloud_run_v2_service.worker : one([for e in s.template[0].containers[0].env : e.value if e.name == "WORKER_ACTIVATION"]) == "disabled"])
    error_message = "Jobs must have no notification secrets; both workers start disabled."
  }
}
run "reject_latest" {
  command = plan
  variables { vapid_version = "latest" }
  expect_failures = [var.vapid_version]
}
run "enabled_notification_remains_request_based" {
  command = plan
  variables {
    enabled                  = true
    image                    = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    vapid_version            = "1"
    policy_version           = "1"
    push_subject             = "mailto:synthetic@example.invalid"
    registered_creators      = ["postgres"]
    notification_enabled     = true
    command_dispatch_enabled = true
  }
  assert {
    condition     = length(google_cloud_run_v2_service_iam_member.command_dispatch) == 1 && google_cloud_run_v2_service_iam_member.command_dispatch[0].role == "roles/run.invoker" && google_cloud_run_v2_service_iam_member.command_dispatch[0].member == "serviceAccount:mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"
    error_message = "Only the exact DEV command identity receives the notify service invocation grant."
  }
  assert {
    condition     = google_cloud_run_v2_service.worker["notify"].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.worker["notify"].scaling[0].max_instance_count == 1 && google_cloud_run_v2_service.worker["notify"].template[0].containers[0].resources[0].cpu_idle && google_cloud_run_v2_service.worker["notify"].template[0].scaling[0].min_instance_count == 0
    error_message = "Enabled dispatcher must scale to zero and allocate CPU only during requests."
  }
  assert {
    condition     = google_cloud_run_v2_service.worker["jobs"].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.worker["jobs"].template[0].containers[0].resources[0].cpu_idle && alltrue([for j in google_cloud_scheduler_job.tick : j.paused])
    error_message = "Dispatcher activation must not warm jobs or resume any schedule."
  }
}
run "reject_prod_image" {
  command = plan
  variables { image = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  expect_failures = [var.image]
}
run "reject_unbound_notify" {
  command = plan
  variables {
    enabled             = true
    image               = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    registered_creators = ["postgres"]
  }
  expect_failures = [google_cloud_run_v2_service.worker["notify"]]
}


run "prod_workers_are_separate_and_scale_zero" {
  command = plan
  variables {
    environment              = "prod"
    enabled                  = true
    image                    = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    vapid_version            = "1"
    policy_version           = "2"
    push_subject             = "mailto:synthetic@example.invalid"
    registered_creators      = ["postgres"]
    notification_enabled     = true
    command_dispatch_enabled = true
  }
  assert {
    condition     = alltrue([for key, s in google_cloud_run_v2_service.worker : s.name == "mw-credit-app-${key}-prod" && s.scaling[0].min_instance_count == 0 && s.template[0].containers[0].resources[0].cpu_idle && one([for e in s.template[0].containers[0].env : e.value if e.name == "DB_NAME"]) == "loan_manager_prod"]) && google_cloud_run_v2_service_iam_member.command_dispatch[0].member == "serviceAccount:mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com"
    error_message = "PROD must use separate names/DB/caller and remain request based."
  }
}
run "prod_rejects_dev_image" {
  command = plan
  variables {
    environment = "prod"
    image       = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  expect_failures = [var.image]
}

run "caller_subjects_pinned_per_worker" {
  command = plan
  variables {
    enabled                  = true
    image                    = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    vapid_version            = "1"
    policy_version           = "1"
    push_subject             = "mailto:synthetic@example.invalid"
    registered_creators      = ["postgres"]
    notification_enabled     = true
    command_dispatch_enabled = true
  }
  override_resource {
    target          = google_service_account.scheduler[0]
    override_during = plan
    values          = { email = "mw-credit-app-scheduler-dev@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000001" }
  }
  override_data {
    target          = data.google_service_account.command[0]
    override_during = plan
    values          = { email = "mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000002" }
  }
  assert {
    condition     = jsondecode(one([for e in google_cloud_run_v2_service.worker["notify"].template[0].containers[0].env : e.value if e.name == "WORKER_CALLER_SUBJECTS_JSON"])) == { "mw-credit-app-scheduler-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" = "100000000000000000001", "mw-credit-app-command-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" = "100000000000000000002" }
    error_message = "Notify pins the scheduler and the dispatching command identity by unique id."
  }
  assert {
    condition     = jsondecode(one([for e in google_cloud_run_v2_service.worker["jobs"].template[0].containers[0].env : e.value if e.name == "WORKER_CALLER_SUBJECTS_JSON"])) == { "mw-credit-app-scheduler-dev@clever-oasis-508610-n7.iam.gserviceaccount.com" = "100000000000000000001" }
    error_message = "Jobs pins the scheduler only."
  }
}
run "caller_subjects_without_dispatch_skip_command" {
  command = plan
  variables {
    enabled             = true
    image               = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    vapid_version       = "1"
    policy_version      = "1"
    push_subject        = "mailto:synthetic@example.invalid"
    registered_creators = ["postgres"]
  }
  override_resource {
    target          = google_service_account.scheduler[0]
    override_during = plan
    values          = { email = "mw-credit-app-scheduler-dev@clever-oasis-508610-n7.iam.gserviceaccount.com", unique_id = "100000000000000000001" }
  }
  assert {
    condition     = length(data.google_service_account.command) == 0 && keys(jsondecode(one([for e in google_cloud_run_v2_service.worker["notify"].template[0].containers[0].env : e.value if e.name == "WORKER_CALLER_SUBJECTS_JSON"]))) == ["mw-credit-app-scheduler-dev@clever-oasis-508610-n7.iam.gserviceaccount.com"]
    error_message = "Without direct dispatch the command identity is neither read nor accepted."
  }
}
