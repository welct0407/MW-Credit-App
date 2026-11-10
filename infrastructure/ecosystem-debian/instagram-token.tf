# Owner instruction 10 November 2026: automatic Instagram token renewal. Secret Manager
# `mw-instagram-access-token` (created by the owner in the console, not managed here) is the
# master copy of the token the agent reads from /etc/mw-integration-agent/secrets. The VM
# identity reads the latest version, adds renewed versions and destroys versions older than
# the newest three (mw-instagram-token-refresh). Both grants are on this one secret only.
locals {
  instagram_token_secret = "projects/clever-oasis-508610-n7/secrets/mw-instagram-access-token"
  debian_identity        = "serviceAccount:mw-integration-agent@clever-oasis-508610-n7.iam.gserviceaccount.com"
}

resource "google_secret_manager_secret_iam_member" "debian_instagram_token_accessor" {
  secret_id = local.instagram_token_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = local.debian_identity
}

resource "google_secret_manager_secret_iam_member" "debian_instagram_token_version_manager" {
  secret_id = local.instagram_token_secret
  role      = "roles/secretmanager.secretVersionManager"
  member    = local.debian_identity
}
