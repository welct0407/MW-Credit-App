override_resource {
  target          = google_service_account.application["command"]
  override_during = plan
  values          = { email = "mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com", name = "projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com" }
}
mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  sql_ssd_import             = false # mock providers cannot import
  application_project_id     = "clever-oasis-508610-n7"
  application_project_number = "737787224638"
  region                     = "asia-southeast1"
  hosting_site_id            = "synthetic-phase3-production"
}

run "recognizer_default_off" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    business_runtime_authorized        = true
  }
  assert {
    condition     = alltrue([for role, service in google_cloud_run_v2_service.foundation : length(service.template[0].vpc_access) == 0 && alltrue([for e in service.template[0].containers[0].env : !startswith(e.name, "PROD_RECEIPT_RECOGNITION")])])
    error_message = "By default no PROD service has VPC egress or recognizer settings."
  }
}
run "recognizer_command_only" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    business_runtime_authorized        = true
    receipt_recognizer                 = { enabled = true }
  }
  assert {
    condition     = one(google_cloud_run_v2_service.foundation["command"].template[0].vpc_access).egress == "PRIVATE_RANGES_ONLY" && one(one(google_cloud_run_v2_service.foundation["command"].template[0].vpc_access).network_interfaces).subnetwork == "default" && one([for e in google_cloud_run_v2_service.foundation["command"].template[0].containers[0].env : e.value if e.name == "PROD_RECEIPT_RECOGNITION_URL"]) == "http://10.148.0.2:8790/v1/receipt-recognition" && one([for e in google_cloud_run_v2_service.foundation["command"].template[0].containers[0].env : e.value if e.name == "PROD_RECEIPT_RECOGNITION"]) == "disabled"
    error_message = "PROD command gets private-range egress and the recognizer URL with the flag left disabled."
  }
  assert {
    condition     = length(google_cloud_run_v2_service.foundation["read"].template[0].vpc_access) == 0 && alltrue([for e in google_cloud_run_v2_service.foundation["read"].template[0].containers[0].env : !startswith(e.name, "PROD_RECEIPT_RECOGNITION")])
    error_message = "The PROD reader never gets recognizer egress or settings."
  }
}
run "recognizer_requires_business_runtime" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                     = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version          = "2"
    capability_policy_sha256           = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators       = ["postgres"]
    business_runtime_authorized        = false
    receipt_recognizer                 = { enabled = true }
  }
  expect_failures = [google_cloud_run_v2_service.foundation]
}
run "recognizer_rejects_unknown_activation" {
  command = plan
  variables { receipt_recognizer = { enabled = true, activation = "on" } }
  expect_failures = [var.receipt_recognizer]
}
