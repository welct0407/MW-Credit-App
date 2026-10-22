# R089 Grafana revamp, additive and read-only. The Debian resource collector
# (debian-health.py, VM identity) reads the shared Cloud SQL instance's backup
# runs and log retention (backupRuns.list, instances.get) and the newest boot-disk
# snapshot (compute.snapshots.list/get). No write permission is added.
resource "google_project_iam_member" "debian_cloudsql_viewer" {
  project = "clever-oasis-508610-n7"
  role    = "roles/cloudsql.viewer"
  member  = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
}

resource "google_project_iam_custom_role" "snapshot_viewer" {
  project     = "clever-oasis-508610-n7"
  role_id     = "mwSnapshotViewer"
  title       = "MW snapshot viewer"
  description = "R089: list and read Compute Engine snapshot metadata for the resource collector."
  permissions = ["compute.snapshots.get", "compute.snapshots.list"]
  stage       = "GA"
}

resource "google_project_iam_member" "debian_snapshot_viewer" {
  project = "clever-oasis-508610-n7"
  role    = google_project_iam_custom_role.snapshot_viewer.name
  member  = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
}
