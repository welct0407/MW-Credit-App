# Retained protected container from the retired uid-pinned DEV owner mode (ALL-ARCH-01).
# No DEV runtime reads it; membership now comes from mw-credit-app-dev-capability-policy.
resource "google_secret_manager_secret" "owner_identity" {
  secret_id = "mw-credit-app-dev-owner-identity"
  replication {
    auto {}
  }
  labels = { application = "mw-credit-app", environment = "dev" }
  lifecycle { prevent_destroy = true }
}
