terraform {
  required_version = "= 1.16.5"
  required_providers { google = { source = "hashicorp/google", version = "= 8.6.0" } }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "ecosystem-debian"
  }
}
provider "google" { project = "clever-oasis-508610-n7" }
