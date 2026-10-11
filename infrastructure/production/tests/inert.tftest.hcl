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
