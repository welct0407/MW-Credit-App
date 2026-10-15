# Private operator records that must outlive an ephemeral cloud session:
# pre-migration database backups with restore proofs (prod-backups/) and
# promotion receipts (promotion-receipts/). Contains borrower data; readable
# only through project Owner (no bucket-level grants). Objects are never
# expired automatically; delete superseded backups deliberately.
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
}
