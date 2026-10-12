mock_provider "google" {}

run "default_is_inert" {
  command = plan
  assert {
    condition     = length(google_project.application) == 0 && length(google_project_service.storage) == 0 && length(google_storage_bucket.state) == 0
    error_message = "Default preparation must propose no resources."
  }
}

run "reviewed_proposal_is_minimal" {
  command = plan
  variables { bootstrap_authorized = true }
  assert {
    condition     = length(google_project.application) == 1 && length(google_project_service.storage) == 1 && length(google_storage_bucket.state) == 1
    error_message = "Bootstrap is exactly one new project/billing association, Storage API and state bucket."
  }
  assert {
    condition     = !google_project.application[0].auto_create_network && google_storage_bucket.state[0].versioning[0].enabled && google_storage_bucket.state[0].uniform_bucket_level_access && google_storage_bucket.state[0].public_access_prevention == "enforced" && !google_storage_bucket.state[0].force_destroy && google_storage_bucket.state[0].soft_delete_policy[0].retention_duration_seconds == 604800
    error_message = "No default network; state requires versioning, private uniform access, recovery and deletion protection."
  }
}

run "reject_existing_data_project" {
  command = plan
  variables { project_id = "clever-oasis-508610-n7" }
  expect_failures = [var.project_id]
}
