terraform {
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "bootstrap"
  }

  required_version = "= 1.16.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 8.6.0"
    }

  }


}

provider "google" {
  project = "clever-oasis-508610-n7"
}

resource "google_storage_bucket" "state" {

  name                        = "mw-credit-app-tfstate-737787224638"
  location                    = "ASIA-SOUTHEAST1"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }

  labels = {
    application = "mw-credit-app"
    purpose     = "terraform-state"
  }


}
