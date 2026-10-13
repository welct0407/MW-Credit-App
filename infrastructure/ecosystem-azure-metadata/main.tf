terraform {
  required_version = "= 1.16.5"
  required_providers {
    azapi = { source = "Azure/azapi", version = "= 2.13.0" }
  }
  backend "gcs" {
    bucket = "mw-credit-app-tfstate-737787224638"
    prefix = "ecosystem-azure-metadata"
  }
}
provider "azapi" {
  subscription_id            = "50f792fa-803e-4280-833d-1fe60fef5293"
  tenant_id                  = "9e29c895-606a-420b-acc2-1c24375df4d9"
  skip_provider_registration = true
  disable_default_output     = true
  enable_preflight           = false
}
