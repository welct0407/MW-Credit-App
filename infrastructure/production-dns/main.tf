terraform {
  required_version = "= 1.16.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.27.0" }
  }
  backend "gcs" {}
}
provider "cloudflare" {}

# Exact Firebase custom-domain output captured after F1, 11 October 2026.
# Token is injected transiently from the established private credential route.
resource "cloudflare_dns_record" "production_host" {
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
  name    = "lm.mw-credit.com"
  type    = "CNAME"
  content = "mw-credit-prod-737787224638.web.app"
  ttl     = 1
  proxied = false
  comment = "R052 contained production Firebase Hosting; managed by MW-Credit-App Terraform"
}
