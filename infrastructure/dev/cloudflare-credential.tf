# Token versions are provisioned privately; never put a credential value in Terraform.
resource "google_secret_manager_secret" "cloudflare_dev_dns" {
  project   = local.project
  secret_id = "mw-credit-app-dev-cloudflare-dns-token"
  replication {
    auto {}
  }
  lifecycle { prevent_destroy = true }
}
