mock_provider "google" {}
mock_provider "google-beta" {}

variables {
  application_project_id     = "clever-oasis-508610-n7"
  application_project_number = "737787224638"
  region                     = "asia-southeast1"
  hosting_site_id            = "synthetic-phase3-production"
}

run "default_is_inert" {
  command = plan
  assert {
    condition     = length(google_service_account.application) == 0 && length(google_secret_manager_secret.application) == 0 && length(google_artifact_registry_repository.application) == 0
    error_message = "The preparation root must propose no cloud resources by default."
  }
  assert {
    condition     = length(google_sql_user.business_runtime) == 0 && length(google_project_iam_member.business_sql) == 0
    error_message = "Business prerequisites must remain absent without explicit authorization."
  }
}

run "reject_superseded_new_project" {
  command = plan
  variables {
    application_project_id = "mw-credit-app-prod-20261011"
  }
  expect_failures = [var.application_project_id]
}

run "explicit_foundation_has_no_runtime_or_data_authority" {
  command = plan
  variables {
    foundation_authorized = true
  }
  assert {
    condition     = length(google_service_account.application) == 4 && length(google_secret_manager_secret.application) == 1 && length(google_artifact_registry_repository.application) == 1 && length(google_cloud_run_v2_service.foundation) == 0
    error_message = "Enrollment creates identities, only the used owner secret and artifacts; no runtime before owner enrollment."
  }
}

run "contained_runtime_has_only_auth_authority" {
  command = plan
  variables {
    foundation_authorized   = true
    runtime_authorized      = true
    verified_github_subject = "repo:welct0407@322659955/MW-Credit-App@1408349602:environment:production"
    owner_secret_version    = "1"
    foundation_image        = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = length(google_cloud_run_v2_service.foundation) == 2 && google_project_iam_custom_role.auth_user[0].permissions == toset(["firebaseauth.users.get"]) && length(google_secret_manager_secret_iam_member.runtime_owner) == 2
    error_message = "Both contained runtime identities have only auth lookup and the owner secret, never retained data access."
  }
  assert {
    condition     = google_iam_workload_identity_pool_provider.delivery[0].attribute_condition == "assertion.repository_id == '1408349602' && assertion.repository_owner_id == '322659955' && assertion.ref == 'refs/heads/main' && assertion.sub == 'repo:welct0407@322659955/MW-Credit-App@1408349602:environment:production'"
    error_message = "Federation must require exact repository/owner/main/production context."
  }
  assert {
    condition     = alltrue([for service in google_cloud_run_v2_service.foundation : service.template[0].scaling[0].max_instance_count == 1 && service.template[0].containers[0].args == tolist(["services/production/server.mjs"])])
    error_message = "Only bounded contained entrypoints may be proposed."
  }
  assert {
    condition     = length(google_project_iam_member.deployer) == 1 && google_project_iam_member.deployer["roles/serviceusage.serviceUsageConsumer"].role == "roles/serviceusage.serviceUsageConsumer" && length(google_cloud_run_v2_service_iam_member.deployer_runtime) == 2 && google_artifact_registry_repository.application[0].repository_id == "mw-credit-app-prod"
    error_message = "No automated Hosting/project-wide Run grant; use exact PROD services and separate artifacts."
  }
}

run "runtime_requires_real_pins" {
  command = plan
  variables {
    foundation_authorized   = true
    runtime_authorized      = true
    verified_github_subject = "repo:welct0407@322659955/MW-Credit-App@1408349602:environment:production"
  }
  expect_failures = [google_cloud_run_v2_service.foundation]
}

run "business_prerequisites_do_not_activate_runtime" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = length(google_sql_user.business_runtime) == 2 && length(google_project_iam_member.business_sql) == 4
    error_message = "Only two IAM database users and four SQL connection bindings are proposed."
  }
  assert {
    condition     = alltrue([for service in google_cloud_run_v2_service.foundation : service.template[0].containers[0].args == tolist(["services/production/server.mjs"]) && service.template[0].scaling[0].max_instance_count == 1])
    error_message = "SQL prerequisites must not activate business entrypoints or resize services."
  }
}

