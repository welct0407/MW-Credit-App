# Private operator records that must outlive an ephemeral cloud session:
# pre-migration database backups with restore proofs (prod-backups/) and
# promotion receipts (promotion-receipts/). Contains borrower data; readable
# only through project Owner (no bucket-level grants). prod-backups/ objects
# expire 180 days after creation (R063 W3 DB-BACKUP-05; the noncurrent copy
# kept by versioning goes 30 days later); other prefixes never expire.
resource "google_storage_bucket" "operator_private" {
  lifecycle { prevent_destroy = true }
  name                        = "mw-credit-operator-private-737787224638"
  project                     = "clever-oasis-508610-n7"
  location                    = "ASIA-SOUTHEAST1"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = { purpose = "operator-private-records" }
  versioning {
    enabled = true
  }
  soft_delete_policy {
    retention_duration_seconds = 604800
  }
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age            = 180
      matches_prefix = ["prod-backups/"]
    }
  }
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      with_state                 = "ARCHIVED"
      days_since_noncurrent_time = 30
      matches_prefix             = ["prod-backups/"]
    }
  }
}

# R064 W4 DB-PERF-01 daily agent audit retention (prepared 17 October 2026): the agent VM's
# service account may create, and only create, objects under agent-audit-archive/. No get,
# list, replace or delete: existing archives and every other prefix stay Owner-only.
resource "google_storage_bucket_iam_member" "agent_audit_archive_create" {
  bucket = google_storage_bucket.operator_private.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
  condition {
    title       = "agent-audit-archive-only"
    description = "Create-only access limited to the agent-audit-archive/ prefix"
    expression  = "resource.name.startsWith(\"projects/_/buckets/mw-credit-operator-private-737787224638/objects/agent-audit-archive/\")"
  }
}
