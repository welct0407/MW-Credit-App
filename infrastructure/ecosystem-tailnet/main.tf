terraform {
  required_version = "= 1.16.5"
  required_providers {
    tailscale = { source = "tailscale/tailscale", version = "= 0.29.2" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "ecosystem-tailnet"
  }
}
provider "tailscale" {
  tailnet = "zhcyidea@gmail.com"
}
