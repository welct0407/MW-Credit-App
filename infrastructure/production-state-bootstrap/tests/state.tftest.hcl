mock_provider "google" {}
run "default_inert" {
  command = plan
  assert {
    condition     = length(google_storage_bucket.state) == 0
    error_message = "No default resource creation."
  }
}
run "separate_protected_state_only" {
  command = plan
  variables { state_bootstrap_authorized = true }
  assert {
    condition     = length(google_storage_bucket.state) == 1 && google_storage_bucket.state[0].name == "mw-credit-app-prod-tfstate-737787224638" && google_storage_bucket.state[0].versioning[0].enabled && !google_storage_bucket.state[0].force_destroy && google_storage_bucket.state[0].public_access_prevention == "enforced"
    error_message = "Create only the protected production state bucket, never reuse DEV state."
  }
}
