terraform {
  required_version = "= 1.16.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.27.0" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "ecosystem-tunnels"
  }
}
provider "cloudflare" {}
