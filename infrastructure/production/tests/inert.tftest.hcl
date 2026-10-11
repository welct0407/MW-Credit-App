mock_provider "google" {}

variables {
  application_project_id     = "synthetic-phase3-production"
  application_project_number = "123456789012"
  region                     = "asia-southeast1"
}

run "default_is_inert" {
  command = plan
  assert {
    condition     = length(google_service_account.application) == 0 && length(google_secret_manager_secret.application) == 0 && length(google_artifact_registry_repository.application) == 0
    error_message = "The preparation root must propose no cloud resources by default."
  }
}

run "reject_existing_dev_project" {
  command = plan
  variables {
    application_project_id = "clever-oasis-508610-n7"
  }
  expect_failures = [var.application_project_id]
}

run "explicit_foundation_has_no_runtime_or_data_authority" {
  command = plan
  variables {
    foundation_authorized = true
  }
  assert {
    condition     = length(google_service_account.application) == 4 && length(google_secret_manager_secret.application) == 4 && length(google_artifact_registry_repository.application) == 1
    error_message = "Only proposed identities, empty secret containers and artifact storage belong to this initial foundation."
  }
}
