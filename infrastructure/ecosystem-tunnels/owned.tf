# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "03566f0be789f9d2ba2a5389dfb0f1f6/f75df9f1-0acf-4e8c-b797-a5fcf85b22f9"
resource "cloudflare_zero_trust_tunnel_cloudflared" "bridge" {
  lifecycle { prevent_destroy = true }
  account_id    = "03566f0be789f9d2ba2a5389dfb0f1f6"
  config_src    = "cloudflare"
  name          = "mw-collection-webhook"
  tunnel_secret = null # sensitive
}

# __generated__ by Terraform from "03566f0be789f9d2ba2a5389dfb0f1f6/f75df9f1-0acf-4e8c-b797-a5fcf85b22f9"
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "bridge" {
  lifecycle { prevent_destroy = true }
  account_id = "03566f0be789f9d2ba2a5389dfb0f1f6"
  config = {
    ingress = [
      {
        hostname       = "hooks.mw-credit.com"
        origin_request = null
        path           = "^/instagram$" # R063 W3 AGT-WEBHOOK-03: only the signed webhook route is public
        service        = "http://127.0.0.1:8000"
      },
      {
        hostname       = "charts.mw-credit.com"
        origin_request = null
        path           = null
        service        = "http://127.0.0.1:8011"
      },
      {
        hostname       = null
        origin_request = null
        path           = null
        service        = "http_status:404"
      },
    ]
    origin_request = null
  }
  source    = "cloudflare"
  tunnel_id = "f75df9f1-0acf-4e8c-b797-a5fcf85b22f9"
}
