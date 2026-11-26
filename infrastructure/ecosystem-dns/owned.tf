# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# __generated__ by Terraform from "77d9da76cfeaaf21ae589f95a958965c/5a3e2cf73d5daf5b07ddff18f4b11b50"
resource "cloudflare_dns_record" "charts" {
  lifecycle { prevent_destroy = true }
  comment                 = null
  content                 = "f75df9f1-0acf-4e8c-b797-a5fcf85b22f9.cfargotunnel.com"
  data                    = null
  include_shadow_metadata = false
  name                    = "charts.mw-credit.com"
  priority                = null
  private_routing         = null
  proxied                 = true
  settings = {
    flatten_cname = false
    ipv4_only     = false
    ipv6_only     = false
  }
  tags    = []
  ttl     = 1
  type    = "CNAME"
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
}

# __generated__ by Terraform from "77d9da76cfeaaf21ae589f95a958965c/59f7b018abd772a52b373ef9800ecac2"
resource "cloudflare_dns_record" "hooks" {
  lifecycle { prevent_destroy = true }
  comment                 = null
  content                 = "f75df9f1-0acf-4e8c-b797-a5fcf85b22f9.cfargotunnel.com"
  data                    = null
  include_shadow_metadata = false
  name                    = "hooks.mw-credit.com"
  priority                = null
  private_routing         = null
  proxied                 = true
  settings = {
    flatten_cname = false
    ipv4_only     = false
    ipv6_only     = false
  }
  tags    = []
  ttl     = 1
  type    = "CNAME"
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
}

# __generated__ by Terraform from "77d9da76cfeaaf21ae589f95a958965c/68b6d51c8ab20d5ae51bf48c0a5a07cf"
resource "cloudflare_dns_record" "reports" {
  lifecycle { prevent_destroy = true }
  comment                 = null
  content                 = "yq8x1vuz.up.railway.app"
  data                    = null
  include_shadow_metadata = false
  name                    = "reports.mw-credit.com"
  priority                = null
  private_routing         = null
  proxied                 = false
  settings = {
    flatten_cname = false
    ipv4_only     = false
    ipv6_only     = false
  }
  tags    = []
  ttl     = 1
  type    = "CNAME"
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
}

# __generated__ by Terraform from "77d9da76cfeaaf21ae589f95a958965c/0812c2993b6ef3b4b9553810f8ebe597"
resource "cloudflare_dns_record" "monitor" {
  lifecycle { prevent_destroy = true }
  comment                 = null
  content                 = "olivecrab1199.grafana.net"
  data                    = null
  include_shadow_metadata = false
  name                    = "monitor.mw-credit.com"
  priority                = null
  private_routing         = null
  proxied                 = false
  settings = {
    flatten_cname = false
    ipv4_only     = false
    ipv6_only     = false
  }
  tags    = []
  ttl     = 1
  type    = "CNAME"
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
}

# __generated__ by Terraform from "77d9da76cfeaaf21ae589f95a958965c/12d90c87273bd42fa4f80caba62aaf4e"
resource "cloudflare_dns_record" "alerts" {
  lifecycle { prevent_destroy = true }
  comment                 = null
  content                 = "ghs.googlehosted.com"
  data                    = null
  include_shadow_metadata = false
  name                    = "alerts.mw-credit.com"
  priority                = null
  private_routing         = null
  proxied                 = false
  settings = {
    flatten_cname = false
    ipv4_only     = false
    ipv6_only     = false
  }
  tags    = []
  ttl     = 1
  type    = "CNAME"
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
}
