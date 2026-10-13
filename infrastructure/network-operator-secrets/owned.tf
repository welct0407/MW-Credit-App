# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "projects/737787224638/secrets/mw-credit-ops-tailscale-oauth-client-secret"
resource "google_secret_manager_secret" "mw_credit_ops_tailscale_oauth_client_secret" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "737787224638"
  secret_id           = "mw-credit-ops-tailscale-oauth-client-secret"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/737787224638/secrets/mw-credit-ops-cloudflare-api-token"
resource "google_secret_manager_secret" "mw_credit_ops_cloudflare_api_token" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "737787224638"
  secret_id           = "mw-credit-ops-cloudflare-api-token"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}

# __generated__ by Terraform from "projects/737787224638/secrets/mw-credit-ops-tailscale-oauth-client-id"
resource "google_secret_manager_secret" "mw_credit_ops_tailscale_oauth_client_id" {
  lifecycle { prevent_destroy = true }
  annotations         = {}
  deletion_policy     = "DELETE"
  deletion_protection = false
  labels              = {}
  project             = "737787224638"
  secret_id           = "mw-credit-ops-tailscale-oauth-client-id"
  secret_type         = null
  tags                = null
  ttl                 = null
  version_aliases     = {}
  version_destroy_ttl = null
  replication {
    auto {
    }
  }
}
