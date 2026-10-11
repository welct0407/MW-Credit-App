resource "google_storage_bucket" "build_source" {
  count                       = var.foundation_authorized ? 1 : 0
  project                     = var.application_project_id
  name                        = "mw-credit-app-prod-builds-${var.application_project_number}"
  location                    = upper(var.region)
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  lifecycle { prevent_destroy = true }
}
resource "google_storage_bucket_iam_member" "builder_source" {
  count  = var.foundation_authorized ? 1 : 0
  bucket = google_storage_bucket.build_source[0].name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.application["build"].email}"
}
resource "google_artifact_registry_repository_iam_member" "builder" {
  count      = var.foundation_authorized ? 1 : 0
  project    = var.application_project_id
  location   = var.region
  repository = google_artifact_registry_repository.application[0].name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.application["build"].email}"
}
resource "google_project_iam_member" "builder_logs" {
  count   = var.foundation_authorized ? 1 : 0
  project = var.application_project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.application["build"].email}"
}
resource "google_project_iam_member" "deployer" {
  for_each = var.foundation_authorized ? toset(["roles/serviceusage.serviceUsageConsumer"]) : toset([])
  project  = var.application_project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.application["deploy"].email}"
}
resource "google_artifact_registry_repository_iam_member" "deployer" {
  count      = var.foundation_authorized ? 1 : 0
  project    = var.application_project_id
  location   = var.region
  repository = google_artifact_registry_repository.application[0].name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.application["deploy"].email}"
}
resource "google_cloud_run_v2_service_iam_member" "deployer_runtime" {
  for_each = local.runtime_roles
  project  = var.application_project_id
  location = var.region
  name     = google_cloud_run_v2_service.foundation[each.key].name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.application["deploy"].email}"
}
resource "google_service_account_iam_member" "deployer_runtime" {
  for_each           = var.foundation_authorized ? toset(["read", "command"]) : toset([])
  service_account_id = google_service_account.application[each.key].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.application["deploy"].email}"
}
resource "google_iam_workload_identity_pool" "delivery" {
  count                     = var.foundation_authorized && var.verified_github_subject != null ? 1 : 0
  project                   = var.application_project_id
  workload_identity_pool_id = "mw-credit-app-production"
  display_name              = "MW Credit production delivery"
  lifecycle { prevent_destroy = true }
}
resource "google_iam_workload_identity_pool_provider" "delivery" {
  count                              = var.foundation_authorized && var.verified_github_subject != null ? 1 : 0
  project                            = var.application_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.delivery[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  attribute_condition = "assertion.repository_id == '1408349602' && assertion.repository_owner_id == '322659955' && assertion.ref == 'refs/heads/main' && assertion.sub == '${var.verified_github_subject}'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
variable "verified_github_subject" {
  description = "Exact production-environment subject verified from current repository OIDC customization; no inferred default."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.verified_github_subject == null ? true : contains(["repo:welct0407/MW-Credit-App:environment:production", "repo:welct0407@322659955/MW-Credit-App@1408349602:environment:production"], var.verified_github_subject)
    error_message = "Use only a verified current production subject for this repository."
  }
}
resource "google_service_account_iam_member" "delivery_federation" {
  count              = var.foundation_authorized && var.verified_github_subject != null ? 1 : 0
  service_account_id = google_service_account.application["deploy"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.delivery[0].name}/attribute.repository_id/1408349602"
}
