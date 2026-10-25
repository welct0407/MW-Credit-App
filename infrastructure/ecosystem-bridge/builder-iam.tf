# R099 hotfix (owner decision, 25 October 2026): the existing PROD builder pushes bridge images.
# Repository-scoped only; same pattern as infrastructure/production/delivery.tf "builder".
resource "google_artifact_registry_repository_iam_member" "prod_builder" {
  project    = google_artifact_registry_repository.monitoring.project
  location   = google_artifact_registry_repository.monitoring.location
  repository = google_artifact_registry_repository.monitoring.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:mw-credit-app-build-prod@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
