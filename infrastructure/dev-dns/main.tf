terraform {
  required_version = "= 1.16.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.27.0" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "development-dns"
  }
}
# Credentials are injected as CLOUDFLARE_API_TOKEN from Secret Manager by the runner.
provider "cloudflare" {}
resource "cloudflare_dns_record" "dev_host" {
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
  name    = "dev-lm.mw-credit.com"
  type    = "CNAME"
  content = "mw-credit-app-dev-737787224638.web.app"
  ttl     = 1
  proxied = false
  comment = "R052 DEV Firebase Hosting; managed by MW-Credit-App Terraform"
}
resource "cloudflare_dns_record" "dev_certificate" {
  zone_id = "77d9da76cfeaaf21ae589f95a958965c"
  name    = "_acme-challenge.dev-lm.mw-credit.com"
  type    = "TXT"
  content = "WPvJUlphnGY84B3Ezt_oT_EQ9pxGPoEpf1-WjtH0ZiE"
  ttl     = 1
  comment = "R052 Firebase public certificate challenge; managed by Terraform"
}