run "business_runtime_requires_policy_and_image_pins" {
  command = plan
  variables {
    foundation_authorized              = true
    runtime_authorized                 = true
    business_infrastructure_authorized = true
    business_runtime_authorized        = true
    owner_secret_version               = "1"
    foundation_image                   = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  expect_failures = [google_cloud_run_v2_service.foundation]
}

run "business_candidate_has_exact_bounded_receipt_authority" {
  command = plan
  override_resource {
    target          = google_service_account.application["command"]
    override_during = plan
    values = {
      email = "mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com"
      name  = "projects/clever-oasis-508610-n7/serviceAccounts/mw-credit-app-command-prod@clever-oasis-508610-n7.iam.gserviceaccount.com"
    }
  }
  variables {
    foundation_authorized                 = true
    runtime_authorized                    = true
    business_infrastructure_authorized    = true
    business_runtime_authorized           = true
    business_receipts_authorized          = true
    owner_secret_version                  = "1"
    foundation_image                      = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    business_image                        = "asia-southeast1-docker.pkg.dev/clever-oasis-508610-n7/mw-credit-app-prod/api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    capability_policy_version             = "2"
    capability_policy_sha256              = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    business_registered_creators          = ["postgres"]
    native_catalog_version                = "3"
    receipt_source_evidence_sha256        = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    receipt_compatibility_evidence_sha256 = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
  }
  assert {
    condition     = google_project_iam_custom_role.business_receipt["get"].permissions == toset(["storage.objects.get"]) && google_project_iam_custom_role.business_receipt["create"].permissions == toset(["storage.objects.create"])
    error_message = "Receipt authority must exclude list/update/delete and public access."
  }
  assert {
    condition     = google_storage_bucket_iam_member.business_receipt["create"].condition[0].expression == "resource.name.startsWith('projects/_/buckets/mw-payment-receipts-prod-508610-n7/objects/appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/pwa/')" && google_storage_bucket_iam_member.business_receipt["get"].condition[0].expression == "resource.name.startsWith('projects/_/buckets/mw-payment-receipts-prod-508610-n7/objects/appsheet/data/LoanManager_975338008_26_08_07/manual_receipts/prod/') || resource.name.startsWith('projects/_/buckets/mw-payment-receipts-prod-508610-n7/objects/receipts/prod/')"
    error_message = "Only verified native/agent PROD prefixes may be read, and only native pwa may be created."
  }
  assert {
    condition     = length(google_secret_manager_secret.business) == 2 && length(google_secret_manager_secret_iam_member.business_policy) == 2 && length(google_secret_manager_secret_iam_member.business_catalog) == 1 && alltrue([for binding in google_storage_bucket_iam_member.business_receipt : binding.member == "serviceAccount:${google_service_account.application["command"].email}"])
    error_message = "Policy belongs to both runtimes; catalog and receipt grants belong only to command."
  }
  assert {
    condition     = alltrue([for service in google_cloud_run_v2_service.foundation : service.template[0].containers[0].args == tolist(["services/production/business-server.mjs"]) && service.template[0].containers[0].image == var.business_image && service.template[0].scaling[0].max_instance_count == 1 && service.template[0].max_instance_request_concurrency == 5])
    error_message = "Business candidate must use its exact image/entrypoint with unchanged bounded runtime sizing."
  }
  assert {
    condition     = alltrue([for role, service in google_cloud_run_v2_service.foundation : one([for env in service.template[0].containers[0].env : env.value if env.name == "PWA_NOTIFICATIONS"]) == "disabled" && one([for env in service.template[0].containers[0].env : env.value if env.name == "PROD_RECEIPTS"]) == (role == "command" ? "enabled" : "disabled")]) && length([for env in google_cloud_run_v2_service.foundation["read"].template[0].containers[0].env : env if env.name == "PROD_RECEIPT_NATIVE_CATALOG_JSON"]) == 0
    error_message = "No notifications/VAPID or reader receipt catalog may be enabled."
  }
}
